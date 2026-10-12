# LEVAGE RADAR

SaaS interne de **veille commerciale** et d'**assistance à la préparation des rapports d'inspection** pour les domaines **levage** et **électricité**.

> Outil de préparation **non officiel**. Il ne remplace ni le logiciel commercial officiel, ni l'outil officiel de rédaction et de validation des rapports, et n'y est **connecté d'aucune façon**. Il n'est ni affilié à Bureau Veritas, ni approuvé par Bureau Veritas.

## Trois espaces

| Espace | Contenu |
|---|---|
| **Radar commercial** | Collecte automatique BOAMP + TED, qualification levage / électricité / mixte, 9 catégories, score explicable 0–100, déduplication multi-sources avec historique, recherche avancée (plein texte, géographie, rayon, dates, montant, score…), fiches détaillées, suivi (statuts, favoris, responsable, notes, tâches, rappels), acheteurs et contrats à surveiller, alertes, rapport quotidien (in-app + e-mail), assistant, exports CSV / PDF. |
| **Rapports levage** | Missions créées à partir de **modèles validés**, plusieurs équipements par mission avec champs propres à chaque famille, relevés réellement saisis, observations / anomalies, photos, champs « en attente », brouillon structuré, checklist, export PDF / JSON avec versions figées, historique. |
| **Rapports électricité** | Modèles distincts : zones, tableaux → circuits, équipements, relevés avec unité, date, appareil et contexte, priorités **internes** configurables, mêmes garanties (brouillon, export, historique). |

Socle commun : utilisateurs, rôles configurables, clients et sites partagés, audit, exports, paramètres, saisie **hors connexion chiffrée** avec gestion des conflits.

## Démarrage rapide (développement)

```bash
cd levage-radar
npm install
npm run dev            # http://localhost:3000 → page /setup (création de l'organisation et de l'administrateur)
```

Sans `DATABASE_URL`, une base **PGlite** (PostgreSQL embarqué) est créée dans `.data/pglite` et migrée automatiquement.

Données de démonstration (facultatif, fictives, jamais mélangées aux données réelles) :

```bash
ENABLE_DEMO_DATA=true npm run db:seed-demo
ENABLE_DEMO_DATA=true npm run dev     # bouton « Voir les données de démonstration » dans l'en-tête
```

Première collecte réelle (réseau requis vers boamp-datadila.opendatasoft.com et api.ted.europa.eu) :

```bash
npm run connectors:check   # test des API sans écrire en base
npm run collect            # collecte et qualification
npm run daily              # collecte + rapports quotidiens + e-mails + rappels
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement / build / production |
| `npm test` | Tests unitaires et d'intégration (Vitest, PostgreSQL PGlite en mémoire, vraies migrations) |
| `npm run lint` / `typecheck` | Qualité |
| `npm run db:generate` | Générer une migration après modification de `lib/db/schema.ts` |
| `npm run db:migrate` | Appliquer les migrations versionnées (`drizzle/`) |
| `npm run admin:create` | Créer le premier administrateur en ligne de commande |
| `npm run collect` / `daily` | Collecte / tâche quotidienne complète |
| `npm run connectors:check` | Vérification des connecteurs en conditions réelles |
| `node e2e/scenario.mjs` | Parcours navigateur de bout en bout (voir docs/TESTS.md) |

## Documentation

- [docs/INSTALLATION.md](docs/INSTALLATION.md) — installation et variables d'environnement
- [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) — déploiement, tâches planifiées, coûts
- [docs/SOURCES.md](docs/SOURCES.md) — sources commerciales, qualification, score, déduplication
- [docs/RAPPORTS.md](docs/RAPPORTS.md) — modèles, missions, hors ligne, conflits
- [docs/SECURITE.md](docs/SECURITE.md) — sécurité, données, conformité
- [docs/TESTS.md](docs/TESTS.md) — fonctionnalités réellement testées et résultats
- [docs/LIMITES_ET_FEUILLE_DE_ROUTE.md](docs/LIMITES_ET_FEUILLE_DE_ROUTE.md) — limites connues et prochaines évolutions

## Architecture

```
app/(auth)        connexion, mot de passe oublié / réinitialisation, installation initiale
app/(app)         tableau de bord, radar, acheteurs, tâches, alertes, rapport quotidien, assistant,
                  connecteurs, missions/[levage|electricite], modèles, clients, exports, audit, utilisateurs, paramètres
app/api           cron quotidien, exports, synchronisation des dossiers, pièces jointes, santé
lib/db            schéma Drizzle (PostgreSQL) — migrations versionnées dans drizzle/
lib/auth          mots de passe scrypt, sessions en base, limitation des tentatives, rôles et permissions
lib/connectors    BOAMP, TED (interface commune, reprises, limitation de débit), registre des sources prévues
lib/radar         dictionnaires FR/EN, classification, catégories, score, géographie, déduplication, ingestion, collecte, rapport quotidien
lib/services      couche métier — TOUS les contrôles d'accès sont ici, côté serveur
lib/reports       schéma des modèles, modèles d'exemple, informations manquantes
lib/offline       file d'opérations, stockage chiffré IndexedDB, photos
components        interface (Tailwind CSS), éditeur de mission
tests             Vitest ; e2e/ parcours navigateur
```

Stack : Next.js 16 (App Router), TypeScript, Tailwind CSS 4, PostgreSQL (Drizzle ORM ; postgres.js en production, PGlite en développement / tests), Zod, pdf-lib, Nodemailer (facultatif), SDK Anthropic (facultatif).
