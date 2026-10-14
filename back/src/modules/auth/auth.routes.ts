import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { register, login, me } from './auth.controller';

export const authRouter = Router();
authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.get('/me', requireAuth, me);
