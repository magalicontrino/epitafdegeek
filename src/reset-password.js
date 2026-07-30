/* Changer le mot de passe d'un gardien :  npm run reset-password stephane */

import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import { db, setAdminPassword } from './db.js';

const username = (argv[2] ?? '').trim().toLowerCase();
const admins = db.prepare('SELECT username, display_name FROM admins').all();

if (!username) {
  console.log('Usage : npm run reset-password <utilisateur>');
  console.log('Utilisateurs :', admins.map((a) => a.username).join(', '));
  exit(1);
}

const admin = admins.find((a) => a.username === username);
if (!admin) {
  console.error(`Utilisateur inconnu : ${username}`);
  console.error('Utilisateurs :', admins.map((a) => a.username).join(', '));
  exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const password = (await rl.question(`Nouveau mot de passe pour ${admin.display_name} : `)).trim();
rl.close();

if (password.length < 8) {
  console.error('Mot de passe trop court (8 caractères minimum).');
  exit(1);
}

setAdminPassword(username, password);
console.log(`Mot de passe mis à jour pour ${admin.display_name}. Les sessions ouvertes ont été fermées.`);
