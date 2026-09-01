# NOTES DE TRAVAIL — MATIÈRE PREMIÈRE POUR LE CAHIER DES CHARGES

> **Mise à jour** : à la demande explicite « fais tout, code tout », les points 1 à 7
> ci-dessous ont été **implémentés** dans le code (pas seulement conservés comme notes).
> Voir `RAPPORT-FINAL.md`, section **« ADDENDUM — SESSION SUIVANTE »**, pour le détail
> exact de ce qui a été codé, testé, et ce qui reste une limite assumée (notamment :
> pas de réécriture complète en "4 couches" strictes du catalogue de composants — voir
> N1 de l'addendum pour la justification ; présence temps réel en mode démo limitée aux
> onglets d'un même navigateur, faute de serveur). Ce fichier reste la trace du
> raisonnement d'origine ; il n'a pas été réécrit pour refléter l'implémentation.

## Statut de ce document

**Ce n'est PAS le cahier des charges.** Le cahier des charges définitif reste
`CAHIER_DES_CHARGES_DEFINITIF_LABO_ELECTRONIQUE_VIRTUEL.md` et ne doit pas être
modifié tant que la matière première n'est pas jugée complète.

Ce fichier sert à accumuler, au fil des échanges, les exigences, problèmes
constatés, solutions envisagées et améliorations proposées, **sans** figer de
décision finale. Quand le tout sera jugé stable, il sera fusionné dans une
nouvelle version du cahier des charges définitif, en remplaçant chaque
« etc. » par une liste explicite.

Chaque section ci-dessous indique, entre crochets, à quelle(s) section(s) du
cahier des charges définitif actuel (CDC) elle se rattache — soit pour la
compléter, soit pour la préciser, soit parce qu'il s'agit d'un point
entièrement nouveau.

---

## 1. Gestion des composants — précisions [complète CDC §8, §16]

- Base de composants très large : jusqu'à plusieurs centaines, potentiellement
  ~1000 références à terme.
- Recherche sur une **page dédiée** (pas seulement une barre de recherche dans
  le catalogue courant).
- **Composants récents** et **favoris** accessibles rapidement depuis un
  panneau flottant / centre de contrôle (pas besoin de rouvrir le catalogue
  complet pour un composant déjà utilisé).
- Plusieurs références peuvent partager un même symbole graphique lorsque leur
  représentation est identique (ex. boîtiers de circuits intégrés similaires),
  **mais** le composant sélectionné conserve ses propres caractéristiques,
  références et comportement (brochage, modèle fonctionnel, paramètres).
- Les broches doivent être correctement positionnées **et numérotées**
  (numérotation visible/consultable, pas seulement une position graphique).
- Les paramètres modifiables dépendent du type de composant : tension,
  courant, résistance, capacité, inductance, nombre de broches, etc. — cette
  liste devra être rendue exhaustive par famille au moment de la fusion dans
  le CDC final (pas de « etc. » dans la version définitive).
- **Composant de remplacement** : possibilité de définir qu'un composant sert
  de remplacement quand une référence précise n'est pas disponible dans la
  base — mais avec un **avertissement clair et visible** si le nom saisi ne
  correspond pas réellement au modèle utilisé.
  - Exemple à éviter : un CD4017 renommé artificiellement en une autre
    référence, silencieusement traité comme s'il s'agissait réellement de ce
    nouveau composant (comportement, brochage et modèle électriques faux).
  - Le système doit donc distinguer clairement : *référence réellement
    modélisée* vs *étiquette de substitution posée par l'utilisateur*.

## 2. Maquette / schématique — liste de fonctions attendues [complète CDC §3, §5]

Chantier majeur. Fonctions à couvrir explicitement :

- déplacement libre des composants ;
- déplacement **avec** connexions (les fils suivent) ;
- déplacement **sans** connexions (détacher un composant sans casser le fil,
  selon le mode choisi) ;
- fils orthogonaux et réorganisables ;
- création de jonctions / nœuds électriques ;
- intersections de fils **sans** connexion électrique (croisement visuel pur) ;
- possibilité de faire passer un fil « par-dessus » un autre ;
- possibilité de poursuivre une connexion à partir d'une borne déjà utilisée
  (bornes multi-connexions / nœuds) ;
- changement de couleur des fils ;
- outils de câblage directement accessibles près de la maquette (pas dans un
  menu séparé et éloigné) ;
- suppression des fils / composants ;
- zoom et dézoom ;
- adaptation complète au tactile ;
- panneau de composants récents/favoris **déplaçable, réductible et
  escamotable** (voir point 1).

Principe directeur : la maquette doit se comporter comme un **véritable
éditeur de schéma électrique**, pas comme une surface où l'on pose des images.

## 3. Travail individuel et travail partagé [remplace/précise CDC §31]

Architecture retenue, plus simple que prévu initialement :

- **Compte personnel** → peut entrer dans un **espace de travail partagé**
  (groupe de travail).
- Pas de catégorie artificielle « responsable administratif » séparée : le
  rôle de responsable découle simplement de la création du groupe.

Règles pour les groupes :

- le créateur du groupe devient responsable du groupe ;
- il peut gérer les projets du groupe selon ses permissions ;
- les membres sont recherchés parmi les utilisateurs **déjà inscrits** (pas de
  création de compte à la volée depuis cet écran) ;
- recherche par nom/prénom ; une seconde méthode de recherche peut être
  ajoutée seulement si elle apporte réellement quelque chose (à définir —
  pas de méthode redondante juste pour en avoir deux) ;
- un projet appartient à son auteur ;
- par défaut, les autres membres du groupe **ne peuvent pas modifier** un
  projet dont ils ne sont pas l'auteur ;
- l'auteur peut autoriser une personne précise à modifier son projet ;
- toute autorisation de modification accordée doit être **signalée** aux
  membres concernés (notification, voir point 4) ;
- **consultation en temps réel** possible ;
- possibilité de voir les composants se déplacer pendant qu'un autre membre
  travaille sur le même projet (édition live visible) ;
- possibilité de choisir entre deux modes d'accès : **voir seulement** ou
  **voir + modifier**.

Ce modèle remplace l'idée d'attribuer automatiquement les mêmes droits à tous
les membres d'un groupe.

## 4. Notifications [nouveau point, absent du CDC actuel]

Séparer deux niveaux :

- **Notifications importantes** → apparition temporaire à l'écran (type
  notification mobile : apparition puis disparition automatique) + signal
  visuel.
