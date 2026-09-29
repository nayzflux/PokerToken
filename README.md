# PocketToken

PocketToken remplace les jetons physiques d'une partie de poker. Les Pockins sont fictifs : le site ne gère ni cartes ni argent réel.

## Démarrage rapide

```sh
docker compose up --build
```

Ouvrez [http://localhost:8080](http://localhost:8080). Le navigateur appelle directement l'API sur [http://localhost:3000](http://localhost:3000), y compris pour les WebSockets. Nginx ne sert que l'interface. Redis est privé au réseau Compose, sans volume et sans persistance. Fermer une room efface ses données ; après deux heures sans action, Redis l'expire automatiquement.

## Développement

Installez Bun 1.4.2 et démarrez un Redis local, puis :

```sh
bun install
bun run dev:api
bun run dev:web
```

Le web est sur `http://localhost:5173` et appelle directement l'API sur `http://localhost:3000`. Lancez les deux commandes de développement dans des terminaux distincts. Pour utiliser une autre API en développement, définissez `VITE_API_URL` dans l'environnement de Vite.

```sh
bun run typecheck
bun test
bun run build
```

## Déploiement

Configurez `API_URL` avec l'origine publique de l'API (par exemple `https://api.example.com`, sans `/api`) et `APP_ORIGIN` avec l'origine publique exacte du site (par exemple `https://app.example.com`). Les routes de l'API conservent leur préfixe `/api`. L'URL de l'API est lue au démarrage du conteneur web : recréez ce conteneur après chaque changement de `API_URL`, sans reconstruire son image. Exposez l'API en HTTPS au navigateur via votre proxy d'entrée ; le port Compose `API_PORT` est lié à `127.0.0.1` pour ce proxy. Configurez `COOKIE_SECURE=true` en HTTPS et `COOKIE_SAME_SITE=None` si le site et l'API sont sur des sites distincts. Ne publiez pas Redis. La perte ou le redémarrage de Redis supprime volontairement toutes les rooms.

Le créateur d'une room est admin tant qu'il conserve son cookie. Les joueurs peuvent revenir avec le même navigateur et retrouvent leur pseudo et leurs Pockins tant que la room existe. Il n'y a pas de compte, de mot de passe ni de récupération d'admin si ce cookie est perdu.
