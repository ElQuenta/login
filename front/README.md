# Login

Página de inicio de sesión en React, TypeScript y Vite. Requiere el backend de `../back` y MongoDB 7 en ejecución.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Abre `http://localhost:5173`. Asegura que el puerto 5173 esté libre antes de iniciar Vite; si usa otro puerto, configura ese origen en CORS del backend. `VITE_API_URL` configura la URL de la API y su valor predeterminado es `http://localhost:3000`. Reinicia Vite después de cambiar `.env`.

Usuario de demostración local, creado por el seed de MongoDB:

- Correo: `demo@example.com`
- Contraseña: `DemoLogin2026!`

Consulta `../back/DATABASE.md` para cargar el dato de prueba en un volumen existente. Estas credenciales son solo para pruebas locales.

El formulario valida correo y contraseña, permite mostrar la contraseña, evita envíos duplicados y comunica errores sin mostrar respuestas sensibles del servidor. Envía `POST /auth/login` con `{ email, password }` y verifica el usuario con `GET /auth/me` y el token Bearer recibido. Tras verificarlo, guarda el token en `sessionStorage` (`auth.token`) y muestra una confirmación en esta misma página. Al recargar, se muestra el formulario de nuevo; no restaura automáticamente la sesión. No hay registro ni páginas adicionales.

```powershell
npm run build
npm run lint
```
