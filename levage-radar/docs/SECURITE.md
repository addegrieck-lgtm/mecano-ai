# Sécurité, confidentialité, conformité

## Mesures en place

| Domaine | Mise en œuvre |
|---|---|
| Authentification | Mots de passe hachés **scrypt** (N=2¹⁵, sel aléatoire), 12 caractères min. et 3 classes ; messages identiques pour compte inconnu / mauvais mot de passe ; temps de réponse égalisé. |
| Limitation | 5 échecs / compte et 30 échecs / IP par 15 min. |
| Sessions | Jeton aléatoire 256 bits en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production ; seul son SHA-256 est stocké ; expiration 7 jours glissante ; révocation à la déconnexion, au changement de mot de passe, à la désactivation ou au changement de rôle. |
| Récupération | Jeton à usage unique haché (1 h ; 7 j pour une activation), envoyé par e-mail ou généré par un administrateur ; toutes les sessions révoquées à la réinitialisation. |
| Autorisations | Rôles configurables + permissions individuelles ; **contrôle côté serveur** dans chaque service (pages, Server Actions, API, fichiers, exports). Un dossier d'une autre organisation ou non autorisé est traité comme inexistant (404). |
| Multi-organisation | Toutes les données métier portent `org_id` ; filtrage systématique ; le suivi commercial, les notes et les tâches sont propres à chaque organisation ; les avis publics collectés sont partagés en lecture. |
| Entrées | Validation **Zod** de toutes les entrées ; requêtes paramétrées (Drizzle) ; valeurs de formulaires vérifiées contre le modèle (types, listes fermées, bornes). |
| CSRF | Cookie `SameSite=Lax`, contrôle d'origine des Server Actions (Next.js) et des routes API modifiant des données. |
| Fichiers | Type réel vérifié par signature binaire (JPEG, PNG, WebP, PDF), taille max. 8 Mo (photo) / 15 Mo (document), nom assaini, servis avec `nosniff`, `Content-Disposition` et CSP `sandbox`. |
| Exports | Soumis aux permissions ; CSV protégé contre l'injection de formules. |
| En-têtes | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| Secrets | Variables d'environnement serveur uniquement ; aucune variable `NEXT_PUBLIC_` ; secret de cron comparé en temps constant. |
| Audit | Journal des actions (création, modification de champ avec valeurs avant/après, pièces jointes, statuts, exports, modèles, utilisateurs) ; durée de conservation configurable avec purge quotidienne. |
| IA | Désactivée par défaut ; service externe uniquement si l'administrateur l'autorise ; seules les données **publiques** d'avis sont transmises, jamais les notes, tâches ou rapports. |
| Collecte | API publiques officielles uniquement, licences respectées, provenance conservée pour chaque donnée, aucun contournement d'authentification ou de restriction. |

## Données personnelles (RGPD)

Données traitées : comptes utilisateurs (nom, e-mail), contacts sur site saisis par les inspecteurs, nom des acheteurs publiés par les sources officielles. Minimisation : pas de collecte de contacts depuis les sources ; photos débarrassées des métadonnées de géolocalisation. À formaliser par l'organisation avant usage réel : registre des traitements, durées de conservation (missions archivées, audit), information des utilisateurs, procédure d'exercice des droits.

## Avant tout usage professionnel réel

Validation requise par les responsables compétents : sécurité informatique (hébergement, sauvegardes, revue de code / test d'intrusion), protection des données, modèles de rapports et règles métier, formats d'export. Ne pas importer de données confidentielles, rapports internes ou données clients d'un tiers (dont Bureau Veritas) sans autorisation explicite.
