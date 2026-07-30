/* ==================================================================
   EPITAF de geek — page publique
   ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  category: null,
  search: '',
  categories: [],
  epitaphs: [],
  counts: [],
};

/* ---------- utilitaires ---------- */

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

function debounce(fn, delay = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

/* ---------- rendu ---------- */

function renderFilters() {
  const bar = $('#filters');
  bar.querySelectorAll('.chip').forEach((el) => el.remove());

  const byCat = Object.fromEntries(state.counts.map((c) => [c.category, c.n]));
  const total = state.counts.reduce((sum, c) => sum + c.n, 0);

  const entries = [
    { label: 'Toutes', value: null, n: total },
    ...state.categories.map((c) => ({ label: c, value: c, n: byCat[c] ?? 0 })),
  ];

  for (const entry of entries) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.category === entry.value ? ' is-active' : '');
    chip.innerHTML = `${esc(entry.label)} <span class="chip__n">${entry.n}</span>`;
    chip.addEventListener('click', () => {
      state.category = state.category === entry.value ? null : entry.value;
      if (entry.value === null) state.category = null;
      load();
    });
    bar.appendChild(chip);
  }
}

function renderTombs() {
  const grid = $('#tombs');
  const list = state.epitaphs;

  $('#result-count').textContent = list.length
    ? `${list.length} épitaphe${list.length > 1 ? 's' : ''} affichée${list.length > 1 ? 's' : ''}`
    : 'Aucun résultat';

  if (!list.length) {
    const [title, sub] = state.search
      ? [`Rien pour « ${esc(state.search)} ».`, 'Aucune épitaphe ne contient ces mots.']
      : ['Cette allée est vide.', "Personne n'est encore mort ici."];
    grid.innerHTML = `
      <div class="empty">
        <h3>${title}</h3>
        <p>${sub} <a href="#proposer" style="color:var(--red);font-weight:700">Écrivez la première.</a></p>
      </div>`;
    return;
  }

  grid.innerHTML = list
    .map((e) => {
      const date = new Date(e.created_at);
      const stamp = Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
        <article class="tomb${e.mono ? ' tomb--mono' : ''}">
          <div class="tomb__head">
            <span class="tomb__num">N°${String(e.id).padStart(3, '0')}</span>
            <span class="tomb__cat">${esc(e.category)}</span>
          </div>
          <p class="tomb__text">${esc(e.text)}</p>
          <div class="tomb__foot">
            <span class="tomb__author">${esc(e.author || 'Anonyme')}</span>
            <span class="leader__fill" style="flex:1;border-bottom:2px dotted currentColor;opacity:.35"></span>
            <span>${esc(stamp)}</span>
          </div>
          <button class="tomb__copy" type="button" data-copy="${esc(e.text)}">Copier</button>
        </article>`;
    })
    .join('');

  grid.querySelectorAll('.tomb__copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = 'Copié ✓';
      } catch {
        btn.textContent = 'Échec';
      }
      setTimeout(() => (btn.textContent = 'Copier'), 1600);
    });
  });
}

function renderStats() {
  const total = state.counts.reduce((sum, c) => sum + c.n, 0);
  $('#stat-total').textContent = String(total).padStart(2, '0');
  $('#stat-cats').textContent = String(state.categories.length).padStart(2, '0');
}

function renderTicker() {
  const track = $('#ticker');
  const sample = state.epitaphs.slice(0, 14);
  if (!sample.length) {
    track.innerHTML = '<span>Le cimetière ouvre bientôt ses portes</span>';
    return;
  }
  const items = sample.map((e) => `<span>${esc(e.text)}</span>`).join('');
  track.innerHTML = items + items;
  setTickerSpeed(track);
}

// Le ruban parcourt sa propre largeur à chaque tour. Fixer la durée ferait
// donc accélérer le bandeau à mesure que le cimetière se remplit : on fixe
// une vitesse de lecture, et la durée s'ajuste.
const TICKER_PIXELS_PER_SECOND = 45;

function setTickerSpeed(track) {
  const width = track.offsetWidth;
  if (width) track.style.animationDuration = Math.round(width / TICKER_PIXELS_PER_SECOND) + 's';
}

/* ---------- chargement ---------- */

// Les filtres peuvent s'enchaîner plus vite que les réponses : on ignore
// toute réponse qui n'est pas celle de la dernière requête lancée.
let requestSeq = 0;

async function load() {
  const seq = ++requestSeq;

  const params = new URLSearchParams();
  if (state.category) params.set('category', state.category);
  if (state.search) params.set('q', state.search);

  try {
    const data = await api('/api/epitaphs?' + params);
    if (seq !== requestSeq) return;
    state.epitaphs = data.epitaphs;
    state.counts = data.counts;
    renderFilters();
    renderStats();
    renderTombs();
    if (!state.category && !state.search) renderTicker();
  } catch (err) {
    if (seq !== requestSeq) return;
    $('#tombs').innerHTML = `<div class="empty"><h3>500</h3><p>${esc(err.message)}</p></div>`;
  }
}

/* ---------- formulaire ---------- */

function notify(message, kind) {
  const el = $('#form-notice');
  el.className = `notice is-visible notice--${kind}`;
  el.textContent = message;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setupForm() {
  const text = $('#f-text');
  const counter = $('#counter');

  text.addEventListener('input', () => {
    counter.textContent = `${text.value.length} / 240`;
    counter.classList.toggle('is-over', text.value.length > 230);
  });

  $('#submit-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = $('#submit-btn');
    btn.disabled = true;

    try {
      const data = await api('/api/epitaphs', {
        method: 'POST',
        body: JSON.stringify({
          text: text.value,
          author: $('#f-author').value,
          category: $('#f-category').value,
        }),
      });
      notify(data.message, 'ok');
      text.value = '';
      $('#f-author').value = '';
      counter.textContent = '0 / 240';
    } catch (err) {
      notify(err.message, 'err');
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- amorçage ---------- */

async function init() {
  $('#year').textContent = new Date().getFullYear();

  const { categories } = await api('/api/categories');
  state.categories = categories;
  $('#f-category').innerHTML = categories
    .map((c) => `<option value="${esc(c)}"${c === 'Dev' ? ' selected' : ''}>${esc(c)}</option>`)
    .join('');

  $('#search').addEventListener(
    'input',
    debounce((event) => {
      state.search = event.target.value.trim();
      load();
    })
  );

  setupForm();
  await load();
}

init();
