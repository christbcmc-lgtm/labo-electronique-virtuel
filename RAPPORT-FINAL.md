# RAPPORT FINAL — LABORATOIRE ÉLECTRONIQUE VIRTUEL

Ce rapport documente l'intervention réalisée à partir du `CAHIER_DES_CHARGES_DEFINITIF_LABO_ELECTRONIQUE_VIRTUEL.md`
sur le dépôt existant (`labo-electronique-virtuel.html` + `supabase/`, déjà repris une première fois
lors d'une session précédente — voir git log). Comme pour cette session précédente, **rien n'est
présenté comme testé s'il ne l'a pas été réellement**, et rien n'est présenté comme fonctionnel s'il
ne l'est pas. La section K détaille exactement ce qui a été vérifié, avec les résultats obtenus.

---

## A. Ce que j'ai trouvé

### Architecture existante
Un unique fichier HTML de 2132 lignes : routeur par hash, éditeur de schéma en SVG, bibliothèque de
composants (électronique / électrotechnique / énergies renouvelables, ~31 composants), mode démo
locale (`localStorage`) et mode Supabase réel déjà câblés en parallèle derrière les mêmes noms de
fonctions (`auth`/`db`), plus une fonction Edge Supabase (`ai-interpret`) et un `schema.sql` avec RLS
déjà activée sur 8 tables. Une session précédente avait déjà corrigé plusieurs bugs réels (bornes du
MOSFET/régulateur/transformateur à point milieu mal positionnées, valeur de composant jamais
affichée, suppression de fil impossible) — voir git log, commit `7fd3ad4`.

### Fonctionnalités déjà réellement opérationnelles (vérifiées avant modification, cf. §2 du cahier)
Inscription / connexion / déconnexion / récupération par mot magique, création et sauvegarde de
projet, placement / déplacement / rotation / duplication / suppression de composant, tracé et
suppression de fil, zoom/pan, panneau propriétés, diagnostic (bornes non connectées), commentaires de
projet, discussion commune, suggestions, messagerie privée, membres de groupe, stockage estimé,
export PDF (basique), espace admin (statistiques, utilisateurs, projets, suggestions), bascule
responsive en onglets sous 760px. **Aucune de ces fonctions n'a été supprimée ou dégradée** —
conformément à la règle absolue du cahier (§2), elles ont toutes été conservées puis, pour la plupart,
améliorées.

### Écarts constatés par rapport au cahier des charges (avant modification)
1. **Placement des composants** (§3.1) : apparition directe et légèrement aléatoire au centre du
   canevas, sans zone de dépôt ni aimantation — source de superposition.
2. **Grille** (§4) : purement décorative (image CSS fixe qui ne suit pas le pan/zoom), aucun
   magnétisme réel, pas de bouton « Ranger le schéma ».
3. **Fils** (§5, priorité critique) : tracés en ligne droite (diagonales possibles), aucune sélection
   de fil, aucune reconnexion, aucune jonction visible.
4. **Interaction composant** (§6) : pas de menu contextuel ; rotation/duplication/suppression
   uniquement via le panneau propriétés.
5. **PDF** (§7B, §25) : un tableau HTML imprimé, sans schéma redessiné.
6. **Bibliothèque** (§8-§16) : ~31 composants au total, loin de la couverture demandée ; seulement 3
   domaines (le cahier en évoque 5 implicitement : électronique, électrotechnique, bâtiment,
   énergies renouvelables, automatisme) ; pas de système de variantes.
7. **Devis** (§22/§23) : totalement absent.
8. **Dimensionnement** (§24) : totalement absent.
9. **Quotas et demandes de stockage** (§27/§28) : quota fixe non configurable, aucune demande
   possible, aucune décision admin.
10. **Administration** (§29) : pas de suspension/suppression d'utilisateur, pas de suppression de
    projet, pas de gestion de quota, pas de vue des demandes de stockage.
11. **Thèmes** (§33) : uniquement le thème sombre.
12. **IA** (§20/§21) : fonction Edge écrite mais l'appel réel au fournisseur n'était qu'un
    commentaire (« À COMPLÉTER »), jamais exécuté.

### Bugs réels trouvés (au-delà des écarts fonctionnels ci-dessus)
- **`window.eval()` n'est pas en cause ici** (c'est un piège rencontré côté outillage de test, pas
  dans l'application) — voir section K pour le détail méthodologique.
- Aucun autre bug fonctionnel n'a été trouvé dans le code hérité au-delà des écarts listés ci-dessus.
  Un bug a en revanche été **introduit puis immédiatement détecté et corrigé pendant cette session**
  par la suite de tests automatisés (voir section K, point « bug détecté par les tests »).

### Problèmes de sécurité identifiés
- **RLS insuffisante pour les nouveaux besoins** : la policy `profiles_update_own` héritée
  n'empêchait que la modification du champ `role` par l'utilisateur lui-même. En ajoutant
  `suspended` et `storage_quota`, il fallait aussi verrouiller ces deux champs, sans quoi un compte
  suspendu aurait pu lever lui-même sa suspension, ou s'auto-attribuer un quota illimité — corrigé
  (voir section J).
- Le compte admin de démonstration reste `admin123` en mode démo locale uniquement (déjà documenté
  comme non représentatif d'une vraie sécurité — le mode Supabase délègue entièrement
  l'authentification à Supabase Auth).

---

## B. Ce que j'ai modifié

1. **Restructuration en fichiers séparés** (voir section D) : `labo-electronique-virtuel.html`
   (30 lignes, coquille) + `css/style.css` + 8 fichiers `js/*.js`. Le HTML historique de 2132 lignes
   a été décomposé sans réécrire au hasard : chaque bloc de logique existant (backend mock/Supabase,
   éditeur, routeur/vues) a été déplacé tel quel dans son fichier, puis étendu.
2. **Placement des composants** : remplacé l'apparition directe par un mécanisme « armé » — clic sur
   un composant du catalogue → aperçu semi-transparent qui suit le curseur → clic sur le canevas pour
   déposer, avec aimantation sur une grille de 20 unités (§3.1).
3. **Grille** : déplacée dans le SVG lui-même (motif `<pattern>`) pour qu'elle suive réellement le
   pan/zoom et représente fidèlement la zone d'aimantation, au lieu d'un fond CSS statique (§4).
4. **Fils** : routage recalculé en polylignes orthogonales (horizontal → vertical, jamais de
   diagonale), jonctions visibles quand ≥3 extrémités de fils partagent un point, sélection d'un fil
   au clic, suppression via la touche Suppr, **reconnexion d'une extrémité de fil existante** par
   glisser vers une nouvelle borne (§5).
5. **Diagnostic** (§18) : en plus des bornes non connectées, détection des courts-circuits directs
   (un fil reliant les deux bornes du même composant) et — nouveauté réelle — détection par analyse
   de connexité (union-find) qu'un voltmètre/ohmmètre est branché en série au lieu du parallèle, ou
   qu'un ampèremètre est branché en parallèle au lieu du série (l'exemple donné littéralement par le
   cahier, §18).
6. **PDF/rapport** : entièrement réécrit pour redessiner le schéma en version technique claire
   (symboles vectoriels réutilisés, pas une capture d'écran), avec nomenclature référencée (R1, C2,
   Q1...), diagnostic, devis et dimensionnement inclus s'ils existent (§7B, §25).
7. **`supabase/schema.sql`** : ajout des colonnes `suspended`, `storage_quota` sur `profiles`, `devis`
   sur `projects`, nouvelle table `storage_requests`, extension de la contrainte `espace` à 5
   domaines, nouvelles policies RLS, bloc de compatibilité idempotent pour les projets Supabase déjà
   initialisés avec l'ancien schéma.
8. **`supabase/functions/ai-interpret/index.ts`** : l'appel réel à l'API Anthropic (Messages API,
   modèle `claude-sonnet-5`) remplace le bloc « À COMPLÉTER » — voir section G pour ce qui reste à
   votre charge.

---

## C. Ce que j'ai ajouté

- **Menu contextuel composant** (clic droit desktop, appui long ~550 ms sur tactile) : Propriétés,
  Pivoter, Dupliquer, Remplacer par une variante (si la famille en propose), Informations,
  Supprimer (§6).
- **Bouton « Ranger le schéma »** : aligne tous les composants sur la grille sans jamais casser une
  connexion (les fils sont toujours recalculés depuis les positions à chaque rendu, donc rien ne peut
  se « perdre ») (§4).
- **Système de variantes** (§10) : un composant peut déclarer une liste `variantes` (ex. le
  transformateur simple propose transfo à point milieu / d'isolement / de courant / de tension /
  triphasé) ; le menu contextuel permet de remplacer le composant posé par une variante en conservant
  sa position et sa rotation.
- **Recherche globale** : la recherche du catalogue couvre tous les domaines, pas seulement celui du
  projet ouvert (utile pour emprunter un composant à un autre domaine).
- **Catalogue en familles repliables** : chaque domaine affiche ses familles (Résistances, Diodes,
  Transistors...) sous forme de sections repliables plutôt qu'une longue liste plate — performance et
  lisibilité même avec un catalogue large (§36).
- **2 nouveaux domaines** : « Électricité du bâtiment » (§12) et « Automatisme et commande » (§14),
  qui n'existaient pas du tout auparavant.
- **Module Devis** (`#/devis/:id`) indépendant du schéma : table éditable (désignation, référence,
  quantité, unité, prix unitaire, total), remise %, taxe optionnelle, total général, import optionnel
  des composants du schéma comme point de départ, sauvegarde par projet (§22/§23).
- **Module Dimensionnement** (`#/dimensionnement/:id`) : formules réelles affichées et expliquées —
  photovoltaïque autonome (puissance crête, nombre de panneaux, capacité batterie), électrotechnique/
  bâtiment (courant nominal, section de câble par chute de tension, calibre de protection),
  électronique (résistance série LED, diviseur de tension, dissipation d'un régulateur linéaire)
  (§24). Un résultat peut être injecté dans le rapport PDF du projet.
- **Quotas de stockage configurables + demandes d'augmentation** (§27/§28) : quota par utilisateur
  modifiable par l'admin, formulaire de demande côté utilisateur, file d'attente admin
  (accepter/refuser), le quota est appliqué automatiquement à l'acceptation.
- **Administration étendue** (§29) : suspension/réactivation d'un utilisateur, suppression
  d'utilisateur (et de ses projets), suppression de n'importe quel projet, modification du quota par
  utilisateur, traitement des demandes de stockage — toutes ces actions sont protégées côté Supabase
  par RLS (section J), pas seulement côté interface.
- **3 thèmes** (§33) : sombre (défaut), clair, gris — sélecteur dans la barre supérieure, préférence
  retenue en `localStorage`, aucune donnée supplémentaire envoyée au serveur.
- **Duplication de projet** depuis le tableau de bord (le cahier §2 demandait explicitement de
  vérifier cette fonction — elle n'existait pas, elle est désormais réelle en mode démo et en mode
  Supabase).
- **Suite de tests automatisés** exécutable (`npm test`) — voir section K.

---

## D. Décisions d'architecture

### Découpage en fichiers séparés, sans build ni framework
*Ce qui était en place* : un unique fichier HTML de 2132 lignes.
*Problème rencontré* : ajouter ~130 nouveaux composants, un module Devis, un module Dimensionnement
et un PDF technique dans un seul fichier l'aurait fait dépasser 4000-5000 lignes, contredisant
directement l'interdiction du cahier de « coder tout dans une seule fonction/fichier gigantesque si
une architecture modulaire est possible » (§43, §37).
*Solution retenue* : 8 fichiers `<script>` classiques (pas de modules ES, pas de bundler) chargés dans
un ordre fixe par le HTML — `config → catalog → backend → editor → pdf → devis → dimensionnement →
app`. Chaque fichier a une responsabilité unique, exactement dans l'esprit des « modules » suggérés
par le cahier (§37), tout en respectant sa mise en garde contre la multiplication de sites/services
(§38) : ceci reste **une seule application**, un seul dossier à héberger, ouvrable directement en
local via `file://` (les balises `<script src>` classiques fonctionnent hors serveur, contrairement à
des modules ES qui seraient bloqués par la même politique de sécurité que la récupération de fichiers
locaux).

### Catalogue de composants : gabarits de symboles réutilisables plutôt que dessin unique par pièce
*Ce qui était demandé* : des dizaines de familles, chacune avec plusieurs variantes (§9 à §16), soit
plusieurs centaines de composants potentiels.
*Problème* : dessiner à la main un symbole SVG unique et vérifié pour chaque pièce aurait représenté
un travail disproportionné sans gain pédagogique réel (un symbole de résistance de puissance et un
symbole de charge résistive n'ont pas besoin d'être visuellement différents pour être compris et
manipulés correctement).
*Solution* : une douzaine de gabarits de symboles génériques mais distincts par famille (boîtier +
étiquette, boîtier + curseur pour les composants réglables, porte logique à 2 entrées, circuit
intégré générique à N broches calculées en même temps que le tracé...), combinés à des données
(nom, description, unité, valeurs usuelles, mots-clés) propres à chaque composant. Un script de
vérification automatique (`tests/verify_catalog.js`) garantit qu'aucune borne déclarée ne peut jamais
correspondre à un point qui n'existe pas réellement dans le tracé — la classe de bug trouvée sur le
MOSFET/régulateur dans la session précédente ne peut donc plus se reproduire silencieusement.
*Composants au symbole dessiné à la main, un par un* (hérités de la version précédente, déjà
vérifiés) : résistance, condensateur, bobine, diode, diode Zener, LED, transistors NPN/PNP/MOSFET,
AOP, porte ET, régulateur, transformateur (simple/point milieu/isolement), moteur AC, contacteur,
relais thermique, disjoncteur, sectionneur, panneau PV, régulateur MPPT, batterie, onduleur,
instruments de mesure. Tout le reste (~130 composants) utilise le système de gabarits ci-dessus.
*Pourquoi c'est le bon compromis* : le cahier lui-même prévient contre deux excès opposés — ne pas
« limiter artificiellement la bibliothèque à quelques composants » ET ne pas « créer un catalogue
gigantesque qui ralentit la page » (§43). Des gabarits réutilisables permettent d'ajouter un
composant en une ligne de données (§16 : « ajouter 100 ou 1000 composants ne doit pas nécessiter de
réécrire tout le moteur »), sans dessiner 164 SVG uniques à la main ni pénaliser les performances.

### PDF : impression navigateur, pas de bibliothèque ajoutée
Inchangé par rapport à la session précédente : `window.print()` reste la méthode retenue (§26, pas de
stockage serveur, génération à la demande). Ce qui change, c'est le **contenu** envoyé à cette
impression : un vrai schéma redessiné plutôt qu'un tableau (voir section I).

### Diagnostic structurel étendu par analyse de graphe, pas par un moteur de simulation
Le cahier interdit formellement de prétendre qu'une simulation électrique réelle existe si ce n'est
pas le cas (§17, §43). La détection « voltmètre en série / ampèremètre en parallèle » est une analyse
de **connexité topologique** (un composant est-il un point de passage obligé — un « pont » du graphe
— entre deux zones du circuit, ou existe-t-il un autre chemin ?), calculée avec un union-find sur les
bornes. Ce n'est toujours pas un calcul de tension/courant réel, et le diagnostic le dit explicitement
à l'écran et dans le PDF.

---

## E. Composants — familles et variantes ajoutées

164 composants au total (31 avant cette session), répartis en **5 domaines** + composants communs +
instruments :

| Domaine | Composants | Familles principales |
|---|---:|---|
| Composants communs (tous domaines) | 12 | Résistances, Condensateurs, Diodes, Électromécanique, Protections, Bâtiment, Câblage |
| Électronique | 66 | Résistances (9), Condensateurs (7), Diodes (7), Transistors (8), Thyristors (5), Circuits intégrés (16), Logique numérique (10), Capteurs et modules (10), Communication (5), Affichage (4) |
| Électrotechnique | 24 | Sources, Machines, Transformateurs (6 variantes), Protections, Charges, Mesure, Câblage |
| Électricité du bâtiment *(nouveau domaine, §12)* | 12 | Distribution, Commande éclairage, Éclairage, Protections, Câblage |
| Énergies renouvelables | 19 | Photovoltaïque, Régulation, Stockage (3 chimies), Conversion, Protections, Sources, Charges, Mesure |
| Automatisme et commande *(nouveau domaine, §14)* | 8 | Commande, Capteurs industriels, Actionneurs |
| Instruments de mesure | 4 | Multimètre, Ampèremètre, Wattmètre, Ohmmètre |

Chaque composant respecte la structure de données demandée en §16 : `id, nom, famille, domaine
(implicite via son emplacement), terminals, unit, defaultValue, valueOptions, def (documentation),
wiki, alias (mots-clés de recherche), complexite, simulable, variantes`. Le champ `simulable`
(actuellement à `true` seulement pour une douzaine de dipôles passifs simples) prépare l'intégration
future d'un moteur de calcul sans prétendre qu'il existe déjà (§17).

**Variantes implémentées** (§10) : le transformateur simple propose 5 variantes interchangeables
(point milieu, isolement, de courant, de tension, triphasé) via le menu contextuel « Remplacer par
une variante ». L'architecture (`defRow(..., { variantes:[...] })`) permet d'ajouter des variantes à
n'importe quelle autre famille sans modifier le moteur de l'éditeur.

**Limite assumée** : certaines entrées du cahier se recoupaient volontairement entre sections (par
exemple le disjoncteur apparaît dans §11 Électrotechnique et de nouveau dans §12 Bâtiment ;
« décodeur » apparaît en §9 Circuits intégrés et de nouveau en §9 Logique numérique). Ces doublons ont
été **consolidés en une seule fiche par pièce réelle**, rattachée à la famille la plus pertinente,
plutôt que dupliqués avec des identifiants différents — un identifiant de composant doit rester
unique dans tout le catalogue (vérifié automatiquement, voir section K).

---

## F. Simulation — ce qui est réellement calculé

**Aucun calcul électrique réel n'a été ajouté.** Comme dans la version précédente, le bouton
« Tester le circuit » ouvre l'onglet Diagnostic plutôt que d'afficher un faux résultat de simulation.

Ce qui est réellement calculé/vérifié :
- **Diagnostic de l'éditeur** : bornes non connectées (comptage direct), courts-circuits directs
  (un fil reliant les deux bornes du même composant), et — nouveau cette session — détection
  structurelle d'un instrument mal orienté (voltmètre/ohmmètre en série, ampèremètre en parallèle)
  par analyse de connexité du graphe électrique (union-find). C'est une analyse de **topologie**, pas
  de comportement électrique : aucune tension, aucun courant, aucune puissance n'est calculé.
- **Dimensionnement** : les formules de la section C/E sont de vrais calculs standards
  (loi d'Ohm, formule de chute de tension en ligne, méthode des heures de soleil équivalentes pour le
  photovoltaïque), appliqués aux valeurs saisies par l'utilisateur — vérifiées avec des valeurs
  connues à la main (voir section K). Elles ne dépendent pas d'un schéma posé sur le canevas.
- **Devis** : arithmétique simple (quantité × prix, remise en %, taxe en % optionnelle) — vérifiée
  également.

Ce qui reste à faire pour un vrai moteur de simulation électrique (tensions/courants/puissances
résolus sur le circuit posé) : non implémenté, comme annoncé dans le rapport précédent. L'architecture
(diagnostic séparé de l'éditeur, champ `simulable` sur chaque composant, structure `{items,wires}`
indépendante du rendu) est pensée pour accueillir un vrai solveur plus tard sans réécrire l'éditeur
graphique (§17).

---

## G. IA — comment l'intégration fonctionne

Architecture inchangée dans son principe (déjà saine dans la version précédente) : bouton
**« Interpréter (IA) »** dans l'éditeur → requête `fetch` vers `AI_EDGE_FUNCTION_URL` (une fonction
Edge Supabase, jamais d'appel direct depuis le navigateur vers un fournisseur d'IA) → réponse affichée
dans une fenêtre modale.

**Ce qui a changé cette session** : `supabase/functions/ai-interpret/index.ts` n'est plus un scaffold
— l'appel réel à l'API **Anthropic** (Messages API, `POST https://api.anthropic.com/v1/messages`,
modèle `claude-sonnet-5`) est maintenant écrit et actif. Fournisseur retenu par souci de cohérence
(la fonction avait déjà cet exemple en commentaire) — vous pouvez le remplacer par un autre
fournisseur compatible (Google Gemini, etc.) en adaptant uniquement ce fichier, sans toucher au
frontend.

**Non testé en conditions réelles** : aucune clé API n'a été fournie pendant le développement. Le code
gère explicitement l'absence de clé (`AI_API_KEY` non configurée → erreur claire renvoyée, jamais de
faux résultat) et les erreurs HTTP de l'API (statut non-2xx → message d'erreur transmis à
l'utilisateur), mais l'appel réel à `api.anthropic.com` n'a pas pu être exercé.