- **Notifications ordinaires** → indicateur/badge dans un centre de
  notifications, sans interruption immédiate.
- **Historique** consultable ensuite pour les deux types.
- Le **son** de notification doit être optionnel, avec possibilité de le
  désactiver.

Exemples d'événements déclencheurs identifiés jusqu'ici : autorisation de
modification accordée sur un projet (point 3), activité dans un groupe. Cette
liste devra être complétée avant fusion dans le CDC final.

## 5. PDF — structure de document [précise et étend CDC §7, §25]

Principe confirmé : le PDF **ne doit pas** être une capture ou un export brut
de l'interface. Il doit ressembler à un document technique propre et
exploitable.

Structure proposée (sections pouvant être réparties sur plusieurs pages
chacune) :

1. page de présentation ;
2. identification du laboratoire / site ;
3. informations du projet ;
4. schéma technique redessiné avec les symboles électriques normalisés ;
5. résultats de simulation ;
6. dimensionnement ;
7. feuille / tableau de calcul ;
8. devis ;
9. observations éventuelles ;
10. conclusion ou note finale.

Règles spécifiques au **devis** dans le PDF :

- les lignes totalement vides sont **supprimées** du PDF (pas affichées) ;
- les lignes partiellement remplies sont **conservées** ;
- l'utilisateur peut ajouter autant de lignes que nécessaire dans l'éditeur de
  devis ;
