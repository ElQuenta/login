import express, { ErrorRequestHandler } from 'express';
import cors from 'cors';
import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.frontendOrigin }));
app.use(express.json({ limit: '16kb' }));
app.use('/auth', authRouter);
app.use((_req, res) => { res.status(404).json({ message: 'Ruta no encontrada.' }); });
const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ message: 'JSON inválido.' }); return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ message: 'Solicitud demasiado grande.' }); return;
  }
  console.error('Error interno en la API.');
  res.status(500).json({ message: 'Error interno del servidor.' });
};
app.use(handleError);
