import { app } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { User } from './models/User';

async function start() {
  await connectDatabase();
  await User.init();
  const server = app.listen(env.port, () => console.log(`API disponible en http://localhost:${env.port}`));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      await disconnectDatabase();
      process.exitCode = 0;
    });
    server.closeIdleConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.on('error', async () => {
    console.error('No se pudo abrir el puerto de la API.');
    await disconnectDatabase();
    process.exitCode = 1;
  });
}

start().catch(async () => {
  console.error('No se pudo iniciar la API. Revisa MongoDB y las variables de entorno.');
  await disconnectDatabase();
  process.exitCode = 1;
});
