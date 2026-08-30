# CAHIER DES CHARGES DÉFINITIF — LABORATOIRE D’ÉLECTRONIQUE VIRTUEL
## Directive de reprise, correction, architecture et finalisation du projet

> **À L’ATTENTION DE L’IA / AGENT DE DÉVELOPPEMENT**
>
> Tu dois considérer ce document comme la directive actuelle et prioritaire du projet.
> Le projet que tu vas recevoir peut contenir du code provenant d’un travail précédent et certaines fonctionnalités déjà opérationnelles. Ton rôle n’est pas de repartir aveuglément de zéro ni de remplacer ce qui fonctionne par une démonstration simplifiée : tu dois **reprendre le projet existant, l’analyser, conserver les fonctionnalités validées, corriger les défauts et construire une version réellement cohérente et extensible**.
>
> Tu disposes d’une liberté technique réelle : si une décision précédemment envisagée est mauvaise, trop coûteuse, trop lourde, fragile ou incohérente avec l’objectif du logiciel, tu peux la modifier. Tu dois cependant préserver l’intention fonctionnelle du cahier des charges. Lorsque tu prends une décision importante différente de ce qui était prévu, documente-la dans le rapport final avec sa justification.
>
> **Objectif général : améliorer le projet jusqu’à obtenir une plateforme de travail crédible, propre, fluide, esthétique, extensible et réellement exploitable par des étudiants et professionnels des domaines électriques, électroniques, électrotechniques et énergétiques.**
>
> Ne transforme pas le projet en simple maquette visuelle. Les fonctionnalités doivent être conçues avec une vraie logique de logiciel.

---

# 1. VISION RÉELLE DU PROJET

Le **Laboratoire d’Électronique Virtuel** est une plateforme en ligne de conception et d’étude technique.

Elle doit permettre à un utilisateur de :

- créer un compte et gérer son espace personnel ;
- créer plusieurs projets ;
- choisir un domaine de travail ;
- rechercher et placer des composants ;
- construire des schémas électriques/électroniques ;
- déplacer, sélectionner, dupliquer, supprimer et faire pivoter les éléments ;
- relier les composants par des fils de manière fluide ;
- modifier leurs paramètres ;
- observer les connexions et les éventuelles erreurs ;
- analyser un circuit ;
- effectuer des calculs et du dimensionnement ;
- réaliser un devis ;
- générer un rapport PDF contenant notamment le schéma proprement redessiné ;
- utiliser une IA comme assistant d’interprétation et d’analyse ;
- travailler sur ordinateur comme sur téléphone ;
- conserver ses projets dans son espace ;
- partager certains projets avec d’autres utilisateurs ;
- disposer d’un système administrateur ;
- évoluer vers une bibliothèque extrêmement large de composants sans rendre l’interface lourde.

Le logiciel doit donc être pensé comme une **plateforme technique modulaire**, et non comme une simple page HTML contenant un dessin de circuit.

---

# 2. RÈGLE ABSOLUE : NE PAS DÉTRUIRE CE QUI FONCTIONNE

Dans la version actuellement reçue, certaines fonctionnalités sont déjà opérationnelles.

À vérifier avant toute modification :

- déplacement des composants ;
- suppression ;
- duplication des composants ;
- duplication des schémas/projets lorsque disponible ;
- tracé des fils ;
- zoom avant/arrière ;
- déplacement du canevas ;
- menu/interface générale ;
- fonctionnement responsive déjà présent ;
- navigation entre les espaces ;
- sauvegarde existante ;
- système de comptes existant ;
- administration existante ;
- partage existant ;
- export PDF existant, même s’il doit être amélioré.

**Ces fonctions doivent être testées avant modification.**

Toute fonction qui fonctionne correctement doit être conservée ou améliorée, pas remplacée par une version moins fonctionnelle.

---

# 3. PRIORITÉ N°1 : L’ÉDITEUR DE SCHÉMAS

Le cœur du projet est l’éditeur de schémas.

Il doit donner l’impression d’utiliser un véritable logiciel de schématique.

## 3.1 Placement des composants

Lorsqu’un utilisateur choisit un composant dans le catalogue :

- le composant ne doit pas apparaître brutalement au milieu du schéma en superposant les autres composants ;
- il doit apparaître dans une **zone temporaire de dépôt / prévisualisation**, idéalement près d’un bord du canevas ou sous le doigt/la souris ;
- l’utilisateur doit ensuite pouvoir le prendre et le déposer à l’endroit voulu ;
- sur téléphone, le comportement doit être adapté au tactile ;
- éviter toute apparition automatique au même point qui crée un empilement illisible.

Prévoir un mécanisme de type :
**Catalogue → prévisualisation → déplacement → dépôt sur canevas.**

Le composant doit s’aimanter correctement à la grille.

---

# 4. GRILLE ET ORGANISATION VISUELLE

