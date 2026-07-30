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

Trois variables d'environnement suffisent :

| Variable | Défaut | À quoi elle sert |
|---|---|---|
| `PORT` | `3000` | Port d'écoute. |
| `DATA_DIR` | `./data` | Où vit la base. **À faire pointer vers un volume persistant.** |
| `TRUST_PROXY` | *(inactif)* | Mettre à `1` derrière un reverse proxy. |

```bash
PORT=8080 DATA_DIR=/data TRUST_PROXY=1 npm start
```

`TRUST_PROXY=1` fait deux choses : le serveur lit l'adresse réelle du visiteur
dans `X-Forwarded-For` (sinon l'anti-spam voit tout le monde comme une seule
personne, celle du proxy), et il ajoute l'attribut `Secure` au cookie de session
quand le proxy annonce `X-Forwarded-Proto: https`.

⚠️ **Ne l'activez que derrière un vrai proxy.** Exposé en direct, n'importe qui
pourrait envoyer un faux `X-Forwarded-For` et contourner la limite anti-spam.

Deux points restent à votre charge :

1. **Le disque.** Beaucoup d'hébergeurs donnent un système de fichiers éphémère :
   à chaque redéploiement, tout ce que l'application a écrit disparaît. Il faut
   un volume persistant monté sur `DATA_DIR`, sinon les épitaphes s'effacent.
2. **Les sauvegardes.** Copier `epitaf.db` suffit — c'est un seul fichier.
