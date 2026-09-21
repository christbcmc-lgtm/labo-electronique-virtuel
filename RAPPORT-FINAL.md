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

---

# ADDENDUM 2 — CORRECTIONS SUITE À VOS REMARQUES (nœuds, brochage, catalogue élargi)

Cette section répond point par point à votre message : « les fichiers sont incomplets, notamment le
HTML », le système de nœuds, la conformité des symboles/brochages, et l'exigence d'au moins 900
composants. Comme pour le reste de ce rapport, chaque affirmation ci-dessous a été vérifiée par
exécution réelle (`npm test`), pas seulement relue.

## O1. « Le fichier HTML manque » — vérification

**Le fichier n'a pas été perdu.** `labo-electronique-virtuel.html` existe, fait 30 lignes (c'est une
coquille volontairement mince, voir section D : elle charge `css/style.css` puis les 8 fichiers
`js/*.js` dans l'ordre), et est identique sur votre dépôt GitHub (`git diff origin/main` ne montre
aucune différence, vérifié pendant cette session). Si le fichier vous a semblé manquant ou le projet
incomplet, la cause la plus probable est la façon dont les fichiers ont été récupérés : **ce projet
n'est plus un fichier HTML unique** depuis la session précédente (restructuration documentée en
section D) — il faut le dossier complet (`labo-electronique-virtuel.html` + `css/` + `js/` +
`supabase/`) pour qu'il fonctionne, un seul fichier HTML téléchargé isolément semblerait cassé
puisqu'il référence des fichiers `css/style.css` et `js/*.js` absents à côté de lui. Solution : cloner
le dépôt GitHub en entier (`git clone https://github.com/christbcmc-lgtm/labo-electronique-virtuel.git`)
ou télécharger l'archive ZIP complète depuis GitHub (bouton « Code → Download ZIP »), jamais un seul
fichier isolé.

## O2. Nœuds à une intersection de fils — implémenté

Voir aussi §N2 de l'addendum précédent (couleur/premier plan). Ce tour-ci, votre demande explicite
(« l'utilisateur peut choisir s'il y a un nœud à une intersection ») est implémentée dans
`js/editor.js` : `computeWireCrossings()` détecte géométriquement tous les croisements entre deux fils
différents (segments perpendiculaires, hors extrémités déjà partagées), et un clic sur le point de
croisement (`toggleJunctionAt()`) ajoute ou retire un nœud réel (`schema.junctions`).

**Amélioration apportée par rapport à votre proposition** : plutôt qu'un symbole de « saut » (l'un des
deux fils fait une bosse par-dessus l'autre), qui oblige à deviner visuellement lequel des deux fils
passe au-dessus, j'ai retenu la convention IEC/IEEE moderne, plus simple et sans ambiguïté : **point
plein = nœud électrique réel ; simple croisement sans point = aucune connexion** (les deux fils se
superposent juste visuellement). C'est la convention recommandée dans l'enseignement actuel
précisément parce que le symbole de « saut » est une source d'erreur de lecture. Un texte d'aide est
affiché directement dans l'onglet Diagnostic de l'éditeur pour l'expliquer à l'utilisateur.

Techniquement, un nœud ajouté à un croisement rend réellement les deux fils électriquement communs
dans le diagnostic (`buildWireUnion()` unit maintenant aussi les fils qui partagent un nœud, pas
seulement ceux qui partagent une borne de composant), et le PDF technique redessine désormais les
nœuds (automatiques ET ajoutés manuellement) avec un point plein, ce qu'il ne faisait pour aucun cas
auparavant (lacune préexistante, corrigée au passage).

**Testé** : schéma synthétique à deux fils qui se croisent, avec/sans nœud, vérifiant la détection du
point de croisement ET que le diagnostic électrique change réellement (les deux fils deviennent un
seul circuit seulement après ajout du nœud) — voir section Tests plus bas.

## O3. Symboles conformes aux normes, brochage et caractéristiques réels

**Ce qui était déjà conforme et vérifié cette session** : les portes logiques ET/OU/NON/NON-ET/NON-OU/
OU-EXCLUSIF (`porte_and`, `porte_or`, etc.) utilisent déjà les symboles à forme distinctive
IEEE Std 91 / ANSI Y32.14 (le « D » pour ET, la forme incurvée pour OU...) — ce ne sont pas des
rectangles génériques, contrairement à ce que leur simplicité visuelle pourrait laisser penser.

**Bug de conformité réellement trouvé et corrigé cette session** : le gabarit générique de circuit
intégré (`icTemplate()`, utilisé par toutes les puces multi-broches : NE555, régulateurs, portes en
boîtier, etc.) numérotait ses broches de haut en bas des DEUX côtés du boîtier. **Un vrai boîtier DIP
numérote ses broches de haut en bas d'un côté, PUIS DE BAS EN HAUT de l'autre** (on « fait le tour »).
Concrètement, avant correction, la broche 5 du NE555 générique était affichée en haut à droite ; sur
un vrai NE555, la broche 5 est en bas à droite. Corrigé pour tous les composants basés sur ce gabarit
(plusieurs dizaines). **Effet de bord assumé** : si un projet déjà enregistré utilisait un composant
basé sur ce gabarit avec un fil connecté à une broche du côté droit, ce fil se retrouve maintenant sur
une broche physiquement différente du même boîtier après cette correction (l'index de broche n'a pas
changé, mais sa position réelle si). Comme documenté en section H, le mode Supabase réel n'a jamais
été testé avec de vraies données utilisateur : l'impact réel de ce changement reste théorique, mais
je préfère le signaler explicitement plutôt que de le passer sous silence.

**Brochage réel affiché en toutes lettres** : au-delà de la simple numérotation, chaque référence
précise dont le brochage réel est confirmé avec confiance (NE555, LM358, TL072/074, LM324, séries
74HC00/02/04/08/32/86, CD4001/4011/4013/4017, registre 74HC595, mémoire EEPROM I²C...) déclare
maintenant un champ `pinNames` (ex. broche 1 = GND, broche 8 = VCC pour le NE555), affiché en toutes
lettres dans l'info-bulle du catalogue et dans le panneau Propriétés (`pinNamesListHTML()`), en plus
du numéro déjà visible sur le canevas. **Choix assumé de ne PAS inventer** : pour les circuits dont je
n'ai pas une confiance suffisante dans le brochage exact (microcontrôleurs complets, certains modules
de communication), le champ `pinNames` est volontairement absent plutôt que rempli de manière
approximative — seul le numéro de broche générique reste affiché pour ceux-là. C'est un choix
délibéré : mieux vaut ne rien afficher qu'afficher un brochage faux présenté comme sûr.

**Caractéristiques toujours modifiables** : ceci n'a pas changé — chaque composant catalogué garde ses
`valueOptions`/valeur personnalisée modifiables depuis le panneau Propriétés, exactement comme avant.

## O4. Catalogue étendu à 500 composants (objectif annoncé : au moins 900)