Le canevas doit utiliser une grille technique.

Prévoir :

- grille visible mais discrète ;
- magnétisme sur la grille ;
- positions cohérentes ;
- alignement horizontal/vertical ;
- espacement régulier ;
- possibilité de déplacer facilement un composant sans perdre ses connexions.

Ajouter si pertinent :

- guides d’alignement ;
- indication visuelle lors de l’alignement ;
- bouton « Ranger le schéma » ;
- possibilité d’organiser automatiquement un schéma simple.

**Important : l’auto-organisation ne doit jamais détruire les connexions.**

---

# 5. FILS ET CONNEXIONS — PRIORITÉ CRITIQUE

Le système de fils doit être considérablement amélioré.

Les fils doivent pouvoir être tracés de manière fluide entre les bornes.

## Comportement attendu

1. sélectionner l’outil Fil ;
2. cliquer sur une borne ;
3. déplacer le curseur/doigt ;
4. visualiser le fil en cours ;
5. cliquer sur une seconde borne ;
6. créer la connexion.

Prévoir aussi, si techniquement pertinent :

- connexion par glisser-déposer ;
- annulation d’un fil en cours ;
- suppression d’un fil ;
- sélection d’un fil ;
- déplacement d’un composant sans casser automatiquement ses connexions ;
- reconnexion ;
- jonctions ;
- nœuds électriques ;
- détection des connexions invalides.

## Routage

Les fils doivent privilégier :

- horizontales ;
- verticales ;
- angles à 90° ;
- trajectoires propres.

Éviter les longues diagonales désordonnées.

Si un routage automatique plus avancé est techniquement justifié, l’implémenter progressivement avec une architecture permettant de l’améliorer.

---

# 6. INTERACTION AVEC UN COMPOSANT

Éviter de multiplier les petits boutons dispersés dans l’interface.

Lorsqu’un utilisateur sélectionne un composant, afficher son panneau de propriétés.

Lors d’un double-clic ou d’une interaction secondaire clairement définie, afficher un menu contextuel propre proposant par exemple :

- Modifier ;
- Déplacer ;
- Dupliquer ;
- Faire pivoter ;
- Propriétés ;
- Informations ;
- Remplacer par une variante ;
- Supprimer.

Le menu doit apparaître **près du composant ou à un endroit logique**, sans polluer le canevas.

Sur téléphone, utiliser un menu tactile adapté.

---

# 7. SYMBOLES : DISTINGUER ÉDITEUR ET DOCUMENT FINAL

Il faut distinguer deux représentations :

### A. Représentation interactive
Elle sert à manipuler les objets facilement dans le logiciel.

Elle peut utiliser des éléments graphiques optimisés pour :

- déplacement ;
- sélection ;
- hitbox ;
- bornes ;
- interaction.

### B. Représentation technique du PDF
Le PDF doit redessiner le schéma avec des **symboles électriques/électroniques propres et reconnaissables**, adaptés à la documentation technique.

Le PDF ne doit donc pas simplement faire une capture d’écran du canevas sombre.

Il doit reconstruire le schéma avec :

- symboles ;
- références ;
- valeurs ;
- connexions ;
- bornes ;
- labels ;
- orientation ;
- éventuellement nœuds.

Le résultat doit ressembler à un schéma technique imprimable.

---

# 8. BIBLIOTHÈQUE DE COMPOSANTS — ARCHITECTURE EXTENSIBLE

Ne pas afficher des milliers de composants simultanément.

L’interface doit afficher principalement les composants courants du domaine sélectionné.

Le reste doit être accessible par :

## Recherche intelligente

Exemple :

> « 2N2222 »

ou :

> « transistor NPN »

ou :

> « transformateur 230V 12-0-12V »

ou :

> « capteur infrarouge »

Le système doit rechercher dans une base de composants.

Résultat :

- nom ;
- symbole ;
- famille ;
- variante ;
- caractéristiques principales ;
- éventuellement fiche technique ;
- bouton « Ajouter au projet ».

---

# 9. ORGANISATION PAR DOMAINES

Créer une architecture de bibliothèque par domaines.

## Domaine 1 — Électronique

Inclure notamment, en plus des composants déjà présents :

### Résistances
- résistance fixe ;
- résistance variable ;
- potentiomètre ;
- rhéostat ;
- thermistance NTC ;
- thermistance PTC ;
- LDR ;
- réseaux de résistances ;
- résistances de puissance.

### Condensateurs
- condensateur polarisé ;
- non polarisé ;
- variable ;
- électrolytique ;
- céramique ;
- film ;
- condensateur de démarrage ;
- condensateur permanent.

### Diodes
- diode classique ;
- diode Zener ;
- Schottky ;
- LED ;
- LED RGB ;
- photodiode ;
- diode TVS ;
- varicap ;
- pont de diodes.

