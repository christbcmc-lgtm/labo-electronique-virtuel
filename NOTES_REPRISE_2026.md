# NOTES DE REPRISE 2026 — CHANTIER DIFFÉRÉ (matière première, pas encore mergée)

> Statut : comme pour `NOTES_EXIGENCES_EN_COURS.md`, **ce n'est pas le cahier des charges.**
> `CAHIER_DES_CHARGES_DEFINITIF_LABO_ELECTRONIQUE_VIRTUEL.md` reste la référence et n'a
> volontairement pas été modifié par cette session.

## Origine

Le client a transmis plusieurs documents de reprise au fil de la même session (le premier
~8600 lignes, puis un second plus strict demandant explicitement de ne pas se contenter de
corriger l'existant, puis des demandes ponctuelles en cours de route : logo/PDF pro,
undo/redo, qualité des symboles, tactile, hauteur des boîtiers denses). Une bonne partie a été
traitée au fil de cette session — voir `RAPPORT-FINAL.md`, addenda 3 à 6 : brochage de 5
composants d'appareillage bâtiment, PDF éclaté en 4 exports + logo unifié interface/PDF,
bibliothèque 3 colonnes, modèle de données enrichi, devis multi-devises, PDF du dimensionnement
détaillé, annuler/rétablir, barre d'outils flottante, tactile complet (déplacer/tracer un
fil/pan), hauteur de boîtier variable selon la densité de broches, 3 symboles corrigés
(NTC/PTC/LDR), multimètre redessiné.

Le reste décrit un chantier plus large, **volontairement reporté** — pas une omission. Ce
fichier accumule ce qui reste pour rester traçable pour la suite, exactement comme
`NOTES_EXIGENCES_EN_COURS.md` l'a fait pour le chantier précédent.

## 1. Audit des symboles contre la norme IEC 60617 — PRIORITÉ N°1 (demande explicite du client)

« Les symboles sont prioritaires et doivent respecter la norme, je ne veux pas d'une forme
bâclée. » Cette session a corrigé :
- les 3 cas les plus nets de rectangle-vide-avec-texte sans convention réelle (thermistances
  NTC/PTC, LDR — voir addendum 4, Q7), en réutilisant des gabarits déjà présents dans
  `js/catalog.js` (`TPL.boxDiag`, convention photodiode) ;
- le multimètre, entièrement redessiné en boîtier à afficheur + vraies bornes de sonde
  (addendum 5) ;
- **le chevauchement des numéros de broches sur les boîtiers denses (14/16+ broches)** —
  signalé avec image + exemple de code à l'appui, corrigé par une hauteur de boîtier variable
  (`icTemplate()`/`viewH`, addendum 6) : ce point précis est réglé, ne pas le re-signaler dans
  un audit futur.

Restent à auditer, par ordre de valeur probable :

- Les composants de contrôle/puissance encore en gabarit "rectangle + sigle" (`variateur_vitesse`,
  `gradateur_puissance`, `hacheur`, `relais_auxiliaire`, `analyseur_reseau`,
  `relais_protection`, `interphone`, `permutateur`, `telerupteur`...) : à vérifier composant
  par composant si un symbole IEC 60617 distinctif existe et vaut la peine d'être dessiné à la
  main, ou si le bloc fonctionnel étiqueté reste la convention correcte (c'est déjà le cas
  pour beaucoup d'appareils de commande/contrôle dans les schémas fonctionnels réels — à ne
  pas changer par principe).
- Les ~130-150 composants basés sur `icTemplate()` (circuits intégrés génériques) : le
  rectangle à broches numérotées **est** la convention IEC/pratique standard pour un CI, ce
  n'est probablement pas à corriger — mais mérite une vérification explicite plutôt qu'une
  supposition.
- Les composants "vedettes" dessinés à la main (résistance, diodes, transistors, portes
  logiques, AOP, transformateurs...) sont déjà vérifiés (RAPPORT-FINAL section D/O3) — ne pas
  les rouvrir sans raison précise.

Une méthode possible pour la suite : lister les symboles par famille avec une capture/aperçu
(la fiche détail de la bibliothèque 3 colonnes, ajoutée cette session, permet justement de
voir chaque symbole individuellement — `#/composants` → Parcourir la bibliothèque), les faire
valider un par un plutôt que de deviner ce qui doit changer.

## 2. Séparation espace de travail du schéma / interface générale

Le cahier demande explicitement de ne pas se contenter de « réduire l'interface PC pour
obtenir la version mobile », et de séparer clairement la zone de travail du schéma de
l'interface générale du laboratoire. **Constat de cette session** : la structure actuelle
(`.workspace` en CSS, `css/style.css`) est déjà en réalité une zone plein écran dédiée
(`height:calc(100vh - var(--header-h))`, 3 colonnes tools/canevas/panneau) — pas "une longue
page" contrairement à ce que le cahier laisse supposer pour l'état du dépôt. Ce qui reste
réellement à évaluer : la densité de la barre d'outils du canevas (plusieurs boutons PDF/IA/
partage/enregistrer sur une seule ligne) et une éventuelle vue d'ensemble ("vue générale du
projet") en dézoomant — pas une réorganisation structurelle complète. À vérifier dans un vrai
navigateur avant de décider quoi que ce soit (voir point 4).