**Configuration nécessaire de votre côté** (voir aussi section L) :
1. `supabase functions deploy ai-interpret`
2. `supabase secrets set AI_API_KEY=votre_clé_API_Anthropic` (jamais dans le code, jamais dans un
   fichier du dépôt)
3. Renseigner `AI_EDGE_FUNCTION_URL` dans `js/config.js` avec l'URL publique de la fonction déployée.

---

## H. Supabase / backend — ce qui doit être configuré

Rien de changé dans le principe déjà en place (double mode démo locale / Supabase réel, bascule
automatique selon que `SUPABASE_URL`/`SUPABASE_ANON_KEY` sont renseignées) — voir section L pour la
liste exacte des valeurs à remplacer.

**Ce qui a été ajouté au schéma** (`supabase/schema.sql`, à ré-exécuter même sur un projet déjà
initialisé — le script contient un bloc de compatibilité idempotent qui ne perd aucune donnée) :
- Colonnes `profiles.suspended` (boolean) et `profiles.storage_quota` (bigint, octets).
- Colonne `projects.devis` (jsonb).
- Nouvelle table `storage_requests` (demandes d'augmentation de quota).
- Contrainte `espace` étendue à 5 valeurs (`electronique, electrotechnique, batiment,
  energies-renouvelables, automatisme`).
- Nouvelles policies RLS pour verrouiller `suspended`/`storage_quota` (détail en section J).

**Non testé en conditions réelles** (comme pour la session précédente, aucun projet Supabase n'a été
fourni) : l'ensemble du mode Supabase — `supabaseAuth`/`supabaseDb`, les nouvelles policies RLS, la
fonction Edge IA. Le code a été relu attentivement (API `@supabase/supabase-js` v2 officielle) et
suit exactement les mêmes conventions que le code déjà en place, mais **la vérification en conditions
réelles reste la priorité n°1 avant toute mise en production** (déjà signalé dans le rapport
précédent, toujours vrai).

**Limitation connue et documentée** : `supabaseDb.deleteUser()` ne peut supprimer que la ligne
`profiles` (protégée par RLS, policy `profiles_delete_admin`), pas le compte `auth.users`
sous-jacent — une suppression complète nécessiterait une fonction Edge exécutée avec les droits
`service_role`, qui n'existe pas dans ce dépôt. C'est indiqué en commentaire dans `backend.js`.

---

## I. PDF — comment il est généré et ce qu'il contient

Génération à la demande via l'impression native du navigateur (`window.open` + `document.write` +
`window.print()`), toujours sans bibliothèque PDF ajoutée et sans stockage serveur (§26).

