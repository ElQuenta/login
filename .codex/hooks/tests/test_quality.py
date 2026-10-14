"""Behavioral tests for protection and bounded repair. No API calls or live DB."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('quality', Path(__file__).resolve().parents[1] / 'quality.py')
quality = importlib.util.module_from_spec(spec)
spec.loader.exec_module(quality)
GOOD = {'ok': True, 'steps': []}
BAD = {'ok': False, 'steps': [{'command': 'test', 'code': 1, 'output': 'expected true, received false'}]}


class QualityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patch_root = patch.object(quality, 'ROOT', self.root)
        self.patch_state = patch.object(quality, 'STATE', self.root / '.codex/.state')
        self.patch_root.start()
        self.patch_state.start()
        self.addCleanup(self.patch_root.stop)
        self.addCleanup(self.patch_state.stop)
        self.env = patch.dict(quality.os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.write('back/src/service.ts', 'export const value = false;\n')
        self.write('back/tests/unit/service.test.cjs', 'original assertions\n')
        self.write('back/package.json', '{}')
        self.write('.codex/hooks/fix-prompt.md', 'Repair source only.')
        self.event = {'session_id': 'test-session', 'turn_id': '1', 'cwd': str(self.root)}

    def write(self, name, content):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')
        return target

    def event_hook(self, name, **values):
        return quality.hook({**self.event, 'hook_event_name': name, **values})

    def test_patch_to_existing_test_is_denied(self):
        result = self.event_hook('PreToolUse', tool_name='apply_patch',
                                 tool_input={'command': '*** Update File: back/tests/unit/service.test.cjs\n@@\n'})
        self.assertEqual(result['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_patch_to_source_is_allowed(self):
        self.assertEqual(self.event_hook('PreToolUse', tool_name='apply_patch',
                         tool_input={'command': '*** Update File: back/src/service.ts\n'}), {})

    def test_patch_from_backend_subdirectory_is_denied(self):
        result = quality.hook({**self.event, 'cwd': str(self.root / 'back'),
                               'hook_event_name': 'PreToolUse', 'tool_name': 'apply_patch',
                               'tool_input': {'command': '*** Delete File: tests/unit/service.test.cjs\n'}})
        self.assertEqual(result['hookSpecificOutput']['permissionDecision'], 'deny')

    def test_shell_changes_and_deleted_tests_are_restored(self):
        self.event_hook('SessionStart')
        target = self.root / 'back/tests/unit/service.test.cjs'
        target.unlink()
        self.write('back/package.json', '{"scripts":{"test:unit":"exit 0"}}')
        result = self.event_hook('PostToolUse', tool_name='Bash')
        self.assertIn('restauraron', result['hookSpecificOutput']['additionalContext'])
        self.assertEqual(target.read_text(), 'original assertions\n')
        self.assertEqual((self.root / 'back/package.json').read_text(), '{}')

    def test_explicit_test_maintenance_mode_allows_edits(self):
        self.event_hook('SessionStart')
        with patch.dict(quality.os.environ, {'CODEX_ALLOW_TEST_EDITS': '1'}):
            self.write('back/tests/unit/service.test.cjs', 'new assertions')
            self.assertEqual(self.event_hook('PostToolUse'), {})
        self.assertEqual((self.root / 'back/tests/unit/service.test.cjs').read_text(), 'new assertions')

    def test_ci_integrity_accepts_source_but_rejects_test_changes(self):
        baseline = self.root / '.codex/.state/baseline.json'
        quality.snapshot(baseline)
        self.write('back/src/service.ts', 'fixed source')
        quality.verify(baseline)
        self.write('back/tests/unit/service.test.cjs', 'weakened assertion')
        with self.assertRaisesRegex(RuntimeError, 'fuera de'):
            quality.verify(baseline)

    def test_new_test_becomes_protected(self):
        self.event_hook('SessionStart')
        new = self.write('back/tests/unit/new.test.cjs', 'new test')
        self.event_hook('PostToolUse')
        new.write_text('weakened')
        self.event_hook('PostToolUse')
        self.assertEqual(new.read_text(), 'new test')

    def test_stop_repairs_only_once_per_turn(self):
        self.event_hook('SessionStart')
        with patch.object(quality, 'review', return_value=BAD), patch.object(
                quality, 'fix', side_effect=RuntimeError('repair failed')) as fixer:
            first = self.event_hook('Stop', stop_hook_active=False)
            second = self.event_hook('Stop', stop_hook_active=True)
            self.assertEqual(first['decision'], 'block')
            self.assertNotIn('decision', second)
            self.assertIn('sigue fallando', second['systemMessage'])
            fixer.assert_called_once()

    def test_success_does_not_invoke_fixer(self):
        with patch.object(quality, 'review', return_value=GOOD), patch.object(quality, 'fix') as fixer:
            self.event_hook('Stop')
            fixer.assert_not_called()

    def simulated_agent(self, command, cwd, **kwargs):
        self.assertIn('features.hooks=false', command)
        candidate = Path(cwd)
        (candidate / 'back/src/service.ts').write_text('export const value = true;\n')
        # Even if the repair agent changes tests, those edits must never reach the real repo.
        (candidate / 'back/tests/unit/service.test.cjs').write_text('weakened assertion')
        return 0, 'Candidate repair'

    def test_repair_imports_only_source_after_original_tests_pass(self):
        with patch.object(quality.shutil, 'which', return_value='codex'), patch.object(
                quality, 'run', side_effect=self.simulated_agent), patch.object(
                quality, 'review', side_effect=[BAD, GOOD]):
            self.assertTrue(quality.fix()['ok'])
        self.assertIn('true', (self.root / 'back/src/service.ts').read_text())
        self.assertEqual((self.root / 'back/tests/unit/service.test.cjs').read_text(), 'original assertions\n')
        self.assertIn('true', (self.root / '.codex/.state/autofix.patch').read_text())

    def test_failed_candidate_restores_original_source(self):
        with patch.object(quality.shutil, 'which', return_value='codex'), patch.object(
                quality, 'run', side_effect=self.simulated_agent), patch.object(
                quality, 'review', side_effect=[BAD, BAD]):
            with self.assertRaisesRegex(RuntimeError, 'restaura'):
                quality.fix()
        self.assertIn('false', (self.root / 'back/src/service.ts').read_text())
        self.assertFalse((self.root / '.codex/.state/autofix.patch').exists())


if __name__ == '__main__':
    unittest.main()