### Transistors
- NPN ;
- PNP ;
- JFET ;
- MOSFET canal N ;
- MOSFET canal P ;
- IGBT ;
- phototransistor ;
- Darlington.

### Thyristors et commande de puissance
- SCR ;
- TRIAC ;
- DIAC ;
- optotriac ;
- relais statique.

### Circuits intégrés
Prévoir une architecture capable d'accueillir de nombreux circuits intégrés, notamment :
- NE555 ;
- LM358 ;
- TL082 ;
- LM324 ;
- LM7805 et familles de régulateurs ;
- régulateurs ajustables ;
- comparateurs ;
- amplificateurs opérationnels ;
- multiplexeurs ;
- démultiplexeurs ;
- encodeurs ;
- décodeurs ;
- compteurs ;
- bascules ;
- registres ;
- temporisateurs ;
- drivers.

### Logique numérique
- portes AND ;
- OR ;
- NOT ;
- NAND ;
- NOR ;
- XOR ;
- XNOR ;
- buffers ;
- bascules ;
- compteurs ;
- décodeurs ;
- afficheurs 7 segments ;
- afficheurs numériques ;
- convertisseurs ADC/DAC.

### Capteurs et modules
- récepteur IR ;
- émetteur IR ;
- capteur de lumière ;
- capteur de température ;
- capteur de proximité ;
- capteur ultrason ;
- capteur de mouvement ;
- capteur magnétique ;
- capteur de pression ;
- capteur d'humidité ;
- capteurs analogiques et numériques.

### Communication
Prévoir une architecture permettant d'ajouter :
- modules UART ;
- interfaces I²C ;
- SPI ;
- modules Bluetooth ;
- modules Wi-Fi ;
- modules infrarouges ;
- interfaces de communication.

### Affichage
- LED ;
- afficheur 7 segments ;
- LCD ;
- OLED ;
- afficheurs numériques ;
- voyants ;
- bargraph.

### Composants électromécaniques
- relais ;
- interrupteurs ;
- boutons-poussoirs ;
- commutateurs ;
- contacteurs ;
- buzzers ;
- moteurs.

---

# 10. VARIANTES DES COMPOSANTS

Un composant n'est pas toujours un seul symbole.

Le système doit permettre des variantes.

Exemple : TRANSFORMATEUR.

Prévoir une famille « Transformateurs » pouvant contenir :

- transformateur simple ;
- transformateur d’isolement ;
- transformateur abaisseur ;
- transformateur élévateur ;
- transformateur à point milieu ;
- transformateur double secondaire ;
- transformateur multi-secondaire ;
- transformateur de courant ;
- transformateur de tension ;
- transformateur monophasé ;
- transformateur triphasé ;
- autres variantes pertinentes.

Chaque variante doit pouvoir avoir :

- symbole adapté ;
- nombre de bornes adapté ;
- paramètres adaptés ;
- modèle de calcul adapté.

Même principe pour les autres familles.

---

# 11. ÉLECTROTECHNIQUE

Prévoir une bibliothèque spécifique comprenant notamment :

- sources AC/DC ;
- générateurs ;
- moteurs DC ;
- moteurs asynchrones ;
- moteurs synchrones ;
- moteurs monophasés ;
- moteurs triphasés ;
- transformateurs ;
- contacteurs ;
- relais ;
- disjoncteurs ;
- fusibles ;
- sectionneurs ;
- interrupteurs ;
- inverseurs ;
- démarreurs ;
- protections ;
- charges résistives ;
- charges inductives ;
- charges capacitives ;
- compteurs ;
- wattmètres ;
- voltmètres ;
- ampèremètres ;
- transformateurs de courant ;
- transformateurs de tension ;
- systèmes triphasés ;
- câbles ;
- jeux de barres ;
- bornes.

---

# 12. ÉLECTRICITÉ DU BÂTIMENT

Ajouter un espace ou une famille permettant de représenter :

- tableaux électriques ;
- disjoncteurs ;
- différentiels ;
- prises ;
- interrupteurs ;
- va-et-vient ;
- télérupteurs ;
- contacteurs ;
- éclairage ;
- luminaires ;
- détecteurs ;
- circuits domestiques ;
- circuits spécialisés ;
- câbles ;
- gaines ;
- boîtes ;
- mises à la terre ;
- parafoudres ;
- équipements de protection.

Le système doit pouvoir évoluer vers des schémas d’installation réels.

---

# 13. ÉNERGIES RENOUVELABLES

Prévoir :

- panneaux photovoltaïques ;
- variantes de panneaux ;
- strings PV ;
- batteries ;
- batteries plomb ;
- batteries lithium ;
- LiFePO4 ;
- régulateurs PWM ;
- régulateurs MPPT ;
- onduleurs ;
- onduleurs hybrides ;
- micro-onduleurs ;
- coffrets DC ;
- coffrets AC ;
- protections ;
- parafoudres ;
- inverseurs de source ;
- générateurs ;
- systèmes éoliens ;
- systèmes hydrauliques ;
- charges ;
- compteurs d'énergie.

