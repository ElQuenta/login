import { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { User, publicUser } from '../../models/User';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const dummyHash = bcrypt.hashSync('unused-comparison-password', 10);

function credentials(body: unknown) {
  if (!body || typeof body !== 'object') return null;
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || typeof password !== 'string') return null;
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail) ||
      password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) return null;
  return { email: normalizedEmail, password };
}

export const register: RequestHandler = async (req, res, next) => {
  const data = credentials(req.body);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!data || !name || name.length > 100) {
    res.status(400).json({ message: 'Nombre (1-100 caracteres), email válido y contraseña de al menos 8 caracteres (máximo 72 bytes) son obligatorios.' });
    return;
  }
  try {
    const password = await bcrypt.hash(data.password, 10);
    const user = await User.create({ name, email: data.email, password });
    res.status(201).json({ user: publicUser(user) });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      res.status(409).json({ message: 'No se pudo registrar ese email.' }); return;
    }
    next(error);
  }
};

export const login: RequestHandler = async (req, res, next) => {
  const data = credentials(req.body);
  if (!data) { res.status(400).json({ message: 'Email o contraseña inválidos.' }); return; }
  try {
    const user = await User.findOne({ email: data.email }).select('+password');
    const matches = await bcrypt.compare(data.password, user?.password || dummyHash);
    if (!user || !matches) {
      res.status(401).json({ message: 'Email o contraseña incorrectos.' }); return;
    }
    const token = jwt.sign({}, env.jwtSecret, {
      subject: String(user._id), algorithm: 'HS256', expiresIn: env.jwtExpiresIn,
    });
    res.json({ token, user: publicUser(user) });
  } catch (error) { next(error); }
};

export const me: RequestHandler = async (_req, res, next) => {
  try {
    const user = await User.findById(res.locals.userId);
    if (!user) { res.status(401).json({ message: 'Usuario no autenticado.' }); return; }
    res.json({ user: publicUser(user) });
  } catch (error) { next(error); }
};
