# Tests réalisés et résultats

Exécutés le 12/10/2026 dans l'environnement de développement de cette livraison.

## Tests automatisés — `npm test` : **91 tests, 7 fichiers, tous réussis**

Base PostgreSQL réelle (PGlite, en mémoire) migrée avec les migrations du projet.

| Fichier | Couverture |
|---|---|
| `classify.test.ts` (20) | Classification levage / électricité / mixte / hors domaine, travaux ≠ vérification, lots, termes génériques, anglais, CPV ; catégories (ouverte, clôturée, sans date limite, attribution, contrat à surveiller, pré-information, annulation, appel à fournisseurs) ; score borné et explicable ; préférences personnelles ; déduplication ; géographie. |
| `connectors.test.ts` (13) | Transformation BOAMP et TED (format documenté), champs absents laissés vides, types d'avis, requêtes incrémentales, pagination et dédoublonnage, échec explicite, repli TED en cas de champ refusé, reprises HTTP (503 → succès, abandon, pas de reprise sur 4xx). |
| `ingest.test.ts` (10) | Création qualifiée avec lots / acheteur / historique, avis inchangé, modification historisée, fusion inter-sources sans perte de références, consultation → attribution, non pertinent conservé, clôture automatique, avis TED ; collecte : source en échec n'empêchant pas les autres, état des sources, relance ciblée, collecte incrémentale. |
| `opportunities.test.ts` (14) | Recherche avancée (domaines, ouvertes, catégories, département, rayon, plein texte, score minimal, tri), filtres invalides, refus sans permission, score personnalisé ; suivi (statuts, favoris, responsable, notes, tâches) **isolé par organisation** ; « non pertinent » et « transmis manuellement » ; recherches enregistrées, alertes ; tableau de bord ; export CSV et permissions ; synthèse texte et PDF ; rapport quotidien « NON effectuée » sans collecte réussie et « ok » sinon ; assistant (réponse sourcée, manques signalés, permission). |
| `reports.test.ts` (17) | Modèles : brouillon non utilisable avant validation par un responsable, domaine imposé, définition invalide refusée, versionnement ; missions levage : plusieurs équipements, relevé, observation, photo, informations manquantes, aucune notion de conformité produite ; validation des valeurs ; champ en attente ; statuts contrôlés (checklist, confirmation manuelle) ; archivage en lecture seule ; exports PDF / JSON avec versions ; **permissions** (inspecteur, autre domaine, lecteur, chargé d'affaires, autre organisation, pièces jointes) ; fichiers (type réel, taille, nom, suppression) ; **synchronisation** : idempotence, conflit sans écrasement, résolution explicite, champs différents sans conflit, suppression / observation concurrentes ; historique ; missions électricité : hiérarchie tableau → circuit, relevés avec unité, refus d'un relevé non prévu, champ conditionnel. |
| `auth.test.ts` (13) | scrypt, robustesse, installation unique, session / déconnexion, réponses indiscernables, limitation des tentatives, jeton falsifié, réinitialisation à usage unique révoquant les sessions, désactivation, matrice par défaut et surcharges, dernier administrateur, création de comptes. |
| `offline-queue.test.ts` (4) | Fusion des modifications en conservant la base, opérations en vol, application locale optimiste. |

## Parcours navigateur de bout en bout — `e2e/scenario.mjs` : **réussi**

Application en **build de production** (`next start`) sur **PostgreSQL 16 réel**, Chromium (bureau 1360 px et mobile 390 px tactile) :

installation → tableau de bord réel avec sources en erreur → historique des synchronisations → radar réel vide (aucune donnée de démonstration mélangée) → espace démonstration séparé → fiche : statut, note, tâche → export PDF de synthèse et CSV → assistant → création d'un inspecteur (lien d'activation) → installation et **validation** d'un modèle → client + site → activation et connexion de l'inspecteur sur mobile → **refus d'accès au radar** → création d'une mission → saisie mobile (type de mission, équipement, capacité, relevé, anomalie, photo) avec sauvegarde automatique → **passage hors ligne, rechargement de la page depuis la copie locale chiffrée, modification mise en file** → modification concurrente du même champ par un autre utilisateur → **retour du réseau : conflit affiché, rien d'écrasé** → résolution explicite → vérification serveur (équipement, relevé, observation, photo) → brouillon, exports PDF et JSON, historique → 404 sur dossier inexistant, **origine étrangère refusée (403)** → pages d'administration. Erreurs JavaScript navigateur : aucune.

Ce parcours a révélé et permis de corriger 4 défauts (redirection après connexion, mise en cache hors ligne du service worker, valeur de référence des éléments créés hors ligne, rafraîchissement des photos).

Exécution : application démarrée sur une base vierge avec données de démonstration, puis `npm i -D playwright-core && node e2e/scenario.mjs test-results http://localhost:3000 [chemin-chromium]`.

## Autres vérifications

- `npm run lint`, `npm run typecheck`, `npm run build` : sans erreur.
- Migrations appliquées sur PostgreSQL 16 réel et sur PGlite.
- `/api/cron/daily` : refus sans secret (401) ; avec secret, exécution complète, échecs des sources journalisés.
- Collecte en ligne de commande : échec réseau correctement enregistré (source en erreur, aucune donnée inventée).

## Non testé dans cet environnement (à faire avant mise en service)

- **Collecte réelle BOAMP / TED** : l'accès réseau à ces API était bloqué par la politique réseau de l'environnement → `npm run connectors:check` à exécuter depuis un environnement connecté (vérifie notamment les noms de champs TED et la syntaxe ODSQL).
- Envoi réel d'e-mails (aucun serveur SMTP configuré).
- Modèle de langage externe (désactivé par défaut).
- Dictée vocale du navigateur, appareils iOS / Android physiques, montée en charge.