Les panneaux doivent pouvoir être paramétrés notamment par :

- Voc ;
- Vmp ;
- Isc ;
- Imp ;
- puissance ;
- température ;
- irradiation.

---

# 14. AUTOMATISME ET COMMANDE

Ajouter un domaine dédié ou une famille :

- boutons ;
- capteurs ;
- relais ;
- temporisateurs ;
- compteurs ;
- automates ;
- entrées/sorties ;
- contacteurs ;
- moteurs ;
- électrovannes ;
- fins de course ;
- détecteurs ;
- logique de commande.

L'architecture doit permettre d'ajouter progressivement des éléments industriels sans modifier tout le logiciel.

---

# 15. ÉLECTROMÉNAGER ET SYSTÈMES INTÉGRÉS

Le logiciel doit pouvoir représenter des appareils réels composés de plusieurs éléments.

Exemples :

### Ventilateur
- moteur ;
- condensateur ;
- sélecteur de vitesse ;
- protections ;
- interrupteur ;
- câblage.

### Chargeur
- transformateur ou convertisseur ;
- redressement ;
- filtrage ;
- régulation ;
- protection ;
- sortie.

### Alimentation
- transformateur ;
- pont de diodes ;
- condensateur ;
- régulateur ;
- protections.

### Radio
Prévoir la possibilité de construire un schéma comprenant de nombreux blocs et composants, par exemple :
- antenne ;
- filtrage ;
- amplification ;
- oscillation ;
- démodulation ;
- alimentation ;
- circuits intégrés ;
- composants passifs ;
- affichage ;
- commande.

Le but n'est pas de limiter artificiellement l'utilisateur à quelques composants scolaires.

---

# 16. ARCHITECTURE « COMPOSANT »

Chaque composant doit idéalement être décrit par une structure de données comprenant :

- identifiant ;
- nom ;
- famille ;
- domaine ;
- variantes ;
- symbole ;
- bornes ;
- orientation ;
- paramètres ;
- valeurs possibles ;
- unité ;
- modèle électrique ;
- documentation ;
- mots-clés de recherche ;
- niveau de complexité ;
- compatibilité simulation.

Ainsi, ajouter 100 ou 1 000 composants ne doit pas nécessiter de réécrire tout le moteur.

---

# 17. SIMULATION ET ANALYSE

La simulation est une partie majeure du projet.

Ne jamais prétendre qu'une simulation réelle fonctionne si elle n'est pas réellement implémentée.

Prévoir une architecture séparée :

### Interface
L'utilisateur construit le circuit.

### Moteur d'analyse
Le système transforme le schéma en modèle exploitable.

### Calcul
Le moteur calcule ce qui est effectivement supporté.

### Résultats
- tensions ;
- courants ;
- puissances ;
- états logiques ;
- valeurs de composants ;
- erreurs ;
- courbes ;
- formes d'ondes lorsque le modèle le permet.

L'architecture doit permettre de remplacer ou d'améliorer le moteur de calcul sans refaire l'éditeur graphique.

---

# 18. DÉTECTION DES ERREURS

Avant simulation/analyse, vérifier notamment :

- borne non connectée ;
- circuit ouvert ;
- court-circuit évident ;
- source mal raccordée ;
- polarité incohérente ;
- composant sans paramètre nécessaire ;
- valeur impossible ;
- connexion incohérente ;
- instrument mal raccordé.

Afficher des messages compréhensibles à l'étudiant.

Exemple :

> « Le voltmètre est branché en série. Pour mesurer cette tension, il doit être placé en parallèle. »

ou :

> « Cette branche semble court-circuiter directement la source. Vérifiez les connexions. »

---

# 19. CORRECTION / ASSISTANCE SUR LE SCHÉMA

Prévoir une fonction d'assistance permettant d'identifier certains problèmes.

L'IA peut aider à :

- expliquer une erreur ;
- interpréter un montage ;
- proposer une correction ;
- expliquer le rôle d'un composant ;
- expliquer pourquoi une simulation échoue ;
- suggérer une configuration cohérente.

Mais l'IA ne doit pas être considérée comme l'unique moteur de sécurité ou de calcul.

Les règles techniques importantes doivent être vérifiées par le logiciel lui-même lorsque cela est possible.

---

# 20. IA

Ne pas créer artificiellement une « IA maison » si cela n'est pas nécessaire.

Prévoir une couche d'intégration avec un fournisseur d'IA externe.

Exemple possible :
- Google Gemini ou autre fournisseur compatible.

La clé API ne doit jamais être écrite directement dans le code public.

Prévoir un emplacement de configuration clairement identifiable, par exemple :

`AI_API_KEY = "REMPLACER_ICI"`

