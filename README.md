# Login local

`front/` contiene la página de login con React, TypeScript y Vite.
`back/` contiene la API Express y toda la configuración de MongoDB con Docker.

## Base de datos y API

Desde `back/`:

```powershell
docker compose up -d
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Antes de iniciar, configura `JWT_SECRET` en `.env` con un valor aleatorio propio.
La conexión local es `mongodb://localhost:27017/auth_db`.

```powershell
npm run seed
npm run dev
```

El comando seed crea el usuario demo para desarrollo:

- Correo: `demo@example.com`
- Contraseña: `DemoLogin2026!`

La contraseña se almacena como hash bcrypt en la colección `users`.

## Frontend

En otra terminal, desde `front/`:

```powershell
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Abre `http://localhost:5173` e inicia sesión con el usuario demo.
`VITE_API_URL` apunta a `http://localhost:3000`.

## Endpoints

| Método | Ruta | Entrada |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` |
| POST | `/auth/login` | `{ email, password }` |
| GET | `/auth/me` | Cabecera `Authorization: Bearer <token>` |

El login devuelve `{ token, user }`. El endpoint `/auth/me` devuelve `{ user }`.
El frontend conserva el token en `sessionStorage` durante la sesión.

Para compilar cada proyecto, ejecuta `npm run build` en su carpeta.
Para detener MongoDB conservando los datos, ejecuta `docker compose down` desde `back/`.

## Calidad, hooks y CI

Desde la raíz, `python .codex/hooks/quality.py review` compila el backend y
ejecuta las pruebas unitarias Jest sin MongoDB. `review --integration` también
ejecuta seed y la prueba HTTP existente: configura una base de datos de pruebas.
`python .codex/hooks/quality.py fix` intenta una reparación con Codex CLI y solo
conserva cambios de producción que pasan las pruebas originales.

En Codex CLI, revisa y activa los hooks del proyecto con `/hooks`. Protegen tests
y configuración, y ejecutan revisión con un intento de reparación al terminar.
GitHub Actions ejecuta las comprobaciones en push, pull request y manualmente.
El autofix de CI requiere el secret `OPENAI_API_KEY` y publica un parche validado
como artefacto; el commit original sigue fallando hasta subir la corrección.

Consulta la [configuración y funcionamiento de la automatización](.codex/skills/flujo-calidad/references/automation.md).