**Ce qui a été fait** : le catalogue est passé de **164 à 500 composants** cette session (+336, plus
de trois fois sa taille), toujours avec **0 anomalie** détectée par `tests/verify_catalog.js`
(identifiants dupliqués, symbole manquant, broche ne correspondant à aucun trait réellement dessiné).
Ajouts principaux : ~70 circuits intégrés réels nommés (temporisateurs, amplis op, comparateurs,
régulateurs à tension fixe/ajustable, familles logiques 74HC/CD4000, registres, drivers de puissance,
mémoire, interfaces, microcontrôleurs), ~45 diodes/LED/transistors/MOSFET réels réutilisant les
symboles déjà vérifiés des familles génériques, ~55 capteurs et modules réels très demandés en
projets pédagogiques (DHT11/22, BMP/BME28x, MPU6050/9250, HC-SR04/501, séries MQ, RTC, RFID,
Bluetooth/Wi-Fi/LoRa...), et plusieurs dizaines d'équipements électrotechnique/bâtiment/renouvelables/
automatisme réellement distincts (variateur de vitesse, RCBO, parafoudres type 1/2/3, IRVE, capteurs
de proximité inductif/capacitif/optique, vérins, arrêt d'urgence...).

**Pourquoi je n'ai pas atteint 900 dans cette session, et pourquoi ce n'est pas un simple manque
d'effort** : la méthode suivie pour chaque composant a été (1) vérifier que la référence existe
réellement, (2) écrire une description techniquement correcte, (3) la faire vérifier automatiquement
par `tests/verify_catalog.js` (7 erreurs de brochage ont d'ailleurs été détectées et corrigées pendant
cette expansion — la vérification automatique n'est pas une formalité, elle a trouvé de vraies
fautes). Fabriquer les 400 entrées manquantes en dupliquant des valeurs de paramètre (par exemple
créer une fiche séparée par ampérage de disjoncteur, ou par nombre de broches de connecteur) aurait
permis d'afficher « 900 » plus vite, mais aurait été exactement la « base gigantesque qui ralentit la
page sans valeur ajoutée réelle » que le cahier des charges interdit explicitement (§43) — et surtout
n'aurait pas respecté votre propre principe du §7 de vos notes (un composant garde son modèle propre
même si un symbole est partagé) : gonfler le compteur avec des doublons de paramètre revient à
l'inverse de ce principe.

**Ce qui reste un chantier réel, pas fermé** : l'architecture est justement conçue pour que continuer
soit mécanique — ajouter un composant qui réutilise un gabarit existant (IC générique ou dipôle déjà
dessiné) tient en une ligne de données (voir les nombreux blocs `...[...].map(([id,nom,...]) => ...)`
ajoutés cette session dans `js/catalog.js`), vérifiée automatiquement. Une session dédiée uniquement à
cette expansion, poursuivant la même méthode par lots de composants réels (bibliothèque de connecteurs
industriels, familles de capteurs supplémentaires, davantage de références électrotechnique/bâtiment
réellement distinctes), peut raisonnablement continuer à progresser vers 900 sans dégrader la qualité.
Je préfère vous le dire clairement plutôt que d'annoncer un chiffre que je n'ai pas atteint.

## O5. Solutions proposées pour ce que je ne peux pas exécuter moi-même dans cet environnement

Conformément à votre demande de trouver des solutions plutôt que de simplement constater une
limite :

- **Test en vrai navigateur** : j'ai vérifié à nouveau cette session — l'extension Chrome
  (`claude-in-chrome`) n'est toujours pas connectée dans cet environnement de développement (message
  retourné : « Browser extension is not connected »). Je ne peux donc pas le faire moi-même ici.
  **Solution concrète** : une checklist de vérification manuelle rapide (5-10 minutes) est fournie
  ci-dessous — si vous la suivez et me rapportez ce qui ne fonctionne pas, je peux corriger
  directement. Alternative : si vous connectez l'extension Chrome à ce compte Claude (installation
  décrite sur claude.ai/chrome) dans une session future, je pourrai alors piloter un vrai navigateur
  moi-même et vérifier visuellement (glisser le panneau favoris, cliquer un nœud, voir la notification
  apparaître) sans dépendre de vous pour ces vérifications.
- **Test en mode Supabase réel** : je n'ai ni les moyens de créer un projet Supabase depuis cet
  environnement, ni vos identifiants. **Solution concrète** : si vous créez un projet gratuit sur
  supabase.com et me communiquez son URL/clé publique (jamais un secret) dans une prochaine session,
  je peux exécuter `supabase/schema.sql`, configurer `js/config.js` avec vous, et vérifier avec vous
  les scénarios de partage/permissions qui n'ont pu être testés qu'en mode démo locale jusqu'ici.
- **Checklist de vérification manuelle** (nouvelles fonctionnalités de cette session et de la
  précédente, dans un vrai navigateur) :
  1. Ouvrir un projet, tracer deux fils qui se croisent sans partager de borne → vérifier qu'aucun
     point n'apparaît au croisement, puis cliquer dessus → un point plein doit apparaître (et
     inversement au second clic).
  2. Sélectionner un fil → vérifier la barre d'outils de couleur + bouton « Premier plan ».
  3. Ouvrir le panneau Récents/Favoris (en haut à droite du canevas) → le glisser par son en-tête, le
     réduire (▾), le masquer (✕) puis le rouvrir (★).
  4. Partager un projet avec un second compte en « voir seulement » → se connecter avec ce second
     compte → vérifier qu'aucune modification n'est possible et qu'une notification est apparue
     (cloche en haut à droite, avec un court signal sonore si activé).
  5. Poser un NE555 ou un 74HC00 → clic sur le bouton ⓘ du catalogue → vérifier que le brochage réel
     s'affiche (GND, TRIG, OUT... pour le 555).
  6. Exporter le PDF → vérifier la boîte de confirmation, puis que le devis n'affiche pas de lignes
     totalement vides dans le document généré.

## Tests (addendum 2)

`npm test` exécute maintenant **123 vérifications, 0 échec, 0 erreur JavaScript non interceptée**
(111 précédemment + 12 ajoutées cette session), plus `tests/verify_catalog.js` qui confirme les
500 composants sans aucune anomalie de brochage. Nouveaux parcours vérifiés par exécution réelle :
- détection géométrique d'un croisement de fils, absence de nœud par défaut, ajout d'un nœud qui
  rend réellement les deux fils électriquement communs dans le diagnostic (union-find) ;
- ordre de brochage DIP du NE555 vérifié broche par broche (haut→bas puis bas→haut, pas haut→bas des
  deux côtés) ;
- brochage réel (`pinNames`) présent et affichable pour une référence connue, absent (et non inventé)
  par défaut.

---

# ADDENDUM 3 — REPRISE CIBLÉE À PARTIR DU CAHIER « REPRISE, ORGANISATION ET ÉVOLUTION »

