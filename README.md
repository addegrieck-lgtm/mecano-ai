# MECANO AI — le copilote intelligent du garage

Plateforme professionnelle pour garages automobiles : **diagnostic OBD guidé par IA**, organisation **garage → équipes → mécaniciens**, **devis**, **interventions**, **planning** et **historique véhicule**. Conçue comme un SaaS multi-garage, avec un MVP qui fonctionne **à 0 €** (aucune API payante).

```
VÉHICULE → OBD → DONNÉES → DIAGNOSTIC → IA → TESTS → CONCLUSION → DEVIS → INTERVENTION → HISTORIQUE
GARAGE → ÉQUIPES → MÉCANICIENS → VÉHICULES → INTERVENTIONS
```

---

## Démarrage rapide

```bash
npm install
npm run dev
```

Puis ouvrir **http://localhost:3000**.

Aucune configuration n'est nécessaire : `DEMO_MODE=true` par défaut. Les données de démonstration (Garage Dupont, Garage Martin, équipes, utilisateurs, clients, véhicules, historique) sont créées au premier lancement et **stockées localement dans le navigateur (IndexedDB)**.

Pour changer d'utilisateur (patron, chef d'équipe, mécanicien, réception, lecture seule…), utilisez le **menu de compte en haut à droite** (ou « Plus » sur mobile). Chaque rôle voit une interface et des données différentes.

### Parcours de démonstration conseillé

1. Connecté en **Paul Dupont (Patron)** → Tableau de bord.
2. **+ DIAGNOSTIC** → Volkswagen Golf → symptôme « Moteur qui broute ».
3. Étape « Codes défaut » → **CONNECTER** (simulateur, scénario P0302) → **Lire les codes** → **Lire** (données live).
4. **Analyser avec MECANO AI** → hypothèses + contrôle recommandé.
5. Test guidé « Permutation des bobines » → **OUI** → l'hypothèse bobine devient « Soutenue par un test ».
6. Conclusion (cocher la confirmation technicien) → **CRÉER UN DEVIS** : pré-rempli avec le catalogue du garage.
7. **Marquer comme envoyé** → **Accepté par le client** → **Créer l'intervention** (équipe + mécanicien).
8. Intervention → **COMMENCER** → photos → **CLÔTURER** → **Laisser un avis**.
9. Fiche véhicule → onglet **Historique** : tout le dossier apparaît chronologiquement.
10. **Statistiques** : CA, heures, taux d'acceptation, comparaison par équipe.

Pour repartir de zéro : **Paramètres → Données → Réinitialiser la démo**.

---

## Variables d'environnement

Copier `.env.example` en `.env.local` :

| Variable | Rôle |
|---|---|
| `DEMO_MODE` | `true` (défaut) : données locales, pas d'authentification. `false` : Supabase. |
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase (publique). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé *anon* (publique, protégée par RLS). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Serveur uniquement** — invitation de membres (`/api/invite`). Jamais exposée au navigateur. |
| `OLLAMA_BASE_URL` | URL d'Ollama (défaut `http://localhost:11434`). |
| `OLLAMA_MODEL` | Modèle Ollama. Vide = premier modèle installé. |

Seules les variables préfixées `NEXT_PUBLIC_` sont visibles côté client. **Ne jamais committer `.env.local`** (ignoré par git). `DEMO_MODE` est lu au build : relancer `npm run build` après l'avoir modifié.

---

## Intelligence artificielle (0 €)

