import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, verifyPassword } from './db.js';
import { CATEGORIES } from './categories.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');

const PORT = Number(process.env.PORT ?? 3000);
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 h

// En ligne, le site tourne derrière un reverse proxy (Fly, Render, nginx…).
// À n'activer QUE dans ce cas : sinon n'importe qui pourrait se fabriquer
// un faux X-Forwarded-For et contourner la limite anti-spam.
const TRUST_PROXY = process.env.TRUST_PROXY === '1';

const MAX_TEXT = 240;
const MAX_AUTHOR = 40;

/* ------------------------------------------------------------------ */
/* Utilitaires HTTP                                                    */
/* ------------------------------------------------------------------ */

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

async function readJsonBody(req, limit = 8 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('payload trop volumineux');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('JSON invalide');
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const i = part.indexOf('=');
      return i === -1
        ? [part.trim(), '']
        : [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim())];
    })
  );
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'inconnu';
}

function clientIpHash(req) {
  return createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16);
}

// Le proxy termine le TLS : la connexion vue par Node est en clair, mais le
// visiteur, lui, est bien en HTTPS — le cookie doit alors porter Secure.
function isHttps(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-proto']) {
    return String(req.headers['x-forwarded-proto']).split(',')[0].trim() === 'https';
  }
  return Boolean(req.socket.encrypted);
}

// Les requêtes qui modifient l'état doivent venir de la page elle-même.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // requêtes non-navigateur (curl, tests)
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Sessions admin                                                      */
/* ------------------------------------------------------------------ */

function createSession(username) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, username, expires_at) VALUES (?, ?, ?)')
    .run(token, username, Date.now() + SESSION_TTL_MS);
  return token;
}

function currentAdmin(req) {
  const token = parseCookies(req).epitaf_session;
  if (!token) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db
    .prepare('SELECT username, display_name FROM admins WHERE username = ?')
    .get(session.username) ?? null;
}

function sessionCookie(req, token, maxAgeSeconds) {
  const secure = isHttps(req) ? '; Secure' : '';
  return `epitaf_session=${token}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`;
}

/* ------------------------------------------------------------------ */
/* Anti-spam très simple : 5 propositions / 10 min / adresse IP        */
/* ------------------------------------------------------------------ */

const submissionLog = new Map();