ou une variable d'environnement côté serveur.

Si l'architecture nécessite une clé Supabase, URL, identifiant ou autre donnée absente :

**mettre un placeholder clairement indiqué**, sans inventer de vraies clés.

Exemple :

`SUPABASE_URL = "YOUR_SUPABASE_URL"`

`SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"`

Le projet doit rester compréhensible et remplaçable.

---

# 21. RÔLE DE L'IA DANS LE LOGICIEL

L'IA peut analyser :

- le schéma ;
- le domaine ;
- les composants ;
- les paramètres ;
- les erreurs détectées ;
- les résultats de calcul ;
- le contexte du projet.

Elle peut produire :

### Analyse technique
- description du montage ;
- fonctionnement ;
- rôle des composants ;
- points importants ;
- erreurs ;
- recommandations.

### Interprétation pédagogique
- explication simple ;
- niveau étudiant ;
- explication approfondie ;
- applications réelles.

### Identification du projet
Par exemple :

> « Ce montage ressemble à une alimentation linéaire avec redressement, filtrage et régulation. »

L'IA peut également proposer :

> « Ce montage peut être utilisé dans une alimentation basse tension. »

Mais elle doit clairement distinguer :
- résultat calculé ;
- déduction ;
- suggestion.

---

# 22. DEVIS — ESPACE INDÉPENDANT ET UNIVERSEL

Le devis ne doit pas être réservé à un seul domaine.

Il doit fonctionner pour :

- électronique ;
- électrotechnique ;
- électricité bâtiment ;
- énergie renouvelable ;
- automatisme ;
- électroménager ;
- autres projets techniques.

Le devis doit permettre de sélectionner des composants indépendamment de ceux utilisés pour la simulation.

Exemple :

Un circuit électronique peut utiliser :
- résistances ;
- condensateurs ;
- transistors.

Mais le devis peut également contenir :
- PCB ;
- soudure ;
- fil ;
- connecteurs ;
- boîtier ;
- vis ;
- entretoises ;
- fusibles ;
- gaine ;
- accessoires ;
- main-d'œuvre ;
- transport ;
- autres fournitures.

Le devis n'est donc PAS simplement une copie du circuit.

---

# 23. TABLEAU DE DEVIS

Prévoir au minimum :

| Désignation | Référence | Quantité | Unité | Prix unitaire | Total |
|---|---|---:|---|---:|---:|

Ajouter :

- sous-total ;
- remise éventuelle ;
- taxes si activées ;
- main-d'œuvre ;
- frais divers ;
- total général.

Les valeurs doivent être modifiables.

Prévoir une base de prix modifiable.

---

# 24. DIMENSIONNEMENT

Créer un espace universel de dimensionnement.

Il doit pouvoir évoluer selon le domaine.

Exemples :

### Photovoltaïque
- besoin énergétique ;
- puissance ;
- irradiation ;
- rendement ;
- nombre de panneaux ;
- configuration série/parallèle ;
- batterie ;
- régulateur ;
- onduleur ;
- câbles ;
- protections.

### Électrotechnique
- puissance ;
- tension ;
- courant ;
- cos φ ;
- rendement ;
- section de conducteur ;
- protection ;
- moteur ;
- transformateur.

### Électricité bâtiment
- bilan de puissance ;
- circuits ;
- puissance installée ;
- courant ;
- protections ;
- câbles ;
- chute de tension ;
- mise à la terre selon les données disponibles.

### Électronique
- résistances ;
- polarisation ;
- puissance dissipée ;
- alimentation ;
- filtrage ;
- régulation ;
- composants associés.

Les formules doivent être affichées et expliquées lorsque cela est pédagogique.

---

# 25. PDF DU PROJET

Le bouton « Exporter PDF » doit fonctionner même si l'utilisateur n'a pas terminé ou simulé son projet.

Le PDF doit pouvoir être généré à partir du travail existant.

Contenu possible :

1. page de garde ;
2. informations du projet ;
3. utilisateur/auteur selon les droits ;
4. domaine ;
5. description ;
6. schéma technique redessiné ;
7. nomenclature des composants ;
8. paramètres ;
9. mesures ;
10. résultats de calcul ;
11. analyse ;
12. interprétation IA si disponible ;
13. erreurs éventuelles ;
14. recommandations ;
15. devis si demandé ;
16. dimensionnement si demandé ;
17. conclusion.

Si aucune simulation n'a été effectuée, ne pas inventer de résultats.

Écrire par exemple :

> « Simulation non exécutée. »

Le PDF doit quand même être généré.

---

# 26. PDF ET STOCKAGE

Le PDF généré ne doit pas obligatoirement être conservé définitivement sur l'hébergement.

Prévoir si possible :

- génération à la demande ;
- téléchargement local ;
- stockage temporaire avec durée limitée si nécessaire ;
- suppression automatique des fichiers temporaires.

