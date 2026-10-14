import { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { env } from '../config/env';

export const requireAuth: RequestHandler = (req, res, next) => {
  const authorization = req.headers.authorization;
  const match = authorization?.match(/^Bearer (\S+)$/);
  if (!match) { res.status(401).json({ message: 'Autenticación requerida.' }); return; }
  try {
    const payload = jwt.verify(match[1], env.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || !isValidObjectId(payload.sub)) {
      throw new Error('Token inválido');
    }
    res.locals.userID = payload.sub;
    next();
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado.' });
  }
};
