# Automatización de calidad

Ejecuta los comandos desde la raíz. Requiere Python 3.11+, Node.js 22 y
dependencias instaladas con `npm ci --prefix back`.

## Codex CLI

La configuración está en `.codex/hooks.json`. Busca el script desde la carpeta
actual o sus padres, por lo que admite iniciar Codex desde `back/`.

- `SessionStart`: guarda una copia de tests y configuración protegidos.
- `PreToolUse`: deniega parches directos a archivos protegidos existentes.
- `PostToolUse`: detecta y restaura modificaciones a esos archivos, incluidas
  las realizadas mediante shell, e informa al agente.
- `Stop`: comprueba protección, ejecuta build y Jest y, si fallan, intenta una
  reparación aislada. Si persiste el fallo, solicita una continuación y evita
  volver a lanzar el reparador en ella.

Codex exige revisar y confiar en los hooks mediante `/hooks`; también debe
confiar en la configuración del proyecto. Este paso corresponde al usuario en
su CLI. No se alteran ajustes globales ni se omite esa revisión.

La protección ayuda contra cambios accidentales; no es una barrera del sistema
operativo. Captura archivos existentes al inicio; los nuevos tests quedan
protegidos después de crearlos. No coordines sesiones distintas que editen los
mismos archivos mientras la protección esté activa.

Para una sesión cuyo objetivo explícito sea crear o mantener tests y configuración:

```powershell
$env:CODEX_ALLOW_TEST_EDITS = '1'
codex
Remove-Item Env:CODEX_ALLOW_TEST_EDITS
```

En Bash: `CODEX_ALLOW_TEST_EDITS=1 codex`. En revisión normal, no definas la
variable. También se protegen Jest, package.json, lockfile, tsconfig y los hooks
para impedir que una reparación evite las pruebas.

## Comandos compartidos

```text
python .codex/hooks/quality.py review
python .codex/hooks/quality.py review --integration
python .codex/hooks/quality.py fix
python .codex/hooks/quality.py fix --integration
python -m unittest discover -s .codex/hooks/tests -v
```

`--integration` necesita `MONGO_URI` de una base de pruebas y un `JWT_SECRET`
válido; ejecuta seed para el demo requerido por la suite existente. El hook local
no la activa por defecto.

El reparador local requiere Codex CLI autenticado. Copia backend a un directorio
temporal sin `.env`, realiza una llamada a `codex exec` con hooks desactivados e
incorpora exclusivamente `back/src/**/*.ts`. La revisión final usa tests y
configuración originales; si falla, restaura el código previo. En Windows copia
dependencias para evitar permisos de enlaces. Informes y parche validado quedan
en `.codex/.state/`, ignorado por Git.

## GitHub Actions

`.github/workflows/backend-quality.yml` responde a `push`, `pull_request` y
`workflow_dispatch`. Instala dependencias con lockfile, levanta MongoDB efímero,
prueba los hooks y ejecuta build, Jest, seed e integración con el mismo revisor.

Si falla y existe el secret `OPENAI_API_KEY`, utiliza `openai/codex-action` para
un intento de reparación. La clave se entrega a la acción, no a npm ni a tests.
En PRs de forks y Dependabot solo comprueba tests, sin usar la clave.
Un script y baseline guardados fuera del checkout verifican que el agente solo
cambió `back/src/**/*.ts`, antes y después de repetir tests. Los hooks de ciclo
de vida se desactivan en ese agente para evitar duplicación; el workflow llama
explícitamente a los scripts compartidos.

Publica el parche solo si la reparación supera pruebas e integridad. No hace
commits ni pushes automáticos. El check del commit original permanece fallido
hasta aplicar y subir el parche: una copia temporal corregida no valida ese commit.

Configura el secret en **Settings → Secrets and variables → Actions**. Sin él,
los tests funcionan y se reportan fallos sin autofix. Descarga informes y parche
desde los artefactos del run; revisa y aplica `git apply autofix.patch`, y sube
la corrección. Para ejecución manual, el workflow debe existir en la rama predeterminada.

Fuentes: [hooks de Codex](https://learn.chatgpt.com/docs/hooks),
[modo no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode),
[acción oficial](https://github.com/openai/codex-action),
[eventos Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