L'objectif est de limiter inutilement la consommation de stockage.

---

# 27. PROJETS ET STOCKAGE UTILISATEUR

Ne pas imposer une limite artificiellement basse qui empêcherait un étudiant de travailler normalement.

Prévoir un système de quota configurable.

Par exemple :

- quota initial ;
- taille utilisée ;
- taille restante ;
- possibilité de demander une augmentation ;
- décision administrateur.

Le stockage doit être mesuré intelligemment.

Ne pas stocker inutilement :
- copies temporaires ;
- PDF expirés ;
- doublons ;
- fichiers inutiles.

---

# 28. DEMANDE D'AUGMENTATION DE STOCKAGE

Un utilisateur dépassant son quota doit pouvoir envoyer une demande à l'administrateur.

L'administrateur peut :

- accepter ;
- refuser ;
- attribuer un quota supplémentaire ;
- retirer un quota supplémentaire.

Les valeurs doivent être configurables.

---

# 29. ADMINISTRATION

L'administrateur doit pouvoir voir, selon les droits :

- utilisateurs ;
- projets ;
- domaines ;
- stockage utilisé ;
- demandes ;
- activités pertinentes ;
- projets partagés ;
- statistiques générales.

Il doit pouvoir :

- suspendre si nécessaire ;
- supprimer ;
- gérer les projets ;
- gérer certains quotas ;
- traiter les demandes ;
- administrer les données.

Les actions sensibles doivent être sécurisées côté serveur.

---

# 30. AUTHENTIFICATION ET RÉCUPÉRATION DE COMPTE

Le système doit utiliser une authentification réelle pour la production.

Ne pas stocker les mots de passe en clair dans `localStorage`.

Pour la récupération :

- e-mail utilisateur ;
- mécanisme sécurisé ;
- token temporaire ;
- expiration ;
- limitation des tentatives ;
- journalisation des opérations sensibles.

Le « mot magique » peut être conservé comme mécanisme secondaire si l'architecture le justifie, mais **il ne doit pas être la seule barrière de sécurité**.

Ne jamais permettre à quelqu'un de modifier directement le mot de passe d'un autre compte simplement parce qu'il connaît son nom/prénom.

---

# 31. GROUPES ET COMMUNAUTÉS

Conserver la possibilité :

- compte personnel ;
- groupe ;
- communauté.

Prévoir à terme :

- membres ;
- rôles ;
- droits ;
- partage ;
- projets communs.

Ne pas donner automatiquement les mêmes droits à tous.

---

# 32. RESPONSIVE / TÉLÉPHONE

Le logiciel doit être utilisable sur :

- ordinateur ;
- tablette ;
- téléphone.

Sur téléphone :

- catalogue accessible ;
- canevas accessible ;
- propriétés accessibles ;
- mesures accessibles ;
- menus tactiles ;
- zoom tactile ;
- déplacement tactile ;
- sélection fiable ;
- fils traçables au doigt.

Éviter de reproduire trois grandes colonnes impossibles à utiliser sur un petit écran.

Utiliser au besoin :

- onglets ;
- panneaux coulissants ;
- tiroirs ;
- fenêtres modales ;
- barres d'outils compactes.

---

# 33. PERSONNALISATION DE L'ESPACE DE TRAVAIL

L'utilisateur doit pouvoir modifier certains paramètres visuels.

Prévoir plusieurs thèmes sobres et techniques :

- sombre ;
- clair ;
- gris ;
- éventuellement autres thèmes cohérents.

La personnalisation doit rester légère et ne pas augmenter inutilement la taille des données.

Prévoir éventuellement :

- arrière-plan ;
- grille ;
- contraste ;
- taille de grille ;
- densité visuelle.

---

# 34. PAGE D'ACCUEIL PERSONNALISABLE

Après création du compte, l'utilisateur peut personnaliser son espace d'accueil.

Il peut éventuellement :

- ajouter une image ;
- modifier une image ;
- choisir une présentation.

Mais imposer :

- taille maximale ;
- format accepté ;
- dimensions raisonnables ;
- compression ;
- contrôle de poids.

Ne jamais permettre qu'une simple image remplisse inutilement le stockage.

---

# 35. ESTHÉTIQUE

Le logiciel doit être techniquement sérieux mais aussi agréable.

Principes :

- interface propre ;
- hiérarchie visuelle ;
- espaces réguliers ;
- boutons cohérents ;
- animations discrètes ;
- pas de surcharge ;
- pas de texte inutile ;
- couleurs cohérentes ;
- composants bien alignés ;
- menus non dispersés.

L'objectif est de donner une impression de véritable logiciel technique moderne.

**Ne pas sacrifier l'ergonomie à l'esthétique.**

---

# 36. PERFORMANCE

Le nombre de composants disponibles ne doit pas signifier que tous les composants doivent être chargés graphiquement à l'écran.