function rateLimited(ipHash) {
  const now = Date.now();
  const window = 10 * 60 * 1000;
  const hits = (submissionLog.get(ipHash) ?? []).filter((t) => now - t < window);
  if (hits.length >= 5) {
    submissionLog.set(ipHash, hits);
    return true;
  }
  hits.push(now);
  submissionLog.set(ipHash, hits);
  return false;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function cleanEpitaphInput(body) {
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim();
  const author = String(body.author ?? '').replace(/\s+/g, ' ').trim();
  const category = String(body.category ?? 'Divers').trim();

  if (text.length < 3) return { error: 'L’épitaphe doit faire au moins 3 caractères.' };
  if (text.length > MAX_TEXT) return { error: `L’épitaphe ne doit pas dépasser ${MAX_TEXT} caractères.` };
  if (author.length > MAX_AUTHOR) return { error: `Le pseudo ne doit pas dépasser ${MAX_AUTHOR} caractères.` };
  if (!CATEGORIES.includes(category)) return { error: 'Catégorie inconnue.' };

  return { text, author: author || 'Anonyme', category };
}

/* ------------------------------------------------------------------ */
/* Routes API                                                          */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, url) {
  const method = req.method;
  const path = url.pathname;

  if (method !== 'GET' && !sameOrigin(req)) {
    return sendJson(res, 403, { error: 'Origine non autorisée.' });
  }

  /* ---------- public ---------- */

  if (path === '/api/categories' && method === 'GET') {
    return sendJson(res, 200, { categories: CATEGORIES });
  }

  if (path === '/api/epitaphs' && method === 'GET') {
    const category = url.searchParams.get('category');
    const search = (url.searchParams.get('q') ?? '').trim();

    let sql = "SELECT id, text, author, category, created_at FROM epitaphs WHERE status = 'approved'";
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (text LIKE ? OR author LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY id DESC';

    const rows = db.prepare(sql).all(...params);
    const counts = db
      .prepare("SELECT category, COUNT(*) AS n FROM epitaphs WHERE status = 'approved' GROUP BY category")
      .all();
    return sendJson(res, 200, { epitaphs: rows, counts });
  }

  if (path === '/api/epitaphs' && method === 'POST') {
    const ipHash = clientIpHash(req);
    if (rateLimited(ipHash)) {
      return sendJson(res, 429, {
        error: 'Trop de propositions d’un coup. Réessayez dans quelques minutes.',
      });
    }

    const body = await readJsonBody(req);
    const clean = cleanEpitaphInput(body);
    if (clean.error) return sendJson(res, 400, { error: clean.error });

    const duplicate = db
      .prepare('SELECT id FROM epitaphs WHERE lower(text) = lower(?)')
      .get(clean.text);
    if (duplicate) {
      return sendJson(res, 409, { error: 'Cette épitaphe a déjà été proposée.' });
    }

    db.prepare(`
      INSERT INTO epitaphs (text, author, category, status, created_at, submitter_ip)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(clean.text, clean.author, clean.category, new Date().toISOString(), ipHash);

    return sendJson(res, 201, {
      message: 'Proposition enregistrée. Elle apparaîtra une fois validée par la modération.',
    });
  }

  /* ---------- authentification ---------- */

  if (path === '/api/admin/login' && method === 'POST') {
    const body = await readJsonBody(req);
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    // On accepte l'identifiant court ou l'adresse e-mail, au choix.
    const admin = db
      .prepare("SELECT * FROM admins WHERE username = ? OR (email <> '' AND lower(email) = ?)")
      .get(username, username);

    if (!admin || !verifyPassword(password, admin.salt, admin.password_hash)) {
      return sendJson(res, 401, { error: 'Identifiant ou mot de passe incorrect.' });
    }

    const token = createSession(admin.username);
    return sendJson(
      res,
      200,
      { admin: { username: admin.username, display_name: admin.display_name } },
      { 'set-cookie': sessionCookie(req, token, SESSION_TTL_MS / 1000) }
    );
  }

  if (path === '/api/admin/logout' && method === 'POST') {
    const token = parseCookies(req).epitaf_session;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return sendJson(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
  }

  if (path === '/api/admin/me' && method === 'GET') {
    const admin = currentAdmin(req);
    return sendJson(res, 200, { admin });
  }

  /* ---------- zone protégée ---------- */

  if (path.startsWith('/api/admin/')) {
    const admin = currentAdmin(req);
    if (!admin) return sendJson(res, 401, { error: 'Connexion requise.' });

    if (path === '/api/admin/epitaphs' && method === 'GET') {
      const status = url.searchParams.get('status') ?? 'pending';
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return sendJson(res, 400, { error: 'Statut inconnu.' });
      }
      const rows = db
        .prepare('SELECT * FROM epitaphs WHERE status = ? ORDER BY id DESC')
        .all(status);
      const counts = Object.fromEntries(
        db.prepare('SELECT status, COUNT(*) AS n FROM epitaphs GROUP BY status')
          .all()
          .map((r) => [r.status, r.n])
      );
      return sendJson(res, 200, { epitaphs: rows, counts });
    }

    const match = path.match(/^\/api\/admin\/epitaphs\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      const row = db.prepare('SELECT * FROM epitaphs WHERE id = ?').get(id);
      if (!row) return sendJson(res, 404, { error: 'Épitaphe introuvable.' });

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const next = { ...row, ...body };
        const clean = cleanEpitaphInput(next);
        if (clean.error) return sendJson(res, 400, { error: clean.error });

        const status = body.status ?? row.status;
        if (!['pending', 'approved', 'rejected'].includes(status)) {
          return sendJson(res, 400, { error: 'Statut inconnu.' });
        }

        db.prepare(`
          UPDATE epitaphs
             SET text = ?, author = ?, category = ?, status = ?,
                 reviewed_at = ?, reviewed_by = ?
           WHERE id = ?
        `).run(
          clean.text, clean.author, clean.category, status,
          new Date().toISOString(), admin.display_name, id
        );

        return sendJson(res, 200, {
          epitaph: db.prepare('SELECT * FROM epitaphs WHERE id = ?').get(id),
        });
      }

      if (method === 'DELETE') {
        db.prepare('DELETE FROM epitaphs WHERE id = ?').run(id);
        return sendJson(res, 200, { ok: true });
      }
    }
  }

  return sendJson(res, 404, { error: 'Route inconnue.' });
}

/* ------------------------------------------------------------------ */
/* Fichiers statiques                                                  */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

async function serveStatic(req, res, url) {
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/admin') pathname = '/admin.html';

  const filePath = join(publicDir, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end('Interdit');
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>Page non trouvée. <a href="/">Retour au cimetière</a></p>');
  }
}

/* ------------------------------------------------------------------ */

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erreur serveur.' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`⚰️  EPITAF de geek — http://localhost:${PORT}`);
  console.log(`   Modération       — http://localhost:${PORT}/admin`);
  if (TRUST_PROXY) console.log('   Mode proxy activé (X-Forwarded-For, cookie Secure).');
});