## 3. Refonte mobile-first

Le mode responsive actuel (onglets Composants/Canevas/Mesures sous 760px) fonctionne mais a
été construit comme une adaptation de l'interface desktop existante. À auditer avec le point 2
ci-dessus, dans un vrai navigateur, avant toute décision de redesign.

## 4. Vérification visuelle dans un vrai navigateur — bloquant pour les points 1, 2, 3

Cette session a de nouveau tenté d'utiliser l'extension Chrome pilotable : elle est connectée,
mais à une machine différente de celle qui exécute le serveur de développement local
(`http://127.0.0.1:8080`, atteignable depuis PowerShell/curl sur cette machine mais pas depuis
le navigateur piloté — un site externe s'affiche normalement). Toute la validation de cette
session reste donc au niveau DOM simulé (Node + jsdom : logique, structure HTML, absence
d'erreur), jamais au rendu pixel réel. Avant de pousser plus loin les points 1 à 3 (qui sont
fondamentalement des jugements visuels), il faudrait soit connecter l'extension à la bonne
machine, soit qu'un humain fasse un tour rapide de l'application déployée et rapporte ce qui
ne va pas concrètement.

## 5. Catalogue étendu vers 900 composants

Objectif annoncé dans le tout premier cahier, jamais atteint (503 aujourd'hui). Toujours jugé
secondaire par rapport à la qualité (voir RAPPORT-FINAL O4) — pas repris cette session, et pas
prioritaire tant que le point 1 (qualité des symboles déjà présents) n'est pas traité : ajouter
des composants avec des symboles génériques non vérifiés irait à l'encontre de la demande
explicite du client sur ce point.

## 6. Plan de bâtiment — intégré cette session (voir RAPPORT-FINAL.md, addendum 7)

Le client a transmis un très volumineux cahier des charges décrivant une plateforme complète
multi-domaines (électronique / électrotechnique / bâtiment / énergies renouvelables /
automatisme / instrumentation / CAO 3D bâtiment / CAO mécanique 3D / messagerie avancée /
sécurité admin / export PDF par espace, etc.) — un chantier de plusieurs mois, pas quelque
chose qu'une session peut traiter en bloc. Sur demande explicite de l'utilisateur, cette
session a choisi et traité **une seule pièce concrète et livrable** de cet ensemble : le
prototype fonctionnel « Atelier Plan » (éditeur de plan 2D bâtiment/électricité) qu'il avait
fourni comme code de référence, intégré (pas collé tel quel) comme 4ᵉ onglet
Schéma/Devis/Dimensionnement/**Plan** de chaque projet, avec sa propre persistance backend
(`db.getPlan`/`db.savePlan`, `js/plan.js`, `css/plan.css`). Détails complets, ce qui a été
vérifié par exécution réelle et ce qui ne l'a pas été (rendu visuel, Supabase réel,
verrouillage lecture-seule complet) : voir l'addendum 7 de `RAPPORT-FINAL.md`.

Reste explicitement différé de ce sous-chantier :
- Fusionner l'export PDF du plan avec la famille de PDF partagée (`js/pdf.js`,
  `openPdfWindow`/logo commun) — le plan garde pour l'instant son propre export planche
  (impression navigateur, cartouche déjà intégré au prototype), volontairement laissé
  indépendant plutôt que fusionné à la hâte (voir addendum 7 pour la justification).
- Verrouillage complet des outils de dessin en mode lecture seule (aujourd'hui seule la
  sauvegarde est bloquée côté module, pas l'interface).
- Vérification visuelle réelle du rendu (ruban, panneaux, lisibilité des symboles bâtiment à
  l'échelle papier, tactile pincement/deux doigts) — bloqué par le point 4 ci-dessous, comme
  le reste de ce document.

Reste hors de portée pour l'instant (non commencé, non estimé) : énergies renouvelables
détaillées (PV/éolien/hydraulique/stockage), messagerie avancée (transfert de message, pièces
jointes enrichies), assistant IA contextuel nommé, bibliothèques visuelles par domaine
(électrotechnique/renouvelable/instrumentation séparées du catalogue électronique actuel),
constructeur/import de composants personnalisés, sécurité admin côté serveur (RLS déjà en
place pour le reste du projet, à étendre explicitement au strict nécessaire si ces nouveaux
espaces sont un jour construits).

## 7. Vue 3D du bâtiment — intégrée cette session (voir RAPPORT-FINAL.md, addendum 8)

Nouveau 5ᵉ onglet « 3D » (`#/plan3d/:id`, `js/plan3d.js` + `css/plan3d.css`) : lit le plan déjà
enregistré (point 6 ci-dessus) et l'affiche en 3D orbitable via Three.js chargé en CDN (murs
extrudés avec ouvertures découpées, poteaux, symboles électriques positionnés à leur hauteur de
pose, vues prédéfinies, coupe horizontale réglable, export PNG). Aucun nouveau stockage — vue
en lecture seule dérivée du plan. Détails complets dans l'addendum 8 de `RAPPORT-FINAL.md`,
notamment ce qui a pu être vérifié (géométrie pure, repli gracieux sans Three.js/WebGL) contre
ce qui ne l'a pas pu (rendu WebGL réel, chargement réel du CDN — même limitation d'environnement
que pour tout le reste de ce projet, voir point 4).

## 8. CAO mécanique 3D — PROCHAINE ÉTAPE SUGGÉRÉE, NON COMMENCÉE

C'est la Phase 3 du cahier reçu, volontairement laissée de côté cette session (chantier d'une
tout autre ampleur que la vue 3D du bâtiment ci-dessus — voir la justification dans l'addendum
8). Pour information, si ce chantier est repris un jour, le cahier original décrit :

- primitives paramétriques (boîte/cylindre/sphère/cône/tube/tore) ;
- esquisse 2D sur un plan (XY/XZ/YZ ou sur une face existante) → extrusion/révolution ;
- opérations booléennes (union/soustraction/intersection), perçage ;
- arbre de conception (liste des fonctions appliquées, modifier un paramètre régénère le
  corps) — nécessite un modèle de données "historique de fonctions", pas seulement une liste
  d'entités comme le plan 2D/3D bâtiment ;
- bibliothèque de pièces standard paramétriques (vis, écrous, rondelles, roulements,
  engrenages, profilés) ;
- mesures, coupe, matériaux avec masse volumique (calcul de masse) ;
- export STL (binaire) + OBJ, réimport.

Techniquement : Three.js est déjà chargé (voir point 7) et pourrait servir de moteur de rendu,
mais les opérations booléennes fiables nécessitent une bibliothèque CSG dédiée (ex.
`three-bvh-csg`), non incluse actuellement. Ce module n'est PAS une extension du fichier
`js/plan3d.js` existant (qui est volontairement une simple visualisation dérivée, sans édition)
— il mérite son propre fichier/espace, son propre modèle de données, et une session dédiée.

## À faire avant de fusionner ce document dans le CDC définitif

- [ ] Faire auditer visuellement l'interface actuelle dans un vrai navigateur (point 4) avant
      de trancher les points 1 à 3 — décisions qui méritent d'être vues, pas seulement lues.
- [ ] Prioriser les familles de composants à auditer en premier pour le point 1 (le client n'a
      pas donné d'ordre explicite au-delà de constater le problème général).
- [ ] Décider si/quand fusionner l'export PDF du plan (point 6) avec la famille de PDF
      partagée, ou le garder durablement indépendant (il produit un type de document —
      planche technique dimensionnée — que le système actuel ne sait pas produire).
- [ ] Prioriser, avec le client, laquelle des pièces du cahier des charges élargi (point 6)
      traiter ensuite — il n'a pas donné d'ordre explicite au-delà de la liste complète.
- [ ] Faire vérifier le rendu 3D réel (point 7) dans un vrai navigateur dès que possible —
      c'est la partie la plus visuelle de tout ce qui a été livré jusqu'ici, et la seule à
      n'avoir reçu aucune vérification pixel, même approximative.
- [ ] Décider si la CAO mécanique 3D (point 8) est réellement souhaitée avant d'y investir une
      session complète — c'est de loin le chantier le plus lourd de tout ce qui reste.

## 9. Énergies renouvelables — 17 composants manquants ajoutés cette session (voir RAPPORT-FINAL.md, addendum 9)

Protection DC/batterie (fusible gPV, sectionneur DC, fusible/sectionneur batterie), optimiseur
PV, BMS, éolien (génératrice, redresseur, contrôleur, frein), hydraulique (contrôleur, vanne),
et une nouvelle famille "Solaire thermique" complète (capteur, ballon, circulateur, régulateur
différentiel, sonde). Catalogue : 505 → 522 composants. Détail complet dans l'addendum 9.

Reste explicitement non couvert de la section énergies renouvelables du cahier reçu (non
vérifié comme manquant avec la même rigueur — à revérifier avant d'ajouter) : micro-réseaux
hybrides détaillés (flux réseau ↔ stockage ↔ production), dimensionnement dédié à ces nouveaux
composants (le module Dimensionnement §24 calcule déjà PV/batterie/onduleur mais n'a pas été
étendu pour l'éolien/hydraulique/solaire thermique).

## À faire avant de fusionner ce document dans le CDC définitif (suite)

- [ ] Étendre le module Dimensionnement (§24) à l'éolien/hydraulique/solaire thermique
      maintenant que leurs composants existent dans le catalogue (point 9) — sinon ces
      familles peuvent être placées dans un schéma mais pas dimensionnées.
