/* ==================================================================
   Fabrique la version statique du cimetière, dans dist/.

     npm run build

   Ne reprend que les épitaphes validées. Le résultat est un dossier de
   fichiers ordinaires, à déposer tel quel chez n'importe quel hébergeur —
   aucun serveur, aucune base de données à l'arrivée.
   ================================================================== */

import { mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { CATEGORIES } from './categories.js';
import { SITE } from './config.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(rootDir, 'public');
const distDir = join(rootDir, 'dist');

const FORM_ENDPOINT = SITE.formEndpoint;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const frDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* ---------- les données ---------- */

const epitaphs = db
  .prepare("SELECT id, text, author, category, created_at, mono FROM epitaphs WHERE status = 'approved' ORDER BY id DESC")
  .all();

const counts = Object.fromEntries(
  db.prepare("SELECT category, COUNT(*) AS n FROM epitaphs WHERE status = 'approved' GROUP BY category")
    .all()
    .map((r) => [r.category, r.n])
);

/* ---------- les fragments ---------- */

// Les épitaphes sont écrites en dur dans la page : elle reste lisible et
// indexable même si le JavaScript ne s'exécute pas.
const tombsHtml = epitaphs
  .map((e) => {
    const search = `${e.text} ${e.author}`.toLowerCase();
    return `        <article class="tomb${e.mono ? ' tomb--mono' : ''}" data-category="${esc(e.category)}" data-search="${esc(search)}">
          <div class="tomb__head">
            <span class="tomb__num">N°${String(e.id).padStart(3, '0')}</span>
            <span class="tomb__cat">${esc(e.category)}</span>
          </div>
          <p class="tomb__text">${esc(e.text)}</p>
          <div class="tomb__foot">
            <span class="tomb__author">${esc(e.author || 'Anonyme')}</span>
            <span style="flex:1;border-bottom:2px dotted currentColor;opacity:.35"></span>
            <span>${esc(frDate(e.created_at))}</span>
          </div>
        </article>`;
  })
  .join('\n');

const chipsHtml = [{ label: 'Toutes', value: '', n: epitaphs.length }]
  .concat(CATEGORIES.map((c) => ({ label: c, value: c, n: counts[c] ?? 0 })))
  .map(
    (c, i) =>
      `      <button class="chip${i === 0 ? ' is-active' : ''}" type="button" data-cat="${esc(c.value)}">${esc(c.label)} <span class="chip__n">${c.n}</span></button>`
  )
  .join('\n');

const optionsHtml = CATEGORIES.map(
  (c) => `<option value="${esc(c)}"${c === 'Dev' ? ' selected' : ''}>${esc(c)}</option>`
).join('');

const tickerHtml = epitaphs.length
  ? epitaphs.slice(0, 14).map((e) => `<span>${esc(e.text)}</span>`).join('').repeat(2)
  : '<span>Le cimetière ouvre bientôt ses portes</span>';

// Sans adresse de réception, le formulaire annonce la couleur au lieu de
// faire semblant de fonctionner.
const formAttrs = FORM_ENDPOINT
  ? `action="${esc(FORM_ENDPOINT)}" method="POST"`
  : 'data-unconfigured="1"';

const formNotice = FORM_ENDPOINT
  ? ''
  : `<div class="notice is-visible notice--err" style="display:block">
          Formulaire non relié : reconstruisez le site avec FORM_ENDPOINT.
        </div>`;

/* ---------- la page ---------- */

const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>EPITAF de geek — l'annuaire des derniers mots</title>
  <meta name="description" content="EPITAF de geek : le recueil collaboratif des phrases qui méritent de finir gravées dans la ROM. Proposez la vôtre.">
  <meta property="og:title" content="EPITAF de geek">
  <meta property="og:description" content="Le cimetière des derniers mots de geeks. ${epitaphs.length} épitaphes gravées.">
  <meta property="og:type" content="website">
  <!-- Chemins relatifs : la page marche aussi bien à la racine d'un domaine
       que dans un sous-dossier, comme sur les pages de projet GitHub. -->
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="style.css">
</head>
<body>

<div class="ticker">
  <div class="ticker__inner">
    <span class="ticker__label">Dernières volontés&nbsp;·</span>
    <div class="ticker__scroll"><div class="ticker__track">${tickerHtml}</div></div>
    <a class="micro micro--red" href="#proposer">AJOUTER LA VÔTRE →</a>
  </div>
</div>

<div class="shell">

  <header class="masthead">
    <div class="brand">
      <div class="brand__flag" aria-hidden="true"></div>
      <div class="brand__text">
        <div class="brand__name">EPIT<em>A</em>F</div>
        <div class="brand__tag">Le cimetière des derniers mots de geeks</div>
      </div>
    </div>
    <nav class="nav" aria-label="Sections">
      <a class="nav__link is-active" href="#cimetiere"><span class="dot dot--square"></span>Le cimetière</a>
      <a class="nav__link" href="#proposer"><span class="dot dot--ink"></span>Proposer</a>
      <a class="nav__link" href="#regles">Les règles</a>
    </nav>
    <nav class="nav nav--right" aria-label="Accès">
      <a class="nav__link" href="#cimetiere">↓ Parcourir</a>
      <a class="nav__link" href="#proposer">✎ Proposer</a>
    </nav>
  </header>

  <section class="hero">
    <h1 class="hero__title">Votre dernière phrase n'aura pas de <em>version 2</em>.</h1>
    <p class="hero__sub">
      EPITAF collecte les phrases qui méritent de finir gravées dans la ROM&nbsp;:
      le point-virgule oublié, la sauvegarde prévue pour demain, le déploiement
      du vendredi 18&nbsp;h, le <code>rm -rf</code> tapé dans le mauvais terminal.
      Chaque proposition passe par la modération avant d'entrer au cimetière.
    </p>
    <div class="hero__actions">
      <a class="btn" href="#proposer">Proposer une épitaphe</a>
      <a class="btn btn--ghost" href="#cimetiere">Visiter le cimetière</a>
      <span class="badge-new">RIP<br>&amp;<br>RUN</span>
    </div>
  </section>

  <section class="cells stats" aria-label="Chiffres du cimetière">
    <div class="cell">
      <span class="micro micro--mute">Épitaphes gravées</span>
      <span class="stat__value">${String(epitaphs.length).padStart(2, '0')}</span>
      <span class="leader micro micro--mute"><span>validées</span></span>
    </div>
    <div class="cell">
      <span class="micro micro--mute">Catégories</span>
      <span class="stat__value">${String(CATEGORIES.length).padStart(2, '0')}</span>
      <span class="leader micro micro--mute"><span>allées du cimetière</span></span>
    </div>
    <div class="cell cell--paper">
      <span class="micro micro--mute">Gardiens</span>
      <span class="stat__value">02</span>
      <span class="leader micro micro--mute"><span>Steph &amp; Mag</span></span>
    </div>
    <div class="cell cell--red">
      <span class="micro">Statut du service</span>
      <span class="stat__value">200</span>
      <span class="micro">OK — LE CIMETIÈRE EST OUVERT</span>
    </div>
  </section>

  <section id="cimetiere">
    <div class="section-head">
      <h2 class="section-head__title">Le cimetière</h2>
      <p class="section-head__meta" id="result-count">${epitaphs.length} épitaphe${epitaphs.length > 1 ? 's' : ''} affichée${epitaphs.length > 1 ? 's' : ''}</p>
    </div>

    <div class="filters" id="filters">
      <label class="filters__search">
        <span class="dot" aria-hidden="true"></span>
        <input type="search" id="search" placeholder="Chercher une épitaphe, un pseudo…" aria-label="Chercher une épitaphe">
      </label>
${chipsHtml}
    </div>

    <div class="cells tombs" id="tombs">
${tombsHtml}
      <div class="empty" id="empty" hidden><h3>Rien à cet endroit.</h3><p>Aucune épitaphe ne correspond.</p></div>
    </div>
  </section>

  <section class="cells submit" id="proposer">
    <div class="submit__pitch">
      <span class="micro micro--red">Formulaire · 30 secondes</span>
      <h2>Écrivez votre <em>dernière</em> ligne.</h2>
      <p>
        Une bonne épitaphe de geek tient en une phrase, se comprend sans note de bas de page,
        et fait sourire quelqu'un qui n'était pas là. Le reste, c'est du remplissage.
      </p>
      <ol class="submit__steps">
        <li><b>01</b><span>Vous écrivez la phrase et choisissez une allée.</span></li>
        <li><b>02</b><span>Elle part en modération.</span></li>
        <li><b>03</b><span>La modération tranche — et elle est gravée.</span></li>
      </ol>
    </div>

    <form class="form" id="submit-form" ${formAttrs} novalidate>
      ${formNotice}
      <div class="notice" id="form-notice" role="status" aria-live="polite"></div>

      <div class="field">
        <div class="field__label">
          <span class="micro">L'épitaphe *</span>
          <span class="micro micro--mute counter" id="counter">0 / 240</span>
        </div>
        <textarea id="f-text" name="epitaphe" maxlength="240" required
                  placeholder="Il n'avait pas fait de sauvegarde."></textarea>
        <span class="field__hint">Une phrase. Pas de paragraphe, pas de roman.</span>
      </div>

      <div class="form__row">
        <div class="field">
          <div class="field__label"><span class="micro">Signature</span></div>
          <input type="text" id="f-author" name="signature" maxlength="40" placeholder="Anonyme">
          <span class="field__hint">Pseudo affiché sous la pierre.</span>
        </div>
        <div class="field">
          <div class="field__label"><span class="micro">Allée</span></div>
          <select id="f-category" name="allee">${optionsHtml}</select>
          <span class="field__hint">Là où on la rangera.</span>
        </div>
      </div>

      <button class="btn btn--red" type="submit" id="submit-btn">
        Envoyer aux gardiens <span aria-hidden="true">→</span>
      </button>
    </form>
  </section>

  <section class="cells" id="regles" style="grid-template-columns: repeat(3, 1fr);">
    <div class="cell">
      <span class="micro micro--red">01 — Format</span>
      <h3 style="margin: 14px 0 10px; font-size: 24px;">Une phrase, point.</h3>
      <p style="margin:0; color: var(--ink-soft); font-size: 15px;">
        240 caractères maximum. Si votre épitaphe a besoin d'un README, ce n'est pas une épitaphe.
      </p>
    </div>
    <div class="cell">
      <span class="micro micro--red">02 — Modération</span>
      <h3 style="margin: 14px 0 10px; font-size: 24px;">Deux gardiens.</h3>
      <p style="margin:0; color: var(--ink-soft); font-size: 15px;">
        Rien n'apparaît sans validation humaine. Les doublons sont écartés.
      </p>
    </div>
    <div class="cell">
      <span class="micro micro--red">03 — Ton</span>
      <h3 style="margin: 14px 0 10px; font-size: 24px;">On rit, on n'insulte pas.</h3>
      <p style="margin:0; color: var(--ink-soft); font-size: 15px;">
        Les attaques personnelles finissent à la corbeille, pas au cimetière.
      </p>
    </div>
  </section>

  <footer class="cells foot">
    <div class="cell">
      <div class="foot__big">EPIT<span style="color:var(--red)">A</span>F<br>DE GEEK</div>
      <p style="margin:18px 0 0; color: var(--ink-mute); font-size: 14px; max-width: 40ch;">
        Un recueil collaboratif de derniers mots. Aucune donnée personnelle collectée&nbsp;:
        pas de compte, pas de traqueur.
      </p>
    </div>
    <div class="cell">
      <span class="micro micro--mute">Naviguer</span>
      <ul class="foot__list">
        <li><a href="#cimetiere">Le cimetière</a></li>
        <li><a href="#proposer">Proposer une épitaphe</a></li>
        <li><a href="#regles">Les règles</a></li>
      </ul>
    </div>
    <div class="cell cell--paper">
      <span class="micro micro--mute">Gardiens du lieu</span>
      <ul class="foot__list">
        <li><span class="dot dot--square"></span> Steph</li>
        <li><span class="dot dot--square"></span> Mag</li>
      </ul>
    </div>
  </footer>
</div>

<div class="colophon">
  <span>© ${new Date().getFullYear()} EPITAF de geek — tous les bugs réservés.</span>
  <span>${epitaphs.length} épitaphes gravées.</span>
</div>

<script>
(function () {
  // Vitesse de lecture constante du bandeau, quel que soit son contenu.
  var track = document.querySelector('.ticker__track');
  if (track && track.offsetWidth) {
    track.style.animationDuration = Math.round(track.offsetWidth / 45) + 's';
  }

  var tombs = [].slice.call(document.querySelectorAll('.tomb'));
  var chips = [].slice.call(document.querySelectorAll('.chip'));
  var search = document.getElementById('search');
  var count = document.getElementById('result-count');
  var empty = document.getElementById('empty');
  var category = '';

  function apply() {
    var q = search.value.trim().toLowerCase();
    var shown = 0;
    tombs.forEach(function (t) {
      var ok = (!category || t.dataset.category === category) &&
               (!q || t.dataset.search.indexOf(q) !== -1);
      t.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown !== 0;
    count.textContent = shown
      ? shown + ' épitaphe' + (shown > 1 ? 's' : '') + ' affichée' + (shown > 1 ? 's' : '')
      : 'Aucun résultat';
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      category = chip.dataset.cat;
      chips.forEach(function (c) { c.classList.toggle('is-active', c === chip); });
      apply();
    });
  });

  var timer;
  search.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(apply, 120);
  });

  // Formulaire : envoi en arrière-plan pour rester sur la page.
  var form = document.getElementById('submit-form');
  var text = document.getElementById('f-text');
  var counter = document.getElementById('counter');
  var notice = document.getElementById('form-notice');

  text.addEventListener('input', function () {
    counter.textContent = text.value.length + ' / 240';
    counter.classList.toggle('is-over', text.value.length > 230);
  });

  form.addEventListener('submit', function (event) {
    if (form.dataset.unconfigured) { event.preventDefault(); return; }
    event.preventDefault();

    var btn = document.getElementById('submit-btn');
    btn.disabled = true;

    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('refus du service');
        notice.className = 'notice is-visible notice--ok';
        notice.textContent = 'Proposition envoyée. Elle apparaîtra une fois validée par la modération.';
        form.reset();
        counter.textContent = '0 / 240';
      })
      .catch(function () {
        notice.className = 'notice is-visible notice--err';
        notice.textContent = "L'envoi a échoué. Réessayez dans un instant.";
      })
      .then(function () { btn.disabled = false; });
  });
})();
</script>
</body>
</html>
`;

/* ---------- écriture ---------- */

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

writeFileSync(join(distDir, 'index.html'), html);
copyFileSync(join(publicDir, 'style.css'), join(distDir, 'style.css'));
copyFileSync(join(publicDir, 'favicon.svg'), join(distDir, 'favicon.svg'));

console.log(`dist/ fabriqué — ${epitaphs.length} épitaphes gravées.`);
if (FORM_ENDPOINT) {
  console.log(`   Les propositions partiront vers ${FORM_ENDPOINT}`);
} else {
  console.log('\n⚠  Aucune adresse de formulaire dans src/config.js :');
  console.log("   les visiteurs ne pourront rien vous envoyer.\n");
}
