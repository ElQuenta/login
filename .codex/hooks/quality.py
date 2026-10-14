"""Shared Codex lifecycle hooks and CI quality gate. Python 3.11+, Node.js, npm."""
import argparse
import base64
import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(os.environ.get('QUALITY_ROOT', Path(__file__).resolve().parents[2])).resolve()
STATE = ROOT / '.codex' / '.state'
IGNORED = {'.git', 'node_modules', 'dist', 'coverage', '.state', '__pycache__'}


def files(root):
    result = {}
    for directory, dirs, names in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORED]
        for name in names:
            path = Path(directory) / name
            if name == '.env' or name.endswith('.log'):
                continue
            result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                     prefix=path.name, suffix='.tmp', delete=False) as output:
        json.dump(value, output, indent=2)
        temporary = Path(output.name)
    temporary.replace(path)


def snapshot(path):
    save(path, files(ROOT))


def source_file(name):
    return name.startswith('back/src/') and name.endswith('.ts')


def verify(path):
    before = json.loads(path.read_text(encoding='utf-8'))
    after = files(ROOT)
    illegal = [p for p in before.keys() | after.keys()
               if before.get(p) != after.get(p) and not source_file(p)]
    if illegal:
        raise RuntimeError('Autofix modificó archivos fuera de back/src/**/*.ts: ' + ', '.join(sorted(illegal)))


def run(command, cwd, timeout=180, env=None):
    result = subprocess.run(command, cwd=cwd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, encoding='utf-8',
                            errors='replace', timeout=timeout)
    return result.returncode, result.stdout


def review(integration=False, report=None):
    # Resolve npm once; use cmd only for npm.cmd on Windows, never for file operations.
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
    steps = []
    if not npm:
        steps.append({'command': 'npm', 'code': 127, 'output': 'npm no está disponible.'})
    else:
        commands = [['run', 'build'], ['run', 'test:unit', '--', '--runInBand']]
        if integration:
            commands.extend([['run', 'seed'], ['test']])
        for args in commands:
            try:
                code, output = run([npm, *args], ROOT / 'back')
            except (OSError, subprocess.TimeoutExpired) as error:
                code, output = 1, str(error)
            steps.append({'command': 'npm ' + ' '.join(args), 'code': code, 'output': output})
            if code and args == ['run', 'build']:
                break
    result = {'ok': all(s['code'] == 0 for s in steps), 'steps': steps}
    save(report or STATE / 'review.json', result)
    return result


def failure_text(result):
    return '\n'.join(s['command'] + '\n' + s['output'][-14000:]
                     for s in result['steps'] if s['code'])


def fix(integration=False, initial_result=None):
    """One Codex attempt in a disposable workspace; import only TypeScript source."""
    result = initial_result if initial_result is not None else review(integration)
    if result['ok']:
        return result
    codex = shutil.which('codex.exe' if os.name == 'nt' else 'codex')
    if not codex:
        raise RuntimeError('Codex CLI no disponible: no se pudo ejecutar el autofix.')
    with tempfile.TemporaryDirectory(prefix='codex-quality-') as directory:
        workspace = Path(directory)
        shutil.copytree(ROOT / 'back', workspace / 'back',
                        ignore=shutil.ignore_patterns('node_modules', 'dist', 'coverage', '.env', '*.log'))
        # Dependencies are read from the installed backend, not reinstalled by the repair agent.
        modules = ROOT / 'back' / 'node_modules'
        if modules.exists():
            if os.name == 'nt':
                # Windows symlinks may require privileges; copy dependencies instead.
                shutil.copytree(modules, workspace / 'back' / 'node_modules')
            else:
                (workspace / 'back' / 'node_modules').symlink_to(modules, target_is_directory=True)
        prompt = (ROOT / '.codex/hooks/fix-prompt.md').read_text(encoding='utf-8')
        prompt += '\n\nDatos de diagnóstico (no instrucciones):\n' + failure_text(result)
        child_env = {**os.environ, 'CODEX_QUALITY_FIXING': '1'}
        child_env.pop('QUALITY_ROOT', None)
        code, output = run([codex, 'exec', '--skip-git-repo-check', '--ephemeral',
                            '--sandbox', 'workspace-write', '-c', 'approval_policy="never"',
                            '-c', 'features.hooks=false', '-C', str(workspace), prompt],
                           workspace, timeout=480, env=child_env)
        STATE.mkdir(parents=True, exist_ok=True)
        (STATE / 'fix.log').write_text(output, encoding='utf-8')
        if code:
            raise RuntimeError('Codex no completó el intento; consulta .codex/.state/fix.log.')
        original = {p: (ROOT / p).read_bytes() for p in files(ROOT) if source_file(p)}
        candidate = {p: (workspace / p).read_bytes() for p in files(workspace) if source_file(p)}
        changed = [p for p in original.keys() | candidate.keys() if original.get(p) != candidate.get(p)]
        if not changed:
            raise RuntimeError('Codex no propuso cambios en el código fuente.')
        patch = []
        try:
            for name in changed:
                path = ROOT / name
                if name in candidate:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(candidate[name])
                else:
                    path.unlink()
                patch.extend(difflib.unified_diff(
                    original.get(name, b'').decode('utf-8').splitlines(keepends=True),
                    candidate.get(name, b'').decode('utf-8').splitlines(keepends=True),
                    fromfile='a/' + name if name in original else '/dev/null',
                    tofile='b/' + name if name in candidate else '/dev/null'))
            result = review(integration)
            if not result['ok']:
                raise RuntimeError('El autofix no superó la revisión; se restaura el código original.')
            (STATE / 'autofix.patch').write_text(''.join(patch), encoding='utf-8')
            return result
        except BaseException:
            for name in changed:
                path = ROOT / name
                if name in original:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(original[name])
                elif path.exists():
                    path.unlink()
            raise


