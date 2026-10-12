# Modules de rapports (levage et électricité)

## Principes

- Ces modules **préparent** les informations ; la rédaction finale et la validation du rapport officiel se font dans l'outil officiel, sous la responsabilité de l'inspecteur habilité.
- L'application ne produit **aucune conclusion de conformité**, aucune valeur de mesure, aucune référence réglementaire ; les priorités d'observation sont **internes** et explicitement distinctes de toute gravité réglementaire.
- Le statut « Prêt à finaliser dans l'outil officiel » exige : aucune information obligatoire manquante, checklist entièrement cochée, et une **confirmation manuelle** de l'utilisateur. Il ne signifie aucune transmission informatique.

## Modèles de mission

Définition JSON validée (`lib/reports/template-schema.ts`) : champs de mission, types d'éléments (avec rattachement parent → enfant, ex. tableau → circuit), types de champs (texte, nombre avec unité et bornes, date, liste fermée, choix multiples, oui/non), champs obligatoires, affichage conditionnel, motifs de validation, relevés possibles (unités autorisées, éléments concernés), priorités internes, états de traitement, pièces attendues, checklist, options et mention d'export.

Cycle de vie : chaque modification crée une **nouvelle version en brouillon** ; un utilisateur disposant de `templates.validate` (responsable technique) la **valide** ; les versions validées antérieures sont retirées pour les nouvelles missions, les missions existantes conservent leur version. Les modèles fournis sont des **exemples à adapter**, installés en brouillon.

## Saisie terrain

- Interface mobile : grands boutons, formulaires générés par le modèle, navigation par éléments, photos via l'appareil photo (redimensionnées et sans métadonnées EXIF), PDF joints, champ « laisser en attente », éléments restant à vérifier.
- **Sauvegarde automatique** (1,2 s après la dernière frappe) avec indicateur d'état : enregistré / en attente / hors ligne / erreur / session expirée.
- **Dictée vocale** : dictée du navigateur, désactivée par défaut (l'audio peut être traité par le service du fabricant du navigateur) ; activable par l'administrateur. La dictée du clavier du téléphone reste toujours utilisable.

## Mode hors ligne (implémenté et testé)

- Toutes les modifications passent par une **file d'opérations** (`lib/offline/queue.ts`), en ligne comme hors ligne : un seul chemin de code.
- La copie du dossier, la file et les photos en attente sont stockées dans IndexedDB, **chiffrées en AES-GCM 256** avec une clé WebCrypto non extractible propre à l'utilisateur et à l'appareil.
- Le service worker met en cache la coque de la page d'édition (qui ne contient pas les données du dossier) ; les réponses d'API ne sont jamais mises en cache en clair.
- Au retour du réseau, la file est envoyée ; chaque opération est **idempotente** (identifiant unique, table `sync_operations`).
- **Conflits** : chaque modification porte la valeur de référence (« base ») sur laquelle elle a été faite ; le serveur compare **champ par champ**. Un champ modifié ailleurs entre-temps n'est **jamais écrasé** : l'utilisateur voit la valeur du serveur et la sienne, et choisit. Les champs non conflictuels sont appliqués. Suppression d'un élément modifié ailleurs, modification concurrente d'une observation : même principe.
- **Effacement local** : à la déconnexion (avec avertissement s'il reste des modifications non synchronisées), si un autre utilisateur se connecte sur l'appareil, ou manuellement (Paramètres). En cas de session expirée ou révoquée, les données restent chiffrées et inaccessibles jusqu'à la reconnexion du même utilisateur.
- Limites : une page jamais ouverte en ligne sur l'appareil n'est pas disponible hors ligne ; le changement de statut et la suppression d'une pièce jointe déjà envoyée exigent une connexion ; le chiffrement local ne protège pas un appareil déverrouillé et compromis.

## Exports

- Brouillon PDF (bandeau « BROUILLON NON OFFICIEL », mention du modèle, données saisies uniquement, photos, informations manquantes, checklist, historique optionnel).
- Brouillon structuré JSON documenté (`format: "levage-radar/brouillon-rapport"`, `formatVersion: 1`).
- Chaque export enregistre une **version figée** (table `mission_snapshots`) et une ligne au journal des exports. Les formats d'export doivent être validés avant tout usage opérationnel.
