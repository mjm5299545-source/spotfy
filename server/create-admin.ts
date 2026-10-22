import { resolve } from 'node:path';
import { createDatabase, id, passwordHash } from './db.ts';
import { createPostgresDatabase } from './postgres.ts';
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Administrador';
if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) {
  console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres); ADMIN_NAME é opcional. Nunca inclua a senha no código.');
  process.exit(1);
}
const db = process.env.DATABASE_URL
  ? await createPostgresDatabase(process.env.DATABASE_URL)
  : createDatabase(process.env.DATABASE_PATH || resolve('data/spotfy.sqlite'),resolve('public/catalog.json'));
const existing = await db.prepare('SELECT id,role FROM users WHERE email=?').get(email);
if (existing) {
  console.error('O endereço já existe. Use a administração autenticada para alterar permissões. Nenhuma senha foi sobrescrita.');
  await db.close(); process.exit(1);
}
await db.prepare('INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,?)').run(id(),name,email,passwordHash(password),'admin');
console.log('Administrador criado.'); await db.close();