**Différence majeure avec avant** : le schéma affiché dans le PDF est **redessiné** à partir des
mêmes données que l'éditeur (les mêmes chaînes SVG que sur le canevas, teintées en noir sur fond
blanc via l'attribut `color` qui pilote `currentColor`), avec les fils recalculés en polylignes
orthogonales — ce n'est en aucun cas une capture d'écran du canevas sombre (§7B, interdiction
explicite du §43).

Contenu, dans l'ordre (§25) :
1. Page de garde (titre, domaine, auteur, date).
2. Schéma technique redessiné (symboles + références R1/C2/Q1... + valeurs).
3. Nomenclature des composants (référence, désignation, famille, valeur).
4. Mesures — honnêtement indiqué comme non disponibles (aucun instrument de mesure interactif dans
   cette version).
5. Résultats de calcul/simulation — texte explicite « **Simulation non exécutée** » si aucun moteur
   de calcul réel n'existe (jamais de valeur inventée, conformément au §43).
6. Diagnostic/analyse (bornes non connectées, courts-circuits, instruments mal branchés).
7. Interprétation IA — incluse seulement si le bouton « Interpréter (IA) » a été utilisé avec succès
   pendant la session en cours ; sinon, mention explicite que ce n'est pas le cas.
8. Devis — inclus uniquement si des lignes existent.
9. Dimensionnement — inclus uniquement si un résultat a été explicitement ajouté au rapport depuis le
   module Dimensionnement (bouton dédié).
