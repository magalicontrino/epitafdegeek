#!/usr/bin/env bash
#
# Publie le cimetière sur GitHub Pages.
#
#   npm run publier
#
# Fabrique dist/ à partir des épitaphes validées, puis pousse ce dossier
# sur la branche gh-pages. Le code source reste sur main : seule la
# branche gh-pages contient le site tel qu'il est servi.

set -euo pipefail

cd "$(dirname "$0")/.."

BRANCHE="gh-pages"
ATELIER=".publication"

echo "→ Fabrication du site…"
node src/build-static.js

echo "→ Préparation de la branche ${BRANCHE}…"
git worktree remove "$ATELIER" --force 2>/dev/null || true
rm -rf "$ATELIER"

if git ls-remote --exit-code --heads origin "$BRANCHE" >/dev/null 2>&1; then
  git fetch -q origin "$BRANCHE"
  git worktree add -q "$ATELIER" "$BRANCHE"
else
  # Première publication : une branche neuve, sans historique du code.
  git worktree add -q --detach "$ATELIER"
  git -C "$ATELIER" checkout -q --orphan "$BRANCHE"
  git -C "$ATELIER" rm -rq --cached . 2>/dev/null || true
fi

find "$ATELIER" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R dist/. "$ATELIER"/

# Sans ce fichier, GitHub Pages ignore tout ce qui commence par un souligné.
touch "$ATELIER/.nojekyll"

# Nom de domaine personnalisé, si vous en avez configuré un.
if [ -n "${DOMAINE:-}" ]; then
  echo "$DOMAINE" > "$ATELIER/CNAME"
  echo "→ Domaine : $DOMAINE"
fi

cd "$ATELIER"
git add -A
if git diff --cached --quiet; then
  echo "→ Rien de nouveau à publier."
else
  git commit -q -m "Publication du cimetière — $(node -e 'process.stdout.write(new Date().toLocaleString("fr-FR"))')"
  git push -q -u origin "$BRANCHE"
  echo "→ Publié."
fi

cd ..
git worktree remove "$ATELIER" --force

echo "✓ Terminé."
