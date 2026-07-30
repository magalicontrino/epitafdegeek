/* ==================================================================
   EPITAF de geek — salle de modération
   ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);

const state = { admin: null, status: 'pending', categories: [], rows: [], counts: {} };

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Erreur inattendue.');
  return data;
}

function frDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ---------- connexion ---------- */

function showLogin() {
  $('#login-section').hidden = false;
  $('#mod-section').hidden = true;
  $('#who').hidden = true;
}

function showQueue() {
  $('#login-section').hidden = true;
  $('#mod-section').hidden = false;
  $('#who').hidden = false;
  $('#who-name').textContent = state.admin.display_name;
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const notice = $('#login-notice');
  const btn = $('#login-btn');
  btn.disabled = true;

  try {
    const data = await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#l-user').value, password: $('#l-pass').value }),
    });
    state.admin = data.admin;
    notice.className = 'notice';
    $('#l-pass').value = '';
    showQueue();
    await loadQueue();
  } catch (err) {
    notice.className = 'notice is-visible notice--err';
    notice.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  state.admin = null;
  showLogin();
});

/* ---------- file ---------- */

$('#tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (!tab) return;
  state.status = tab.dataset.status;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t === tab));
  loadQueue();
});

// Même garde que côté public : on peut cliquer d'un onglet à l'autre
// plus vite que les réponses n'arrivent.
let queueSeq = 0;

async function loadQueue() {
  const seq = ++queueSeq;
  const data = await api(`/api/admin/epitaphs?status=${state.status}`);
  if (seq !== queueSeq) return;
  state.rows = data.epitaphs;
  state.counts = data.counts;

  for (const status of ['pending', 'approved', 'rejected']) {
    const el = document.querySelector(`[data-count="${status}"]`);
    if (el) el.textContent = state.counts[status] ?? 0;
  }

  const labels = {
    pending: ['en attente', 'en attente'],
    approved: ['gravée', 'gravées'],
    rejected: ['refusée', 'refusées'],
  };
  const [singular, plural] = labels[state.status];
  $('#queue-meta').textContent = `${state.rows.length} ${state.rows.length > 1 ? plural : singular}`;

  renderQueue();
}

function renderQueue() {
  const queue = $('#queue');

  if (!state.rows.length) {
    const messages = {
      pending: ['File vide.', 'Rien à modérer. Profitez-en.'],
      approved: ['Aucune épitaphe gravée.', 'Validez une proposition pour commencer.'],
      rejected: ['Aucun refus.', 'Vous êtes des gardiens cléments.'],
    };
    const [title, sub] = messages[state.status];
    queue.innerHTML = `<div class="empty"><h3>${title}</h3><p>${sub}</p></div>`;
    return;
  }

  queue.innerHTML = state.rows
    .map((row) => {
      const options = state.categories
        .map((c) => `<option value="${esc(c)}"${c === row.category ? ' selected' : ''}>${esc(c)}</option>`)
        .join('');

      const actions =
        state.status === 'pending'
          ? `<button class="btn btn--sm" data-act="approve">✓ Graver</button>
             <button class="btn btn--sm btn--ghost" data-act="save">Enregistrer</button>
             <button class="btn btn--sm btn--red" data-act="reject">✕ Refuser</button>`
          : state.status === 'approved'
          ? `<button class="btn btn--sm btn--ghost" data-act="save">Enregistrer</button>
             <button class="btn btn--sm btn--red" data-act="reject">Retirer du cimetière</button>`
          : `<button class="btn btn--sm" data-act="approve">✓ Finalement, graver</button>`;

      return `
        <article class="review" data-id="${row.id}">
          <div class="review__meta">
            <span style="font-family:var(--font-mono)">N°${String(row.id).padStart(3, '0')}</span>
            <span>Proposée le ${esc(frDate(row.created_at))}</span>
            ${row.reviewed_by ? `<span>· traitée par ${esc(row.reviewed_by)}</span>` : ''}
          </div>

          <textarea data-field="text" maxlength="240">${esc(row.text)}</textarea>

          <div class="review__row">
            <label>
              <span class="micro micro--mute">Signature</span>
              <input type="text" data-field="author" maxlength="40" value="${esc(row.author)}">
            </label>
            <label>
              <span class="micro micro--mute">Allée</span>
              <select data-field="category">${options}</select>
            </label>
          </div>

          <div class="notice" data-role="notice"></div>
          <div class="review__actions">${actions}</div>
        </article>`;
    })
    .join('');
}

$('#queue').addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-act]');
  if (!btn) return;

  const card = btn.closest('.review');
  const id = card.dataset.id;
  const notice = card.querySelector('[data-role="notice"]');
  const act = btn.dataset.act;

  const payload = {
    text: card.querySelector('[data-field="text"]').value,
    author: card.querySelector('[data-field="author"]').value,
    category: card.querySelector('[data-field="category"]').value,
  };
  if (act === 'approve') payload.status = 'approved';
  if (act === 'reject') payload.status = 'rejected';

  card.querySelectorAll('button').forEach((b) => (b.disabled = true));

  try {
    await api(`/api/admin/epitaphs/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (act === 'save') {
      notice.className = 'notice is-visible notice--ok';
      notice.textContent = 'Modifications enregistrées.';
      card.querySelectorAll('button').forEach((b) => (b.disabled = false));
    } else {
      await loadQueue();
    }
  } catch (err) {
    notice.className = 'notice is-visible notice--err';
    notice.textContent = err.message;
    card.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
});

/* ---------- amorçage ---------- */

(async function init() {
  const [{ categories }, { admin }] = await Promise.all([
    api('/api/categories'),
    api('/api/admin/me'),
  ]);
  state.categories = categories;

  if (admin) {
    state.admin = admin;
    showQueue();
    await loadQueue();
  } else {
    showLogin();
  }
})();
