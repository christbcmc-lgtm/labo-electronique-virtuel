# NOTES DE REPRISE 2026 — CHANTIER DIFFÉRÉ (matière première, pas encore mergée)

> Statut : comme pour `NOTES_EXIGENCES_EN_COURS.md`, **ce n'est pas le cahier des charges.**
> `CAHIER_DES_CHARGES_DEFINITIF_LABO_ELECTRONIQUE_VIRTUEL.md` reste la référence et n'a
> volontairement pas été modifié par cette session.

## Origine

Le client a transmis un nouveau document (~8600 lignes) explicitement écrit comme un cahier
des charges de **reprise, organisation et évolution**, destiné à une IA prenant le relais
sans connaître le code. Une partie de ce document a été traitée cette session (voir
`RAPPORT-FINAL.md`, « ADDENDUM 3 » : correction du brochage de 4 composants d'appareillage
bâtiment + éclatement du PDF en 4 exports indépendants + logo/mise en page).

Le reste du document décrit une refonte nettement plus large, **volontairement reportée** —
décision prise avec l'accord explicite du client (scope de session confirmé), pas une
omission. Ce fichier accumule ce chantier pour qu'il reste traçable pour la suite, exactement
comme `NOTES_EXIGENCES_EN_COURS.md` l'a fait pour le chantier précédent.

## 1. Bibliothèque en 3 colonnes façon Proteus

Le cahier demande une organisation « Famille → Sous-famille → Fiche détail » (3 colonnes),
inspirée de Proteus. L'interface actuelle (`js/app.js`/`js/editor.js`) affiche déjà les
familles en sections repliables (addendum 1), mais pas de sélection à 3 niveaux avec une
colonne de détail dédiée (référence, brochage, caractéristiques, documentation, symbole
affichés ensemble). C'est un chantier d'interface à part entière, pas une simple extension de
données.

## 2. Modèle de données composant à 4 couches

Déjà identifié comme chantier réel (pas une reformulation) dans
`NOTES_EXIGENCES_EN_COURS.md` §7, avant même ce nouveau document. Le nouveau cahier en donne
la liste de champs cible : identifiant, nom, **référence technique**, famille,
**sous-famille**, alias, description, symbole, nombre de broches, numéro/nom/fonction/
position des broches, orientation, **boîtier**, caractéristiques électriques, paramètres,
variantes, documentation, **source**, **niveau de vérification**.

État actuel (`js/catalog.js`, fonction `defRow`) : `id, nom, terminals, unit, defaultValue,
valueOptions, def, wiki, alias, famille, complexite, simulable, variantes`, plus `pinNames`
en option. Manquants : sous-famille explicite (actuellement mélangée dans `famille`),
référence technique distincte du nom, boîtier, source, niveau de vérification. Migrer les
~503 fiches existantes vers ce schéma élargi sans casser `tests/verify_catalog.js` ni les
tests fonctionnels est un chantier de plusieurs sessions à lui seul.

## 3. Séparation espace de travail du schéma / interface générale

Le cahier demande explicitement de ne pas se contenter de « réduire l'interface PC pour
obtenir la version mobile », et de séparer clairement la zone de travail du schéma de
l'interface générale du laboratoire (actuellement une seule page longue par vue). Nécessite
un audit complet de `css/style.css` et de la structure DOM produite par `js/app.js`/
`js/editor.js` avant toute décision — pas commencé.

## 4. Refonte mobile-first

Le mode responsive actuel (onglets Composants/Canevas/Mesures sous 760px, voir
`RAPPORT-FINAL.md` section A) fonctionne mais a été construit comme une adaptation de
l'interface desktop existante, pas conçu mobile-first comme le demande maintenant le cahier
(§11 : menus compacts, panneaux adaptés, zoom/déplacement tactile pensés dès le départ). À
auditer avec le point 3 ci-dessus, pas séparément.

## 5. Audit de brochage élargi à l'ensemble du catalogue

Cette session n'a corrigé/complété que les 4 composants d'appareillage bâtiment
explicitement et concrètement faux par rapport au nouveau cahier (va-et-vient, permutateur,
interrupteur double, interrupteur bipolaire) + le télérupteur (pinNames manquants). Le
cahier demande un audit de "forme / représentation / orientation / bornes / cohérence" pour
l'ensemble du catalogue. Les ~500 autres composants n'ont pas été revérifiés au-delà de ce
que `tests/verify_catalog.js` garantit déjà (bornes ↔ tracé, pas d'identifiant en double) —
cela ne garantit pas l'exactitude électrique/normative de chaque fiche, seulement sa
cohérence interne.

## À faire avant de fusionner ce document dans le CDC définitif

- [ ] Décider si la refonte bibliothèque (point 1) et le modèle 4 couches (point 2) doivent
      être menés ensemble (ils se recoupent fortement) ou séparément.
- [ ] Faire auditer visuellement l'interface actuelle dans un vrai navigateur avant de
      concevoir la séparation espace de travail / interface générale (point 3) — décision
      d'architecture qui mérite d'être vue, pas seulement lue dans le code.
- [ ] Prioriser les familles de composants à auditer en premier pour le point 5 (le cahier
      ne donne pas d'ordre explicite au-delà de l'appareillage bâtiment déjà traité).
