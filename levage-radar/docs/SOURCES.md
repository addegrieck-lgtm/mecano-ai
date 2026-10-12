# Sources commerciales et qualification

## Sources réellement intégrées

### BOAMP — Bulletin officiel des annonces des marchés publics (DILA)
- **Accès** : API Opendatasoft Explore v2.1, jeu de données `boamp`, libre, sans clé — `https://boamp-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/boamp/records`.
- **Méthode** : 7 requêtes ODSQL regroupant ~35 termes métier (`"appareils de levage" OR "VGP" OR …`) + `dateparution >= "AAAA-MM-JJ"`, tri par date de parution, pages de 100 (offset + limit ≤ 10 000).
- **Champs** : `idweb`, `objet`, `nomacheteur`, `dateparution`, `datelimitereponse`, `code_departement`, `nature_categorise_libelle` / `nature_libelle`, `procedure_libelle`, `descripteur_libelle`, `titulaire`, `url_avis`, et extraction au mieux du JSON `donnees` (CPV, description, lots, valeur estimée, durée, adresse, SIRET, références d'avis liés).
- **Licence** : Licence Ouverte / Etalab 2.0, mention « BOAMP / DILA ».
- **Limites** : MAPA publiés au BOAMP seulement si l'acheteur le choisit ; le format de `donnees` varie (formats historiques, eForms) → extraction « au mieux », jamais inventée.

### TED — Tenders Electronic Daily (Office des publications de l'UE)
- **Accès** : `POST https://api.ted.europa.eu/v3/notices/search`, libre, sans clé.
- **Méthode** : requêtes expertes `FT~"terme" OR …` (termes FR + EN), `PD>=AAAAMMJJ`, filtre `buyer-country=FRA` (configurable `TED_COUNTRIES`), pages de 100.
- **Champs demandés** (configurables `TED_FIELDS`) : `publication-number`, `notice-title`, `notice-type`, `buyer-name`, `buyer-country`, `classification-cpv`, `publication-date`, `deadline`, `total-value`, `total-value-cur`, `links`. Si l'API refuse un champ (HTTP 400), nouvel essai avec un jeu minimal et collecte marquée **partielle**.
- **Réutilisation** : autorisée avec mention de la source (décision 2011/833/UE).
- **Limites** : marchés au-dessus des seuils européens (ou publiés volontairement) ; langues autres que FR/EN partiellement couvertes.

> **Vérification en conditions réelles** : l'environnement de développement de cette livraison n'avait pas d'accès réseau vers ces API (bloqué par la politique réseau). Les connecteurs ont été écrits d'après la documentation publique et testés sur des réponses au format documenté (fixtures fictives) et en conditions d'échec réseau réelles. **Avant mise en service, exécutez `npm run connectors:check`** depuis un environnement ayant accès à Internet : la commande affiche les avis réellement récupérés et normalisés, sans rien écrire en base.

## Sources non intégrées (affichées comme telles dans l'application)

| Source | Statut / raison |
|---|---|
| DECP (données essentielles, data.gouv.fr) | Prochaine source recommandée pour les marchés attribués (titulaire, montant, durée). |
| PLACE | Pas d'API publique de recherche identifiée ; collecte automatisée non réalisée sans accord. |
| Profils d'acheteurs (MAPA) | Conditions variables par plateforme ; à étudier via flux officiels. |
| Portails privés, annonces d'investissements | À vérifier site par site ; aucun contournement d'authentification. |

## Fonctionnement d'un connecteur

Interface commune (`lib/connectors/types.ts`) : nom, géographie, types de données, conditions d'accès, méthode, fréquence, licence, limites de couverture, `fetch(since, maxPages)`. Client HTTP commun : délai maximal, 4 tentatives avec attente exponentielle sur 429 / 5xx / réseau (respect de `Retry-After`), espacement d'1 s entre requêtes vers un même hôte, User-Agent identifiant l'outil (+ `CONNECTOR_CONTACT_EMAIL`). Arrêt immédiat si la source est injoignable dès la première requête.

Chaque collecte crée une ligne `sync_runs` (déclencheur, paramètres, nombre d'avis, créés, fusionnés, mis à jour, erreurs) et met à jour l'état de la source (dernière exécution, dernière réussite, échecs consécutifs). Collecte incrémentale : depuis la dernière réussite − 2 jours (premier passage : `COLLECT_LOOKBACK_DAYS`, 30 j).

## Qualification

1. **Dictionnaires** (`lib/radar/dictionaries.ts`) : ~55 termes levage, ~35 termes électricité (FR + EN, pluriels, acronymes), signaux d'inspection, de travaux, de maintenance, de fourniture, de marché multiservices, d'appel à fournisseurs, et ~25 règles CPV.
2. **Domaine** : LEVAGE / ÉLECTRICITÉ / MIXTE / hors domaine. Le titre compte double ; les **lots** sont analysés ; un marché de « contrôles réglementaires » sans mention explicite est classé MIXTE (indirect, à confirmer). Un terme générique isolé (« électrique ») ne suffit pas.
3. **Nature** : inspection / maintenance / **travaux** / fourniture / multiservices. Un marché de travaux électriques n'est **jamais** assimilé à une vérification : il est classé « signal commercial » avec l'explication.
4. **Catégorie** (9) : consultation active, à venir, clôturée, marché attribué, contrat à surveiller, appel à fournisseurs, signal, indirecte / multiservices, non pertinent. Les résultats non pertinents sont conservés (masqués par défaut) avec leur justification.
5. **Score 0–100** : correspondance métier, nature de la prestation, catégorie, délai, montant **publié**, fiabilité de la source, fraîcheur, récurrence de l'acheteur ; + ajustements personnels (département suivi, rayon, domaines). Chaque facteur est affiché avec sa contribution. Aucun montant n'est estimé.

## Déduplication et historique

Un avis brut par (source, référence). Rattachement à une opportunité existante si : référence croisée publiée (ex. n° TED dans un avis BOAMP, avis initial cité par un avis d'attribution), même lien officiel, ou même acheteur + titre similaire (Jaccard ≥ 0,7) + publication à moins de 60 jours (365 pour une attribution). La fusion **complète** sans écraser, conserve toutes les références sources, fait évoluer le statut (rectificatif, attribution, annulation) et écrit l'historique des champs modifiés avec la raison de la fusion. Les consultations dont la date limite publiée est dépassée passent automatiquement en « clôturée ».

## Rapport quotidien

Généré après chaque tâche quotidienne, par organisation : nouvelles consultations levage / électricité, plus pertinentes, échéances à 7 jours, attributions, contrats à surveiller, appels à fournisseurs, signaux, résultats à vérifier par un humain, alertes de surveillance, état des sources. Statut **« Veille NON effectuée »** si aucune source n'a réussi, **« incomplète »** si au moins une a échoué : jamais de rapport vide présenté comme une veille réussie. Envoi par e-mail selon les préférences de chacun (quotidien, hebdomadaire, désactivé) si SMTP est configuré.
