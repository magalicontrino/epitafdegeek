import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// En ligne, DATA_DIR pointe vers le volume persistant de l'hébergeur :
// sans cela, un redéploiement effacerait toutes les épitaphes.
const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : join(rootDir, 'data');

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'epitaf.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS epitaphs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    text         TEXT NOT NULL,
    author       TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL DEFAULT 'Divers',
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TEXT NOT NULL,
    reviewed_at  TEXT,
    reviewed_by  TEXT,
    submitter_ip TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_epitaphs_status ON epitaphs(status, id DESC);

  CREATE TABLE IF NOT EXISTS admins (
    username      TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    salt          TEXT NOT NULL,
    password_hash TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// L'adresse de chaque gardien. Volontairement absente du code : le dépôt
// est public, et une adresse en clair y serait moissonnée par les robots.
// Elle ne vit que dans la base locale — voir « npm run adresse ».
if (!db.prepare('PRAGMA table_info(admins)').all().some((c) => c.name === 'email')) {
  db.exec("ALTER TABLE admins ADD COLUMN email TEXT NOT NULL DEFAULT ''");
}

// Certaines épitaphes sont des sorties de terminal — elles se lisent mieux
// en chasse fixe sur fond sombre que dans la grosse police du marbre.
if (!db.prepare('PRAGMA table_info(epitaphs)').all().some((c) => c.name === 'mono')) {
  db.exec('ALTER TABLE epitaphs ADD COLUMN mono INTEGER NOT NULL DEFAULT 0');
}

/* ------------------------------------------------------------------ */
/* Mots de passe                                                       */
/* ------------------------------------------------------------------ */

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function setAdminPassword(username, password) {
  const { salt, hash } = hashPassword(password);
  db.prepare('UPDATE admins SET salt = ?, password_hash = ? WHERE username = ?')
    .run(salt, hash, username);
  db.prepare('DELETE FROM sessions WHERE username = ?').run(username);
}

/* ------------------------------------------------------------------ */
/* Amorçage : les deux administrateurs + quelques épitaphes            */
/* ------------------------------------------------------------------ */

const ADMINS = [
  { username: 'stephane', display_name: 'Stéphane' },
  { username: 'magali', display_name: 'Magali' },
];

function seedAdmins() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM admins').get();
  if (n > 0) return;

  const lines = [
    'Identifiants administrateur EPITAF de geek',
    'Générés automatiquement au premier démarrage.',
    'Changez-les avec :  npm run reset-password <utilisateur>',
    'Supprimez ce fichier une fois les mots de passe notés ailleurs.',
    '',
  ];

  for (const admin of ADMINS) {
    const password = randomBytes(9).toString('base64url');
    const { salt, hash } = hashPassword(password);
    db.prepare(
      'INSERT INTO admins (username, display_name, salt, password_hash) VALUES (?, ?, ?, ?)'
    ).run(admin.username, admin.display_name, salt, hash);
    lines.push(`${admin.display_name.padEnd(10)} identifiant: ${admin.username.padEnd(10)} mot de passe: ${password}`);
  }

  const file = join(dataDir, 'IDENTIFIANTS-ADMIN.txt');
  writeFileSync(file, lines.join('\n') + '\n', { mode: 0o600 });

  console.log('\n' + lines.join('\n'));
  console.log(`\n(Également enregistré dans ${file})\n`);
}

const SEED_EPITAPHS = [
  ['Il n’avait pas fait de sauvegarde.', 'Anonyme', 'Sysadmin'],
  ['Ça marchait pourtant sur ma machine.', 'Anonyme', 'Dev'],
  ['Segmentation fault (core dumped)', 'Anonyme', 'Dev'],
  ['Il a répondu « oui » à rm -rf /', 'Anonyme', 'Sysadmin'],
  ['C’est un tout petit changement, je pousse direct en prod.', 'Anonyme', 'Dev'],
  ['Il manquait un point-virgule ;', 'Anonyme', 'Dev'],
  ['404 — Vie non trouvée.', 'Anonyme', 'Web'],
  ['Connexion perdue. Tentative de reconnexion…', 'Anonyme', 'Réseau'],
  ['GAME OVER — Insérez une pièce pour continuer.', 'Anonyme', 'Gaming'],
  ['Fin de vie. Plus aucun correctif de sécurité ne sera publié.', 'Anonyme', 'Sysadmin'],
  ['while (true) { vivre(); }  // il manquait la condition de sortie', 'Anonyme', 'Dev'],
  ['Il a débranché le mauvais câble.', 'Anonyme', 'Hardware'],
  ['Ctrl+S, une seconde trop tard.', 'Anonyme', 'Dev'],
  ['Je suis désolé, Dave. Je crains de ne pouvoir faire cela.', 'Anonyme', 'Sci-fi'],
  ['Il est passé en veille prolongée. Définitivement.', 'Anonyme', 'Hardware'],
  ['Ci-gît son dernier commit : « fix final v2 (vraiment) ».', 'Anonyme', 'Dev'],
];

function seedEpitaphs() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM epitaphs').get();
  if (n > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO epitaphs (text, author, category, status, created_at, reviewed_at, reviewed_by)
    VALUES (?, ?, ?, 'approved', ?, ?, 'système')
  `);
  for (const [text, author, category] of SEED_EPITAPHS) {
    insert.run(text, author, category, now, now);
  }
}

seedAdmins();
seedEpitaphs();