- **MockAIProvider** (par défaut) : « IA » déterministe fondée sur le moteur de règles. Hors ligne, gratuite, sans hallucination.
- **OllamaProvider** : LLM local ([ollama.com](https://ollama.com)). Détecté automatiquement.

```bash
ollama pull llama3.2      # ou mistral, qwen2.5…
ollama serve
```

Si Ollama n'est pas joignable, le MockAIProvider prend **automatiquement** le relais (et, hors connexion, le navigateur utilise le moteur embarqué). État visible dans **Paramètres → IA**.

Règles imposées à toute IA (`lib/ai/prompt.ts`) : ne jamais inventer de donnée technique (couple, procédure, référence, valeur de test, temps constructeur, prix) → « **Information non disponible** » ; distinguer *Hypothèse / Cause possible / Contrôle recommandé / Résultat observé / Conclusion à confirmer* ; signaler les systèmes critiques (HT, freinage, direction, airbags, carburant) ; ne jamais remplacer le professionnel.

Le LLM ne reçoit jamais un code isolé : il reçoit un **contexte structuré** (véhicule, kilométrage, symptômes, codes, données live, historique, résultats de tests, mesures) et un extrait de la base de règles (`lib/ai/prompt.ts`, `lib/ai/context-builder.ts`). **Les prix des devis ne sont jamais générés par l'IA** : ils viennent du catalogue du garage, sinon « Prix à renseigner ».

---

## OBD

```
VOITURE → Port OBD-II → Boîtier Bluetooth/BLE → Téléphone → MECANO AI
```

- `lib/obd/obd-provider.ts` — interfaces `OBDProvider` et `OBDTransport`.
- `lib/obd/elm327-provider.ts` — protocole ELM327/STN (initialisation, mode 01/03/04/09, AT RV), indépendant du matériel.
- `lib/obd/simulator-obd-provider.ts` — **SimulatorOBDProvider** : émule un ELM327 et renvoie des trames brutes, décodées par le même parser que le vrai boîtier. Scénarios : *Aucun défaut, P0302, P0420, P0401, Défauts multiples* ; plusieurs véhicules (VIN) de démonstration.
- `lib/obd/bluetooth-obd-provider.ts` — **BluetoothOBDProvider** (Web Bluetooth BLE, profils FFF0/FFE0/Vgate). Fonctionne sur Chrome/Edge (Android, desktop). **Pas sur iOS Safari** et pas avec les boîtiers Bluetooth *Classic* : une app native devra fournir son propre `OBDTransport`, sans changer le reste.
- `lib/obd/obd-parser.ts` — parser indépendant (PID, DTC CAN/non-CAN, VIN multi-trames, tension).
- `lib/obd/obd-service.ts` — état de connexion hors React (les composants s'abonnent via `useSyncExternalStore`).

Chaque connexion crée une **session OBD** (véhicule, utilisateur, équipe, date, codes, données live, durée, diagnostic associé). L'effacement des codes demande une confirmation (« l'effacement ne répare pas la cause ») et est **journalisé**.

---

## Moteur de diagnostic

`lib/diagnostics/engine.ts` + `data/diagnostic-rules.ts` (P0300–P0304, P0401, P0420, P0171, P0172, P0101, P0113, P0130, P0135, P0299) :
description, causes possibles, symptômes, sécurité et **étapes guidées OUI / NON / JE NE SAIS PAS**. Toutes les réponses sont mémorisées (`diagnostic_tests`), le parcours est recalculé à chaque réponse, les hypothèses sont classées (*Hypothèse*, *Soutenue par un test*, *Affaiblie*), les corrélations entre codes sont détectées (ex. ratés + mélange pauvre). Une conclusion reste « à confirmer » tant que le technicien ne l'a pas validée.

---

## Architecture

```
app/
  (auth)/          login, signup, forgot-password, reset-password (Supabase Auth)
  (dashboard)/     dashboard, vehicles, clients, teams, members, diagnostics, assistant, obd,
                   interventions, quotes, planning, vehicle-intake, stats, garage, settings, more
  api/ai           IA côté serveur (Ollama ou Mock), entrées validées par Zod
  api/invite       invitation de membres (service_role côté serveur uniquement)
components/        ui (shadcn/ui), app, obd, diagnostics, quotes, interventions, photos…
lib/
  ai/              provider, ollama-provider, mock-provider, prompt, context-builder
  obd/             provider, ELM327, simulateur, Bluetooth, parser, service
  diagnostics/     moteur de règles
  data/            DataStore (Memory / IndexedDB) + TenantRepository (isolation multi-garage)
  services/        couche métier : organisation, CRM, diagnostics, devis/interventions, historique, stats
  permissions/     rôles + permissions extensibles
  validation/      schémas Zod
  supabase/        client navigateur + SupabaseStore
  connectors/      interfaces futures (Parts, VehicleData, TechnicalData, Messaging, Payment, Accounting, Review)
  billing/         offres et limites (Phase 3, sans Stripe)
  voice/           entrée vocale (préparation « MECANO AI, j'ai un P0302… »)
data/              demo-data, diagnostic-rules, causes
supabase/migrations/  0001_init.sql (schéma) · 0002_rls.sql (Row Level Security)
tests/             vitest
```

**Principe clé** : toute l'application passe par `createServices(store, context)`. Le `TenantRepository` filtre chaque lecture par `garage_id`, ignore tout `garage_id` fourni par l'appelant et traite un identifiant d'un autre garage comme inexistant (anti-IDOR). En production, **Row Level Security** applique la même règle dans PostgreSQL. Le même code métier tourne sur IndexedDB (démo) ou Supabase.

### Rôles

| Rôle | Périmètre |
|---|---|
| OWNER | Accès total |
| ADMIN | Gestion du garage |
| TEAM_MANAGER | Son équipe et ses interventions |
| MECHANIC | Diagnostics / interventions qui lui sont attribués |
| RECEPTION | Clients, véhicules, rendez-vous, devis |
| VIEWER | Lecture seule |

Matrice complète : page **Membres**. Permissions additionnelles par membre : `garage_members.permissions`.

---

## Supabase (production)

1. Créer un projet Supabase (offre gratuite).
2. Exécuter `supabase/migrations/0001_init.sql` puis `0002_rls.sql` (SQL Editor ou `supabase db push`).
3. Renseigner les variables `NEXT_PUBLIC_SUPABASE_*` et `SUPABASE_SERVICE_ROLE_KEY`, puis `DEMO_MODE=false`.
4. `npm run build && npm start` → inscription, création du garage, invitations.

Photos : bucket privé `photos` créé par la migration (chemins `{garage_id}/…`, JPEG/PNG/WebP, 2 Mo max). En mode démo, les photos sont ré-encodées côté navigateur (suppression EXIF) et stockées localement.

---

## PWA

Manifest (`app/manifest.ts`), icônes (`public/icons`, régénérables via `node scripts/generate-icons.mjs`), service worker (`public/sw.js`, actif en production) : installation sur téléphone, cache des pages et ressources essentielles, fonctionnement dégradé hors connexion (données démo locales, IA de secours embarquée). Navigation mobile : **Accueil · Véhicules · + DIAG · Planning · Plus**.

---

## Tests, qualité, build

```bash
npm run lint        # ESLint
npm run test        # Vitest : multi-tenant, permissions, diagnostic, OBD, devis, parcours complet
npm run typecheck   # TypeScript
npm run build       # build de production
npm start           # serveur de production
```

## Déploiement

- **Vercel / Netlify / tout hébergeur Node** : `npm run build`, variables d'environnement dans l'hébergeur. L'offre gratuite suffit pour le MVP.
- Ollama étant local, en production hébergée l'IA bascule sur le moteur de règles, sauf à exposer un serveur Ollama privé via `OLLAMA_BASE_URL`.

## Feuille de route

- **Phase 2 — OBD réel** : validation sur boîtiers BLE, transport natif iOS (Capacitor/Swift) via `OBDTransport`.
- **Phase 3 — SaaS** : `PaymentProvider` (Stripe), limites par offre (`lib/billing/plans.ts`), facturation.
- **Phase 4 — Données techniques** : `TechnicalDataProvider`, uniquement sources licenciées (aucun scraping).
- **Phase 5 — Fournisseurs** : `PartsProvider` (recherche, disponibilité, prix, compatibilité, commande).

> MECANO AI propose des hypothèses et des contrôles ; il ne remplace pas le jugement d'un professionnel.