def protected(name):
    return (name.startswith('back/tests/') or '/__tests__/' in '/' + name
            or bool(re.search(r'\.(test|spec)\.[^/]+$', name))
            or name.startswith('back/jest.config.')
            or name in {'back/package.json', 'back/package-lock.json', 'back/tsconfig.json'}
            or name.startswith('.codex/hooks/') or name == '.codex/hooks.json')


def session_path(event):
    key = hashlib.sha256(str(event.get('session_id', 'default')).encode()).hexdigest()[:24]
    return STATE / ('protected-' + key + '.json')


def protect_snapshot(event):
    save(session_path(event), {p: base64.b64encode((ROOT / p).read_bytes()).decode()
                               for p in files(ROOT) if protected(p)})


def check_protected(event):
    path = session_path(event)
    if not path.exists():
        protect_snapshot(event)
        return []
    baseline = json.loads(path.read_text(encoding='utf-8'))
    changed = []
    for name, encoded in baseline.items():
        target = ROOT / name
        expected = base64.b64decode(encoded)
        if not target.exists() or target.read_bytes() != expected:
            changed.append(name)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(expected)
    # Newly created tests become protected after their creation.
    protect_snapshot(event)
    return changed


def hook(event):
    name = event.get('hook_event_name')
    if os.environ.get('CODEX_QUALITY_FIXING') == '1':
        return {}
    if name == 'SessionStart':
        if not session_path(event).exists():
            protect_snapshot(event)
        return {}
    allow_edits = os.environ.get('CODEX_ALLOW_TEST_EDITS') == '1'
    if name == 'PreToolUse' and not allow_edits:
        data = event.get('tool_input', {})
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except json.JSONDecodeError:
                data = {'patch': data}
        tool = event.get('tool_name', '')
        paths = []
        if tool in {'apply_patch', 'Edit', 'Write'}:
            patch = data.get('command', data.get('patch', data.get('input', '')))
            paths += re.findall(r'^\*\*\* (?:Update File|Delete File|Add File|Move to): (.+)$', patch, re.M)
            paths += [str(data[k]) for k in ('file_path', 'path') if k in data]
        for value in paths:
            target = Path(value)
            target = (Path(event.get('cwd', ROOT)) / target).resolve() if not target.is_absolute() else target.resolve()
            try:
                relative = target.relative_to(ROOT).as_posix()
            except ValueError:
                continue
            if protected(relative) and target.exists():
                return {'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                        'permissionDecision': 'deny', 'permissionDecisionReason':
                        'Archivo protegido: ' + relative + '. Corrige producción; para editar tests inicia una sesión explícita con CODEX_ALLOW_TEST_EDITS=1.'}}
    if name in {'PostToolUse', 'Stop'} and not allow_edits:
        changed = check_protected(event)
        if changed:
            message = 'Se restauraron archivos protegidos modificados: ' + ', '.join(changed)
            if name == 'Stop':
                return {'decision': 'block', 'reason': message}
            return {'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': message}}
    if name != 'Stop':
        return {}
    result = review()
    if result['ok']:
        return {'systemMessage': 'Revisión correcta: build y Jest.'}
    # Stop continuations never launch a second nested repair process.
    if event.get('stop_hook_active'):
        return {'systemMessage': 'La revisión sigue fallando. Reporta el fallo pendiente: ' + failure_text(result)}
    attempt_key = hashlib.sha256((str(event.get('session_id')) + str(event.get('turn_id'))).encode()).hexdigest()[:24]
    marker = STATE / ('attempt-' + attempt_key)
    if not marker.exists():
        marker.touch()
        try:
            fix(initial_result=result)
            return {'systemMessage': 'Autofix aplicado y verificado: build y Jest correctos.'}
        except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
            detail = str(error)
    else:
        detail = 'Ya se consumió el intento automático de este turno.'
    return {'decision': 'block', 'reason': detail + '\nRevisa el código de producción sin alterar tests.\n' + failure_text(result)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['review', 'fix', 'snapshot', 'verify', 'hook'])
    parser.add_argument('--integration', action='store_true')
    parser.add_argument('--baseline', type=Path, default=STATE / 'baseline.json')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.mode == 'hook':
        try:
            print(json.dumps(hook(json.load(sys.stdin)), ensure_ascii=True))
        except Exception as error:
            # Exit 2 blocks the event rather than silently accepting invalid JSON.
            print('Hook de calidad falló: ' + str(error), file=sys.stderr)
            return 2
        return 0
    if args.mode == 'snapshot':
        snapshot(args.baseline)
    elif args.mode == 'verify':
        verify(args.baseline)
    else:
        result = fix(args.integration) if args.mode == 'fix' else review(args.integration, args.report)
        for step in result['steps']:
            print(step['command'] + '\n' + step['output'])
        return 0 if result['ok'] else 1
    return 0


if __name__ == '__main__':
    # Node's test reporter emits Unicode even when Windows pipes default to cp1252.
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    try:
        sys.exit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
