import bcrypt from 'bcrypt';
import { connectDatabase, disconnectDatabase } from './config/database';
import { User } from './models/User';

async function seed() {
  await connectDatabase();
  await User.init();
  const email = 'demo@example.com';
  const existing = await User.findOne({ email }).select('+password');
  if (existing) {
    if (existing.name !== 'Usuario Demo' || !await bcrypt.compare('DemoLogin2026!', existing.password)) {
      throw new Error('El email demo@example.com ya pertenece a otro usuario; no se modificó.');
    }
    console.log('El usuario demo ya existe.');
    return;
  }
  await User.create({ name: 'Usuario Demo', email, password: await bcrypt.hash('DemoLogin2026!', 10) });
  console.log('Usuario demo creado.');
}

seed().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(disconnectDatabase);
