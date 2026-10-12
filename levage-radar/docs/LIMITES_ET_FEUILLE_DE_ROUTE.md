# Limites connues et prochaines évolutions

## Limites connues

**Sources**
- Deux sources intégrées : BOAMP et TED. Pas de couverture des profils d'acheteurs (MAPA non publiés au BOAMP), de PLACE, des portails privés ni des annonces d'investissement. Aucune exhaustivité nationale ou mondiale n'est revendiquée.
- Connecteurs non éprouvés contre les API réelles dans l'environnement de développement (réseau bloqué) : lancer `npm run connectors:check` avant mise en service.
- Extraction du JSON BOAMP « au mieux » : lots, CPV, montants et durées peuvent manquer selon le format de l'avis (ils restent alors vides, jamais estimés).
- Qualification par règles : faux positifs / négatifs possibles ; les dictionnaires sont à enrichir avec l'expérience des chargés d'affaires.
- Rayon géographique approché au niveau du département (préfecture), France uniquement.
- Recherche limitée aux 3 000 premiers candidats après filtres SQL (signalé à l'écran).
- Pièces du DCE et critères détaillés non collectés : consulter la source officielle.

**Rapports**
- Modèles fournis = exemples à adapter et valider ; édition des modèles en JSON (pas d'éditeur visuel).
- Hors ligne : uniquement les dossiers déjà ouverts sur l'appareil ; statut et suppression de pièces jointes envoyées nécessitent une connexion.
- Photos stockées en base PostgreSQL : surveiller le volume (prévoir un stockage objet au-delà de quelques Go).
- Pas d'import automatique depuis des appareils de mesure (saisie manuelle uniquement, comme exigé ; structure prête : champ `origin`).
- Export Excel natif non fourni : CSV compatible Excel (UTF-8, séparateur « ; »). Pas d'archive ZIP des pièces jointes.

**Plateforme**
- Une organisation par compte (multi-organisation prête dans le schéma, pas d'interface de super-administration).
- Pas de double authentification (2FA) ni de SSO.
- Assistant : questions types interprétées par règles ; la reformulation par modèle de langage est facultative.

## Prochaines évolutions proposées

1. Valider les connecteurs en production (`connectors:check`) et ajuster champs / requêtes.
2. Source DECP (marchés attribués : titulaires, montants, durées) → contrats à surveiller fiables.
3. Enrichissement des dictionnaires à partir des opportunités marquées « non pertinent » / suivies (boucle de retour).
4. 2FA (TOTP) et SSO d'entreprise (OIDC).
5. Stockage objet compatible S3 pour les pièces jointes ; archive ZIP.
6. Éditeur visuel des modèles avec prévisualisation ; comparaison entre versions.
7. Export Excel natif ; synthèses PDF multi-opportunités.
8. Profils d'acheteurs via flux officiels (RSS / API) après examen des conditions.
9. Notifications push (PWA) pour échéances et rappels.
10. Tableau de bord statistique (taux de transformation, volumes par acheteur / région / période).
