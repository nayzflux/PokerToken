# PocketToken

PocketToken remplace les jetons physiques d'une partie de poker. Les Pockins sont fictifs : le site ne gère ni cartes ni argent réel.

## Démarrage rapide

```sh
docker compose up --build
```

Ouvrez [http://localhost:8080](http://localhost:8080). Le service web sert l'interface et transmet `/api` et les WebSockets à l'API. Redis est privé au réseau Compose, sans volume et sans persistance. Fermer une room efface ses données ; après deux heures sans action, Redis l'expire automatiquement.

## Développement

Installez Bun 1.4.2 et démarrez un Redis local, puis :

```sh
bun install
bun run dev:api
bun run dev:web
```

Le web est sur `http://localhost:5173` et Vite transfère `/api` à l'API sur le port 3000. Lancez les deux commandes de développement dans des terminaux distincts.

```sh
bun run typecheck
bun test
bun run build
```

## Déploiement

Configurez `WEB_PORT`, `APP_ORIGIN` (origine publique exacte du site) et `COOKIE_SECURE=true` lorsque le site est servi en HTTPS. Terminez TLS sur votre proxy d'entrée. Ne publiez pas Redis ni le port API. La perte ou le redémarrage de Redis supprime volontairement toutes les rooms.

Le créateur d'une room est admin tant qu'il conserve son cookie. Les joueurs peuvent revenir avec le même navigateur et retrouvent leur pseudo et leurs Pockins tant que la room existe. Il n'y a pas de compte, de mot de passe ni de récupération d'admin si ce cookie est perdu.
