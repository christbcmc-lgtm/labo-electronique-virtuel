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

**Mise à jour (session suivante, voir RAPPORT-FINAL.md addendum 11)** : la liste "composants de
contrôle/puissance en gabarit rectangle + sigle" ci-dessous a été revue un par un contre les
conventions réelles de schématique électrique (pas juste relue en diagonale) :

- `variateur_vitesse` (VFD), `gradateur_puissance`, `hacheur`, `analyseur_reseau`,
  `relais_protection` : **confirmés corrects tels quels**. Aucun symbole IEC 60617 distinctif
  n'existe pour ces appareils de conversion/mesure à ce niveau d'abstraction (dispositif complet,
  pas son schéma interne) — le bloc fonctionnel étiqueté est la convention réellement utilisée
  dans les schémas unifilaires et fonctionnels professionnels. Ne pas rouvrir sans nouvelle
  information contraire.
- `relais_auxiliaire` : déjà un symbole distinct (contacts courbes dessinés à la main, pas un
  simple rectangle) — vérifié correct, rien à faire.
- `permutateur`, `telerupteur` : déjà corrigés lors d'une session précédente (brochage IEC
  documenté via `pinNames`, voir plus haut) — confirmés à jour, pas de nouveau problème trouvé.
- `interphone` : **corrigé** — remplacé le rectangle générique portant le texte "INT" par un
  boîtier avec un pictogramme reconnaissable (silhouette de haut-parleur, réutilisant la forme
  déjà employée pour `haut_parleur`, + bouton d'appel), sur le même principe que le multimètre
  (addendum 5). Aucun autre composant de cette liste ne présentait un vrai déficit de ce type
  après vérification individuelle.

Restent à auditer, par ordre de valeur probable :

- Les ~130-150 composants basés sur `icTemplate()` (circuits intégrés génériques) : le
  rectangle à broches numérotées **est** la convention IEC/pratique standard pour un CI —
  **confirmé** (vérification explicite faite cette session, pas une simple supposition reportée) :
  c'est la convention universellement utilisée par les fabricants et les logiciels de CAO
  électronique pour représenter un circuit intégré. Rien à corriger sur ce point.
- Les composants "vedettes" dessinés à la main (résistance, diodes, transistors, portes
  logiques, AOP, transformateurs...) sont déjà vérifiés (RAPPORT-FINAL section D/O3) — ne pas
  les rouvrir sans raison précise.
- **Ce qui reste réellement ouvert** : un audit visuel pixel par pixel (proportions, épaisseur
  de trait, lisibilité à petite échelle) de l'ensemble des ~522 symboles n'a toujours pas pu
  être fait, faute d'accès à un vrai navigateur (voir point 4) — seule la géométrie
  bornes↔tracé est vérifiée automatiquement (`tests/verify_catalog.js`), pas le rendu visuel
  réel. La question « la convention utilisée est-elle la bonne » (posée composant par
  composant, sans navigateur) est en revanche désormais traitée pour toutes les familles
  identifiées comme douteuses.

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

## 8. CAO mécanique 3D — FAIT (session suivante), voir point 12 et RAPPORT-FINAL.md addendum 13

**Mise à jour** : ce chantier, décrit ci-dessous comme différé, a finalement été traité dans une
session suivante sur demande explicite du client — voir le point 12 plus bas pour ce qui a été
livré et le périmètre assumé (pas d'opérations booléennes 3D générales). Le texte original de ce
point est conservé tel quel ci-dessous à titre d'historique (c'est la description du besoin telle
que comprise avant réalisation, utile pour comparer à ce qui a été effectivement livré) :

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
- [x] CAO mécanique 3D (point 8) — faite, périmètre délimité (voir point 12).
- [ ] Décider si les opérations booléennes 3D générales (union/soustraction entre solides
      quelconques, hors périmètre du point 12) valent l'ajout d'une dépendance CSG dédiée.

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


## 10. Dimensionnement éolien/hydraulique/solaire thermique — fait cette session (voir RAPPORT-FINAL.md, addendum 10)

Le point ci-dessus (dimensionner ce qui a été ajouté au point 9) est traité : nouvel onglet
« Éolien / Hydraulique / Solaire thermique » dans le module Dimensionnement, formules physiques
standard (puissance du vent, puissance hydraulique, production solaire thermique), export PDF
individuel comme les onglets existants. Détail complet dans l'addendum 10.

## 11. Constructeur de composant personnalisé — fait cette session (voir RAPPORT-FINAL.md, addendum 12)

Nouvelle page "Créer un composant" (3e onglet de la page Composants) : génère automatiquement
le symbole via icTemplate() (même gabarit que les CI génériques, donc géométriquement correct
par construction), stocké par utilisateur (nouvelle table Supabase `custom_components` + RLS),
immédiatement utilisable dans tous ses projets (recherche, éditeur de schéma) sans avoir touché
au reste du moteur. Détail complet dans l'addendum 12.

Reste explicitement non couvert :
- Choix de forme de boîtier (un seul gabarit rectangulaire disponible actuellement).
- Modèle électrique/simulation pour un composant personnalisé (le cahier distingue
  explicitement symbole graphique et modèle électrique, §24 — seul le symbole est couvert ici,
  ces composants ne sont jamais `simulable`).
- Import depuis un fichier externe (JSON/SVG) — seule la création via formulaire est
  disponible, pas d'import de définition déjà existante.

## 12. CAO mécanique 3D — fait cette session (voir RAPPORT-FINAL.md, addendum 13)

Le point 8 ci-dessus (Phase 3, "prochaine étape suggérée, non commencée") est traité, avec un
périmètre délibérément réduit et documenté : primitives, esquisse extrudée avec perçage,
révolution, bibliothèque de pièces standard (vis/écrou/rondelle/profilé/engrenage
approximatif), assemblage par positionnement (pas de fusion booléenne), matériaux/masse,
coupe, export STL. Nouvel onglet "CAO 3D" (6e onglet). Détail complet dans l'addendum 13.

Reste explicitement non couvert (choix de périmètre assumé, pas un oubli) :
- Opérations booléennes 3D générales (union/soustraction/intersection entre solides
  quelconques) — nécessiterait une bibliothèque CSG dédiée non incluse.
- Éditeur d'esquisse 2D visuel (à la souris, avec contraintes/cotes) — les profils se saisissent
  aujourd'hui sous forme de listes de coordonnées numériques.
- Denture réelle des engrenages (représentés en disque avec alésage).
- Congés/chanfreins, coupes/vues de mise en plan, export DXF.
- Vérification visuelle réelle du rendu — bloquée par le point 4 comme tout le reste.

## 13. Plan bâtiment — verrouillage lecture seule et logo PDF — fait cette session (addendum 15)

Le point 6 mentionnait deux limites : verrouillage lecture seule incomplet (en réalité déjà
correct, l'affirmation était inexacte — corrigé dans la documentation, testé de bout en bout) et
PDF du plan sans le logo partagé (ajouté au cartouche, sans toucher à la planche technique).
Détail dans l'addendum 15 de RAPPORT-FINAL.md.

Reste du point 6 toujours non fait : fusion complète de l'export PDF du plan avec la famille de
PDF partagée (`openPdfWindow`) — décision volontairement non prise, le plan produit un type de
document (planche technique dimensionnée A5-A0) que le système actuel ne sait pas produire.