- les éléments physiques absents du schéma (visserie, boîtier, câblage,
  main-d'œuvre, etc. — liste à détailler, voir CDC §22-23) peuvent être
  ajoutés manuellement au devis ;
- une **confirmation finale** est demandée à l'utilisateur avant génération
  du PDF ;
- le devis et le dimensionnement doivent pouvoir être modifiés **sans**
  nécessairement avoir construit de schéma au préalable (cohérent avec CDC
  §39).

## 6. Statut du projet [nouveau point, à ajouter au CDC]

Introduire une notion explicite de statut de projet, par exemple :

**Brouillon → En cours → Vérification → Finalisé → Exporté**

Objectif : que le système sache en permanence si :

- le schéma est incomplet ;
- le dimensionnement a été fait manuellement (sans passer par le moteur) ;
- le devis a été rempli manuellement ;
- une simulation a réellement été effectuée ;
- le PDF est prêt à être généré.

Ce statut sert notamment de garde-fou pour empêcher l'IA d'inventer des
résultats de simulation lorsque celle-ci n'a pas été exécutée (cohérent avec
l'interdiction du CDC §25 et §43).

## 7. Séparation des données composant en quatre couches [affine CDC §16]

Pour chaque composant, séparer explicitement quatre éléments distincts dans
la base de données, au lieu d'une fiche plate unique :

1. **Nom commercial / référence** — identité commerciale du composant
   (ex. « CD4017 », « NE555 »).
2. **Symbole graphique** — représentation visuelle (peut être partagée entre
   plusieurs références, voir point 1).
3. **Modèle fonctionnel** — comportement, brochage réel, logique interne du
   composant (spécifique à chaque référence même si le symbole est partagé).
4. **Paramètres** — valeurs modifiables propres à l'instance posée dans un
   schéma (tension, courant, résistance, etc. selon le type).

Justification : plusieurs circuits intégrés peuvent utiliser une
représentation de boîtier quasiment identique, alors que leur modèle
fonctionnel et leur brochage réels diffèrent totalement. Dupliquer un symbole
graphique complet pour chaque référence serait inefficace ; la séparation en
quatre couches permet de réutiliser le symbole tout en gardant un modèle
fonctionnel et des paramètres propres à chaque référence.

Remarque technique (état actuel du code, `js/catalog.js`) : l'implémentation
présente utilise déjà des « gabarits de symbole » (`SYM`, `TPL`) partagés par
famille, distincts du tableau de fiches composant — c'est un début de
séparation symbole/données. En revanche, il n'existe pas encore de couche
« modèle fonctionnel » isolée des « paramètres » : une fiche combine
aujourd'hui brochage, valeurs par défaut et comportement. La séparation en
quatre couches proposée ici est donc une évolution réelle du modèle de
données actuel, pas une simple reformulation de l'existant.

---

## À faire avant de fusionner ce document dans le CDC définitif

- [ ] Obtenir la liste explicite des composants à couvrir, structurée en
      **catégories → sous-catégories → composants → références → symbole →
      brochage → paramètres → comportement** (mentionné par l'utilisateur
      comme prochaine étape).
- [ ] Détailler la liste complète des paramètres modifiables par famille de
      composant (point 1) — actuellement une liste d'exemples, pas exhaustive.
- [ ] Détailler la liste des événements déclenchant une notification
      (point 4) — actuellement une liste d'exemples, pas exhaustive.
- [ ] Décider si une seconde méthode de recherche de membres est nécessaire
      pour les groupes (point 3), et laquelle.
- [ ] Une fois ces points stabilisés, réécrire les sections concernées du
      CDC définitif (notamment §3, §5, §7, §8, §16, §22-23, §25, §31) sans
      « etc. » dans les listes.
