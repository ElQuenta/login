import 'dotenv/config';
import type { SignOptions } from 'jsonwebtoken';

const secret = process.env.JWT_SECRET;
const mongoUri = process.env.MONGO_URI;
if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
  throw new Error('Configura JWT_SECRET con un secreto aleatorio de al menos 32 caracteres.');
}
if (!mongoUri) throw new Error('Configura MONGO_URI.');
const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
if (!/^\d+(ms|s|m|h|d|w|y)$/.test(expiresIn)) {
  throw new Error('JWT_EXPIRES_IN debe incluir unidad, por ejemplo 1h.');
}
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido.');

export const env = {
  mongoUri,
  jwtSecret: secret,
  jwtExpiresIn: expiresIn as SignOptions['expiresIn'],
  port,
  frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
};
