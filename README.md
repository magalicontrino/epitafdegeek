# EPITAF de geek

Un recueil collaboratif des phrases qui méritent de finir gravées dans le marbre.
N'importe qui peut en proposer une depuis la page d'accueil ; rien n'est publié
sans la validation de **Stéphane** ou **Magali**.

## Démarrer

```bash
npm start
```

- Site public : http://localhost:3000
- Salle de modération : http://localhost:3000/admin

Aucune dépendance à installer : le serveur n'utilise que des modules Node
(`node:http`, `node:sqlite`, `node:crypto`). Node 22.5 ou plus est requis.

Pendant le développement, `npm run dev` relance le serveur à chaque modification.

## Les identifiants des gardiens

Au tout premier démarrage, deux comptes sont créés — `stephane` et `magali` —
avec des mots de passe aléatoires. Ils sont affichés dans le terminal **et**
écrits dans `data/IDENTIFIANTS-ADMIN.txt`.

Notez-les ailleurs, puis supprimez ce fichier.

Pour changer un mot de passe (cela ferme aussi les sessions ouvertes) :

```bash
npm run reset-password magali
```

## Comment ça marche

1. Un visiteur écrit une phrase, choisit une signature et une allée, puis envoie.
2. La proposition arrive dans la file de modération avec le statut `en attente`.
3. Dans `/admin`, un gardien peut la corriger avant de la **graver** (publier)
   ou la **refuser**. Une épitaphe déjà gravée peut être retirée à tout moment.

Une épitaphe refusée n'est pas supprimée : elle reste dans l'onglet « Refusées »
et peut être gravée plus tard.

## Ce qui est en place

- Modération obligatoire : l'API publique ne renvoie que le statut `approved`.
- Refus automatique des doublons (comparaison insensible à la casse).
- Limite de 5 propositions par adresse IP et par tranche de 10 minutes.
- Mots de passe stockés en `scrypt` + sel, comparés en temps constant.
- Sessions par cookie `HttpOnly` / `SameSite=Lax`, valables 12 heures.
- Les requêtes qui modifient des données doivent venir du site lui-même
  (vérification de l'en-tête `Origin`).
- Les adresses IP ne sont conservées que sous forme de hachage tronqué.

## Où sont les choses

```
src/server.js          serveur HTTP, API et service des fichiers
src/db.js              base SQLite, schéma, mots de passe, données initiales
src/reset-password.js  changement de mot de passe en ligne de commande
public/index.html      page publique
public/admin.html      salle de modération
public/style.css       toute la mise en forme
public/app.js          logique de la page publique
public/admin.js        logique de la modération
data/epitaf.db         la base (créée au premier démarrage, non versionnée)
```

Les catégories (« allées ») sont définies dans la constante `CATEGORIES`
en haut de `src/server.js`.

## Mettre le site en ligne

Le serveur écoute sur le port défini par la variable `PORT` (3000 par défaut) :

```bash
PORT=8080 npm start
```

Trois points à régler avant une mise en ligne publique :

1. Placer le site derrière **HTTPS** (un reverse proxy nginx ou Caddy suffit) et
   ajouter l'attribut `Secure` au cookie de session dans `src/server.js`.
2. Le compteur anti-spam se base sur `req.socket.remoteAddress` : derrière un
   proxy, toutes les visites auront la même adresse. Il faudra lire
   `X-Forwarded-For` — uniquement si le proxy est de confiance.
3. Sauvegarder `data/epitaf.db` : c'est là que vivent toutes les épitaphes.
