# MongoDB local

Desde `back/`, ejecuta `docker compose up -d` para levantar MongoDB y
`docker compose down` para detenerlo. Los datos permanecen en el volumen
`login-auth_mongo_data`. No uses `down -v` si quieres conservar los datos.

El backend ejecutado en el host debe usar
`MONGO_URI=mongodb://localhost:27017/auth_db`.
Si en el futuro el backend se ejecuta en la misma red Docker, debe usar
`mongodb://mongo:27017/auth_db`.

El puerto se publica únicamente en `127.0.0.1`. La instancia local no utiliza
credenciales y debe mantenerse accesible solo desde el equipo de desarrollo.

La única colección de aplicación prevista es `users`, con `name`, `email`,
`password` (hash bcrypt), `createdAt` y `updatedAt`. El modelo User del backend
gestiona el esquema y el índice único de `email`. El script inicial crea la
colección en un volumen nuevo; no se ejecuta de nuevo sobre datos persistidos.

Para comprobar el servicio: `docker compose ps` y
`docker compose exec mongo mongosh auth_db --quiet --eval 'db.adminCommand({ping:1})'`.

Si el puerto 27017 está ocupado por otra instancia, resuelve ese conflicto
antes de arrancar este Compose. No detengas servicios ajenos ni borres sus datos.

La imagen configurada es `mongo:7` por preferencia del proyecto. Se verificó
el arranque con Docker Compose y una consulta real con mongosh:
`{ping:1,database:'auth_db',collections:['users']}`.