Utiliser :

- chargement à la demande ;
- recherche ;
- catégories ;
- pagination/virtualisation si nécessaire ;
- données séparées des symboles ;
- chargement des symboles seulement lorsque nécessaire.

L'objectif est d'avoir une bibliothèque potentiellement très grande sans ralentir l'interface.

---

# 37. ARCHITECTURE RECOMMANDÉE

Tu as la liberté de modifier l'architecture si nécessaire.

Une architecture modulaire est préférable :

### Module Interface
UI, navigation, thèmes, responsive.

### Module Éditeur
canevas, composants, fils, sélection, déplacement, zoom.

### Module Bibliothèque
composants, familles, variantes, recherche.

### Module Simulation
modèles et calculs.

### Module Analyse
diagnostic technique.

### Module Dimensionnement
formules et études.

### Module Devis
nomenclature, prix, quantités, coûts.

### Module PDF
génération de documents.

### Module IA
communication avec le fournisseur IA.

### Module Authentification
comptes et permissions.

### Module Données
projets, utilisateurs, composants, paramètres.

Cela permet d'améliorer une partie sans casser toutes les autres.

---

# 38. CONCERNANT LE NOMBRE DE SITES

Ne crée pas automatiquement plusieurs sites indépendants si ce n'est pas nécessaire.

Le principe retenu est :

**une plateforme principale + des modules/services spécialisés.**

Le moteur de calcul peut être séparé techniquement du frontend si cela améliore :

- performance ;
- sécurité ;
- maintenabilité ;
- évolutivité.

Mais l'utilisateur doit avoir l'impression d'utiliser un seul logiciel cohérent.

Le dimensionnement et le devis doivent rester accessibles depuis le même projet.

---

# 39. COHÉRENCE ENTRE SCHÉMA, DEVIS ET DIMENSIONNEMENT

Un même projet doit pouvoir être utilisé comme base pour :

**Schéma → Analyse → Dimensionnement → Devis → Rapport PDF**

Mais ces étapes ne doivent pas être obligatoirement toutes exécutées.

Exemple :

Un utilisateur peut :

- créer un schéma ;
- ne pas simuler ;
- demander directement un PDF.

Ou :

- créer un schéma ;
- faire un dimensionnement ;
- créer un devis ;
- générer le rapport.

Ou :

- créer seulement un devis.

Le logiciel doit rester flexible.

---

# 40. MAQUETTES ET PROJETS COMPLEXES

L'utilisateur doit pouvoir construire des schémas comportant beaucoup de composants.

Ne pas imposer une limite artificielle de quelques composants.

Prévoir :

- déplacement fluide ;
- zoom ;
- navigation ;
- regroupement ;
- sélection multiple si possible ;
- duplication ;
- suppression ;
- fils ;
- labels ;
- organisation.

Un utilisateur doit pouvoir construire une maquette complexe, comme une alimentation, une commande de moteur, une installation photovoltaïque ou un circuit électronique comportant de nombreux composants.

---

# 41. VERSIONNAGE / SAUVEGARDE

Si possible, prévoir :

- sauvegarde automatique ;
- sauvegarde manuelle ;
- restauration ;
- prévention des pertes ;
- gestion des modifications.

Ne pas sauvegarder chaque mouvement de souris individuellement si cela crée trop d'écritures.

Utiliser une stratégie efficace.

---

# 42. TESTS OBLIGATOIRES

Avant de considérer le travail terminé, effectuer des tests fonctionnels.

### Test compte
- inscription ;
- connexion ;
- déconnexion ;
- récupération ;
- sécurité.

### Test projet
- création ;
- ouverture ;
- sauvegarde ;
- duplication ;
- suppression.

### Test éditeur
- placer composant ;
- déplacer ;
- sélectionner ;
- pivoter ;
- dupliquer ;
- supprimer ;
- zoomer ;
- dézoomer ;
- déplacer le canevas.

### Test fil
- connecter deux bornes ;
- annuler ;
- supprimer ;
- déplacer les composants ;
- vérifier que les connexions restent cohérentes.

### Test bibliothèque
- rechercher ;
- afficher ;
- choisir une variante ;
- ajouter ;
- modifier les paramètres.

### Test PDF
- schéma sans simulation ;
- schéma avec simulation ;
- schéma avec analyse ;
- devis ;
- dimensionnement.

### Test mobile
- placement ;
- déplacement ;
- zoom ;
- fils ;
- menus ;
- propriétés.

---

# 43. CE QUI EST INTERDIT

Ne pas :