Cette session fait suite à un nouveau document reçu du client : un cahier des charges de
**reprise et de réorganisation** (~8600 lignes), explicitement écrit pour une IA prenant le
relais sans connaître le code existant, avec un ordre de priorités précis (analyser →
cartographier → identifier l'existant → doublons → réorganiser fichiers → bibliothèque →
interface/canevas → mobile → PDF → tester sans casser).

## P1-P4. Ce qui a été analysé avant toute modification

Conformément à ce document, rien n'a été modifié avant d'avoir lu et vérifié l'état réel du
dépôt : `RAPPORT-FINAL.md` (sections A à O ci-dessus) et `NOTES_EXIGENCES_EN_COURS.md` ont
été relus intégralement, puis leurs affirmations ont été spot-vérifiées directement contre
`js/catalog.js` (structure des gabarits `T2`/`T4`/`TPL`, mécanisme `pinNames`) plutôt que
supposées exactes. Conclusion : la cartographie déjà écrite dans ce rapport est fidèle à
l'état réel du code — priorités 1 à 4 déjà couvertes par les sessions précédentes, pas
refaites de zéro.

Un écart entre le dépôt et le nouveau cahier a cependant été détecté par cette relecture
croisée (voir P6 ci-dessous) : `js/config.js`/`js/catalog.js`/etc. étaient bien chargés
depuis `index.html` (30 lignes, coquille), mais **`tests/test_app.js` référençait encore
l'ancien nom de fichier `labo-electronique-virtuel.html`**, supprimé lors du renommage vers
`index.html` (commit `cdb2916`). Conséquence concrète : `npm test` échouait immédiatement
(`ENOENT`) depuis ce renommage — corrigé (2 occurrences dans `tests/test_app.js`). C'est un
bug réel trouvé par exécution, pas seulement par lecture.

## P6. Bibliothèque de composants — 4 défauts de brochage corrigés/comblés

Le nouveau cahier donne le détail exact (bornes, désignations IEC) des mécanismes de
commande de l'électricité du bâtiment (Schémas C1/C2/C5/C6/C7, montages va-et-vient/
permutateur/télérupteur). Comparé à ce détail, `js/catalog.js` présentait :

1. **`interrupteur_va_et_vient` modélisé avec seulement 2 bornes** (`T2`, gabarit
   `TPL.switchLike`) alors qu'un vrai va-et-vient (Schéma 6/C6) est un inverseur unipolaire à
   **3 bornes** (commune `L` + 2 navettes). Avec 2 bornes seulement, le montage va-et-vient
   classique (deux commutateurs reliés par deux navettes) ne pouvait pas être câblé
   correctement dans l'éditeur. Corrigé : nouveau gabarit de bornes `T3_SPDT`, nouveau
   symbole (commune + 2 contacts + lame), `pinNames:['L (commun)','1 (navette)','2 (navette)']`.
2. **Aucun composant `permutateur` (Schéma 7/C7) n'existait** — impossible de représenter un
   3ᵉ point de commande sur un circuit va-et-vient, pourtant un cas explicitement décrit dans
   le nouveau cahier. Ajouté (4 bornes `L1,L2,1,2` sur le gabarit `T4` déjà utilisé par le
   télérupteur, `pinNames` correspondants).
3. **`interrupteur_double` (Schéma 5/C5, double allumage)** et **`interrupteur_bipolaire`
   (Schéma 2/C2, coupure phase+neutre)** n'existaient pas non plus comme fiches distinctes
   (seul un interrupteur générique à 2 bornes existait). Ajoutés avec leurs bornes et
   symboles propres (visuellement distincts du va-et-vient : deux lames indépendantes plutôt
   qu'un seul inverseur, conformément à la règle du cahier « le nombre de broches ne définit
   jamais à lui seul le symbole »).
4. **`telerupteur` avait déjà les 4 bonnes bornes mais aucun `pinNames`** — ajouté
   (`1`/`2` = contact de puissance, `A1`/`A2` = bobine de commande), conforme au tableau du
   cahier et cohérent avec le mécanisme `pinNames` déjà utilisé pour le NE555 etc.

