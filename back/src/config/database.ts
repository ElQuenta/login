import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  // Una conexión compartida para el servidor local; conservamos el pool del driver.
  await mongoose.connect(env.mongoUri);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