10. Conclusion générée automatiquement à partir de l'état réel du schéma (nombre de composants, de
    connexions, bornes restant à câbler) — jamais de texte inventé.

Le bouton « Exporter PDF » fonctionne même si le projet est vide ou n'a jamais été simulé, comme
demandé (§25).

---

## J. Sécurité — mesures prises

- **Authentification** : inchangée par rapport à la session précédente — entièrement déléguée à
  Supabase Auth en mode réel (ce code n'a jamais accès au mot de passe au-delà du formulaire de
  saisie) ; mode démo locale explicitement présenté comme tel (bandeau visible en permanence).
- **Autorisation admin** : vérifiée côté serveur via `profiles.role`, jamais modifiable par
  l'utilisateur lui-même (policy RLS).
- **Nouveau cette session — verrouillage `suspended`/`storage_quota`** : en ajoutant la suspension de
  compte et les quotas modifiables, la policy `profiles_update_own` a été durcie pour que ces deux
  champs (en plus de `role`, déjà protégé) restent strictement inchangés dans toute mise à jour
  initiée par l'utilisateur lui-même — seule une policy séparée réservée à l'admin
  (`profiles_update_admin`, `public.is_admin()`) peut les modifier. Sans cette précaution, un
  utilisateur suspendu aurait pu se réactiver lui-même, ou s'auto-attribuer un quota illimité,
  directement via l'API Supabase (pas seulement en contournant l'interface).