**Non fait délibérément** : le nouveau cahier demande aussi un audit de brochage beaucoup
plus large (les ~500 composants du catalogue) et un modèle de données à 4 couches
(référence/symbole/modèle/paramètres) avec des champs supplémentaires (sous-famille,
référence technique, niveau de vérification, source). Ce n'est pas fait cette session — voir
`NOTES_REPRISE_2026.md` pour la justification et le report explicite de ce chantier, qui
exigerait sa propre session de planification (risque de régression sur un catalogue déjà
vérifié par `tests/verify_catalog.js`, comme cela avait déjà été expliqué pour une demande
similaire dans l'addendum 1, section N1).

## P9. PDF — 4 exports indépendants au lieu d'un seul rapport imposé

Le nouveau cahier (§15) est explicite : « le choix du type de PDF doit appartenir à
l'utilisateur ». Avant cette session, `js/pdf.js` n'exposait qu'un seul export
(`exportProjectPDF`, un unique bouton dans l'éditeur) assemblant systématiquement schéma +
devis + dimensionnement + IA en un seul document ; le devis et le dimensionnement n'avaient
aucun export qui leur soit propre.

Refonte, sans changer le contenu déjà existant :
- `exportRapportCompletPDF` (renommage de l'ancien `exportProjectPDF`) : **contenu et ordre
  des sections strictement identiques** à avant — aucune régression sur le seul export déjà
  utilisé jusqu'ici.
- `exportSchemaPDF` (nouveau) : schéma redessiné + nomenclature + diagnostic seuls, bouton
  dédié dans l'éditeur (« Exporter le schéma (PDF) »).
- `exportDevisPDF` (nouveau) : devis seul, indépendant du schéma, bouton dédié dans la vue
  Devis.
- `exportDimensionnementPDF` (nouveau) : dernier résultat de dimensionnement calculé seul,
  indépendant du schéma, bouton dédié à côté de chaque calculateur (photovoltaïque,
  électrotechnique) qui alimente déjà `window.__lastDimResult`.

Les 4 exports partagent désormais la même mise en page (voir ci-dessous) au lieu que seul le
rapport complet ait un habillage soigné.

## Logo et mise en page « professionnelle » des PDF (demande explicite du client en cours de
## session — décision prise sans revalidation, comme autorisé explicitement)

Demande reçue en cours de session : un logo sur les PDF, et une présentation plus
professionnelle, avec autorisation explicite de décider seul sans redemander. Décisions
prises :
- **Logo 100% vectoriel** (`LAB_LOGO_SVG` dans `js/pdf.js`) : un pictogramme de boîtier à
  broches dessiné en SVG inline, dans le même style (`<line>`/`<rect>`) que tous les
  symboles de composants déjà utilisés ailleurs dans l'app — aucune image importée, aucune
  dépendance ajoutée, cohérent avec le principe déjà établi « pas de bibliothèque PDF, pas de
  stockage serveur » (§26).
- **En-tête/pied de page partagés** (`pdfHeaderHTML`/`pdfFooterHTML`/`openPdfWindow`) :
  logo + nom du laboratoire + titre + métadonnées en en-tête, mention de génération en pied
  de page, appliqués identiquement aux 4 types d'export via une fonction d'ouverture de
  fenêtre commune (`openPdfWindow`) qui a remplacé la duplication de code
  `window.open/document.write/close/focus` qui existait dans l'ancien `exportProjectPDF`.
- Feuille de style imprimable légèrement resserrée (`PDF_STYLE`), toujours sans bibliothèque
  ajoutée.

## Tests (addendum 3)

`npm test` exécute maintenant **136 vérifications, 0 échec, 0 erreur JavaScript non
interceptée** (123 précédemment + 13 ajoutées cette session), en plus de
`tests/verify_catalog.js` qui confirme les 503 composants (500 + 3 nouveaux : interrupteur
double, interrupteur bipolaire, permutateur) sans aucune anomalie de brochage. Nouveaux
parcours vérifiés par exécution réelle (pas seulement relus) :
- le va-et-vient a bien 3 bornes (pas 2), le permutateur et l'interrupteur double/bipolaire
  existent avec le bon nombre de bornes, le télérupteur affiche bien A1/A2 ;
- `exportSchemaPDF`, `exportDevisPDF`, `exportDimensionnementPDF`, `exportRapportCompletPDF`
  s'exécutent tous les quatre sans exception (y compris le cas « popup bloqué », déjà le cas
  pour l'ancien export) ;
- le type de dimensionnement (« Électrotechnique / Bâtiment ») est bien renseigné pour
  l'export indépendant ;
- l'en-tête partagé des PDF contient bien un `<svg>` et le nom de la marque.

**Non testé automatiquement** (nécessiterait un vrai navigateur, comme déjà signalé section
M) : rendu visuel réel du logo et de la mise en page à l'impression/export PDF réel. La
logique (contenu HTML généré, absence d'exception) est vérifiée par exécution ; l'apparence
pixel-exacte ne l'est pas.

## Ce qui reste délibérément non fait cette session

Voir `NOTES_REPRISE_2026.md` pour le détail et la justification complète. En résumé, le
nouveau cahier demande une refonte beaucoup plus large que ce qui précède :
bibliothèque en 3 colonnes façon Proteus (famille → sous-famille → fiche), modèle de données
composant à 4 couches, séparation de l'espace de travail du schéma et de l'interface
générale, refonte mobile-first. Ce chantier n'a pas été commencé — il a été jugé trop risqué
pour être mené dans la même session que des corrections concrètes et vérifiables, conformément
à la mise en garde du cahier lui-même contre une réécriture aveugle.

---

# ADDENDUM 4 — SUITE DE LA REPRISE : BIBLIOTHÈQUE 3 COLONNES, MULTI-DEVISES, LOGO UNIFIÉ,
# ANNULER/RÉTABLIR, SYMBOLES

Cette session a repris directement là où l'ADDENDUM 3 s'était arrêté, à la demande du client
de continuer le chantier différé, puis a intégré trois demandes supplémentaires reçues en
cours de session (un deuxième document de reprise plus strict, une demande de logo/PDF
professionnel, et une demande d'annuler/rétablir + de symboles conformes à la norme).

## Q1. Bibliothèque en 3 colonnes (§6/§7 des mises à jour)

Ajoutée sur `#/composants`, en plus du mode recherche déjà existant (conservé sans
changement) : un mode « Parcourir la bibliothèque » avec navigation Famille → Sous-famille →
Fiche détail (`js/app.js`, `viewComposantsParcourirHTML`/`componentFicheHTML`). La
sous-famille est **dérivée automatiquement** (`deriveSousFamille()` dans `js/catalog.js`) à
partir de la famille/l'identifiant/le nom/l'alias déjà réels de chaque fiche, plutôt que
saisie une à une sur les 503 composants — évite à la fois un travail manuel disproportionné
et le risque d'erreur de saisie sur une classification répétitive. La fiche détail affiche le
symbole réel (`renderComponentSymbolSVG`), la référence technique, le boîtier (quand connu
avec confiance), le brochage réel s'il existe, et le niveau de vérification réel du
composant.

## Q2. Modèle de données composant enrichi (§4 des mises à jour)

`defRow()` (`js/catalog.js`) expose maintenant `sousFamille`, `refTechnique`, `boitier`,
`source`, `niveauVerification` pour les 503 composants. **Honnêteté des nouveaux champs** :
`boitier` n'est renseigné (DIP-N/SOIC-N) que pour les circuits intégrés dont le brochage
(`pinNames`) est déjà confirmé — déduit automatiquement du nombre de broches réel dans
`icDefRow()`, jamais deviné. `source` reste vide par défaut plutôt que de citer une
documentation non vérifiée. `niveauVerification` reflète ce qui est réellement vérifié par
`tests/verify_catalog.js` (et la présence ou non de `pinNames`), pas une auto-évaluation.

## Q3. Devis multi-devises (§13/§14 des mises à jour, doc « Document texte.txt »)

Écart réel trouvé en relisant `js/devis.js` : le devis était **codé en euros uniquement**
(`fmtMoney` ajoutait toujours « € »), malgré les deux cahiers reçus qui demandent
explicitement le choix de la monnaie. Ajouté : sélecteur de devise (FCFA/XOF, EUR, USD, NGN,
GHS) sur la vue devis, propagé aux totaux, aux lignes et à l'export PDF du devis. EUR reste
la valeur par défaut pour ne pas changer le comportement des devis déjà enregistrés.

## Q4. Logo unifié interface + PDF (§17 des mises à jour)

Le logo vectoriel (`LAB_LOGO_SVG`, déplacé dans `js/config.js` pour être partagé) n'était
affiché que dans les 4 PDF (ajouté à la session précédente) — la barre supérieure de
l'application utilisait un simple glyphe Unicode ◈. Affiche maintenant le même symbole aux
deux endroits.

## Q5. PDF du dimensionnement — écart trouvé et corrigé

Le résultat affiché à l'écran (formules avec substitution des valeurs) était plus détaillé
que ce qui partait dans le PDF (`window.__pvLastHTML`/`__etLastHTML`, un résumé plus court
sans les formules) — contraire à l'exigence explicite du cahier (« le PDF doit donner
suffisamment de détails pour comprendre comment le résultat a été obtenu », §12). Les deux
sont maintenant construits à partir des mêmes formules, avec une conclusion explicite et les
hypothèses/remarques reprises dans le PDF.

## Q6. Annuler / Rétablir — Ctrl+Z / Ctrl+Y (demande explicite du client en cours de session)

L'éditeur n'avait aucun mécanisme d'annulation. Ajouté (`js/editor.js`) : pile d'instantanés
du schéma, un instantané poussé avant chaque mutation discrète (placement, suppression,
déplacement validé, rotation, duplication, remplacement de variante, fil créé/supprimé/
reconnecté/recoloré/premier plan, nœud à une intersection, « Ranger le schéma », modification
de propriété). Raccourcis `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Maj+Z` et deux boutons dédiés (utilisables
au tactile, sans clavier). Deux précautions pour que la pile reste utile plutôt que polluée :
un glisser de composant ne pousse qu'un seul instantané pour tout le geste (pas un par pixel
déplacé), et la saisie de texte (référence de remplacement, valeur personnalisée) n'en pousse
qu'un par session de frappe (capturé au focus), pas un par caractère tapé.

## Q7. Symboles — 3 corrigés, audit plus large explicitement différé

Demande explicite du client : « les symboles sont prioritaires et doivent respecter la
norme, je ne veux pas d'une forme bâclée. » Trois composants utilisaient un rectangle vide
avec juste un texte (`TPL.boxLabel`) alors qu'une convention IEC plus appropriée existait déjà
dans le fichier : thermistances NTC/PTC → gabarit résistance + flèche diagonale traversante
(`TPL.boxDiag`, déjà utilisé pour le rhéostat juste au-dessus dans `js/catalog.js` — NTC/PTC
ne sont pas distinguées par la forme en IEC 60617, seulement par le texte, donc ce n'est pas
une approximation) ; LDR → résistance + 2 flèches de lumière entrante, même convention que la
photodiode déjà présente. **Ce qui n'a pas été fait** : un audit symbole par symbole des ~500
composants du catalogue contre la norme IEC 60617 est un chantier réel à part entière (au-delà
des ~25 composants « vedettes » déjà dessinés et vérifiés à la main — résistance, condensateur,
diodes, transistors, AOP, portes logiques, transformateurs, etc. — voir section D) ; il n'a
pas pu être mené dans cette même session en plus de tout le reste. C'est maintenant la
priorité n°1 documentée dans `NOTES_REPRISE_2026.md` pour la suite.

## Tests (addendum 4)

`npm test` exécute maintenant **168 vérifications, 0 échec, 0 erreur JavaScript non
interceptée** (158 avant cette session + 10 nouvelles sur l'annuler/rétablir et le PDF du
dimensionnement), plus `tests/verify_catalog.js` (503 composants, 0 anomalie de brochage).
Nouveaux parcours vérifiés par exécution réelle : navigation complète dans la bibliothèque 3
colonnes (famille → sous-famille Zener → fiche → favori) ; changement de devise répercuté sur
les totaux, les lignes et le rendu PDF ; logo présent dans la barre supérieure ; enchaînement
annuler ×3 / rétablir ×3 après rotation+duplication+suppression, retrouvant exactement l'état
de départ ; annuler sur une pile vide ne lève pas d'exception ; le PDF du dimensionnement
contient bien les formules, une conclusion et les hypothèses.

**Non vérifié dans un vrai navigateur** (comme signalé aux sections M et K) : l'extension
Chrome disponible dans cet environnement s'est révélée connectée à une machine différente de
celle où tourne le serveur de développement local (`http://127.0.0.1:8080` atteignable depuis
PowerShell/curl sur cette machine, mais pas depuis le navigateur piloté — `https://example.com`
s'affichait normalement, donc l'extension fonctionne, seul l'accès au serveur local échoue).
Toute la validation de cette session reste donc au niveau DOM simulé (Node + jsdom), pas au
rendu pixel réel — en particulier la mise en page de la bibliothèque 3 colonnes sur petit
écran et le rendu réel des nouveaux symboles n'ont pas pu être observés visuellement.

---

# ADDENDUM 6 — TACTILE (bug réel corrigé) ET HAUTEUR VARIABLE DES BOÎTIERS DENSES

## R1. Déplacement, tracé de fil et pan ne fonctionnaient pas du tout au tactile

Le client a fourni un exemple de code (`WireRouter`, inspiré de WinRelais) utilisant les
Pointer Events pour unifier souris et tactile, en signalant explicitement que le tracé de fil
ne fonctionnait pas bien et devait fonctionner au tactile. Vérification précise plutôt que
supposition : `js/editor.js` n'écoutait que `mousedown`/`mousemove`/`mouseup` pour trois
gestes essentiels — déplacer un composant posé, faire un pan du canevas, et afficher la ligne
de prévisualisation d'un fil en cours de tracé. Sur un vrai téléphone/tablette, aucun des
trois ne fonctionnait (seule la sélection via l'évènement `click`, bien synthétisé après un
tapotement, fonctionnait déjà). Corrigé en ajoutant les équivalents tactiles
(`touchstart`/`touchmove`/`touchend`) à chacun des trois gestes, plus aux deux panneaux
flottants (Récents/Favoris, Outils), sans dupliquer la logique métier (`eventPoint()` normalise
un évènement souris ou tactile une seule fois, réutilisé partout). Le geste d'appui long pour
le menu contextuel (§6) reste fonctionnel : il est annulé dès qu'un vrai déplacement est
détecté, pour que les deux gestes ne puissent jamais aboutir en même temps.

## R2. Boîtiers à forte densité de broches — chevauchement des numéros

Le client a fourni une image du problème plus un exemple de code complet (classe Canvas avec
hauteur de boîtier calculée dynamiquement à partir du nombre de broches) montrant précisément
la correction attendue. `icTemplate()` (`js/catalog.js`) donne maintenant
une hauteur logique (`viewH`) proportionnelle au nombre de broches par côté, calibrée pour ne
rien changer aux boîtiers à 4 broches par côté ou moins (l'immense majorité du catalogue,
espacement 6 unités déjà correct), et agrandit les boîtiers plus denses pour garder ce même
espacement de 6 unités quel que soit le nombre de broches — un ATmega328P (28 broches) comme
un NE555 (8 broches) ont maintenant exactement le même espacement entre broches. Ce nouveau
champ a été répercuté partout où le code supposait un centre de rotation fixe à (30,15)
(rendu canevas, rendu PDF, `terminalAbsPos()` qui calcule la position réelle de connexion des
fils, position de dépose, aperçu de la bibliothèque) — sinon un boîtier dense pivoté aurait
connecté ses fils au mauvais endroit après rotation, un bug plus grave que le problème visuel
d'origine. Vérifié par exécution réelle : rotation à 90° d'un registre à décalage 16 broches,
la borne se connecte exactement là où `rotatePointAround()` la prédit avec le nouveau centre.

## Ce qui reste non fait (audit complet des symboles)

Ces deux corrections ciblent des bugs réels et concrets signalés avec preuve (image + code de
référence). Un audit systématique de la forme/proportion de chaque symbole du catalogue
(au-delà de la géométrie broches↔tracé déjà vérifiée automatiquement) reste un chantier plus
large, toujours documenté comme priorité n°1 dans `NOTES_REPRISE_2026.md`.

## Tests (addendum 6)

`npm test` exécute maintenant **196 vérifications, 0 échec** (184 avant cette section + 12
nouvelles : 6 sur le tactile — glisser un composant au doigt et le retrouver aimanté sur la
grille, la ligne de prévisualisation du fil suit le doigt avec les bonnes coordonnées après
pan/zoom, tracer un fil complet au doigt, glisser le fond du canevas au doigt fait un pan — et
6 sur la hauteur variable des boîtiers denses, dont la vérification de rotation ci-dessus).
`tests/verify_catalog.js` : 505 composants, 0 anomalie de brochage.

## ADDENDUM 7 — Intégration de l'éditeur de plan de bâtiment ("Atelier Plan")

Le client a fourni un fichier HTML/CSS/JS complet et autonome (« Atelier Plan » — éditeur de
plan 2D façon CAO : murs, portes, fenêtres, poteaux/poutres, pièces avec surface automatique,
symboles électriques du bâtiment, circuits, câblage avec accrochages type AutoCAD, cotation,
export SVG/PNG/PDF), présenté comme du code de référence à analyser et intégrer — pas une
architecture définitive à coller telle quelle (consigne explicite du client). C'est cette pièce,
correspondant à la section « plan électrique architectural » du cahier des charges reçu, qui a
été choisie comme point de départ concret pour cette session (le reste du cahier — plateforme
multi-domaines complète, CAO mécanique 3D, énergies renouvelables détaillées, messagerie avancée,
etc. — reste un chantier de plusieurs mois, hors de portée d'une session, et n'a pas été
entamé).

### Ce qui a été fait

**Analyse avant intégration** (pas un simple copier-coller, conformément à la consigne du
client) :
- Le prototype fourni est une page complète autonome : son propre `<html>/<head>/<body>`, un
  `:root` CSS avec des variables génériques (`--bg`, `--ok`...), des classes très génériques
  (`.btn`, `.brand`, `.row`, `.hidden`...) et un élément racine `id="app"`. Fusionné tel quel
  dans le site existant, il aurait **cassé l'application entière** : `<main id="app">` du site
  entre en conflit direct avec le `<div id="app">` du prototype, et son `:root{--bg:...}`
  aurait écrasé les couleurs du thème sombre/clair/gris du site pour toutes les pages, pas
  seulement pour le plan.
- Le script du prototype est déjà une IIFE `(() => {...})()` — ce qui évite les collisions de
  noms de fonctions top-niveau avec `esc`/`toast`/`uid` déjà définis ailleurs dans le projet
  (`js/config.js`, `js/app.js`, `js/backend.js`). En revanche, tout son code s'exécute
  immédiatement au chargement du script et suppose que le DOM de la page existe déjà
  (`const svg = $('#cv')` etc.) — incompatible avec le routeur du site, qui construit le DOM
  de chaque vue dynamiquement au moment de la navigation.

**Adaptations effectuées** (`js/plan.js`, nouveau fichier, ~2300 lignes) :
- Toute la logique DOM (état de vue, grille, accrochages, outils, interactions souris/tactile/
  clavier, ruban, panneaux, export planche) a été déplacée dans une fonction `mount(root,
  storage, opts)`, appelée uniquement quand la route `#/plan/:id` est visitée
  (`afterPlanView()`, même convention que `afterProjectView()`/`afterDevisView()`). Les aides
  `$`/`$$` de sélection DOM sont désormais scoping sur `root` plutôt que sur `document`.
- `unmount()` retire proprement les deux seuls écouteurs posés sur `window` (clavier) et
  déconnecte le `ResizeObserver` ; `mount()` appelle systématiquement `unmount()` en premier,
  pour qu'ouvrir/fermer/rouvrir la vue plusieurs fois n'empile jamais de gestionnaires (même
  principe défensif que `window.__wireEscBound` déjà utilisé dans `js/editor.js`).
  `ResizeObserver` est utilisé de façon défensive (`typeof ResizeObserver !== 'undefined'`),
  jsdom (harnais de test) ne l'implémentant pas.
- `id="app"` renommé en `id="plan-shell"` pour éliminer le doublon d'ID avec `<main id="app">`
  du site. `#toast`→`#plan-toast`, `#pageStyle`→`#planPrintStyle` (éviter toute confusion avec
  d'éventuels ids futurs du site).
- Nouveau fichier `css/plan.css` : **toutes** les règles sont préfixées par le sélecteur
  d'ancrage `#plan-shell` (y compris les variables CSS, redéclarées sur ce conteneur plutôt
  que sur `:root`), ce qui donne à chaque règle une spécificité plus forte que les règles
  génériques du site pour tout ce qui est à l'intérieur de l'éditeur, sans avoir à renommer les
  centaines de références de classes internes au module (`.btn`, `.on`, `.row`...). La règle
  d'impression (`@media print`) a été réécrite en « tout cacher sauf `#printArea` par
  visibilité » plutôt que « cacher les enfants directs de `<body>` » : le plan est maintenant
  imbriqué plus profondément dans le DOM (`body > main#app > .workspace > #plan-shell >
  #printArea`) qu'à la racine du `<body>` du prototype d'origine, l'ancienne règle aurait
  masqué `#printArea` lui-même.
- Persistance : nouvelles fonctions `db.getPlan(projectId)`/`db.savePlan(projectId, plan)`
  dans `js/backend.js` (mock **et** Supabase), exactement sur le modèle de
  `getDevis`/`saveDevis` déjà existant — colonne `plan jsonb` ajoutée à `projects` dans
  `supabase/schema.sql` (+ migration idempotente `alter table ... add column if not exists`).
  Le module ne connaît plus `window.PLAN_CAO_STORAGE`/`localStorage` (mécanisme prévu par le
  prototype autonome) : `viewPlan()`/`afterPlanView()` lui fournissent un adaptateur
  `{load, save}` fermé sur le `projectId` réel.
- Permissions : même règle que le schéma (`isOwner || collaborateur en édition`) ; un
  collaborateur en lecture seule voit un bandeau « 🔒 Lecture seule » et ses sauvegardes sont
  ignorées côté module (`S.readOnly`). Le verrouillage complet des outils d'édition en lecture
  seule (aujourd'hui seule la sauvegarde est bloquée) reste à affiner — documenté ci-dessous.
- Intégré comme **4ᵉ onglet** « Plan » aux côtés de Schéma/Devis/Dimensionnement
  (`js/editor.js`, `js/devis.js`, `js/dimensionnement.js`, `js/app.js`), routé sur
  `#/plan/:id`, avec son propre panneau Propriétés/Calques/Symboles/Circuits/Rapport
  (vérifications indicatives NF C 15-100 déjà intégrées telles que fournies par le client —
  toujours présentées comme indicatives, jamais comme une certitude réglementaire) et ses
  propres exports (SVG, PNG, PDF via impression, JSON, CSV nomenclature/circuits) — tous déjà
  fonctionnels dans le prototype fourni et laissés inchangés sur le fond.

### Ce qui a été vérifié par exécution réelle (`npm test`, 206 vérifications, 0 échec, 0 erreur
JS non interceptée sur toute la session)

- L'éditeur se monte à la navigation vers `#/plan/:id` (élément `#plan-shell` présent, 4ᵉ
  onglet actif, API `window.AtelierPlanEditor`/`window.AtelierPlan` exposée).
- Un plan vide par défaut est créé quand aucun plan n'existe encore pour le projet.
- Cycle complet de persistance par le vrai chemin backend : `db.savePlan()` → `db.getPlan()`
  relit fidèlement les entités enregistrées ; en quittant la vue puis en y revenant, le mur
  précédemment enregistré est rechargé (`mount()` → `storage.load()`) **et** effectivement
  redessiné dans le SVG (pas seulement présent en mémoire).
- En quittant la route Plan, son DOM est bien retiré ; aucune erreur JS n'est apparue pendant
  tout le cycle montage → sauvegarde → démontage → remontage.

### Ce qui n'a PAS été vérifié (honnêteté, même limitation que pour les sessions précédentes)

- **Rendu visuel réel** : comme pour tout ce projet, aucune vérification pixel dans un vrai
  navigateur n'a été possible dans cet environnement (voir `NOTES_REPRISE_2026.md` point 4 —
  l'extension Chrome pilotable reste connectée à une autre machine que celle qui sert le
  fichier). Non vérifiés visuellement en particulier : le rendu du ruban/panneaux avec la
  nouvelle feuille de style `css/plan.css`, la lisibilité des symboles électriques du bâtiment
  à l'échelle papier, le comportement tactile (pincement/deux doigts) du module — le code
  reprend le mécanisme du prototype fourni sans modification sur ce point, mais n'a été
  exercé qu'au clic simulé par le harnais de test, pas au doigt sur un vrai écran.
- **Supabase réel** : `db.getPlan`/`db.savePlan` côté Supabase n'ont pu être vérifiés que par
  relecture attentive du code (même limitation documentée pour tout `js/backend.js` — pas de
  projet Supabase réel disponible pour tester).
- **Verrouillage complet en lecture seule** : un collaborateur en lecture seule ne peut pas
  sauvegarder, mais peut toujours cliquer les outils de dessin (édition en mémoire non
  persistée) — pas un vrai verrouillage de l'interface comme pourrait le laisser penser le
  bandeau affiché. À corriger si ce cas d'usage devient réellement utilisé.
- **PDF du plan hors de la famille de PDF partagée** : le plan garde son propre export PDF
  (impression du navigateur avec cartouche déjà intégré au prototype), indépendant de
  `openPdfWindow`/du logo partagé utilisé par les 4 exports PDF existants (`js/pdf.js`). Ne
  pas fusionner les deux sans réflexion — le plan produit une vraie planche technique
  dimensionnée (formats A5 à A0, cartouche 180×40mm, échelle graphique, flèche nord) que le
  système de PDF existant ne sait pas produire ; les fusionner mérite une tâche dédiée plutôt
  qu'une réécriture rapide.

## ADDENDUM 8 — Vue 3D du bâtiment (Phase 2 du cahier "CAO 3D")

Suite demandée : « fais-moi le reste du cahier des charges, la CAO 3D etc. ». Le cahier
initial décrit deux volets 3D bien distincts et explicitement phasés par le client lui-même :
**Phase 2 — vue 3D légère du bâtiment** (« volontairement simple, visualiser, pas modéliser »,
directement dérivée des murs/ouvertures déjà dessinés dans le plan) et **Phase 3 — CAO
mécanique 3D minimaliste** (esquisse → extrusion/révolution → booléens → bibliothèque de pièces
paramétriques → export STL, un véritable noyau de CAO paramétrique). Cette session a traité la
Phase 2, qui s'appuie directement sur le travail déjà livré (addendum 7) et reste un périmètre
raisonnable pour une session. La Phase 3 (CAO mécanique) est un chantier d'une toute autre
ampleur — un noyau de modélisation paramétrique complet — et n'a **pas** été commencée ; elle
reste documentée comme prochaine étape dans `NOTES_REPRISE_2026.md`, avec les raisons de ce
choix, plutôt que d'être bâclée pour cocher une case.

### Ce qui a été fait

Nouveau **5ᵉ onglet « 3D »** (`#/plan3d/:id`, `js/plan3d.js` + `css/plan3d.css`), aux côtés de
Schéma/Devis/Dimensionnement/Plan :

- **Géométrie pure, sans dépendance 3D** (`wallOpeningBoxes`, `wallSegments`,
  `buildLevelScene`, `buildBuildingScene`) : transforme les murs/ouvertures/poteaux/symboles
  déjà enregistrés par le module Plan (`db.getPlan`) en une description 3D neutre (boîtes avec
  centre/dimensions) — exactement le principe « mur découpé en boîtes pleines autour de
  l'ouverture (avant/allège/linteau/après), sans booléen » déjà écrit dans le cahier du
  client. Ces fonctions ne dépendent d'aucune bibliothèque graphique et sont donc vérifiables
  directement.
- **Rendu Three.js** (`createBuildingViewer`) : scène orbitable (glisser = tourner, molette =
  zoomer, via `OrbitControls`), vues prédéfinies (Isométrique/Dessus/Face/Droite), affichage/
  masquage par niveau, **coupe horizontale réglable** par curseur (plan de clip Three.js,
  demandé explicitement : « voir l'intérieur »), cadrage automatique sur le bâtiment, export
  PNG de la vue courante. Matériaux plats simples, ombres désactivées, `pixelRatio` plafonné à
  2 — comme demandé pour rester fluide sur mobile d'entrée de gamme.
- **Three.js chargé en CDN** (`three@0.128.0` + son addon `OrbitControls`, jsdelivr), sur le
  même principe déjà en place dans ce projet pour `@supabase/supabase-js` (`index.html`) :
  aucune nouvelle dépendance de build, le site reste un site statique sans étape de
  compilation. **Chargement défensif** : `threeAvailable()`/`webglAvailable()` sont vérifiés
  avant toute tentative de créer la scène ; si la bibliothèque n'a pas pu se charger (réseau,
  bloqueur de script) ou si WebGL n'est pas disponible, la vue affiche un message clair au
  lieu de planter, et renvoie vers l'onglet Plan.
- Pas de nouveau stockage : la vue 3D est une **lecture** du plan déjà enregistré (pas de
  document séparé à sauvegarder) — se construit automatiquement dès qu'un plan existe pour le
  projet, invite à ouvrir l'onglet Plan sinon.
- Démontage propre en quittant la route (`unmountPlan3D()` : dispose du renderer/scène/
  contrôles Three.js et du `ResizeObserver`), appelé depuis `js/app.js` sur le même principe
  que pour le module Plan (addendum 7).

### Ce qui a été vérifié par exécution réelle (`npm test`, **223 vérifications, 0 échec, 0
erreur JS** — 206 avant cette section + 17 nouvelles)

- Les fonctions de géométrie pure sont testées directement avec des données représentatives :
  un mur avec porte pleine hauteur (pas de linteau), un mur avec porte standard 2100 mm dans
  un mur de 2800 mm (linteau généré), une fenêtre avec allège (4 boîtes), la conversion
  mur/poteau/symbole d'un plan complet vers une scène 3D, et le comportement sur une entrée
  vide/invalide (ne lève pas d'exception, retourne une liste de niveaux vide).
- **Repli gracieux vérifié en conditions réelles de test** : ce harnais (Node + jsdom) ne
  charge délibérément aucun script externe (voir `boot()`, tous les `<script src>` sont
  retirés du HTML avant injection), donc `window.THREE` n'existe pas — exactement le scénario
  « bibliothèque 3D indisponible » que le code doit gérer en production sur un réseau capricieux
  ou avec un bloqueur de script. Le test confirme que `threeAvailable()` renvoie bien `false`
  dans ce cas, que le message de repli s'affiche au lieu d'une page cassée, et qu'aucune
  exception n'est levée pendant le montage ni le démontage de la vue.

### Ce qui n'a PAS été vérifié (même limitation que pour tout le reste du projet)

- **Rendu 3D réel** (WebGL) : ne peut tout simplement pas être vérifié dans cet environnement
  sans navigateur réel — ni par ce harnais de test (jsdom n'implémente pas WebGL), ni par
  l'extension Chrome pilotable (toujours connectée à une autre machine que celle qui sert le
  site, voir `NOTES_REPRISE_2026.md` point 4). Non vérifiés visuellement : l'orbite à la
  souris/au doigt, la justesse des dimensions/proportions du bâtiment extrudé, la lisibilité
  des marqueurs de symboles électriques en 3D, le curseur de coupe horizontale, l'export PNG.
- **Chargement réel du CDN Three.js** : le code suppose que `three@0.128.0` et son addon
  `OrbitControls` se chargent correctement depuis jsdelivr dans un vrai navigateur — jamais
  exécuté dans un vrai navigateur dans cette session, seule la lecture attentive du code et la
  cohérence avec l'usage documenté de Three.js (API stable depuis de nombreuses versions) le
  laissent penser correct.
- **Performance** sur un bâtiment à plusieurs niveaux/beaucoup de murs : non mesurée (pas
  d'environnement de test avec rendu réel pour le faire).

### Ce qui reste explicitement hors de portée (Phase 3 et au-delà)

La **CAO mécanique 3D** (esquisse 2D → extrusion/révolution, booléens union/soustraction,
bibliothèque de pièces paramétriques — vis, écrous, roulements, engrenages —, arbre de
conception avec régénération, export STL) décrite dans le cahier reste un chantier séparé et
nettement plus important : il ne réutilise aucune donnée déjà en place (contrairement à la vue
3D du bâtiment, qui lit directement les données du plan) et nécessite de concevoir depuis zéro
un modèle de données de type « historique de fonctions » avec régénération, une bibliothèque
CSG, et un éditeur d'esquisse 2D sur plan de coupe. Non commencé cette session — voir
`NOTES_REPRISE_2026.md` pour le détail de ce qui resterait à faire et pourquoi ce n'est pas une
extension incrémentale du module 3D bâtiment qui vient d'être livré.

## ADDENDUM 9 — Composants Énergies Renouvelables manquants (protection DC/batterie, éolien, hydraulique, solaire thermique)

Suite de « fais-moi le reste du cahier des charges » : avant d'ajouter quoi que ce soit, le
catalogue existant (déjà riche : panneaux PV, régulateurs PWM/MPPT, batteries plomb/lithium/
LiFePO4, onduleurs, éolienne, turbine hydraulique...) a été vérifié composant par composant par
recherche dans `js/catalog.js` (pas de supposition) contre la liste très détaillée du cahier
reçu. **17 composants explicitement cités et absents** ont été identifiés puis ajoutés, dans le
domaine `energies-renouvelables` :

- **Protection DC/batterie** (famille `Protections`) : `fusible_gpv`, `sectionneur_dc`,
  `fusible_batterie`, `sectionneur_batterie` — réutilisent exactement les symboles déjà
  vérifiés du fusible/sectionneur génériques (`fusible`, `sectionneur`, déjà utilisés ailleurs
  dans le catalogue), avec une étiquette distinctive (gPV/DC/BAT) — pas de nouveau gabarit
  graphique inventé.
- **Conversion/régulation** : `optimiseur_pv` (`Conversion`), `bms` (`Stockage`, représentation
  simplifiée à 2 bornes, documentée comme telle dans sa fiche plutôt que d'inventer un brochage
  précis non vérifié).
- **Éolien** (complète l'éolienne déjà existante) : `generatrice_eolienne`, `redresseur_eolien`,
  `controleur_eolien`, `frein_eolien`.
- **Hydraulique** (complète la turbine déjà existante) : `controleur_hydraulique`,
  `vanne_hydraulique` (réutilise le symbole déjà vérifié de l'électrovanne).
- **Solaire thermique — nouvelle famille**, absente du catalogue jusqu'ici (à ne pas confondre
  avec le chauffe-eau électrique déjà présent en famille `Bâtiment`) : `capteur_solaire_thermique`,
  `ballon_solaire`, `circulateur_solaire`, `regulateur_solaire_thermique`,
  `sonde_temperature_solaire`.

Tous réutilisent les gabarits de symboles déjà établis dans ce fichier (`T2`/`T4`,
`TPL.boxLabel`/`TPL.circleLetter`, motif fusible/sectionneur/box-régulation déjà répété une
dizaine de fois pour d'autres composants) — aucun nouveau type de gabarit graphique introduit,
conformément à l'architecture « par gabarits » documentée en tête de `js/catalog.js`.

### Vérifié par exécution réelle

- `tests/verify_catalog.js` : **522 composants** (505 avant, +17), toujours **0 doublon d'ID,
  0 SYM manquant, 0 borne non alignée** — chaque nouvelle borne déclarée correspond bien à un
  trait réellement dessiné dans son symbole.
- `npm test` : **227 vérifications, 0 échec** (223 avant + 4 nouvelles : présence des 17
  composants dans le domaine Énergies Renouvelables, brochage simplifié du BMS documenté comme
  tel, 4 bornes de l'optimiseur PV, cohérence de la nouvelle famille Solaire thermique).

### Ce qui n'a pas été vérifié

Même limitation que pour l'audit des symboles déjà documenté (point 1 de
`NOTES_REPRISE_2026.md`) : la conformité stricte à la norme IEC 60617 de chaque nouveau
symbole n'a pas été validée visuellement dans un vrai navigateur — ils reprennent des gabarits
déjà en place et vérifiés géométriquement (bornes ↔ tracé), mais pas contre-vérifiés vue par
vue avec un outil de référence normatif.
