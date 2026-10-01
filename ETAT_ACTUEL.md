# ÉTAT ACTUEL DU PROJET — document de référence unique

> **À lire avant toute proposition de modification, par n'importe quelle session (IA ou humaine).**
> **À mettre à jour après tout travail significatif.**

## Pourquoi ce document existe

Plusieurs sessions ont travaillé sur ce projet, parfois en parallèle, avec des documents de
référence différents (`CAHIER_DES_CHARGES_DEFINITIF_LABO_ELECTRONIQUE_VIRTUEL.md`,
`RAPPORT-FINAL.md`, `NOTES_EXIGENCES_EN_COURS.md`, `NOTES_REPRISE_2026.md`). Deux problèmes
concrets en ont résulté :

1. Une fusion Git a silencieusement effacé un renommage ("CAO 3D" → "Dessin technique") en
   remplaçant un fichier entier par une copie plus ancienne, sans qu'aucun test ne le détecte.
2. Un cahier des charges externe a recommandé de "construire" des fonctionnalités (aimantation
   des fils, diagnostic électrique) déjà présentes et plus avancées dans le vrai code, parce
   qu'il avait été écrit sans consulter le dépôt réel.

**Règle à suivre par toute session future : vérifier ce fichier ET le code réel avant de croire
qu'une fonctionnalité manque ou qu'un renommage a été fait.** Les quatre documents ci-dessus
restent comme historique détaillé (addenda numérotés, décisions argumentées) — ce fichier-ci ne
les remplace pas, il donne juste la photo actuelle en un seul endroit.

## Architecture générale (depuis la séparation Élec / Plan technique)

Un projet appartient à l'une de ces deux branches **dès sa création**, de façon strictement
séparée — ce n'est plus une pile d'onglets partagée sur un même document :

- **Branche Élec** (Électronique, Électrotechnique, Électricité du bâtiment, Énergies
  renouvelables, Automatisme & commande) → onglets Schéma, Dimensionnement, Devis uniquement.
- **Branche Plan technique** → deux types, sans aucun Schéma/Dimensionnement/Devis :
  - *Plan architectural* : 2D (`js/plan.js`) + 3D (`js/plan3d.js`)
  - *Dessin technique* : 3D uniquement pour l'instant (`js/cao3d.js`, ex-"CAO 3D") — pas de 2D

Un garde-fou central (`js/app.js`) redirige automatiquement si on tape l'URL d'un onglet qui
n'appartient pas à la branche du projet.

## Ce qui est fait et fonctionne (vérifié par les tests automatisés)

**Éditeur de schéma (branche Élec)**
- Placement de composants, catalogue de 522 composants avec recherche hybride, favoris, récents
- Traçage de fils : orthogonal (coude à 90°, règle `P0→(x1,y0)→P1`), verrouillage de l'axe sur
  le premier mouvement, aimantation sur les bornes ET sur un fil existant (jonction en T),
  traçage libre possible sans toucher aucune borne (accroché à la grille, continuité électrique
  par coïncidence de coordonnées) — fonctionnalité délibérée du client, pas une anomalie
- Diagnostic électrique : court-circuit direct, instrument mal branché, analyse de connexité
- Menu contextuel (clic droit / appui long), remplacement de composant par variante
- Annuler/rétablir, tactile complet (déplacer/tracer/pan)
- Export PDF/SVG/PNG/JSON, cartouche avec logo unifié interface+PDF
- Constructeur de composant personnalisé (gabarit rectangulaire ou circulaire, import JSON)
- Calques, couleur des fils (palette libre) et des composants

**Dimensionnement et Devis (branche Élec)**
- Calculs automatiques depuis le schéma (sections de câble, protections, PV/batterie, éolien,
  hydraulique, solaire thermique), jamais imposés, toujours modifiables
- Devis multi-devises (XOF, EUR, etc.), jamais une seule monnaie imposée