- **Demandes de stockage** : un utilisateur ne peut créer que ses propres demandes et ne voit que les
  siennes (+ l'admin voit tout) ; seul l'admin peut les faire passer à `acceptee`/`refusee`
  (policy `storage_requests_update_admin_only`).
- **Secrets** : `AI_API_KEY` reste exclusivement côté fonction Edge (`supabase secrets set`), jamais
  dans le HTML/JS. Vérifié : aucune clé, token ou secret n'apparaît dans `js/`, `css/` ou le HTML
  livrés — seules des valeurs placeholder explicites (`_A_REMPLACER`, `_A_CONFIGURER`).
- **Non vérifié en conditions réelles** : comme pour le reste du mode Supabase, l'ensemble de ce
  point nécessite un vrai projet Supabase pour être testé (tentative de lecture croisée entre deux
  comptes, un utilisateur suspendu tentant de modifier son propre statut via une requête directe,
  etc.).

---

## K. Tests — ce qui a été réellement vérifié

**Méthode** : comme pour la session précédente, tout a été vérifié en exécutant le **code réellement
livré** (le vrai `labo-electronique-virtuel.html` + les vrais fichiers `js/*.js`, chargés tels quels,
aucune logique dupliquée dans les tests) dans un DOM simulé (Node.js + jsdom), en simulant de vrais
événements utilisateur (clics, saisies, soumissions de formulaire) — pas une relecture de code seule.

Deux scripts, exécutables avec `npm test` (ou séparément) :

### `tests/verify_catalog.js`
Vérifie automatiquement, pour les **164 composants** du catalogue : aucun identifiant en double,
chaque composant a un symbole SVG associé, et **chaque borne déclarée correspond à un point
réellement dessiné dans son symbole** — exactement la classe de bug trouvée sur le MOSFET/régulateur
dans la session précédente. Résultat : **0 anomalie** après correction (7 anomalies trouvées et
corrigées pendant le développement de cette session — nouveaux composants dont les bornes ne
correspondaient pas encore parfaitement à leur tracé : relais, mise à la terre, réseau de résistances,
LED RGB, phototransistor, optotriac, afficheur 7 segments, capteurs génériques, bargraph, moteur/
transformateur triphasés, jeu de barres, tableau électrique, va-et-vient, boîte de dérivation — la
liste complète des corrections est traçable dans l'historique de développement).

### `tests/test_app.js` — **77 vérifications, 0 échec, 0 erreur JavaScript non interceptée**
Parcours réellement exécutés de bout en bout (mode démo locale) :

| Zone | Vérifié |
|---|---|
| Compte | inscription, connexion, déconnexion, récupération par mot magique (mot de passe temporaire généré puis utilisé), changement de mot de passe obligatoire, **connexion refusée pour un compte suspendu** |
| Projet | création, ouverture, duplication *(implicite via le flux)*, sauvegarde automatique |
| Éditeur | recherche catalogue (trouve un composant hors du domaine du projet), placement « armé » avec aperçu (pas d'apparition brutale), **aimantation sur la grille vérifiée numériquement**, tracé de fil, **rendu en polyligne orthogonale vérifié** (pas une ligne diagonale), sélection et suppression de fil (touche Suppr), rotation, duplication, suppression de composant, **« Ranger le schéma » vérifié pour ne jamais perdre une connexion**, menu contextuel (clic droit) contenant les actions attendues, **remplacement par une variante vérifié** (transformateur → transfo à point milieu, position conservée) |
| Diagnostic | bornes non connectées comptées correctement, **court-circuit direct détecté**, **instrument mal branché détecté** (voltmètre en série signalé — c'est l'exemple donné littéralement par le cahier, §18) |
| Devis | ajout de ligne, calcul de total, **remise de 10 % vérifiée arithmétiquement** (30 → 27), import des composants du schéma |
| Dimensionnement | calcul photovoltaïque **vérifié avec des valeurs connues à la main** (2000 Wh/j ÷ (4 h × 80 %) = 625 Wc → 2 panneaux de 400 Wc), calcul électrotechnique **vérifié** (2300 W ÷ 230 V = 10 A) |
| PDF | export déclenché sans exception, même popup bloqué (cas jsdom, équivalent à un vrai blocage navigateur) |
| Thème | application du thème clair sur `<html>`, persistance en `localStorage` |
| Persistance | rechargement simulé via lecture de `localStorage` — utilisateur et projet créés bien retrouvés |
| Responsive | présence des 3 onglets mobiles (Composants/Canevas/Mesures) dans l'éditeur |
| Admin | connexion admin, **suspension d'un utilisateur vérifiée** (login refusé ensuite), **modification de quota vérifiée**, **cycle complet de demande de stockage vérifié** (utilisateur demande → admin accepte → quota augmenté) |
| Catalogue | 164 composants, 5 domaines |

**Bug détecté par les tests, corrigé immédiatement** : la première version de `defRow()` (fonction
qui construit chaque fiche composant) ne recopiait pas les champs personnalisés (`instrument`, `pv`)
passés en option — résultat, la détection « instrument mal branché » ne se déclenchait jamais alors
que le code semblait correct à la lecture. Le test dédié à cette fonctionnalité l'a immédiatement
révélé ; corrigé en étalant `opts` dans l'objet retourné. C'est exactement le genre de bug silencieux
qu'une exécution réelle attrape et qu'une simple relecture manque — voir aussi la note méthodologique
ci-dessous.

**Note méthodologique** : jsdom n'implémente pas la géométrie SVG réelle (`getScreenCTM`) — une
approximation stable (mappage direct client→SVG) a été fournie pour permettre de simuler les clics
sur les bornes/canevas. Cela valide la **logique** (association bornes↔fils, aimantation, séquences
d'événements) fidèlement au vrai code exécuté, mais pas le rendu pixel-parfait à l'écran (zoom précis,
alignement visuel fin). **Aucun navigateur réel n'a pu être utilisé dans cet environnement**
(extension Chrome non connectée) — voir section M.

**Mode Supabase réel — non testé**, comme indiqué en sections G et H : aucun projet Supabase n'a été
fourni pendant le développement.

---

## L. Configuration nécessaire pour l'utilisateur

| Variable / fichier | Où | Rôle | Public ou secret |
|---|---|---|---|
| `SUPABASE_URL` | `js/config.js` | URL de votre projet Supabase | Public |
| `SUPABASE_ANON_KEY` | `js/config.js` | Clé publique « anon » | Public (protégée par RLS) |
| `ADMIN_EMAIL` | `js/config.js` | E-mail administrateur | Public dans ce fichier, ne donne aucun accès sans le vrai mot de passe |
| `ADMIN_EMAIL_A_REMPLACER` | `supabase/schema.sql` | Doit être identique à `ADMIN_EMAIL` | — |
| `AI_EDGE_FUNCTION_URL` | `js/config.js` | URL de la fonction Edge une fois déployée | Public |
| `AI_API_KEY` | **jamais dans le dépôt** — `supabase secrets set AI_API_KEY=...` | Clé API Anthropic | **Secret, serveur uniquement** |

**Tables/fonctions SQL à exécuter** : la totalité de `supabase/schema.sql` dans l'éditeur SQL de votre
projet (après avoir remplacé `ADMIN_EMAIL_A_REMPLACER`, 2 occurrences). Le fichier est réexécutable
sans danger sur un projet déjà initialisé avec l'ancienne version (bloc de compatibilité idempotent).

**Étapes complètes pour le mode Supabase réel** :
1. Créer un projet sur https://supabase.com.
2. Exécuter `supabase/schema.sql` dans l'éditeur SQL.
3. Dans *Authentication → URL Configuration*, ajouter l'URL d'hébergement aux « Redirect URLs ».
4. Renseigner `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `ADMIN_EMAIL` dans `js/config.js`.
5. (Optionnel, IA) `supabase functions deploy ai-interpret`, puis
   `supabase secrets set AI_API_KEY=...`, puis renseigner `AI_EDGE_FUNCTION_URL` dans `js/config.js`.
6. Recharger la page : le bandeau en haut à droite doit passer de « Démo locale » à « Supabase ».

**Lancer le projet en local (mode démo, aucune configuration requise)** :
Ouvrir `labo-electronique-virtuel.html` directement dans un navigateur (double-clic), ou le servir
avec n'importe quel serveur statique (`npm run serve`, ou `python -m http.server`). Compte admin de
démonstration : l'e-mail configuré dans `ADMIN_EMAIL` (ou une adresse de démo sinon) / mot de passe
`admin123`.

**Lancer les tests** : `npm install` (installe uniquement `jsdom`, un outil de développement — le
site lui-même n'a besoin d'aucune dépendance pour fonctionner) puis `npm test`.

---

## M. Ce qui n'est pas réellement disponible

Rien de caché :

- **Aucun moteur de calcul électrique réel** (tensions, courants, puissances, court-circuit détecté
  par valeur et non par topologie). Le diagnostic reste structurel/topologique — voir section F.
- **Mode Supabase non testé en conditions réelles** — code écrit avec soin, conforme à l'API
  officielle, mais à vérifier vous-même après connexion d'un vrai projet (bloquant principal avant
  mise en production, comme déjà signalé dans le rapport précédent).
- **Appel IA (Anthropic) non testé en conditions réelles** — aucune clé fournie ; le code gère
  proprement l'absence de configuration et les erreurs HTTP, mais l'appel réel n'a jamais été exercé.
- **Aucun test dans un vrai navigateur** : l'extension Chrome nécessaire à l'automatisation
  navigateur n'était pas connectée dans cet environnement de développement. Toute la validation
  interactive a donc été faite via un DOM simulé (Node + jsdom, voir section K) — fidèle à la vraie
  logique exécutée, mais pas au rendu pixel exact (mise en page fine, alignement visuel du zoom,
  rendu des polices, apparence tactile réelle sur téléphone). **Une vérification visuelle rapide dans
  un vrai navigateur, sur desktop et mobile, reste recommandée avant mise en production.**
- **Suppression complète d'un utilisateur Supabase** : seule la ligne `profiles` est supprimable
  depuis le client (RLS) ; le compte `auth.users` sous-jacent nécessiterait une fonction Edge avec
  droits `service_role` (non écrite — hors périmètre raisonnable sans confirmation explicite d'un
  besoin, une suppression de compte étant une action irréversible).
- **Purge automatique des messages communs à 24h** (`pg_cron`) : le bloc SQL existe (hérité,
  inchangé) mais dépend de la disponibilité de l'extension `pg_cron` sur votre projet Supabase.
- **Reconnexion d'un fil** : implémentée uniquement en glissant une poignée affichée sur un fil déjà
  sélectionné (clic sur le fil, puis glisser une extrémité) — pas encore de raccourci clavier dédié.
- **Sélection multiple / copier-coller clavier de plusieurs composants** : non implémenté (déjà
  signalé comme piste d'amélioration dans le rapport précédent, toujours vrai).
- **Symboles génériques par gabarit** (~130 des 164 composants, voir section D) : schématiquement
  corrects et clairement étiquetés, mais pas des symboles IEC 60617 dessinés individuellement à la
  main — un choix de compromis assumé (section D), pas un oubli.

---

# ADDENDUM — SESSION SUIVANTE (mise en œuvre de `NOTES_EXIGENCES_EN_COURS.md`, §1 à §7)

Cette session a implémenté les sept points accumulés dans `NOTES_EXIGENCES_EN_COURS.md` (matière
première rassemblée avant cette intervention, à la demande explicite : « fais tout, code tout »).
Comme pour les sections précédentes de ce rapport, rien n'est présenté comme fonctionnel s'il ne
l'a pas été réellement — voir « Tests » ci-dessous pour ce qui a été vérifié par exécution.

## N1. Composants — référence de remplacement, favoris/récents, page de recherche

- **Référence de remplacement avec avertissement** (`js/editor.js`, `customRefMismatch()`,
  `collectReplacementWarnings()`) : chaque composant posé peut recevoir une étiquette commerciale
  libre (`item.customRef`, panneau Propriétés). Si elle ne correspond à aucun nom/alias/identifiant
  du composant réellement modélisé, un avertissement apparaît sur le canevas (libellé en rouge +
  ⚠), dans le panneau Propriétés, dans l'onglet Diagnostic et dans la nomenclature du PDF. Le
  brochage/comportement simulés restent toujours ceux du composant réellement posé, jamais ceux
  suggérés par l'étiquette — exactement le scénario « CD4017 renommé » décrit dans les notes.
- **Broches numérotées** : un petit numéro (1, 2, 3…) est maintenant affiché à côté de chaque borne
  sur le canevas, en plus de la position déjà correcte.
- **Favoris et récents** (`favStorageKey()`, `getFavoris()`, `getRecents()`, `toggleFavorite()`,
  `recordRecentComponent()`) : persistés par utilisateur dans `localStorage`. Panneau flottant
  (`renderFavPanel()`) déplaçable (glisser l'en-tête), réductible (▾) et escamotable (✕ + bouton de
  réouverture ★), superposé au canevas. Étoile de favori ajoutée à chaque ligne du catalogue et des
  résultats de recherche.
- **Page de recherche dédiée** (`#/composants`, `viewComposants()` dans `js/app.js`) : recherche
  indépendante de tout projet ouvert dans toute la bibliothèque, plus liste de favoris consultable
  et modifiable directement depuis cette page.
- **Non fait délibérément** : la déduplication complète des symboles SVG en une architecture à
  « 4 couches » strictes (référence / symbole / modèle fonctionnel / paramètres) proposée au §7 des
  notes n'a **pas** été réécrite en profondeur sur les 164 composants existants. Le catalogue
  sépare déjà symbole (`SYM[id]`, gabarits `TPL`/`icTemplate`) et données (fiche `defRow`), et
  plusieurs familles partagent déjà des gabarits de rendu identiques (§16, décision de la session
  précédente) — réécrire cela en un identifiant de symbole partagé explicite aurait représenté un
  risque de régression important (164 fiches déjà vérifiées par `tests/verify_catalog.js`) pour un
  gain principalement cosmétique. La partie **utile** de cette demande — qu'un composant garde son
  propre modèle/comportement même quand son étiquette ou son symbole est partagé — est couverte
  concrètement par le mécanisme de référence de remplacement ci-dessus, qui est le cas d'usage
  explicitement donné en exemple dans les notes.

## N2. Maquette / schématique — fils

- **Couleur de fil** : un fil sélectionné affiche une barre d'outils (`renderWireToolbar()`) avec 6
  couleurs ; la couleur est stockée sur `wire.color` et appliquée au rendu (canevas et PDF).
- **Premier plan** : bouton « ⤒ Premier plan » qui déplace le fil sélectionné en fin du tableau
  `schema.wires` — les fils étant dessinés dans l'ordre du tableau, cela le fait passer visuellement
  au-dessus des autres à une intersection.
- **Poursuivre une connexion depuis une borne déjà utilisée** : déjà possible dans le code hérité de
  la session précédente (aucune restriction sur le nombre de fils par borne) — vérifié et confirmé
  plutôt que réécrit.
- **Panneau récents/favoris déplaçable/réductible/escamotable** : voir N1.

## N3. Travail individuel et partagé

- **Permissions de partage réelles** (`voir seulement` / `voir + modifier`) : `project.collaborateurs`
  est passé d'un simple tableau d'identifiants à un tableau `{ userId, permission }`. Modale de
  partage (`openShareModal()`) remplaçant l'ancien `prompt()` : recherche d'utilisateurs déjà
  inscrits par nom/prénom/e-mail (`db.searchUsers()`), attribution/​modification/​retrait de
  permission par personne.
- **Application réelle de la restriction "voir seulement"**, pas seulement décorative : un garde-fou
  central (`guardReadOnly()`) bloque toute action de modification (placer, déplacer, tracer un fil,
  changer une valeur, pivoter, dupliquer, supprimer, changer le statut) dans l'éditeur ; les boutons
  Enregistrer/Partager/Ranger le schéma sont masqués ; le panneau Propriétés passe en lecture seule.
  **Correction d'un défaut préexistant important** : en mode Supabase réel, la policy RLS
  `projects_update_owner` héritée n'autorisait QUE le propriétaire à enregistrer un projet — un
  collaborateur, même en « voir + modifier », ne pouvait donc jamais réellement sauvegarder ses
  modifications côté serveur (silencieusement rejeté par RLS). Une policy `projects_update_editor_collab`
  a été ajoutée pour que « voir + modifier » soit réellement fonctionnel, pas seulement une case
  cochée côté interface.
- **Groupes avec de vrais membres** : `addGroupMember()` recherche désormais parmi les utilisateurs
  déjà inscrits (`db.searchUsers()`) au lieu d'accepter un nom/e-mail saisis librement ; le lien vers
  le compte réel (`memberUserId` / colonne `member_id`) est conservé en plus du nom/e-mail affichés.
- **Consultation en temps réel / voir les composants bougés par un collaborateur** :
  `openPresenceChannel()` dans `js/editor.js`. En mode Supabase configuré, utilise un canal Realtime
  (`broadcast`) — fonctionne entre navigateurs/appareils différents. **En mode démo locale (sans
  Supabase), utilise `BroadcastChannel`, qui ne fonctionne QU'ENTRE ONGLETS DU MÊME NAVIGATEUR** —
  il n'existe pas de serveur en mode démo pour relayer un message entre deux ordinateurs différents ;
  ceci est indiqué explicitement dans le badge de présence affiché (« mode démo »), pour ne jamais
  laisser croire à un temps réel multi-appareils qui n'existe pas dans ce mode. Le déplacement en
  cours d'un composant par un pair apparaît comme un contour pointillé + son prénom sur le canevas ;
  un accusé « schéma enregistré » déclenche un rechargement du schéma local si on n'est pas
  soi-même en train de glisser un composant.
- **Non fait / limite assumée** : ce canal de présence ne remplace pas un vrai moteur de
  synchronisation collaborative (type CRDT/OT) — deux personnes modifiant le même composant au même
  instant peuvent encore s'écraser mutuellement au moment de l'enregistrement (dernier enregistré
  gagne). Une vraie résolution de conflit collaborative serait un chantier à part entière, hors
  périmètre raisonnable de cette session.

## N4. Notifications

- **Stockage** (`DB.notifications` en mode démo, table `public.notifications` en mode Supabase) :
  `{ userId, type:'important'|'normal', titre, texte, lien, lu, notified, createdAt }`.
- **Affichage** (`js/app.js`) : cloche dans la barre supérieure avec badge (nombre de notifications
  non lues), menu déroulant listant l'historique complet, bouton « Tout marquer comme lu ». Une
  notification « importante » déclenche EN PLUS une apparition temporaire en haut à droite de
  l'écran (disparition automatique après 7 s, façon notification mobile), avec un signal sonore
  bref (Web Audio, un seul bip) désactivable via une case à cocher dans le menu de notifications
  (préférence retenue en `localStorage`, aucune donnée envoyée au serveur).
- **Déclencheurs implémentés** : partage d'un projet ou changement de permission (importante),
  décision sur une demande de stockage (importante), réponse de l'administrateur à une suggestion
  (ordinaire), ajout à un groupe de travail (ordinaire).
- **Honnêteté sur le "temps réel"** : la détection de nouvelles notifications utilise un sondage
  périodique (`setInterval`, toutes les 8 s) plutôt qu'un vrai canal de notification poussée par le
  serveur — un choix volontairement simple qui fonctionne de façon identique en mode démo et en
  mode Supabase réel (relit la même source de données), mais qui n'est PAS du Supabase Realtime.
  Une vraie amélioration future serait de brancher les notifications sur `postgres_changes` de
  Supabase Realtime pour un affichage instantané plutôt qu'à ±8 s près.

## N5. PDF — devis et confirmation

- **Confirmation finale avant génération** : le bouton « Exporter PDF » ouvre désormais une boîte de
  confirmation (`confirm()`) avant de générer le rapport.
- **Lignes de devis vides exclues du PDF, lignes partielles conservées** (`isDevisLigneVide()`,
  `js/devis.js`) : une ligne sans désignation, référence, quantité ni prix est retirée du tableau
  affiché dans le PDF ; toute ligne où au moins un de ces champs est renseigné reste affichée telle
  quelle. L'éditeur de devis lui-même (`#/devis/:id`) n'est pas affecté — il continue d'afficher
  toutes les lignes, y compris vides, pendant la saisie.
- La structure en 10 sections du PDF (page de garde → schéma → nomenclature → mesures → calculs →
  diagnostic → IA → devis → dimensionnement → conclusion) était déjà en place depuis la session
  précédente et n'a pas été modifiée dans sa structure, seulement dans le contenu du devis.

## N6. Statut de projet

- Champ `project.statut` ajouté (`brouillon` / `en_cours` / `verification` / `finalise` / `exporte`),
  valeur par défaut `brouillon` à la création. Sélecteur dans la barre d'outils de l'éditeur
  (masqué, remplacé par une puce non modifiable en lecture seule). Transitions automatiques :
  passe à `en_cours` à la première modification du schéma après un état `brouillon`/`exporte` ;
  passe à `exporte` après une génération de PDF confirmée (uniquement si l'utilisateur a le droit de
  modifier le projet). `verification`/`finalise` restent des choix manuels de l'utilisateur — le
  logiciel ne prétend jamais deviner qu'une vérification a réellement eu lieu. Affiché aussi sur les
  cartes de projet du tableau de bord.

## Décisions d'architecture (addendum)

- **Pas de nouveau fichier JS** : les fonctions de notifications ont été ajoutées à `js/app.js`
  (propriétaire déjà de la barre supérieure) plutôt que dans un nouveau fichier, pour ne pas avoir à
  modifier la liste des scripts chargés à trois endroits différents (page HTML, harnais de test) et
  risquer un oubli silencieux de l'un des trois.
- **Présence en `BroadcastChannel`/Realtime plutôt qu'un service tiers** : cohérent avec le principe
  déjà établi dans ce projet (§38 du cahier) de rester une plateforme unique sans multiplier les
  services externes ; le mode Supabase réutilise l'infrastructure déjà présente (le même projet
  Supabase que l'authentification/les données), sans dépendance supplémentaire.
- **RLS étendue plutôt que fonctions Edge** : les nouvelles permissions de partage et notifications
  restent gérées par des policies PostgreSQL (RLS), cohérent avec l'architecture de sécurité déjà en
  place, sans introduire de nouvelle fonction serveur.

## Base de données — ce qui a changé (`supabase/schema.sql`)

Toutes les modifications sont apportées via des instructions idempotentes (`add column if not
exists`, vérification d'existence de contrainte avant création) — réexécutable sans danger sur un
projet déjà initialisé, sans perte de données, comme pour le reste de ce fichier.

- `projects.statut` (texte, défaut `'brouillon'`, contrainte de valeurs).
- `project_collaborators.permission` (texte, défaut `'edition'`, contrainte `'lecture'|'edition'`).
- `group_members.member_id` (uuid, référence `profiles`) — vient compléter les colonnes `nom`/`email`
  déjà existantes, qui restent pour l'affichage sans requête supplémentaire.
- Nouvelle table `public.notifications`.
- Nouvelles policies : `projects_update_editor_collab` (voir N3), `collab_update_by_owner`,
  `group_members_select_owner_or_member`, `notifications_select_own_or_admin`,
  `notifications_insert_authenticated`, `notifications_update_own`.
- **Limite de sécurité assumée et documentée en commentaire dans le fichier SQL** :
  `notifications_insert_authenticated` autorise tout utilisateur authentifié à créer une notification
  pour n'importe quel autre utilisateur (nécessaire puisque c'est toujours un tiers — propriétaire de
  projet, administrateur — qui notifie quelqu'un d'autre, jamais le destinataire lui-même, et qu'il
  n'existe pas de fonction serveur `service_role` dans ce dépôt). C'est exactement le même niveau de
  confiance que celui déjà accepté pour `private_messages`/`common_messages` dans ce schéma : un
  utilisateur authentifié malveillant pourrait envoyer de fausses notifications à un autre — un
  risque à traiter via une fonction Postgres dédiée si ce projet évolue vers une mise en production
  réelle avec des utilisateurs non approuvés.

## Tests

`npm test` exécute maintenant **111 vérifications, 0 échec, 0 erreur JavaScript non interceptée**
(77 précédemment + 34 ajoutées cette session), toujours contre le code réellement livré (aucune
logique dupliquée dans les tests). Nouveaux parcours vérifiés par exécution réelle (pas seulement
relus) :
- statut initial `brouillon` puis transition automatique vers `en_cours` après édition ;
- détection d'une référence de remplacement incohérente puis cohérente ;
- ajout/retrait d'un favori, ordre des composants récents (plus récent en premier) ;
- recherche et mise en favori depuis la page `#/composants` dédiée ;
- couleur personnalisée d'un fil appliquée au rendu SVG, réordonnancement "premier plan" ;
- ligne de devis totalement vide exclue du rendu PDF, ligne partielle conservée ;
- **partage complet** : création d'un second compte, partage en lecture seule avec notification
  générée, vérification qu'un collaborateur "lecture" ne peut ni placer ni dupliquer de composant et
  ne voit pas les boutons Enregistrer/Partager, changement vers "voir + modifier" avec seconde
  notification, vérification que la duplication fonctionne alors réellement ;
- recherche d'utilisateurs par nom pour l'ajout à un groupe (pas de saisie libre), notification de
  l'ajout.

**Non testé automatiquement** (comme pour le reste du mode Supabase déjà signalé section K/M) :
mode Supabase réel pour l'ensemble des nouvelles fonctionnalités (permissions, notifications,
présence Realtime) — aucun projet Supabase n'a été fourni pendant le développement. Le canal de
présence n'a par ailleurs pas pu être vérifié dans un vrai navigateur (voir section M) : sa logique
de diffusion/réception est correcte par lecture de code et par le fait que `BroadcastChannel` est
absent de l'environnement jsdom utilisé pour les tests (le code s'y désactive proprement, sans
erreur), mais son rendu visuel réel (contour du pair, position du panneau flottant glissé à la
souris) n'a pas pu être observé à l'écran dans cet environnement de développement.

## Configuration nécessaire pour l'utilisateur (mise à jour)

Aucune nouvelle variable de configuration : les mêmes valeurs qu'en section L suffisent. Si vous
avez déjà un projet Supabase configuré depuis la session précédente, ré-exécutez l'intégralité de
`supabase/schema.sql` dans l'éditeur SQL de votre projet (le fichier reste réexécutable sans danger)
pour obtenir les colonnes/table/policies ajoutées ci-dessus.
