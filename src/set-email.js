/* Enregistre l'adresse e-mail d'un gardien, pour qu'il puisse s'en servir
   comme identifiant de connexion :

     npm run adresse stephane steph@exemple.fr

   Les adresses restent dans la base locale et ne partent jamais sur GitHub. */

import { argv, exit } from 'node:process';
import { db } from './db.js';

const username = (argv[2] ?? '').trim().toLowerCase();
const email = (argv[3] ?? '').trim();
const admins = db.prepare('SELECT username, display_name, email FROM admins').all();

if (!username) {
  console.log('Usage : npm run adresse <utilisateur> <adresse>\n');
  console.log('Gardiens enregistrés :');
  for (const a of admins) {
    console.log(`  ${a.username.padEnd(10)} ${a.display_name.padEnd(10)} ${a.email || '(aucune adresse)'}`);
  }
  exit(username ? 1 : 0);
}

const admin = admins.find((a) => a.username === username);
if (!admin) {
  console.error(`Gardien inconnu : ${username}`);
  console.error('Gardiens :', admins.map((a) => a.username).join(', '));
  exit(1);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Adresse invalide : ${email || '(vide)'}`);
  exit(1);
}

const pris = admins.find((a) => a.username !== username && a.email.toLowerCase() === email.toLowerCase());
if (pris) {
  console.error(`Cette adresse est déjà celle de ${pris.display_name}.`);
  exit(1);
}

db.prepare('UPDATE admins SET email = ? WHERE username = ?').run(email, username);
console.log(`${admin.display_name} peut désormais se connecter avec ${email} ou avec ${username}.`);
