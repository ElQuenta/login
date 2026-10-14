# API de autenticación

Requiere Node.js 20.19+ y MongoDB 7 local. Desde `back`:

```powershell
npm install
docker compose up -d
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Cambia JWT_SECRET por un valor aleatorio de al menos 32 caracteres.
npm run seed
npm run dev
```

Ya se preparó un `.env` local ignorado con secreto aleatorio. No reemplaces ese archivo si deseas conservar la configuración actual. `MONGO_URI=mongodb://localhost:27017/auth_db`, API `http://localhost:3000`, frontend permitido `http://localhost:5173`. `JWT_EXPIRES_IN` admite valores con unidad, como `1h` o `30m`.

Para ejecutar compilado: `npm run build` y `npm start`. Para las pruebas HTTP contra MongoDB real: `npm run build`, `npm run seed` y `npm test`. Las pruebas limpian únicamente su usuario temporal y conservan el demo.

Usuario de demostración: **demo@example.com**, contraseña **DemoLogin2026!**, nombre **Usuario Demo**. Son credenciales públicas para desarrollo local. `npm run seed` es idempotente y rechaza sobrescribir un usuario diferente que ya tenga ese email.

| Endpoint | Solicitud | Respuesta correcta |
| --- | --- | --- |
| `POST /auth/register` | `{ "name": "Ana", "email": "ana@example.com", "password": "UnaClave2026!" }` | 201 `{ "user": { ... } }` |
| `POST /auth/login` | `{ "email": "demo@example.com", "password": "DemoLogin2026!" }` | 200 `{ "token": "JWT", "user": { ... } }` |
| `GET /auth/me` | Header `Authorization: Bearer <token>` | 200 `{ "user": { ... } }` |

`user` contiene `_id`, `name`, `email`, `createdAt`, `updatedAt`. Las fechas son cadenas ISO y `_id` es una cadena. Nunca se devuelve password. Todos los errores tienen `{ "message": "..." }`: 400 validación/JSON incorrecto; 401 credenciales o JWT incorrectos, expirados o ausentes; 409 email duplicado; 413 cuerpo demasiado grande; 404 ruta desconocida; 500 error interno.

El email se recorta y convierte a minúsculas. Nombre: 1-100 caracteres. Password: al menos 8 caracteres y máximo 72 bytes UTF-8 por el límite de bcrypt. bcrypt usa 10 rondas. JWT usa HS256 con expiración configurable. La única colección es `users`, con índice único de email. Se abre una conexión Mongoose antes de aceptar solicitudes y se cierra al detener el servidor; se mantienen los valores predeterminados del pool para este entorno local.

Diagnóstico de conexiones desde `back`:

```powershell
docker compose exec mongo mongosh --quiet --eval 'db.serverStatus().connections'
```

Código: `src/config` entorno y conexión, `src/models/User.ts` modelo, `src/modules/auth` controladores y rutas, `src/middlewares/auth.ts` JWT, `src/app.ts` Express/CORS, `src/server.ts` inicio y cierre, `src/seed.ts` demo. La interfaz solo necesita llamar a login y me; registrar usuarios queda disponible por API.
