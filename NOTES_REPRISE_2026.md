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

## À faire avant de fusionner ce document dans le CDC définitif

- [ ] Faire auditer visuellement l'interface actuelle dans un vrai navigateur (point 4) avant
      de trancher les points 1 à 3 — décisions qui méritent d'être vues, pas seulement lues.
- [ ] Prioriser les familles de composants à auditer en premier pour le point 1 (le client n'a
      pas donné d'ordre explicite au-delà de constater le problème général).