- prétendre qu'une fonctionnalité est réelle lorsqu'elle est simulée ;
- inventer des résultats électriques ;
- inventer des clés API ;
- stocker des secrets côté frontend ;
- supprimer une fonctionnalité fonctionnelle sans raison ;
- remplacer un moteur fonctionnel par un simple bouton « bientôt disponible » ;
- mettre tous les composants directement à l'écran ;
- limiter artificiellement la bibliothèque à quelques composants ;
- créer un catalogue gigantesque qui ralentit la page ;
- multiplier les boutons dispersés ;
- faire un PDF qui est seulement une capture du canevas ;
- rendre la version téléphone inutilisable ;
- coder tout dans une seule fonction gigantesque si une architecture modulaire est possible.

---

# 44. LIBERTÉ DE DÉCISION TECHNIQUE

Tu peux améliorer les choix précédents.

Si tu identifies qu'une solution est meilleure :

- choisis-la ;
- explique pourquoi ;
- conserve les fonctionnalités demandées ;
- évite les dépendances inutiles ;
- privilégie les solutions accessibles financièrement ;
- privilégie les technologies maintenables ;
- ne choisis pas une technologie uniquement parce qu'elle est « professionnelle » si elle rend le projet inutilement complexe.

Si un élément est impossible dans l'environnement actuel, ne fais pas semblant.

Implémente une architecture propre permettant son intégration future et indique précisément ce qui manque.

---

# 45. OBJECTIF FINAL

Le résultat attendu n'est pas :

> « une page HTML avec quelques symboles ».

Le résultat attendu est une **plateforme de laboratoire technique extensible** permettant à l'utilisateur de passer de l'idée au schéma, du schéma à l'analyse, puis au dimensionnement, au devis et au rapport.

Chaîne cible :

**Choisir un domaine**
→ **Créer un projet**
→ **Rechercher des composants**
→ **Construire le schéma**
→ **Relier les composants**
→ **Configurer les paramètres**
→ **Vérifier les erreurs**
→ **Analyser / simuler**
→ **Dimensionner si nécessaire**
→ **Créer le devis si nécessaire**
→ **Faire interpréter le résultat par l'IA**
→ **Générer le PDF**
→ **Conserver / partager le projet**

---

# 46. RAPPORT FINAL OBLIGATOIRE DE TON TRAVAIL

Lorsque tu as terminé, tu dois fournir un rapport clair contenant :

## A. Ce que tu as trouvé
- architecture existante ;
- fonctionnalités fonctionnelles ;
- bugs ;
- limitations ;
- problèmes de sécurité.

## B. Ce que tu as modifié
Liste précise de chaque modification.

## C. Ce que tu as ajouté
Fonctionnalités nouvelles.

## D. Décisions d'architecture
Expliquer les changements importants.

## E. Composants
Indiquer les familles et variantes ajoutées.

## F. Simulation
Dire exactement ce qui est réellement calculé.

## G. IA
Dire exactement comment l'intégration fonctionne et quelles clés/configurations sont nécessaires.

## H. Supabase / backend
Dire exactement ce qui doit être configuré.

## I. PDF
Expliquer comment il est généré et quelles données il contient.

## J. Sécurité
Indiquer les mesures prises.

## K. Tests
Fournir les tests effectués et leurs résultats.

## L. Configuration nécessaire pour l'utilisateur
Fournir une liste très claire :

- URL Supabase à remplacer ;
- clé publique ;
- clé API IA ;
- variables d'environnement ;
- tables SQL ;
- fonctions SQL ;
- autres paramètres.

Utiliser des placeholders lorsque les informations ne sont pas disponibles.

## M. Ce qui n'est pas réellement disponible
Ne rien cacher.

Si une fonctionnalité n'est pas encore possible dans l'environnement fourni, l'indiquer clairement et expliquer pourquoi.

---

# 47. DIRECTIVE FINALE D'EXÉCUTION

**Ne me demande pas de choisir entre 10 étapes si tu peux prendre une décision technique raisonnable toi-même.**

Tu dois :

1. analyser le projet reçu ;
2. analyser le code réellement présent ;
3. identifier les fonctionnalités déjà opérationnelles ;
4. les préserver ;
5. corriger les problèmes ;
6. restructurer l'architecture si nécessaire ;
7. implémenter les fonctionnalités demandées ;
8. tester ;
9. corriger les régressions ;
10. produire la version finale du projet ;
11. produire le rapport final.

Tu dois travailler sur **le fichier/projet réellement fourni**, et non sur une version imaginaire.

Le cahier des charges actuel remplace les anciennes interprétations contradictoires lorsqu'elles entrent en conflit avec celui-ci.

**La priorité est la qualité finale du logiciel, pas la fidélité aveugle à une ancienne architecture.**

Si une décision technique doit être prise, choisis la solution qui offre le meilleur compromis entre :

- fonctionnement réel ;
- simplicité ;
- coût ;
- performance ;
- sécurité ;
- évolutivité ;
- facilité de maintenance ;
- expérience utilisateur.

Et surtout :

**ne transforme pas les fonctionnalités importantes en simples placeholders sans nécessité.**

Le résultat doit être une base réellement exploitable et extensible.
