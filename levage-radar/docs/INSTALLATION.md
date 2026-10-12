# Installation

## Prérequis

- Node.js ≥ 20.9 (testé avec Node 22)
- PostgreSQL ≥ 14 pour la production (testé avec PostgreSQL 16). En développement, rien à installer : PGlite.

## Installation locale

```bash
cd levage-radar
cp .env.example .env.local     # puis compléter
npm install
npm run dev
```

Ouvrir http://localhost:3000 : sans compte existant, l'application redirige vers `/setup` (création de l'organisation et du premier administrateur). En production, définissez `SETUP_TOKEN` pour protéger cette étape, ou créez l'administrateur en ligne de commande :

```bash
ORG_NAME="Agence Lyon" ADMIN_NAME="Prénom Nom" ADMIN_EMAIL=admin@exemple.fr ADMIN_PASSWORD='Un-mot-de-passe-solide-1' npm run admin:create
```

## Premiers pas après l'installation

1. **Utilisateurs & droits** : créer les comptes (lien d'activation à usage unique, valable 7 jours, envoyé par e-mail si la messagerie est configurée, sinon affiché pour transmission par un canal sûr). Ajuster si besoin la matrice des rôles.
2. **Modèles de mission** : installer les modèles d'exemple (brouillons), les **relire, adapter et faire valider** par un responsable technique. Aucune mission ne peut être créée sans version validée.
3. **Clients & sites** : référentiel commun levage / électricité.
4. **État des connecteurs** : lancer une première collecte. Configurer ensuite la tâche planifiée (docs/DEPLOIEMENT.md).
5. **Paramètres** : chaque chargé d'affaires renseigne son département, son rayon, ses départements suivis et ses préférences d'e-mail.

## Variables d'environnement

Toutes sont décrites dans `.env.example`. Points essentiels :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | production | PostgreSQL. Absent : PGlite locale (développement uniquement). |
| `APP_URL` | production | URL publique (liens des e-mails). |
| `CRON_SECRET` | pour la collecte planifiée | Secret ≥ 16 caractères exigé par `/api/cron/daily`. |
| `SETUP_TOKEN` | recommandé | Protège `/setup`. |
| `SMTP_*`, `EMAIL_FROM` | non | E-mails (rapports, rappels, activation). Sans eux : tout reste consultable dans l'application. |
| `TED_COUNTRIES` | non | Pays TED (ISO-3), défaut `FRA`. Vide = tous. |
| `AI_PROVIDER` | non | `none` (défaut, gratuit), `ollama`, `anthropic`. |
| `ENABLE_DEMO_DATA` | non | Autorise l'espace de démonstration. |

Seules les variables préfixées `NEXT_PUBLIC_` seraient visibles du navigateur : **aucune n'est utilisée**. Ne jamais committer `.env.local`.

## Migrations

Les migrations SQL versionnées sont dans `drizzle/`. Après modification du schéma (`lib/db/schema.ts`) : `npm run db:generate`, relire le SQL, committer. Application : `npm run db:migrate` (automatique en développement avec PGlite).