**Plan architectural (branche Plan technique)**
- Plan 2D : murs, portes, fenêtres, pièces avec surface, équipements électriques, cotation
- Vue 3D du bâtiment : niveaux, toiture, matériaux, coupe
- Partage en lecture seule vérifié et verrouillé correctement
- Export PDF avec logo partagé dans le cartouche

**Dessin technique / CAO 3D (branche Plan technique)**
- Pièces paramétriques, bibliothèque de pièces standard (vis/écrou/rondelle/profilé/engrenage)
- Esquisse extrudée et révolution, dessinables à la souris ou par saisie numérique
- Assemblage par positionnement, matériaux/masse, coupe, export STL et DXF (profil 2D)

**Comptes et collaboration**
- Authentification Supabase (e-mail + mot de passe), profils, rôles
- Partage de projet (lecture/édition), notifications
- Messagerie privée entre utilisateurs : le code et les règles de sécurité (RLS) sont corrects
  et testés localement ; **non vérifié en conditions réelles** (voir section suivante)

**Référencement (SEO)**
- Meta description, robots.txt, sitemap.xml vers l'URL réelle du site, URL canonique

## Ce qui dépend d'une action du client, pas du code

- **Messagerie / visibilité entre utilisateurs** : le schéma SQL (`supabase/schema.sql`) a été
  rendu entièrement idempotent (peut être recollé et relancé sans risque dans le SQL Editor
  Supabase à tout moment). L'hypothèse la plus probable du problème signalé (utilisateurs
  invisibles entre eux) est qu'une version plus ancienne de ce fichier a été exécutée sur le
  vrai projet Supabase, sans les dernières policies. **Action nécessaire côté client** :
  ré-exécuter `supabase/schema.sql` en entier, puis tester avec deux comptes réels.
- **Indexation Google** : les éléments techniques sont en place côté code (meta, robots,
  sitemap). L'apparition effective dans les résultats de recherche dépend de Google lui-même
  (soumission à Search Console, délai d'indexation) — ce n'est pas quelque chose qu'une
  modification de code peut garantir.
- **Vérification visuelle réelle** : toute la validation faite par une session IA reste au
  niveau DOM simulé (Node + jsdom) — jamais un rendu pixel réel dans un vrai navigateur. Les
  jugements purement visuels (proportions des symboles, densité de la barre d'outils) restent
  à confirmer par un humain sur le site déployé.

## Explicitement reporté (choix assumé, pas un oubli)

- Catalogue étendu à 900 composants (objectif initial, 522 aujourd'hui) — secondaire tant que
  la qualité des symboles existants n'est pas jugée insuffisante
- Opérations booléennes 3D générales (union/soustraction entre solides quelconques) —
  nécessiterait une bibliothèque CSG dédiée, pas ajoutée pour l'instant
- Modèle électrique/simulation pour un composant personnalisé ou importé (seul le symbole
  graphique est couvert)
- Mode hors-ligne (PWA) — pas commencé
- Bascule de normes de symboles CEI/NEMA — pas commencé
- Couleurs de fils alignées sur les vraies normes électriques (phase/neutre/terre nommés, en
  plus de la palette esthétique actuelle) — pas commencé
- Restructuration complète du menu "Mon espace" (Tableau de bord, Modèles, Cours & TP,
  Bibliothèque 3D, Aide) — actée avec le client, pas encore exécutée
- Sidebar escamotable / mode plein écran du canevas — pas commencé

## Pour toute session qui reprend ce projet

1. Lire ce fichier en entier avant de proposer quoi que ce soit.
2. Vérifier dans le vrai code (`grep`, lecture directe) avant de croire qu'une fonctionnalité
   manque — un document externe ou une mémoire de conversation peut être dépassé.
3. `npm test` et `node tests/verify_catalog.js` avant tout commit.
4. Toujours `git fetch` avant de pousser — plusieurs sessions travaillent sur ce dépôt.
5. Mettre à jour ce fichier à la fin de tout travail qui change l'état décrit ci-dessus.
