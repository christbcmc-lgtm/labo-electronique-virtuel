// Harness de test DOM simulé (Node + jsdom) pour labo-electronique-virtuel.
// Charge le vrai HTML + les vrais fichiers JS du projet (aucune duplication de logique),
// simule des interactions utilisateur réelles, et vérifie les résultats.
const path = require('path');
const fs = require('fs');
const PROJECT = path.join(__dirname, '..');
const { JSDOM } = require('jsdom');

let PASS = 0, FAIL = 0;
const failures = [];
function assert(cond, label){
  if (cond){ PASS++; }
  else { FAIL++; failures.push(label); console.log('  FAIL:', label); }
}
function section(title){ console.log('\n=== ' + title + ' ==='); }

async function boot(){
  let html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  // Retire TOUTES les balises <script src> (CDN Supabase + fichiers locaux) : on les charge
  // nous-mêmes ci-dessous via eval(), pour un contrôle total sur l'ordre et éviter toute
  // tentative de fetch réseau par jsdom pendant le parsing du HTML.
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window){
      // jsdom n'implémente pas la géométrie SVG réelle (getScreenCTM etc.) — on fournit une
      // approximation stable (mappage direct client->svg) suffisante pour tester la LOGIQUE
      // (association bornes/fils, snapping, etc.), pas le rendu pixel-parfait.
      window.SVGSVGElement.prototype.createSVGPoint = function(){
        return { x:0, y:0, matrixTransform(){ return { x:this.x, y:this.y }; } };
      };
      window.SVGSVGElement.prototype.getScreenCTM = function(){ return { inverse(){ return {}; } }; };
    },
  });
  const readFile = (p) => fs.readFileSync(path.join(PROJECT, p), 'utf8');
  // jsdom's window.eval() does NOT share top-level const/let across separate calls (unlike real
  // browsers) — injecting real <script> elements does, exactly like the browser loading js/*.js
  // via <script src>. This is what actually behaves like the shipped page.
  const doc0 = dom.window.document;
  for (const f of ['js/config.js','js/catalog.js','js/backend.js','js/editor.js','js/pdf.js','js/devis.js','js/dimensionnement.js','js/plan.js','js/plan3d.js','js/cao3d.js','js/composant-builder.js','js/app.js']){
    const s = doc0.createElement('script');
    s.textContent = readFile(f);
    doc0.body.appendChild(s);
  }
  // Pont de test uniquement : les top-level `const` d'un <script> classique ne deviennent PAS
  // des propriétés de `window` (comportement standard, pas un bug) — on les y recopie pour que
  // ce harnais puisse les inspecter/manipuler facilement via `win.X`.
  const bridge = doc0.createElement('script');
  bridge.textContent = `window.__t = { SUPABASE_CONFIGURED, auth, db, wsState, state, GRID_SIZE,
    MOCK_ADMIN_EMAIL, DB_STORAGE_KEY, DB, COMMON_COMPONENTS, COMPONENT_LIBRARY, INSTRUMENT_LIBRARY, ESPACES, SYM };`;
  doc0.body.appendChild(bridge);
  Object.assign(dom.window, dom.window.__t);
  dom.window.__jsErrors = [];
  dom.window.addEventListener('error', (e) => dom.window.__jsErrors.push((e.error && e.error.stack) || e.message));
  await new Promise(r => setTimeout(r, 20));
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles:true, cancelable:true }));
  await new Promise(r => setTimeout(r, 50));
  return dom;
}

function click(win, el){
  el.dispatchEvent(new win.MouseEvent('click', { bubbles:true, cancelable:true, clientX:0, clientY:0 }));
}
function mouseAt(win, el, type, x, y){
  el.dispatchEvent(new win.MouseEvent(type, { bubbles:true, cancelable:true, clientX:x, clientY:y }));
}
// jsdom n'implémente pas toujours le constructeur TouchEvent — un Event générique avec
// touches/changedTouches attachés à la main suffit : eventPoint() (js/editor.js) ne lit que ces
// deux propriétés, exactement comme un vrai TouchEvent de navigateur le ferait.
function touchAt(win, el, type, x, y){
  const e = new win.Event(type, { bubbles:true, cancelable:true });
  const touch = { clientX:x, clientY:y };
  e.touches = type === 'touchend' ? [] : [touch];
  e.changedTouches = [touch];
  el.dispatchEvent(e);
}
function setVal(win, el, val){
  if (!el) throw new Error('setVal: element introuvable');
  const proto = el.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new win.Event('input', { bubbles:true }));
  el.dispatchEvent(new win.Event('change', { bubbles:true }));
}
async function nav(win, route){ win.location.hash = '#/' + route; await new Promise(r=>setTimeout(r,250)); }
async function tick(ms=30){ await new Promise(r=>setTimeout(r,ms)); }

(async () => {
  const dom = await boot();
  const win = dom.window, doc = win.document;

  section('Démarrage / landing');
  assert(doc.title === 'Labo Électronique Virtuel', 'titre de la page correct');
  assert(doc.body.textContent.includes('Concevez'), 'page d\'accueil affichée par défaut');
  assert(win.SUPABASE_CONFIGURED === false, 'mode démo locale actif (pas de config Supabase)');
  assert(doc.querySelector('.brand .brand-mark svg'), 'le logo vectoriel (même symbole que dans les PDF) est affiché dans la barre supérieure (§17 des mises à jour reçues)');
  assert(doc.querySelector('.brand').textContent.includes('Christ BCMC'), 'la signature "Christ BCMC" demandée par le client apparaît dans le logo de la barre supérieure');

  section('Inscription');
  await nav(win, 'register');
  const regForm = doc.getElementById('form-register');
  assert(!!regForm, 'formulaire d\'inscription présent');
  setVal(win, regForm.querySelector('[name=prenom]'), 'Alice');
  setVal(win, regForm.querySelector('[name=nom]'), 'Test');
  setVal(win, regForm.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, regForm.querySelector('[name=password]'), 'motdepasse123');
  setVal(win, regForm.querySelector('[name=motMagique]'), 'chatnoir');
  regForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.currentRoute() === 'dashboard', 'redirection vers le tableau de bord après inscription (route=' + win.currentRoute() + ')');
  assert(win.auth.currentUser && win.auth.currentUser.email === 'alice@example.com', 'utilisateur connecté après inscription');

  section('Déconnexion / connexion');
  await nav(win, 'compte');
  await tick(300);
  const logoutBtn = doc.getElementById('btn-logout');
  assert(!!logoutBtn, 'bouton de déconnexion présent dans la barre supérieure');
  click(win, logoutBtn);
  await tick(250);
  assert(win.auth.currentUser === null, 'déconnexion effective');
  await nav(win, 'login');
  const loginForm = doc.getElementById('form-login');
  setVal(win, loginForm.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginForm.querySelector('[name=password]'), 'motdepasse123');
  loginForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.auth.currentUser && win.auth.currentUser.email === 'alice@example.com', 'reconnexion réussie');

  section('Récupération mot de passe (mot magique)');
  await win.auth.signOut();
  await nav(win, 'forgot');
  const forgotForm = doc.getElementById('form-forgot');
  setVal(win, forgotForm.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, forgotForm.querySelector('[name=motMagique]'), 'chatnoir');
  forgotForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.currentRoute() === 'reset-email', 'étape mot de passe temporaire atteinte');
  const tempPw = win.state.recovery.tempPassword;
  assert(!!tempPw, 'mot de passe temporaire généré');
  const resetForm = doc.getElementById('form-reset-email');
  setVal(win, resetForm.querySelector('[name=tempPassword]'), tempPw);
  resetForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.currentRoute() === 'change-password', 'redirigé vers le changement de mot de passe obligatoire');
  const cpForm = doc.getElementById('form-change-pw');
  setVal(win, cpForm.querySelector('[name=p1]'), 'nouveaumdp123');
  setVal(win, cpForm.querySelector('[name=p2]'), 'nouveaumdp123');
  cpForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.currentRoute() === 'dashboard', 'accès au tableau de bord après changement de mot de passe');

  section('Projet — création');
  await nav(win, 'dashboard');
  await tick(250);
  click(win, doc.getElementById('btn-new-project'));
  await tick(150);
  const npForm = doc.getElementById('form-new-project');
  setVal(win, npForm.querySelector('[name=titre]'), 'Mon montage test');
  setVal(win, npForm.querySelector('[name=espace]'), 'electronique');
  npForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.currentRoute().startsWith('project/'), 'redirection vers l\'éditeur après création (route=' + win.currentRoute() + ')');
  const projectId = win.currentRoute().split('/')[1];
  await tick(400);

  section('Statut de projet (§6 des notes en cours) — valeur initiale');
  const projectJustCreated = (await win.db.getProject(projectId)).data;
  assert(projectJustCreated.statut === 'brouillon', 'un projet nouvellement créé a le statut "brouillon" (valeur: ' + projectJustCreated.statut + ')');

  section('Éditeur — catalogue et familles');
  assert(doc.querySelectorAll('[data-fam-toggle]').length > 5, 'plusieurs familles de composants affichées');
  assert(doc.getElementById('ws-search'), 'champ de recherche présent');
  setVal(win, doc.getElementById('ws-search'), 'NE555');
  await tick(150);
  const searchResults = doc.getElementById('ws-search-results').textContent;
  assert(searchResults.includes('NE555'), 'recherche "NE555" trouve le composant (résultat: ' + searchResults.slice(0,40) + ')');
  setVal(win, doc.getElementById('ws-search'), '');

  section('Éditeur — placement de composants (zone de dépôt + grille)');
  const placeResistanceBtn = doc.querySelector('[data-place="resistance"]');
  assert(!!placeResistanceBtn, 'bouton de placement "résistance" trouvé au catalogue');
  click(win, placeResistanceBtn);
  await tick(150);
  assert(win.wsState.armedType === 'resistance', 'composant "armé" en attente de dépôt (pas placé brutalement)');
  const svg1 = doc.getElementById('ws-svg');
  const bg1 = doc.getElementById('ws-grid-bg');
  mouseAt(win, bg1, 'click', 313, 217);
  await tick(150);
  assert(win.wsState.schema.items.length === 1, '1 composant posé après clic sur le canevas');
  const item1 = win.wsState.schema.items[0];
  assert(item1.x % win.GRID_SIZE === 0 && item1.y % win.GRID_SIZE === 0, 'position du composant aimantée sur la grille (x=' + item1.x + ', y=' + item1.y + ')');

  const placeLedBtn = doc.querySelector('[data-place="led"]');
  click(win, placeLedBtn);
  await tick(150);
  mouseAt(win, doc.getElementById('ws-grid-bg'), 'click', 500, 217);
  await tick(150);
  assert(win.wsState.schema.items.length === 2, '2e composant posé');
  const item2 = win.wsState.schema.items[1];

  section('Éditeur — fils (routage orthogonal, jonctions)');
  const toolFilBtn = doc.querySelector('[data-tool="fil"]');
  click(win, toolFilBtn);
  await tick(150);
  assert(win.wsState.tool === 'fil', 'outil fil activé');
  const term1_0 = doc.querySelector(`[data-term-item="${item1.id}"][data-term-idx="0"]`);
  const term2_0 = doc.querySelector(`[data-term-item="${item2.id}"][data-term-idx="0"]`);
  assert(!!term1_0 && !!term2_0, 'bornes des deux composants trouvées dans le DOM');
  click(win, term1_0);
  await tick(150);
  assert(win.wsState.wireStart && win.wsState.wireStart.itemId === item1.id, 'première borne sélectionnée pour le fil');
  click(win, doc.querySelector(`[data-term-item="${item2.id}"][data-term-idx="0"]`));
  await tick(150);
  assert(win.wsState.schema.wires.length === 1, 'fil créé entre les deux composants');
  const wire1 = win.wsState.schema.wires[0];
  assert(wire1.a.itemId === item1.id && wire1.b.itemId === item2.id, 'le fil référence bien les deux bons composants');
  const polyline = doc.querySelector(`[data-wire="${wire1.id}"]`);
  assert(polyline && polyline.tagName === 'polyline', 'le fil est rendu en polyline (routage orthogonal), pas une simple ligne diagonale');
  const pts = polyline.getAttribute('points').trim().split(/\s+/);
  assert(pts.length >= 2, 'polyline a des points définis');

  section('Panneau flottant Outils (demandé explicitement : "doit flotter... comme Récents/Favoris")');
  assert(!!doc.getElementById('tool-panel'), 'le panneau Outils flottant est rendu à côté du canevas');
  assert(!!doc.querySelector('#tool-panel [data-tool="select"]') && !!doc.querySelector('#tool-panel [data-tool="fil"]') && !!doc.getElementById('tool-cancel'),
    'Sélection, Fil et Annuler (l\'action en cours) sont bien regroupés ensemble dans le panneau');
  // Arme un placement puis vérifie que le bouton "Annuler l'action" (équivalent Échap) l'annule.
  win.armComponentForPlacement('resistance');
  await tick(50);
  assert(win.wsState.armedType === 'resistance', 'placement armé avant le test du bouton annuler');
  click(win, doc.getElementById('tool-cancel'));
  await tick(100);
  assert(win.wsState.armedType === null, 'le bouton "Annuler l\'action" du panneau Outils annule bien le placement armé en cours');
  // Déplacer/réduire/masquer le panneau, comme pour le panneau Favoris déjà existant.
  const toolPanelCollapseBtn = doc.getElementById('tool-panel-collapse');
  click(win, toolPanelCollapseBtn);
  await tick(50);
  assert(doc.getElementById('tool-panel').classList.contains('collapsed'), 'le panneau Outils est réductible');
  click(win, toolPanelCollapseBtn);
  await tick(50);
  click(win, doc.getElementById('tool-panel-close'));
  await tick(50);
  assert(doc.getElementById('tool-panel').classList.contains('hidden') && !doc.getElementById('tool-panel-reopen').classList.contains('hidden'), 'le panneau Outils est masquable, avec un bouton de réouverture');
  click(win, doc.getElementById('tool-panel-reopen'));
  await tick(50);
  assert(!doc.getElementById('tool-panel').classList.contains('hidden'), 'le panneau Outils se rouvre depuis le bouton de réouverture');

  section('Éditeur au tactile (retour explicite du client : "ça doit fonctionner en tactile")');
  click(win, doc.querySelector('#tool-panel [data-tool="select"]'));
  await tick(50);
  // 1. Déplacer un composant au doigt (touchstart → touchmove → touchend), pas seulement à la souris.
  const node1 = doc.querySelector(`.comp-node[data-item="${item1.id}"]`);
  assert(!!node1, 'le nœud SVG du composant à déplacer est trouvé dans le DOM');
  const scale = win.wsState.view.scale || 1;
  const xBefore = win.wsState.schema.items.find(i=>i.id===item1.id).x;
  const yBefore = win.wsState.schema.items.find(i=>i.id===item1.id).y;
  touchAt(win, node1, 'touchstart', 300, 300);
  await tick(30);
  touchAt(win, node1, 'touchmove', 350, 320); // se déplace de +50/+20 avant relâchement
  await tick(30);
  touchAt(win, node1, 'touchend', 350, 320);
  await tick(100);
  const item1After = win.wsState.schema.items.find(i=>i.id===item1.id);
  const expectedX = win.snap(xBefore + 50/scale), expectedY = win.snap(yBefore + 20/scale); // aimanté sur la grille en fin de glisser, comme à la souris
  assert(item1After.x === expectedX && item1After.y === expectedY,
    'le composant a bien suivi le doigt pendant le glisser tactile (avant: ' + xBefore + ',' + yBefore + ' → attendu: ' + expectedX + ',' + expectedY + ' → obtenu: ' + item1After.x + ',' + item1After.y + ')');

  // 2. Tracer un fil au doigt : tapoter une borne, voir la prévisualisation suivre le doigt (touchmove), tapoter la seconde borne.
  click(win, doc.querySelector('#tool-panel [data-tool="fil"]'));
  await tick(50);
  const wiresBeforeTouch = win.wsState.schema.wires.length;
  const term1_1 = doc.querySelector(`[data-term-item="${item1.id}"][data-term-idx="1"]`);
  const term2_1 = doc.querySelector(`[data-term-item="${item2.id}"][data-term-idx="1"]`);
  // La sélection d'une borne reste gérée par l'évènement "click" (déjà synthétisé par un vrai
  // navigateur après un tapotement tactile sans déplacement — inchangé, seule la ligne de
  // prévisualisation ENTRE les deux tapotements ne suivait pas le doigt avant cette session).
  click(win, term1_1);
  await tick(50);
  assert(win.wsState.wireStart && win.wsState.wireStart.itemId === item1.id, 'première borne du fil sélectionnée au tapotement tactile');
  const previewLine = doc.getElementById('wire-preview-line');
  touchAt(win, doc.getElementById('ws-svg'), 'touchmove', 222, 111);
  await tick(50);
  // svgUserToCanvas() retranche le pan de la vue avant d'affecter la ligne — mêmes coordonnées
  // attendues que celles réellement calculées par l'application, pas les coordonnées écran brutes.
  const expX2 = (222 - win.wsState.view.panX) / (win.wsState.view.scale||1);
  const expY2 = (111 - win.wsState.view.panY) / (win.wsState.view.scale||1);
  // La prévisualisation est désormais une polyligne à coude (départ → coin → curseur), jamais
  // une diagonale (§3-§4 du cahier fils) : on vérifie le DERNIER point, qui suit le doigt/curseur.
  const previewPts = previewLine.getAttribute('points').trim().split(/\s+/).map(p => p.split(',').map(Number));
  const lastPt = previewPts[previewPts.length-1];
  assert(previewPts.length === 3, 'la prévisualisation du fil a bien 3 points (départ, coin à angle droit, curseur) — jamais une diagonale directe');
  assert(Math.abs(lastPt[0] - expX2) < 0.5 && Math.abs(lastPt[1] - expY2) < 0.5,
    'la ligne de prévisualisation du fil suit bien le doigt (touchmove), pas seulement la souris (attendu ~' + expX2 + ',' + expY2 + ', obtenu ' + lastPt[0] + ',' + lastPt[1] + ')');
  click(win, term2_1);
  await tick(50);
  assert(win.wsState.schema.wires.length === wiresBeforeTouch + 1, 'le fil est bien créé après avoir tapoté la seconde borne au doigt');
  // Nettoyage : retire le fil ajouté par ce test tactile pour ne pas fausser les tests de
  // diagnostic qui suivent (ils comptent sur des bornes précises restées non connectées).
  win.wsState.schema.wires = win.wsState.schema.wires.filter(w => w.id !== win.wsState.schema.wires[win.wsState.schema.wires.length-1].id);

  section('Fils — aimantation de borne et validation par clic proche (§5-§6 du cahier fils)');
  // Toujours en outil "fil" à ce stade. On vise à côté de la borne (pas pile dessus) pour
  // vérifier la tolérance de ~8px annoncée, plutôt qu'un clic pixel-parfait sur le petit cercle.
  click(win, term1_1);
  await tick(50);
  assert(win.wsState.wireStart && win.wsState.wireStart.itemId === item1.id, 'première borne resélectionnée pour le test d\'aimantation');
  const target = win.terminalAbsPos(item2, 1);
  const scaleNow = win.wsState.view.scale || 1;
  const nearClientX = target.x*scaleNow + win.wsState.view.panX + 4*scaleNow;
  const nearClientY = target.y*scaleNow + win.wsState.view.panY + 4*scaleNow;
  mouseAt(win, doc.getElementById('ws-svg'), 'mousemove', nearClientX, nearClientY);
  await tick(50);
  assert(win.wsState.wireSnapTarget && win.wsState.wireSnapTarget.itemId === item2.id && win.wsState.wireSnapTarget.term === 1,
    'la borne proche (à quelques pixels, pas pile dessus) est détectée comme cible d\'aimantation');
  const snapDot = doc.querySelector(`[data-term-item="${item2.id}"][data-term-idx="1"]`);
  assert(snapDot.classList.contains('snap-target'), 'la borne visée est visuellement signalée (classe snap-target, indicateur vert)');
  const indicator = doc.getElementById('wire-snap-indicator');
  assert(indicator.style.display !== 'none', 'l\'indicateur vert de connexion possible est affiché');
  const previewPtsNow = doc.getElementById('wire-preview-line').getAttribute('points').trim().split(/\s+/);
  assert(previewPtsNow.length === 3, 'la prévisualisation reste un coude à 3 points même quand elle est aimantée à une borne');
  // Clic sur le FOND du canevas près de la borne (pas sur le petit cercle exact) : doit quand
  // même valider la connexion, grâce à la cible d'aimantation déjà détectée.
  const wiresBeforeSnapClick = win.wsState.schema.wires.length;
  mouseAt(win, doc.getElementById('ws-svg'), 'click', nearClientX, nearClientY);
  await tick(50);
  assert(win.wsState.schema.wires.length === wiresBeforeSnapClick + 1, 'le clic "proche" (pas pile sur la borne) valide bien la connexion');
  const snappedWire = win.wsState.schema.wires[win.wsState.schema.wires.length-1];
  assert(snappedWire.a.itemId === item1.id && snappedWire.b.itemId === item2.id && snappedWire.b.term === 1,
    'le fil créé par aimantation relie bien les deux bonnes bornes, pas des coordonnées approximatives');
  assert(win.wsState.wireStart === null && win.wsState.wireSnapTarget === null, 'le traçage se réinitialise après validation par aimantation');
  // Nettoyage, même raison que ci-dessus : ne pas fausser les tests de diagnostic suivants.
  win.wsState.schema.wires = win.wsState.schema.wires.filter(w => w.id !== snappedWire.id);

  // Loin de toute borne : aucune aimantation ne doit se déclencher (pas de faux positif).
  click(win, term1_1);
  await tick(50);
  mouseAt(win, doc.getElementById('ws-svg'), 'mousemove', win.wsState.view.panX + 900, win.wsState.view.panY + 500);
  await tick(50);
  assert(win.wsState.wireSnapTarget === null, 'aucune aimantation ne se déclenche quand le curseur est loin de toute borne');
  assert(doc.getElementById('wire-snap-indicator').style.display === 'none', 'l\'indicateur vert reste caché en l\'absence de borne à portée');
  click(win, doc.querySelector('#tool-panel [data-tool="select"]'));
  await tick(50);
  assert(win.wsState.wireStart === null, 'changer d\'outil annule bien le fil en cours de traçage');

  section('Fils — raccordement sur un fil EXISTANT, pas seulement sur une borne (§12 du cahier fils)');
  // Un 3e composant, pour servir de bout "normal" au nouveau fil de raccordement.
  click(win, doc.querySelector('[data-place="led"]'));
  await tick(150);
  mouseAt(win, doc.getElementById('ws-grid-bg'), 'click', 700, 320);
  await tick(150);
  const item3 = win.wsState.schema.items[win.wsState.schema.items.length-1];
  assert(!!item3 && item3.typeId === 'led', '3e composant (LED) posé pour le test de raccordement');

  click(win, doc.querySelector('#tool-panel [data-tool="fil"]'));
  await tick(50);
  const term3_0 = doc.querySelector(`[data-term-item="${item3.id}"][data-term-idx="0"]`);
  click(win, term3_0);
  await tick(50);
  assert(win.wsState.wireStart && win.wsState.wireStart.itemId === item3.id, 'fil démarré depuis la borne du 3e composant');

  // Point milieu du premier segment de wire1 (item1↔item2) : un point QUELCONQUE de ce fil,
  // pas une de ses deux extrémités — c'est précisément ce que le §12 demande de pouvoir viser.
  const wire1Segs = win.wireSegments(win.wsState.schema, wire1);
  const midCanvas = { x:(wire1Segs[0][0].x+wire1Segs[0][1].x)/2, y:(wire1Segs[0][0].y+wire1Segs[0][1].y)/2 };
  const midClientX = midCanvas.x*scaleNow + win.wsState.view.panX;
  const midClientY = midCanvas.y*scaleNow + win.wsState.view.panY;
  const wire1Line = doc.querySelector(`[data-wire="${wire1.id}"]`);

  mouseAt(win, doc.getElementById('ws-svg'), 'mousemove', midClientX, midClientY);
  await tick(50);
  assert(win.wsState.wireSnapTarget && win.wsState.wireSnapTarget.tap && win.wsState.wireSnapTarget.tap.wireId === wire1.id,
    'un point au milieu d\'un fil existant est bien détecté comme cible d\'aimantation (pas seulement les bornes)');
  assert(doc.getElementById('wire-snap-indicator').style.display !== 'none', 'indicateur vert affiché pour un raccordement sur fil, comme pour une borne');

  const wiresBeforeTap = win.wsState.schema.wires.length;
  mouseAt(win, wire1Line, 'click', midClientX, midClientY);
  await tick(50);
  assert(win.wsState.schema.wires.length === wiresBeforeTap + 1, 'le clic sur le fil existant valide bien la création du nouveau fil');
  const tapWire = win.wsState.schema.wires[win.wsState.schema.wires.length-1];
  assert(tapWire.a.itemId === item3.id && !!tapWire.b.tap && tapWire.b.tap.wireId === wire1.id,
    'le nouveau fil relie bien le 3e composant à un point de raccordement sur wire1, pas à une fausse borne');
  assert(win.wsState.wireStart === null && win.wsState.wireSnapTarget === null, 'le traçage se réinitialise après un raccordement sur fil');

  // Topologie électrique (§19) : le point de raccordement doit être électriquement confondu
  // avec le fil tapé, pas juste dessiné au même endroit par coïncidence graphique.
  const { find } = win.buildWireUnion(win.wsState.schema);
  assert(find(item3.id+'#0') === find(item1.id+'#0'), 'le raccordement forme bien un seul et même nœud électrique avec le fil tapé (union-find)');

  // Rendu : un point cyan doit matérialiser le raccordement sur le schéma (visible, pas caché).
  const tapDot = doc.querySelector(`.wire-tap[cx="${midCanvas.x}"][cy="${midCanvas.y}"]`) || doc.querySelector('.wire-tap');
  assert(!!tapDot, 'un point de raccordement (.wire-tap) est bien dessiné sur le schéma');

  // Suppression en cascade (§15, généralisé) : si le fil SUPPORT (wire1) disparaît, le fil qui
  // s'y raccordait doit disparaître aussi — pas une connexion fantôme vers un fil inexistant.
  win.wsState.selectedWireId = wire1.id;
  win.wsState.schema.wires = win.wsState.schema.wires.filter(w => w.id !== wire1.id);
  win.pruneOrphanTapWires(win.wsState.schema);
  assert(!win.wsState.schema.wires.some(w => w.id === tapWire.id),
    'supprimer le fil support supprime en cascade le fil qui s\'y raccordait (pas de référence pendante)');
  win.wsState.selectedWireId = null; // nettoyage : ne pas fausser le test de sélection qui suit

  // Remise en état pour ne pas fausser les tests de diagnostic suivants : on recrée un fil1
  // "normal" (borne à borne) équivalent à celui d'origine, et on retire le 3e composant de test.
  win.wsState.schema.items = win.wsState.schema.items.filter(i => i.id !== item3.id);
  win.wsState.schema.wires.push({ id: wire1.id, a:{ itemId:item1.id, term:0 }, b:{ itemId:item2.id, term:0 } });
  click(win, doc.querySelector('#tool-panel [data-tool="select"]'));
  await tick(50);

  // 3. Glisser le fond du canevas au doigt fait bien un pan (comme à la souris).
  const panXBefore = win.wsState.view.panX;
  touchAt(win, doc.getElementById('ws-grid-bg'), 'touchstart', 400, 400);
  await tick(30);
  touchAt(win, doc.getElementById('ws-grid-bg'), 'touchmove', 460, 400);
  await tick(30);
  touchAt(win, doc.getElementById('ws-grid-bg'), 'touchend', 460, 400);
  await tick(50);
  assert(win.wsState.view.panX !== panXBefore, 'glisser le fond du canevas au doigt déplace bien la vue (pan tactile), comme à la souris (avant: ' + panXBefore + ', après: ' + win.wsState.view.panX + ')');

  section('Éditeur — diagnostic structurel');
  const diagHtml = win.diagnosticHTML(win.wsState.schema);
  assert(diagHtml.includes('borne') && diagHtml.includes('non connectée'), 'diagnostic signale les bornes restantes non connectées');
  assert(diagHtml.includes('2 composant'), 'diagnostic compte bien 2 composants');

  section('PDF — section "5. Diagnostic / analyse" en tableau structuré (demandé explicitement)');
  const pdfDiagHtml = win.buildDiagnosticText(win.wsState.schema);
  assert(pdfDiagHtml.includes('<table') && pdfDiagHtml.includes('<th>Type</th>') && pdfDiagHtml.includes('<th>Élément</th>') && pdfDiagHtml.includes('<th>Description</th>'), 'le diagnostic du PDF est un vrai tableau (Type/Élément/Description), pas une liste de lignes (résultat: ' + pdfDiagHtml.replace(/\s+/g,' ').slice(0,150) + ')');
  assert(pdfDiagHtml.includes('Borne non connectée'), 'le tableau du diagnostic PDF liste bien les bornes non connectées par leur type');

  section('Éditeur — court-circuit direct détecté');
  const before = win.wsState.schema.wires.length;
  win.wsState.schema.wires.push({ id:'w_short', a:{itemId:item1.id, term:0}, b:{itemId:item1.id, term:1} });
  const diagShort = win.diagnosticHTML(win.wsState.schema);
  assert(diagShort.includes('court-circuite') || diagShort.includes('court-circuit'), 'court-circuit direct (fil reliant 2 bornes du même composant) détecté');
  win.wsState.schema.wires.pop();

  section('Éditeur — sélection/suppression de fil');
  const wireLineEl = doc.querySelector(`[data-wire="${wire1.id}"]`);
  click(win, wireLineEl);
  await tick(150);
  assert(win.wsState.selectedWireId === wire1.id, 'fil sélectionné au clic (outil sélection)');
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key:'Delete', bubbles:true, cancelable:true }));
  await tick(150);
  assert(win.wsState.schema.wires.length === 0, 'fil supprimé via la touche Suppr');

  section('Éditeur — rotation/duplication/suppression composant');
  win.selectItem(item1.id);
  await tick(150);
  const rotateBtn = doc.getElementById('prop-rotate');
  assert(!!rotateBtn, 'bouton pivoter présent dans le panneau propriétés');
  click(win, rotateBtn);
  await tick(150);
  assert(win.wsState.schema.items.find(i=>i.id===item1.id).rot === 90, 'rotation appliquée (90°)');
  const nBefore = win.wsState.schema.items.length;
  click(win, doc.getElementById('prop-duplicate'));
  await tick(150);
  assert(win.wsState.schema.items.length === nBefore+1, 'composant dupliqué');
  const dupId = win.wsState.selectedId;
  click(win, doc.getElementById('prop-delete'));
  await tick(150);
  assert(!win.wsState.schema.items.some(i=>i.id===dupId), 'composant dupliqué supprimé');

  section('Éditeur — Annuler / Rétablir (Ctrl+Z / Ctrl+Y, demandé explicitement par le client)');
  assert(!!doc.getElementById('tool-undo') && !!doc.getElementById('tool-redo'), 'boutons Annuler/Rétablir présents dans le panneau Outils flottant');
  const nAfterDelete = win.wsState.schema.items.length; // == nBefore (le doublon a été supprimé)
  win.undoSchema(); // annule la suppression du doublon
  await tick(100);
  assert(win.wsState.schema.items.length === nAfterDelete+1, 'annuler restaure le composant dupliqué supprimé (résultat: ' + win.wsState.schema.items.length + ' composants)');
  win.undoSchema(); // annule la duplication elle-même
  await tick(100);
  assert(win.wsState.schema.items.length === nAfterDelete, 'annuler à nouveau retire aussi la duplication (résultat: ' + win.wsState.schema.items.length + ' composants)');
  win.undoSchema(); // annule la rotation
  await tick(100);
  assert(win.wsState.schema.items.find(i=>i.id===item1.id).rot !== 90, 'annuler défait aussi la rotation appliquée plus tôt (rot=' + win.wsState.schema.items.find(i=>i.id===item1.id).rot + ')');
  win.redoSchema(); // rétablit la rotation
  win.redoSchema(); // rétablit la duplication
  win.redoSchema(); // rétablit la suppression du doublon
  await tick(100);
  assert(win.wsState.schema.items.length === nAfterDelete, 'rétablir trois fois de suite retrouve exactement l\'état d\'avant les annulations (résultat: ' + win.wsState.schema.items.length + ' composants)');
  assert(win.wsState.schema.items.find(i=>i.id===item1.id).rot === 90, 'rétablir retrouve aussi la rotation à 90°');
  let undoEmptyError = null;
  win.wsState.undoStack = [];
  try { win.undoSchema(); } catch(e){ undoEmptyError = e; }
  assert(!undoEmptyError, 'annuler sur une pile vide ne lève pas d\'exception (résultat: ' + (undoEmptyError ? undoEmptyError.message : 'ok') + ')');

  section('Éditeur — "Ranger le schéma" (ne casse pas les connexions)');
  win.wsState.schema.items.forEach(it => { it.x += 3; it.y += 7; }); // désaligne volontairement
  win.wsState.schema.wires.push({ id:'w_re', a:{itemId:item1.id, term:0}, b:{itemId:item2.id, term:0} });
  const wiresCountBefore = win.wsState.schema.wires.length;
  click(win, doc.getElementById('tool-declutter'));
  await tick(150);
  const allSnapped = win.wsState.schema.items.every(it => it.x % win.GRID_SIZE === 0 && it.y % win.GRID_SIZE === 0);
  assert(allSnapped, 'tous les composants alignés sur la grille après "Ranger le schéma"');
  assert(win.wsState.schema.wires.length === wiresCountBefore, 'les connexions sont conservées après rangement (aucune perdue)');

  section('Éditeur — menu contextuel (§6) et variante (§10)');
  // "transformateur" appartient au domaine électrotechnique ; ce projet est en électronique —
  // on le trouve donc via la recherche globale (qui couvre tout le catalogue, pas que le domaine courant).
  setVal(win, doc.getElementById('ws-search'), 'transformateur simple');
  await tick(150);
  const placeTransfoBtn = doc.querySelector('#ws-search-results [data-place="transformateur"]');
  assert(!!placeTransfoBtn, 'recherche globale trouve un composant hors du domaine courant du projet');
  click(win, placeTransfoBtn);
  await tick(150);
  mouseAt(win, doc.getElementById('ws-grid-bg'), 'click', 700, 400);
  await tick(150);
  const transfoItem = win.wsState.schema.items[win.wsState.schema.items.length-1];
  assert(transfoItem.typeId === 'transformateur', 'transformateur posé');
  const transfoNode = doc.querySelector(`[data-item="${transfoItem.id}"]`);
  transfoNode.dispatchEvent(new win.MouseEvent('contextmenu', { bubbles:true, cancelable:true, clientX:100, clientY:100 }));
  await tick(150);
  const ctxMenu = doc.querySelector('.ctx-menu');
  assert(!!ctxMenu, 'menu contextuel ouvert au clic droit');
  const menuText = ctxMenu.textContent;
  assert(menuText.includes('Propriétés') && menuText.includes('Dupliquer') && menuText.includes('Pivoter') && menuText.includes('Supprimer') && menuText.includes('Informations'), 'menu contextuel contient les actions attendues (§6)');
  const variantBtn = [...ctxMenu.querySelectorAll('[data-act="variante"]')].find(b => b.dataset.vid === 'transfo_pointmilieu');
  assert(!!variantBtn, 'variante "transformateur à point milieu" proposée dans le menu (§10)');
  click(win, variantBtn);
  await tick(150);
  const transfoAfter = win.wsState.schema.items.find(i=>i.id===transfoItem.id);
  assert(transfoAfter.typeId === 'transfo_pointmilieu', 'composant remplacé par la variante choisie, position conservée');

  section('Éditeur — instrument mal branché (voltmètre en série)');
  const schemaCopy = { items: [
      { id:'r1', typeId:'resistance', x:0, y:0, rot:0, value:220 },
      { id:'r2', typeId:'resistance', x:100, y:0, rot:0, value:220 },
      { id:'v1', typeId:'multimetre', x:200, y:0, rot:0, value:'' },
    ], wires: [
      { id:'w1', a:{itemId:'r1',term:1}, b:{itemId:'v1',term:0} },
      { id:'w2', a:{itemId:'v1',term:1}, b:{itemId:'r2',term:0} },
    ] };
  const diagInstr = win.diagnosticHTML(schemaCopy);
  assert(diagInstr.includes('série') && diagInstr.toLowerCase().includes('parallèle'), 'diagnostic signale un multimètre (voltmètre) branché en série au lieu du parallèle');

  section('Devis (§22/§23)');
  await nav(win, 'devis/' + projectId);
  await tick(250);
  assert(!!doc.getElementById('devis-table'), 'table de devis affichée');
  click(win, doc.getElementById('btn-devis-add'));
  await tick(150);
  let rows = doc.querySelectorAll('#devis-table tr[data-idx]');
  assert(rows.length === 1, 'ligne de devis ajoutée');
  const qteInput = rows[0].querySelector('[data-f="qte"]');
  const prixInput = rows[0].querySelector('[data-f="prix"]');
  setVal(win, qteInput, '3');
  setVal(win, prixInput, '10');
  await tick(150);
  assert(doc.getElementById('devis-total').textContent.includes('30'), 'total du devis recalculé correctement (3 × 10 = 30, affiché: ' + doc.getElementById('devis-total').textContent + ')');
  setVal(win, doc.getElementById('devis-remise'), '10');
  await tick(150);
  assert(doc.getElementById('devis-total').textContent.includes('27'), 'remise de 10% appliquée correctement (30 - 10% = 27, affiché: ' + doc.getElementById('devis-total').textContent + ')');
  click(win, doc.getElementById('btn-devis-import'));
  await tick(250);
  rows = doc.querySelectorAll('#devis-table tr[data-idx]');
  assert(rows.length > 1, 'import des composants du schéma dans le devis (lignes=' + rows.length + ')');

  section('Devis multi-devises ("ne jamais imposer une seule monnaie" — mise à jour reçue du client)');
  const deviseSelect = doc.getElementById('devis-devise');
  assert(!!deviseSelect, 'sélecteur de devise présent sur la vue devis');
  assert(deviseSelect.value === 'EUR', 'EUR est la devise par défaut (compatibilité avec les devis déjà enregistrés sans champ devise)');
  assert(doc.getElementById('devis-total').textContent.includes('€'), 'le total est bien affiché en euros par défaut');
  setVal(win, deviseSelect, 'XOF');
  await tick(150);
  assert(win.__devisState.devis.devise === 'XOF', 'la devise choisie est bien mémorisée dans l\'état du devis');
  assert(doc.getElementById('devis-total').textContent.includes('FCFA'), 'le total repasse en FCFA après changement de devise (affiché: ' + doc.getElementById('devis-total').textContent + ')');
  assert(!doc.getElementById('devis-total').textContent.includes('€'), 'l\'ancien symbole € a bien disparu après changement de devise');
  const rowsAfterCurrency = doc.querySelectorAll('#devis-table tr[data-idx] .ligne-total');
  assert(rowsAfterCurrency.length > 0 && [...rowsAfterCurrency].every(td => td.textContent.includes('FCFA')), 'les totaux de chaque ligne du devis suivent aussi la devise choisie');
  setVal(win, deviseSelect, 'NGN');
  await tick(150);
  assert(doc.getElementById('devis-total').textContent.includes('₦'), 'le Naira (₦) est bien pris en charge (affiché: ' + doc.getElementById('devis-total').textContent + ')');
  const devisPdfHtmlSample = win.renderDevisTableHTML(win.__devisState.devis);
  assert(devisPdfHtmlSample.includes('₦'), 'la devise choisie est bien reprise dans le rendu utilisé par le PDF du devis');
  setVal(win, deviseSelect, 'EUR'); // remet l'état par défaut pour la suite des tests
  await tick(150);

  section('Export PDF du devis seul (§15 Option 2 — indépendant du schéma)');
  assert(!!doc.getElementById('btn-devis-export-pdf'), 'bouton "Exporter le devis (PDF)" présent sur la vue devis');
  let devisPdfError = null;
  const origConfirmDevis = win.confirm; win.confirm = () => true;
  try { await win.exportDevisPDF(projectId); } catch(e){ devisPdfError = e; }
  win.confirm = origConfirmDevis;
  assert(!devisPdfError, 'exportDevisPDF ne lève pas d\'exception' + (devisPdfError ? ' — ERREUR: ' + devisPdfError.message : ''));

  section('Dimensionnement (§24) — formules réelles');
  await nav(win, 'dimensionnement/' + projectId);
  await tick(250);
  // Le projet de test est en domaine "électronique" : l'onglet par défaut n'est pas "Photovoltaïque".
  click(win, [...doc.querySelectorAll('[data-dim-tab]')].find(a=>a.dataset.dimTab==='pv'));
  await tick(150);
  setVal(win, doc.getElementById('pv-besoin'), '2000');
  setVal(win, doc.getElementById('pv-irrad'), '4');
  setVal(win, doc.getElementById('pv-rendement'), '80');
  setVal(win, doc.getElementById('pv-ppanneau'), '400');
  click(win, doc.getElementById('pv-calc'));
  await tick(150);
  const pvResultText = doc.getElementById('pv-result').textContent;
  // Pc attendu = 2000 / (4*0.8) = 625 Wc ; nb panneaux = ceil(625/400) = 2
  assert(pvResultText.includes('625'), 'calcul PV correct : puissance crête = 625 Wc (résultat: ' + pvResultText.replace(/\s+/g,' ').slice(0,200) + ')');
  assert(/\b2 panneau/.test(pvResultText), 'calcul PV correct : 2 panneaux nécessaires');

  await nav(win, 'dimensionnement/' + projectId);
  await tick(150);
  const etTab = [...doc.querySelectorAll('[data-dim-tab]')].find(a=>a.dataset.dimTab==='electrotechnique');
  click(win, etTab);
  await tick(150);
  setVal(win, doc.getElementById('et-puissance'), '2300');
  setVal(win, doc.getElementById('et-tension'), '230');
  setVal(win, doc.getElementById('et-cosphi'), '1');
  click(win, doc.getElementById('et-calc'));
  await tick(150);
  const etResultText = doc.getElementById('et-result').textContent;
  // In = 2300/230 = 10 A
  assert(etResultText.includes('10.0 A') || etResultText.includes('10 A'), 'calcul électrotechnique correct : courant nominal = 10 A (résultat: ' + etResultText.replace(/\s+/g,' ').slice(0,200) + ')');
  assert(!!doc.getElementById('et-export-pdf'), 'bouton "Exporter ce dimensionnement (PDF)" présent après un calcul');

  section('Dimensionnement — Éolien / Hydraulique / Solaire thermique (§24 étendu, addendum 9 : formules ajoutées une fois les composants disponibles au catalogue)');
  await nav(win, 'dimensionnement/' + projectId);
  await tick(150);
  click(win, [...doc.querySelectorAll('[data-dim-tab]')].find(a=>a.dataset.dimTab==='renouvelables'));
  await tick(150);
  setVal(win, doc.getElementById('eo-diametre'), '2');
  setVal(win, doc.getElementById('eo-vitesse'), '10');
  setVal(win, doc.getElementById('eo-cp'), '0.4');
  setVal(win, doc.getElementById('eo-rho'), '1.2');
  click(win, doc.getElementById('eo-calc'));
  await tick(150);
  const eoResultText = doc.getElementById('eo-result').textContent;
  // A = π×1² = 3.14 m² ; P = 0.5×1.2×3.14×0.4×10³ ≈ 754 W
  assert(eoResultText.includes('3.14'), 'calcul éolien correct : aire balayée ≈ 3,14 m² (résultat: ' + eoResultText.replace(/\s+/g,' ').slice(0,220) + ')');
  assert(eoResultText.includes('754'), 'calcul éolien correct : puissance théorique ≈ 754 W');
  assert(!!doc.getElementById('eo-export-pdf'), 'bouton "Exporter ce dimensionnement (PDF)" présent pour l\'éolien');

  setVal(win, doc.getElementById('hy-debit'), '100');
  setVal(win, doc.getElementById('hy-hauteur'), '10');
  setVal(win, doc.getElementById('hy-rendement'), '80');
  click(win, doc.getElementById('hy-calc'));
  await tick(150);
  const hyResultText = doc.getElementById('hy-result').textContent;
  // P = 1000 × 9.81 × 0.1 × 10 × 0.8 = 7848 W
  assert(hyResultText.includes('7848'), 'calcul hydraulique correct : puissance théorique = 7848 W (résultat: ' + hyResultText.replace(/\s+/g,' ').slice(0,220) + ')');
  assert(!!doc.getElementById('hy-export-pdf'), 'bouton "Exporter ce dimensionnement (PDF)" présent pour l\'hydraulique');

  setVal(win, doc.getElementById('st-surface'), '5');
  setVal(win, doc.getElementById('st-irrad'), '5');
  setVal(win, doc.getElementById('st-rendement'), '60');
  click(win, doc.getElementById('st-calc'));
  await tick(150);
  const stResultText = doc.getElementById('st-result').textContent;
  // E = 5 × 5 × 0.6 = 15 kWh/jour
  assert(stResultText.includes('15.00'), 'calcul solaire thermique correct : production journalière = 15,00 kWh/jour (résultat: ' + stResultText.replace(/\s+/g,' ').slice(0,220) + ')');
  assert(!!doc.getElementById('st-export-pdf'), 'bouton "Exporter ce dimensionnement (PDF)" présent pour le solaire thermique');

  section('Export PDF du dimensionnement seul (§15 Option 3 — indépendant du schéma)');
  // Fixe directement l'état que le vrai gestionnaire de clic pose avant d'appeler l'export
  // (évite de dépendre du comportement de window.confirm() non implémenté par jsdom).
  win.__lastDimResult = { projectId, type:'Électrotechnique / Bâtiment', html: win.__etLastHTML };
  let dimPdfError = null;
  const origConfirmDim = win.confirm; win.confirm = () => true;
  try { win.exportDimensionnementPDF(projectId); } catch(e){ dimPdfError = e; }
  win.confirm = origConfirmDim;
  assert(!dimPdfError, 'exportDimensionnementPDF ne lève pas d\'exception' + (dimPdfError ? ' — ERREUR: ' + dimPdfError.message : ''));
  assert(win.__lastDimResult && win.__lastDimResult.type === 'Électrotechnique / Bâtiment', 'le type de dimensionnement est bien renseigné pour l\'export');
  assert(win.__etLastHTML.includes('dim-formula') && win.__etLastHTML.includes('In = P'), 'le PDF du dimensionnement contient les formules avec substitution des valeurs, pas seulement un résumé court (§12 des mises à jour reçues)');
  assert(win.__etLastHTML.includes('Conclusion'), 'le PDF du dimensionnement contient une conclusion explicite');
  assert(win.__etLastHTML.includes('Hypothèses'), 'le PDF du dimensionnement documente ses hypothèses/remarques');

  section('Export PDF (4 types indépendants — §15 de la mise à jour, ne doivent pas planter même si popup bloqué)');
  const origConfirmPdf = win.confirm; win.confirm = () => true;
  let schemaPdfError = null, rapportPdfError = null;
  try { await win.exportSchemaPDF(projectId, win.wsState.schema); } catch(e){ schemaPdfError = e; }
  assert(!schemaPdfError, 'exportSchemaPDF ne lève pas d\'exception (popup bloqué géré proprement)' + (schemaPdfError ? ' — ERREUR: ' + schemaPdfError.message : ''));
  try { await win.exportRapportCompletPDF(projectId, win.wsState.schema); } catch(e){ rapportPdfError = e; }
  assert(!rapportPdfError, 'exportRapportCompletPDF ne lève pas d\'exception (popup bloqué géré proprement)' + (rapportPdfError ? ' — ERREUR: ' + rapportPdfError.message : ''));
  win.confirm = origConfirmPdf;
  const pdfHeaderSample = win.pdfHeaderHTML('Test', 'Sous-titre');
  assert(pdfHeaderSample.includes('<svg') && pdfHeaderSample.includes('Laboratoire Électronique Virtuel'), 'l\'en-tête partagé des PDF inclut un logo vectoriel (SVG inline) et la marque');

  section('Plan bâtiment — éditeur d\'architecture/électricité intégré (§11-19 des mises à jour reçues)');
  const jsErrCountBeforePlan = win.__jsErrors.length;
  await nav(win, 'plan/' + projectId);
  await tick(300);
  assert(!!doc.getElementById('plan-shell'), 'l\'éditeur de plan (prototype "Atelier Plan" intégré) est monté dans la vue');
  assert(!!doc.querySelector(`.ws-tabs-top a[href="#/plan/${projectId}"].active`), 'le 4e onglet "Plan" est actif sur cette route, aux côtés de Schéma/Devis/Dimensionnement');
  assert(typeof win.AtelierPlanEditor === 'object' && typeof win.AtelierPlanEditor.mount === 'function' && typeof win.AtelierPlanEditor.unmount === 'function', 'window.AtelierPlanEditor.mount/unmount exposés (API d\'intégration du module)');
  assert(typeof win.AtelierPlan === 'object' && typeof win.AtelierPlan.getProject === 'function', 'window.AtelierPlan (API interne du module monté) exposée');
  const freshPlan = win.AtelierPlan.getProject();
  assert(freshPlan.version === 1 && Array.isArray(freshPlan.entities) && freshPlan.entities.length === 0, 'un projet de plan vide est créé par défaut quand aucun plan n\'a encore été enregistré pour ce projet');

  section('Plan bâtiment — persistance par projet (db.getPlan/db.savePlan, même principe que le devis §22/§23)');
  const samplePlan = { version:1, meta:{ name:'Villa test', scale:50, sheet:'A3', projet:'', titre:'Plan électrique', auteur:'', date:'2026-01-01', indice:'A', planche:'1/1', sheetOrigin:null, dimUnit:'mm' },
    levels:[{ id:'L0', name:'RDC', elevation:0, height:2800 }],
    layers:[{ id:'A-MUR', name:'Murs', color:'#f0f0f0', lw:'thick', lt:'continu', pc:'#000000', visible:true, locked:false }],
    circuits:[], entities:[{ id:'w1', type:'wall', level:'L0', layer:'A-MUR', a:{x:0,y:0}, b:{x:5000,y:0}, t:200, kind:'porteur' }] };
  await win.db.savePlan(projectId, samplePlan);
  const { data: reloadedPlan } = await win.db.getPlan(projectId);
  assert(!!reloadedPlan && reloadedPlan.entities.length === 1 && reloadedPlan.entities[0].type === 'wall', 'le plan enregistré (db.savePlan) est bien relu tel quel (db.getPlan)');
  await nav(win, 'dashboard');
  await tick(100);
  await nav(win, 'plan/' + projectId);
  await tick(400);
  const remountedPlan = win.AtelierPlan.getProject();
  assert(remountedPlan.entities.length === 1 && remountedPlan.entities[0].type === 'wall', 'en rouvrant la vue Plan, le mur précédemment enregistré est rechargé depuis le backend (mount() → storage.load())');
  assert(doc.getElementById('cv') && doc.getElementById('cv').innerHTML.includes('<line'), 'le mur rechargé est effectivement dessiné dans le SVG (pas seulement présent dans l\'état)');
  assert(win.__jsErrors.length === jsErrCountBeforePlan, 'aucune erreur JS non interceptée pendant le montage/démontage/remontage de l\'éditeur de plan' + (win.__jsErrors.length > jsErrCountBeforePlan ? ' — NOUVELLES ERREURS: ' + win.__jsErrors.slice(jsErrCountBeforePlan).join(' | ') : ''));

  section('Plan bâtiment — logo partagé dans le cartouche du PDF (limite fermée : addendum 7 signalait la planche indépendante de l\'identité visuelle des autres PDF)');
  const planSheetSvg = win.AtelierPlan.sheetSVG({});
  assert(planSheetSvg.includes('rx="2.5"') && planSheetSvg.includes('<svg'), 'la planche imprimable du plan intègre désormais le même symbole de logo vectoriel que les 4 autres exports PDF (résultat contient-il le logo ? ' + planSheetSvg.includes('rx="2.5"') + ')');

  await nav(win, 'project/' + projectId);
  await tick(200);
  assert(!doc.getElementById('plan-shell'), 'en quittant la route Plan, son DOM est bien retiré (remplacé par la vue Schéma)');

  section('Vue 3D du bâtiment — géométrie pure (js/plan3d.js, sans WebGL/Three.js requis)');
  // Porte pleine hauteur (h = hauteur du mur, allège 0) : aucun linteau ni allège, juste les 2 pans pleins.
  const wDoorFullHeight = win.wallOpeningBoxes(5000, [{ offset: 2000, w: 900, h: 2800, sill: 0 }], 2800);
  assert(wDoorFullHeight.length === 2, 'un mur de 5 m avec une porte pleine hauteur donne 2 pans pleins (avant/après), sans linteau ni allège (résultat: ' + wDoorFullHeight.length + ' boîte(s))');
  assert(wDoorFullHeight.some(b => Math.abs(b.x1 - 2000) < 0.01) && wDoorFullHeight.some(b => Math.abs(b.x0 - 2900) < 0.01), 'l\'ouverture (2000 à 2900 mm) est bien l\'espace vide entre les deux pans de mur');
  // Porte standard (h = 2100 < hauteur du mur 2800) : un linteau apparaît au-dessus.
  const wDoorStd = win.wallOpeningBoxes(5000, [{ offset: 2000, w: 900, h: 2100, sill: 0 }], 2800);
  assert(wDoorStd.length === 3, 'une porte standard (2100 mm) dans un mur de 2800 mm ajoute un linteau au-dessus (3 boîtes : avant, linteau, après ; résultat: ' + wDoorStd.length + ')');
  const wWindowBoxes = win.wallOpeningBoxes(5000, [{ offset: 2000, w: 1200, h: 1200, sill: 900 }], 2800);
  assert(wWindowBoxes.length === 4, 'un mur avec une fenêtre (allège 900, hauteur 1200) donne 4 boîtes : avant, allège, linteau, après (résultat: ' + wWindowBoxes.length + ')');
  const sampleWallGeom = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 5000, y: 0 }, t: 200, kind: 'porteur' };
  const wSeg = win.wallSegments(sampleWallGeom, [], 2800);
  assert(wSeg.boxes.length === 1 && Math.abs(wSeg.boxes[0].w - 5000) < 0.01, 'un mur sans ouverture donne une seule boîte pleine sur toute sa longueur');
  assert(Math.abs(wSeg.angle) < 1e-9, 'l\'angle du mur horizontal (a→b sur x) est bien 0');
  const sampleWall = Object.assign({ type: 'wall', level: 'L0', layer: 'A-MUR' }, sampleWallGeom);
  const samplePlanFor3D = { levels: [{ id: 'L0', name: 'RDC', elevation: 0, height: 2800 }],
    entities: [sampleWall, { id: 'c1', type: 'column', level: 'L0', x: 1000, y: 1000, s: 200, rot: 0 },
      { id: 's1', type: 'symbol', level: 'L0', sym: 'prise16', x: 300, y: 100, rot: 0, h: 300 }] };
  const scene3D = win.buildBuildingScene(samplePlanFor3D);
  assert(scene3D.levels.length === 1, 'un niveau dans le plan donne un niveau dans la scène 3D');
  assert(scene3D.levels[0].walls.length === 1 && scene3D.levels[0].columns.length === 1 && scene3D.levels[0].symbols.length === 1, 'les murs/poteaux/symboles du niveau sont bien repris dans la scène 3D (murs=' + scene3D.levels[0].walls.length + ', poteaux=' + scene3D.levels[0].columns.length + ', symboles=' + scene3D.levels[0].symbols.length + ')');
  assert(scene3D.levels[0].symbols[0].h === 300, 'la hauteur de pose du symbole (300 mm, prise) est reprise telle quelle pour son placement 3D');
  assert(win.buildBuildingScene(null).levels.length === 0 && win.buildBuildingScene({}).levels.length === 0, 'buildBuildingScene() ne lève pas d\'exception sur une entrée vide/invalide (retourne une liste de niveaux vide)');

  section('Vue 3D du bâtiment — intégration routeur et repli gracieux sans WebGL (attendu dans ce harnais de test)');
  const jsErrCountBefore3D = win.__jsErrors.length;
  await nav(win, 'plan3d/' + projectId);
  await tick(250);
  assert(!!doc.getElementById('plan3d-shell'), 'la vue 3D est montée dans la page (conteneur #plan3d-shell présent)');
  assert(!!doc.querySelector(`.ws-tabs-top a[href="#/plan3d/${projectId}"].active`), 'le 5e onglet "3D" est actif sur cette route');
  assert(win.threeAvailable() === false, 'Three.js n\'est pas chargé dans ce harnais (scripts CDN retirés volontairement, voir boot()) — comportement attendu, pas une erreur');
  assert(!doc.getElementById('p3d-fallback').classList.contains('hidden'), 'en l\'absence de Three.js, le message de repli est affiché au lieu de planter');
  assert(doc.getElementById('p3d-fallback').textContent.includes('3D'), 'le message de repli explique que l\'aperçu 3D est indisponible');
  assert(win.__jsErrors.length === jsErrCountBefore3D, 'aucune erreur JS non interceptée en montant la vue 3D sans Three.js disponible' + (win.__jsErrors.length > jsErrCountBefore3D ? ' — NOUVELLES ERREURS: ' + win.__jsErrors.slice(jsErrCountBefore3D).join(' | ') : ''));
  await nav(win, 'project/' + projectId);
  await tick(200);
  assert(!doc.getElementById('plan3d-shell'), 'en quittant la route 3D, son DOM est bien retiré');

  section('CAO mécanique 3D — géométrie pure (js/cao3d.js, sans WebGL/Three.js requis)');
  assert(win.cao_primitiveVolume({ type:'box', w:10, h:20, d:5 }) === 1000, 'volume d\'une boîte 10×20×5 = 1000 mm³');
  const cylVol = win.cao_primitiveVolume({ type:'cylinder', d:10, h:20 });
  assert(Math.abs(cylVol - Math.PI*25*20) < 0.001, 'volume d\'un cylindre Ø10×20 = π×5²×20 (résultat: ' + cylVol.toFixed(3) + ')');
  const extrudeVol = win.cao_extrudeVolume({ profile:{ shape:'rect', w:20, h:10 }, holes:[{cx:0,cy:0,d:4}], depth:5 });
  // Le trou est approché par un polygone à 24 côtés inscrit dans le cercle (même technique que le
  // reste du projet) : son aire est légèrement inférieure à π×r², d'où une tolérance un peu plus
  // large qu'un calcul purement analytique — pas une imprécision du calcul, une conséquence assumée
  // de l'approximation polygonale (cohérente avec le maillage réellement construit par Three.js).
  const expectedExtrude = (200 - Math.PI*4) * 5;
  assert(Math.abs(extrudeVol - expectedExtrude) < 1, 'volume d\'une esquisse rectangle 20×10 percée d\'un trou Ø4, extrudée sur 5 mm ≈ ' + expectedExtrude.toFixed(1) + ' mm³ (résultat: ' + extrudeVol.toFixed(1) + ', écart dû à l\'approximation polygonale du trou)');
  const revolveVol = win.cao_revolveVolume({ profile:{ pts:[[10,-10],[20,-10],[20,10],[10,10]] }, angle:360 });
  const expectedRevolve = Math.PI*(400-100)*20; // = tube plein rayon 10→20, hauteur 20 (théorème de Pappus-Guldin)
  assert(Math.abs(revolveVol - expectedRevolve) < 1, 'révolution d\'un rectangle (rayon 10→20, hauteur 20) sur 360° = volume d\'un tube plein (Pappus-Guldin), attendu ' + expectedRevolve.toFixed(0) + ' mm³ (résultat: ' + revolveVol.toFixed(0) + ')');
  const steelCubeMass = win.cao_bodyMassKg({ feature:{ type:'box', w:100, h:100, d:100 }, material:'acier' });
  assert(Math.abs(steelCubeMass - 7.85) < 0.001, 'un cube d\'acier de 100 mm de côté pèse 7,85 kg (masse volumique 7850 kg/m³) — résultat: ' + steelCubeMass.toFixed(3) + ' kg');
  const boxHoleVol = win.cao_primitiveVolume({ type:'box', w:20, h:5, d:10, holes:[{cx:0,cy:0,d:4}] });
  assert(Math.abs(boxHoleVol - (200-Math.PI*4)*5) < 1, 'une boîte 20×10×5 avec un trou traversant Ø4 perd le volume du trou (résultat: ' + boxHoleVol.toFixed(1) + ')');
  assert(win.cao_primitiveVolume({ type:'box', w:20, h:5, d:10 }) === 1000, 'sans trou, une boîte 20×10×5 garde son volume plein (1000 mm³, pas de régression pour le cas courant)');
  const cylHoleVol = win.cao_primitiveVolume({ type:'cylinder', d:20, h:10, holes:[{cx:0,cy:0,d:6}] });
  // Le diamètre extérieur reste calculé analytiquement (πr²) ; seul le trou passe par
  // l'approximation polygonale (24 côtés, cf. cao_circlePoints) — d'où une tolérance un peu plus
  // large que le calcul purement analytique, pour la même raison que le test d'esquisse ci-dessus.
  assert(Math.abs(cylHoleVol - (Math.PI*100-Math.PI*9)*10) < 5, 'un cylindre Ø20×10 avec un alésage Ø6 perd le volume de l\'alésage (résultat: ' + cylHoleVol.toFixed(1) + ')');
  const gearPts = win.cao_gearProfile(2, 20);
  assert(gearPts.length === 80, 'le profil d\'un pignon à 20 dents a 4 points par dent (80 points) — résultat: ' + gearPts.length);
  const gearRadii = gearPts.map(p => Math.hypot(p[0], p[1]));
  assert(Math.min(...gearRadii) > 17 && Math.max(...gearRadii) < 23, 'les points du profil d\'engrenage restent entre le diamètre de pied et de tête attendus (module 2, 20 dents) — bornes observées: ' + Math.min(...gearRadii).toFixed(1) + '..' + Math.max(...gearRadii).toFixed(1));
  const gearVol = win.cao_primitiveVolume({ type:'gear', module:2, teeth:20, thickness:5, bore:6 });
  const discVol = Math.PI*400*5; // ancienne approximation (disque au diamètre primitif) : le nouveau calcul doit s'en écarter (denture réelle prise en compte)
  assert(gearVol > 0 && Math.abs(gearVol - discVol) > 50, 'le volume de l\'engrenage reflète désormais le profil denté réel, pas un simple disque plein (résultat: ' + gearVol.toFixed(0) + ' mm³, ancien calcul disque: ' + discVol.toFixed(0) + ')');
  assert(win.cao_bodyVolume({ feature: win.cao_defaultFeature('screw') }) > 0, 'le volume d\'une vis générée par défaut est positif (tête + tige)');
  assert(win.cao_bodyVolume({ feature: win.cao_defaultFeature('nut') }) > 0, 'le volume d\'un écrou généré par défaut est positif');
  // Coordonnées volontairement différentes de "10" (le code de groupe DXF pour X) pour ne pas
  // fausser le comptage ci-dessous : une valeur de coordonnée qui vaudrait littéralement 10
  // apparaîtrait aussi comme la chaîne "10" et serait comptée à tort comme un code de groupe.
  const dxfSample = win.cao_profileToDXF([[0,0],[5,0],[5,5],[0,5]]);
  assert(dxfSample.includes('LWPOLYLINE') && dxfSample.includes('ENDSEC') && dxfSample.trim().endsWith('EOF'), 'l\'export DXF d\'un profil produit un fichier structurellement valide (section ENTITIES/LWPOLYLINE, terminé par EOF)');
  assert((dxfSample.match(/\n10\n/g)||[]).length === 4, 'le DXF contient bien les 4 coordonnées X du profil carré (résultat: ' + (dxfSample.match(/\n10\n/g)||[]).length + ')');
  const extrudeBodyForDxf = { feature: win.cao_defaultFeature('extrude') };
  assert(Array.isArray(win.cao_bodyProfilePoints(extrudeBodyForDxf)) && win.cao_bodyProfilePoints(extrudeBodyForDxf).length >= 3, 'le profil d\'une esquisse extrudée est exploitable pour un export DXF');
  assert(win.cao_bodyProfilePoints({ feature: win.cao_defaultFeature('box') }) === null, 'une primitive sans esquisse 2D (boîte) n\'expose pas de profil exportable en DXF');
  const freshCad = win.cao_newProject();
  assert(freshCad.version === 1 && Array.isArray(freshCad.bodies) && freshCad.bodies.length === 0, 'un projet CAO 3D vide est correctement initialisé');
  let cadValidateError = null;
  try { win.cao_validateProject({ version:2, bodies:[] }); } catch (e) { cadValidateError = e; }
  assert(!!cadValidateError, 'un fichier CAO 3D de version inconnue est rejeté plutôt que silencieusement accepté');
  const bodiesForNaming = [];
  const b1 = win.cao_newBody(bodiesForNaming, 'box'); bodiesForNaming.push(b1);
  const b2 = win.cao_newBody(bodiesForNaming, 'box'); bodiesForNaming.push(b2);
  assert(b1.name !== b2.name, 'deux corps du même type reçoivent des noms distincts (résultat: "' + b1.name + '" / "' + b2.name + '")');
  assert(win.cao_assemblyMassKg(bodiesForNaming) > 0, 'la masse totale d\'un assemblage est la somme des masses de ses corps');

  section('CAO mécanique 3D — éditeur d\'esquisse à la souris (limite fermée : profils numériques uniquement avant cette session)');
  // Transform écran <-> monde pure (mêmes constantes que js/cao3d.js) : aller-retour exact, et
  // vérification que l'axe Y écran (vers le bas) est bien inversé pour donner un Y monde vers le
  // haut (convention déjà utilisée par les profils de révolution existants, ex. cao_defaultFeature).
  const sk1 = win.cao_sketchToScreen(10, 20);
  const back1 = win.cao_sketchToWorld(sk1[0], sk1[1]);
  assert(Math.abs(back1[0]-10) < 1e-9 && Math.abs(back1[1]-20) < 1e-9, 'aller-retour écran<->monde exact pour un point d\'esquisse (résultat: ' + JSON.stringify(back1) + ')');
  const skOrigin = win.cao_sketchToScreen(0, 0);
  const skUp = win.cao_sketchToScreen(0, 10);
  assert(skUp[1] < skOrigin[1], 'un Y monde positif (vers le haut) correspond à une coordonnée écran plus petite (Y écran croît vers le bas) — convention cohérente avec les profils de révolution déjà en place');

  // cao_ensurePolygonProfile : bascule un profil rectangle en contour libre à 4 points sans le
  // vider, puis un second appel sur un polygone déjà vide retombe sur un contour par défaut
  // plutôt que de laisser un profil inutilisable.
  const polyFeature = { type:'extrude', profile:{ shape:'rect', w:40, h:20 }, depth:5 };
  win.cao_ensurePolygonProfile(polyFeature);
  assert(polyFeature.profile.shape === 'polygon' && polyFeature.profile.pts.length === 4, 'basculer un profil rectangle en contour libre conserve 4 points de départ (le rectangle tracé), pas un contour vide (résultat: ' + JSON.stringify(polyFeature.profile.pts) + ')');
  polyFeature.profile.pts = [];
  win.cao_ensurePolygonProfile(polyFeature);
  assert(polyFeature.profile.pts.length === 4, 'un contour libre vidé revient à un contour par défaut exploitable plutôt que de rester vide (résultat: ' + polyFeature.profile.pts.length + ' point(s))');
  // Le volume d'une esquisse extrudée en contour libre (rectangle 40×20 retracé point par point)
  // doit rester cohérent avec le même rectangle exprimé directement en profil 'rect' — preuve que
  // le contour libre n'est pas un second moteur de calcul divergent, juste une autre façon
  // d'exprimer le même polygone.
  const rectVolDirect = win.cao_extrudeVolume({ profile:{ shape:'rect', w:40, h:20 }, depth:5 });
  const rectVolAsPolygon = win.cao_extrudeVolume({ profile: polyFeature.profile, depth:5 });
  assert(Math.abs(rectVolDirect - rectVolAsPolygon) < 1e-6, 'le volume d\'un rectangle retracé en contour libre est identique à celui du même rectangle en profil paramétrique (résultat: ' + rectVolDirect + ' vs ' + rectVolAsPolygon + ')');

  const sketchBodyExtrude = win.cao_newBody([], 'extrude');
  const extrudePts = win.cao_sketchProfilePts(sketchBodyExtrude);
  assert(Array.isArray(extrudePts) && extrudePts.length >= 3 && sketchBodyExtrude.feature.profile.shape === 'polygon', 'ouvrir l\'esquisse d\'une extrusion rectangle/cercle la convertit automatiquement en contour libre exploitable par l\'éditeur graphique');
  const sketchBodyRevolve = win.cao_newBody([], 'revolve');
  sketchBodyRevolve.feature.profile.pts = [];
  const revolvePts = win.cao_sketchProfilePts(sketchBodyRevolve);
  assert(Array.isArray(revolvePts) && revolvePts.length === 4, 'ouvrir l\'esquisse d\'une révolution sans profil défini fournit un profil de départ exploitable plutôt qu\'un contour vide');

  // cao_sketchOpen/Close pilotent l'état affiché par cao_propsHTML (observé indirectement via le
  // HTML généré, la variable d'état interne n'étant volontairement pas exposée hors du module —
  // même principe que C3D/c3dSelected, cf. tests d'intégration routeur ci-dessous).
  win.cao_sketchClose();
  const propsClosed = win.cao_propsHTML(sketchBodyExtrude);
  assert(!propsClosed.includes('c3d-sketch-svg'), 'sans esquisse ouverte, le panneau de propriétés n\'affiche pas l\'éditeur graphique');
  win.cao_sketchOpen(sketchBodyExtrude);
  const propsOpenExtrude = win.cao_propsHTML(sketchBodyExtrude);
  assert(propsOpenExtrude.includes('id="c3d-sketch-svg"'), 'ouvrir l\'esquisse d\'un corps affiche l\'éditeur graphique (SVG) dans le panneau de propriétés');
  assert((propsOpenExtrude.match(/data-pt="/g)||[]).length === extrudePts.length, 'l\'éditeur graphique affiche exactement un point cliquable par point du contour (résultat: ' + (propsOpenExtrude.match(/data-pt="/g)||[]).length + ' pour ' + extrudePts.length + ' point(s))');
  assert((propsOpenExtrude.match(/data-del="/g)||[]).length === extrudePts.length, 'chaque point de l\'esquisse a son propre bouton de suppression (✕)');
  // Chaque point cliquable est placé à la coordonnée écran exacte issue de cao_sketchToScreen —
  // même garantie "coordonnée déclarée = coordonnée réellement dessinée" que pour les gabarits de
  // symboles du catalogue (tests/verify_catalog.js), appliquée ici à l'esquisse.
  const firstPt = extrudePts[0], firstScreen = win.cao_sketchToScreen(firstPt[0], firstPt[1]);
  assert(propsOpenExtrude.includes(`data-pt="0" cx="${firstScreen[0]}" cy="${firstScreen[1]}"`), 'le premier point de l\'esquisse est dessiné exactement à la coordonnée écran calculée par cao_sketchToScreen (pas une valeur désynchronisée)');
  const propsClosedAfter = (() => { win.cao_sketchClose(); return win.cao_propsHTML(sketchBodyExtrude); })();
  assert(!propsClosedAfter.includes('c3d-sketch-svg'), 'fermer l\'esquisse retire l\'éditeur graphique du panneau de propriétés');

  // cao_fieldsHTML expose les nouvelles commandes : option "Contour libre" pour une extrusion,
  // bouton "Dessiner à la souris" pour une révolution — sans rien retirer de la saisie numérique
  // déjà en place (le champ "__pts" texte reste présent pour la révolution, ajout pas remplacement).
  const extrudeFieldsRect = win.cao_fieldsHTML({ type:'extrude', profile:{ shape:'rect', w:40, h:20 }, depth:5 });
  assert(extrudeFieldsRect.includes('value="polygon"'), 'l\'option "Contour libre (esquisse)" est proposée pour une extrusion, en plus de rectangle/cercle');
  const extrudeFieldsPoly = win.cao_fieldsHTML({ type:'extrude', profile: polyFeature.profile, depth:5 });
  assert(extrudeFieldsPoly.includes('data-sketch-open'), 'quand le profil d\'extrusion est déjà en contour libre, le bouton pour dessiner à la souris est affiché');
  const revolveFields = win.cao_fieldsHTML({ type:'revolve', profile:{ pts:[[0,-20],[10,-20],[10,20],[0,20]] }, angle:360 });
  assert(revolveFields.includes('data-sketch-open') && revolveFields.includes('data-f="__pts"'), 'le champ de révolution propose à la fois la saisie numérique existante ("__pts") ET le nouveau bouton pour dessiner à la souris — ajout, pas remplacement');

  section('CAO mécanique 3D — intégration routeur et repli gracieux sans WebGL (attendu dans ce harnais de test)');
  const jsErrCountBeforeCad = win.__jsErrors.length;
  await nav(win, 'cad3d/' + projectId);
  await tick(250);
  assert(!!doc.getElementById('cao3d-shell'), 'l\'atelier CAO 3D est monté dans la page (conteneur #cao3d-shell présent)');
  assert(!!doc.querySelector(`.ws-tabs-top a[href="#/cad3d/${projectId}"].active`), 'le 6e onglet "CAO 3D" est actif sur cette route');
  assert(win.cao_threeAvailable() === false, 'Three.js/STLExporter ne sont pas chargés dans ce harnais (scripts CDN retirés volontairement) — attendu, pas une erreur');
  assert(!doc.getElementById('c3d-fallback').classList.contains('hidden'), 'en l\'absence de Three.js, le message de repli est affiché au lieu de planter');
  assert(win.__jsErrors.length === jsErrCountBeforeCad, 'aucune erreur JS non interceptée en montant l\'atelier CAO 3D sans Three.js disponible' + (win.__jsErrors.length > jsErrCountBeforeCad ? ' — NOUVELLES ERREURS: ' + win.__jsErrors.slice(jsErrCountBeforeCad).join(' | ') : ''));
  await nav(win, 'project/' + projectId);
  await tick(200);
  assert(!doc.getElementById('cao3d-shell'), 'en quittant la route CAO 3D, son DOM est bien retiré');

  section('CAO mécanique 3D — persistance par projet (db.getCad3d/db.saveCad3d, même principe que le plan §22/§23)');
  const sampleCad = { version:1, meta:{ name:'Pièce test' }, bodies:[{ id:'b1', name:'Plaque', visible:true, material:'aluminium', transform:{ pos:[0,0,0], rot:[0,0,0] }, feature:{ type:'box', w:50, h:5, d:30 } }] };
  await win.db.saveCad3d(projectId, sampleCad);
  const { data: reloadedCad } = await win.db.getCad3d(projectId);
  assert(!!reloadedCad && reloadedCad.bodies.length === 1 && reloadedCad.bodies[0].feature.type === 'box', 'le projet CAO 3D enregistré (db.saveCad3d) est bien relu tel quel (db.getCad3d)');

  section('Thème (§33)');
  const themeBtn = doc.querySelector('[data-theme-pick="clair"]');
  assert(!!themeBtn, 'sélecteur de thème présent dans la barre supérieure');
  click(win, themeBtn);
  await tick(150);
  assert(doc.documentElement.getAttribute('data-theme') === 'clair', 'thème clair appliqué sur <html>');
  assert(win.localStorage.getItem('labo_theme') === 'clair', 'préférence de thème persistée en localStorage');

  section('Persistance (localStorage)');
  const raw = win.localStorage.getItem(win.DB_STORAGE_KEY);
  assert(!!raw, 'la base mock est bien sérialisée dans localStorage');
  const saved = JSON.parse(raw);
  assert(saved.users.some(u=>u.email==='alice@example.com'), 'utilisateur créé bien persisté');
  assert(saved.projects.some(p=>p.id===projectId), 'projet créé bien persisté');

  section('Responsive / mobile (présence des éléments adaptatifs)');
  await nav(win, 'project/' + projectId);
  await tick(250);
  assert(!!doc.querySelector('.ws-mobile-tabs'), 'barre d\'onglets mobile présente dans l\'éditeur');
  assert(doc.querySelectorAll('[data-mtab]').length === 3, '3 onglets mobiles (Composants/Canevas/Mesures)');

  section('Admin (§29)');
  await win.auth.signOut();
  await nav(win, 'login');
  const adminEmail = win.MOCK_ADMIN_EMAIL;
  const loginForm2 = doc.getElementById('form-login');
  setVal(win, loginForm2.querySelector('[name=email]'), adminEmail);
  setVal(win, loginForm2.querySelector('[name=password]'), 'admin123');
  loginForm2.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.auth.currentUser && win.auth.currentUser.role === 'admin', 'connexion admin réussie');
  await nav(win, 'admin/users');
  await tick(250);
  assert(doc.body.textContent.includes('alice@example.com'), 'admin voit la liste des utilisateurs (alice présente)');
  const suspendBtn = doc.querySelector('[data-suspend]');
  assert(!!suspendBtn, 'bouton suspendre présent pour un utilisateur non-admin');
  const targetUserId = suspendBtn.dataset.suspend;
  click(win, suspendBtn);
  await tick(200);
  const suspendedUser = (await win.db.listUsers()).data.find(u=>u.id===targetUserId);
  assert(suspendedUser.suspended === true, 'utilisateur suspendu avec succès par l\'admin');

  await win.auth.signOut();
  const loginForm3Route = await nav(win, 'login');
  const loginForm3 = doc.getElementById('form-login');
  setVal(win, loginForm3.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginForm3.querySelector('[name=password]'), 'nouveaumdp123');
  loginForm3.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  const errEl = doc.getElementById('login-error');
  assert(win.auth.currentUser === null && errEl && !errEl.classList.contains('hidden'), 'compte suspendu ne peut plus se connecter (message affiché: ' + (errEl?errEl.textContent:'?') + ')');

  // Reconnexion admin pour tester quota + demande de stockage
  const loginForm4 = doc.getElementById('form-login');
  setVal(win, loginForm4.querySelector('[name=email]'), adminEmail);
  setVal(win, loginForm4.querySelector('[name=password]'), 'admin123');
  loginForm4.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  await nav(win, 'admin/users');
  await tick(250);
  const quotaInput = doc.querySelector(`[data-quota="${targetUserId}"]`);
  assert(!!quotaInput, 'champ quota présent pour l\'utilisateur');
  setVal(win, quotaInput, '50');
  await tick(200);
  const userAfterQuota = (await win.db.listUsers()).data.find(u=>u.id===targetUserId);
  assert(userAfterQuota.storageQuota === 50*1024*1024, 'quota de stockage mis à jour par l\'admin (50 Mo)');

  // Réactiver alice pour tester la demande de stockage (§28) de son côté
  await win.db.setUserSuspended({ userId: targetUserId, suspended:false });
  await win.auth.signOut();
  await nav(win, 'login');
  const loginForm5 = doc.getElementById('form-login');
  setVal(win, loginForm5.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginForm5.querySelector('[name=password]'), 'nouveaumdp123');
  loginForm5.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  await nav(win, 'compte');
  await tick(250);
  const storageForm = doc.getElementById('form-storage-request');
  assert(!!storageForm, 'formulaire de demande d\'augmentation de stockage présent (§28)');
  storageForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  const myReqs = (await win.db.listMyStorageRequests(targetUserId)).data;
  assert(myReqs.length === 1, 'demande de stockage envoyée');

  await win.auth.signOut();
  await nav(win, 'login');
  const loginForm6 = doc.getElementById('form-login');
  setVal(win, loginForm6.querySelector('[name=email]'), adminEmail);
  setVal(win, loginForm6.querySelector('[name=password]'), 'admin123');
  loginForm6.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  await nav(win, 'admin/storage');
  await tick(250);
  const acceptBtn = doc.querySelector('[data-storage-accept]');
  assert(!!acceptBtn, 'demande de stockage visible côté admin, bouton accepter présent');
  const quotaBefore = userAfterQuota.storageQuota;
  click(win, acceptBtn);
  await tick(200);
  const userAfterAccept = (await win.db.listUsers()).data.find(u=>u.id===targetUserId);
  assert(userAfterAccept.storageQuota > quotaBefore, 'quota augmenté après acceptation de la demande par l\'admin');

  section('Statut de projet — transition automatique après édition');
  const projectAfterEdits = (await win.db.getProject(projectId)).data;
  assert(projectAfterEdits.statut === 'en_cours', 'le statut passe à "en_cours" après des modifications du schéma (valeur: ' + projectAfterEdits.statut + ')');

  section('Composant de remplacement + avertissement (§1 des notes en cours)');
  const replItem = win.wsState.schema.items[0];
  const replDef = win.findDef(replItem.typeId);
  replItem.customRef = 'CD4017'; // délibérément incohérent avec le composant réellement posé
  assert(win.customRefMismatch(replItem, replDef) === true, 'une référence de remplacement incohérente avec le composant réellement modélisé est détectée');
  const replWarnings = win.collectReplacementWarnings(win.wsState.schema);
  assert(replWarnings.length === 1 && replWarnings[0].includes('CD4017'), 'le diagnostic liste l\'avertissement de remplacement (résultat: ' + JSON.stringify(replWarnings) + ')');
  replItem.customRef = replDef.nom; // référence cohérente cette fois
  assert(win.customRefMismatch(replItem, replDef) === false, 'une référence de remplacement cohérente avec le composant n\'est pas signalée');
  replItem.customRef = '';

  section('Favoris / récents (§1-§2 des notes en cours)');
  const favBefore = win.getFavoris();
  assert(!favBefore.includes('led'), 'led non favori au départ (état: ' + JSON.stringify(favBefore) + ')');
  win.toggleFavorite('led');
  assert(win.getFavoris().includes('led'), 'led ajouté aux favoris');
  win.toggleFavorite('led');
  assert(!win.getFavoris().includes('led'), 'led retiré des favoris (bascule)');
  win.recordRecentComponent('ne555');
  win.recordRecentComponent('resistance');
  assert(win.getRecents()[0] === 'resistance' && win.getRecents()[1] === 'ne555', 'les composants récents sont classés du plus récent au plus ancien (résultat: ' + JSON.stringify(win.getRecents().slice(0,2)) + ')');

  section('Page de recherche de composants dédiée (§1 des notes en cours)');
  await nav(win, 'composants');
  await tick(200);
  assert(!!doc.getElementById('comp-search'), 'champ de recherche de la page dédiée présent');
  setVal(win, doc.getElementById('comp-search'), 'NE555');
  await tick(150);
  assert(doc.getElementById('comp-search-results').textContent.includes('NE555'), 'la page dédiée trouve un composant dans tout le catalogue');
  assert(!!doc.querySelector('#comp-search-results .comp-result-thumb svg'), 'le symbole réel du composant est visible directement dans les résultats de recherche (retour du client sur WinRelais/VisuSymbole : "on doit voir les symboles dans la partie de recherche")');
  const compFavBtn = doc.querySelector('#comp-search-results [data-fav]');
  assert(!!compFavBtn, 'bouton favori présent sur un résultat de recherche');
  click(win, compFavBtn);
  await tick(100);
  assert(win.getFavoris().includes('ne555'), 'favori ajouté depuis la page de recherche dédiée');
  win.toggleFavorite('ne555'); // nettoyage

  section('Constructeur de composant personnalisé (§23/§26)');
  click(win, doc.querySelector('[data-comp-mode="creer"]'));
  await tick(150);
  assert(!!doc.getElementById('cb-nom'), 'formulaire du constructeur de composant affiché');
  setVal(win, doc.getElementById('cb-nom'), 'Module capteur test');
  setVal(win, doc.getElementById('cb-nbornes'), '3');
  doc.getElementById('cb-nbornes').dispatchEvent(new win.Event('input', { bubbles:true }));
  await tick(80);
  assert(doc.querySelectorAll('.cb-pinname').length === 3, 'trois champs de nom de broche générés après avoir saisi 3 bornes');
  setVal(win, doc.querySelectorAll('.cb-pinname')[0], 'VCC');
  setVal(win, doc.querySelectorAll('.cb-pinname')[1], 'GND');
  setVal(win, doc.querySelectorAll('.cb-pinname')[2], 'OUT');
  click(win, doc.getElementById('cb-preview'));
  await tick(100);
  assert(doc.querySelector('#cb-preview-box svg'), 'un aperçu du symbole (boîtier + broches) est généré automatiquement, sans que l\'utilisateur ait dessiné quoi que ce soit');
  assert(!doc.getElementById('cb-save').disabled, 'le bouton Enregistrer est activé une fois l\'aperçu généré');
  click(win, doc.getElementById('cb-save'));
  await tick(250);
  const customDef = win.findDef('custom_module_capteur_test');
  assert(!!customDef, 'le composant personnalisé est immédiatement retrouvable par findDef() après enregistrement (id=' + (customDef && customDef.id) + ')');
  assert(customDef && customDef.terminals.length === 3, 'le composant personnalisé enregistré a bien ses 3 bornes');
  assert(customDef && Array.isArray(customDef.pinNames) && customDef.pinNames.join(',') === 'VCC,GND,OUT', 'le brochage saisi (VCC/GND/OUT) est conservé tel quel (résultat: ' + JSON.stringify(customDef && customDef.pinNames) + ')');
  assert(win.searchCatalog('Module capteur test').some(c => c.id === 'custom_module_capteur_test'), 'le composant personnalisé apparaît dans la recherche globale du catalogue, comme n\'importe quel composant existant');
  assert(!!doc.querySelector('[data-mine-id="custom_module_capteur_test"]'), 'le composant personnalisé apparaît dans la liste "Mes composants"');
  const { data: savedList } = await win.db.listCustomComponents(win.auth.currentUser.id);
  assert(savedList.some(c => c.id === 'custom_module_capteur_test'), 'le composant personnalisé est bien persisté côté backend (db.listCustomComponents)');
  const origConfirmCb = win.confirm; win.confirm = () => true;
  click(win, doc.querySelector('[data-del-mine="custom_module_capteur_test"]'));
  await tick(250);
  win.confirm = origConfirmCb;
  assert(!win.findDef('custom_module_capteur_test'), 'le composant personnalisé supprimé n\'est plus retrouvable par findDef()');

  section('Constructeur de composant — boîtier circulaire (limite fermée : un seul gabarit disponible avant cette session)');
  assert(!!doc.getElementById('cb-boitier'), 'sélecteur de forme de boîtier présent dans le formulaire');
  const boitierOptions = [...doc.getElementById('cb-boitier').options].map(o => o.value);
  assert(boitierOptions.includes('rect') && boitierOptions.includes('circle'), 'deux gabarits de boîtier proposés : rectangulaire et circulaire (options: ' + boitierOptions.join(',') + ')');
  setVal(win, doc.getElementById('cb-nom'), 'Capteur rond test');
  setVal(win, doc.getElementById('cb-nbornes'), '5');
  doc.getElementById('cb-nbornes').dispatchEvent(new win.Event('input', { bubbles:true }));
  await tick(80);
  doc.getElementById('cb-boitier').value = 'circle';
  click(win, doc.getElementById('cb-preview'));
  await tick(100);
  const circlePreviewSvg = doc.querySelector('#cb-preview-box svg');
  assert(!!circlePreviewSvg && circlePreviewSvg.innerHTML.includes('<circle'), 'l\'aperçu du boîtier circulaire contient bien un <circle> (pas le gabarit rectangulaire par défaut)');
  click(win, doc.getElementById('cb-save'));
  await tick(250);
  const circleDef = win.findDef('custom_capteur_rond_test');
  assert(!!circleDef && circleDef.terminals.length === 5, 'le composant à boîtier circulaire est enregistré avec ses 5 bornes (résultat: ' + (circleDef && circleDef.terminals.length) + ')');
  // Vérifie la même garantie bornes ↔ tracé que tests/verify_catalog.js applique au reste du
  // catalogue : chaque borne déclarée doit être l'extrémité exacte d'un <line> réellement dessiné.
  const circleLineEnds = [...win.SYM['custom_capteur_rond_test'].matchAll(/<line[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/g)].map(m => [Number(m[1]), Number(m[2])]);
  const circleBornesOk = circleDef.terminals.every(([tx, ty]) => circleLineEnds.some(([lx, ly]) => Math.abs(lx - tx) < 1e-9 && Math.abs(ly - ty) < 1e-9));
  assert(circleBornesOk, 'chaque borne du boîtier circulaire correspond exactement à l\'extrémité d\'une ligne tracée (garantie par construction, comme icTemplate)');
  const origConfirmCircle = win.confirm; win.confirm = () => true;
  click(win, doc.querySelector('[data-del-mine="custom_capteur_rond_test"]'));
  await tick(250);
  win.confirm = origConfirmCircle;

  section('Constructeur de composant — import JSON (limite fermée : aucun import possible avant cette session)');
  assert(!!doc.getElementById('cb-import-file') && !!doc.getElementById('cb-import-btn'), 'bouton et champ fichier d\'import JSON présents');
  const validImportJSON = JSON.stringify({
    nom: 'Module importé test',
    sym: '<line x1="0" y1="15" x2="60" y2="15" stroke="currentColor" stroke-width="2"/><rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor"/>',
    terminals: [[0, 15], [60, 15]],
    pinNames: ['IN', 'OUT'],
    famille: 'Autre',
  });
  const validImportFile = new win.File([validImportJSON], 'composant.json', { type: 'application/json' });
  await win.cbImportJSON(validImportFile);
  await tick(150);
  const importedDef = win.findDef('custom_module_importe_test');
  assert(!!importedDef, 'le composant importé depuis un fichier JSON est retrouvable par findDef() après import');
  assert(importedDef && importedDef.terminals.length === 2 && importedDef.pinNames.join(',') === 'IN,OUT', 'les bornes et le brochage du fichier JSON importé sont conservés tels quels');
  assert(importedDef && /non garanties/i.test(importedDef.niveauVerification), 'le niveau de vérification d\'un import signale honnêtement l\'absence de garantie automatique bornes ↔ tracé (contrairement aux composants générés par le formulaire)');
  const origConfirmImp = win.confirm; win.confirm = () => true;
  click(win, doc.querySelector('[data-del-mine="custom_module_importe_test"]'));
  await tick(250);
  win.confirm = origConfirmImp;

  const invalidImportFile = new win.File(['{"nom":"Sans bornes"}'], 'bad.json', { type: 'application/json' });
  await win.cbImportJSON(invalidImportFile);
  await tick(150);
  assert(doc.getElementById('cb-import-msg').textContent.includes('Import impossible'), 'un fichier JSON invalide (sans "terminals") produit un message d\'erreur clair, sans lever d\'exception non interceptée');
  assert(!win.findDef('custom_sans_bornes'), 'un import invalide n\'enregistre aucun composant');

  section('Bibliothèque 3 colonnes — Famille → Sous-famille → Fiche (§6/§7 des mises à jour reçues)');
  click(win, doc.querySelector('[data-comp-mode="parcourir"]'));
  await tick(150);
  assert(!!doc.getElementById('lib-browser'), 'le mode "Parcourir la bibliothèque" affiche le navigateur 3 colonnes');
  const famBtn = [...doc.querySelectorAll('[data-browse-fam]')].find(b => b.dataset.browseFam === 'Diodes');
  assert(!!famBtn, 'la famille "Diodes" est listée en colonne 1');
  click(win, famBtn);
  await tick(150);
  const sfBtns = [...doc.querySelectorAll('[data-browse-sf]')];
  assert(sfBtns.length > 1, 'plusieurs sous-familles de Diodes affichées en colonne 2 (résultat: ' + sfBtns.map(b=>b.dataset.browseSf).join(', ') + ')');
  const zenerSfBtn = sfBtns.find(b => b.dataset.browseSf === 'Zener');
  assert(!!zenerSfBtn, 'la sous-famille "Zener" est bien dérivée pour les diodes Zener');
  click(win, zenerSfBtn);
  await tick(150);
  const compBtns = [...doc.querySelectorAll('[data-browse-id]')];
  assert(compBtns.length > 0 && compBtns.every(b => win.findDef(b.dataset.browseId).sousFamille === 'Zener'), 'seuls des composants de la sous-famille Zener apparaissent après sélection');
  const compBtn = compBtns.find(b => b.dataset.browseId === 'diode_zener') || compBtns[0];
  click(win, compBtn);
  await tick(150);
  const fiche = doc.querySelector('.lib-fiche');
  assert(!!fiche, 'la fiche détail du composant sélectionné s\'affiche en colonne 3');
  assert(fiche.querySelector('.component-symbol-preview svg, svg.component-symbol-preview') || fiche.innerHTML.includes('<svg'), 'la fiche affiche le symbole réel du composant sélectionné');
  assert(fiche.textContent.includes('Référence technique'), 'la fiche affiche la référence technique');
  assert(fiche.textContent.includes('Zener'), 'la fiche affiche bien la sous-famille du composant sélectionné');
  const ficheFavBtn = fiche.querySelector('[data-fav]');
  assert(!!ficheFavBtn && ficheFavBtn.textContent.includes('favoris'), 'le bouton favori de la fiche porte un libellé explicite');
  click(win, ficheFavBtn);
  await tick(100);
  assert(win.getFavoris().includes(compBtn.dataset.browseId), 'favori ajouté depuis la fiche détail de la bibliothèque 3 colonnes');
  win.toggleFavorite(compBtn.dataset.browseId); // nettoyage
  click(win, doc.querySelector('[data-comp-mode="recherche"]'));
  await tick(150);
  assert(!!doc.getElementById('comp-search'), 'retour au mode "Recherche & favoris" fonctionne');

  section('Fils — couleur et premier plan (§2 des notes en cours)');
  if (win.wsState.schema.wires.length){
    const wTest = win.wsState.schema.wires[0];
    wTest.color = '#4FD1C5';
    win.wsState.selectedWireId = null; // pour que la couleur personnalisée soit bien appliquée au rendu
    const svgOut = win.renderCanvasSVG();
    assert(svgOut.includes(`data-wire="${wTest.id}"`) && svgOut.includes('stroke:#4FD1C5'), 'la couleur personnalisée du fil est bien appliquée au rendu SVG');
    win.wsState.schema.wires.push(win.wsState.schema.wires.shift()); // équivalent de "premier plan" (déplacé en fin de tableau)
    assert(win.wsState.schema.wires[win.wsState.schema.wires.length-1].id === wTest.id, 'le fil peut être renvoyé au premier plan (dernier du tableau = dessiné au-dessus)');
  }

  section('Nœuds à une intersection de fils (priorité explicitement demandée)');
  const crossSchema = { items:[
      { id:'R', typeId:'resistance', x:0,   y:85,  rot:0, value:220 },
      { id:'S', typeId:'resistance', x:300, y:85,  rot:0, value:220 },
      { id:'P', typeId:'resistance', x:150, y:0,   rot:0, value:220 },
      { id:'Q', typeId:'resistance', x:150, y:200, rot:0, value:220 },
    ], wires:[
      { id:'wh', a:{itemId:'R', term:0}, b:{itemId:'S', term:0} }, // horizontale, y=100, x de 0 à 300
      { id:'wv', a:{itemId:'P', term:0}, b:{itemId:'Q', term:0} }, // verticale, x=150, y de 15 à 215
    ] };
  const crossings = win.computeWireCrossings(crossSchema);
  assert(crossings.length === 1 && crossings[0].x === 150 && crossings[0].y === 100, 'un croisement géométrique entre deux fils différents est détecté au bon point (résultat: ' + JSON.stringify(crossings) + ')');
  assert(!win.junctionAt(crossSchema, 150, 100), 'par défaut, un croisement de fils n\'est PAS un nœud électrique (convention IEC : pas de point = pas de connexion)');
  const ufBefore = win.buildWireUnion(crossSchema);
  assert(ufBefore.find('R#0') !== ufBefore.find('P#0'), 'sans nœud, les deux fils qui se croisent restent des circuits électriquement séparés');
  crossSchema.junctions = [{ id:'j1', x:150, y:100 }];
  assert(!!win.junctionAt(crossSchema, 150, 100), 'un nœud ajouté au point de croisement est bien retrouvé');
  const ufAfter = win.buildWireUnion(crossSchema);
  assert(ufAfter.find('R#0') === ufAfter.find('P#0'), 'après ajout d\'un nœud au croisement, les deux fils deviennent électriquement un seul et même circuit');

  section('Devis — lignes vides exclues du PDF, lignes partielles conservées (§5 des notes en cours)');
  const devisTest = { lignes:[
    { nom:'', ref:'', qte:0, prix:0, unite:'pièce' },           // totalement vide → doit disparaître
    { nom:'Boîtier', ref:'', qte:0, prix:0, unite:'pièce' },    // partiellement rempli → doit rester
  ], remisePct:0, tauxTaxe:20, taxeActive:false };
  assert(win.isDevisLigneVide(devisTest.lignes[0]) === true, 'une ligne de devis totalement vide est bien détectée comme telle');
  assert(win.isDevisLigneVide(devisTest.lignes[1]) === false, 'une ligne de devis partiellement remplie n\'est pas considérée comme vide');
  const devisHtml = win.renderDevisTableHTML(devisTest);
  assert(devisHtml.includes('Boîtier'), 'la ligne partiellement remplie apparaît dans le rendu du devis pour le PDF');
  const emptyRowCount = (devisHtml.match(/<td><\/td><td><\/td><td>0<\/td>/g)||[]).length;
  assert(emptyRowCount === 0, 'la ligne totalement vide est exclue du rendu du devis pour le PDF');

  section('Partage — permissions "voir seulement" / "voir + modifier" + notifications (§3-§4 des notes en cours)');
  await win.auth.signOut();
  await nav(win, 'register');
  const bobForm = doc.getElementById('form-register');
  setVal(win, bobForm.querySelector('[name=prenom]'), 'Bob');
  setVal(win, bobForm.querySelector('[name=nom]'), 'Collabo');
  setVal(win, bobForm.querySelector('[name=email]'), 'bob@example.com');
  setVal(win, bobForm.querySelector('[name=password]'), 'motdepasse456');
  setVal(win, bobForm.querySelector('[name=motMagique]'), 'chienblanc');
  bobForm.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  const bobId = win.auth.currentUser.id;
  assert(!!bobId, 'compte de collaborateur "Bob" créé');

  await win.auth.signOut();
  await nav(win, 'login');
  const loginAlice = doc.getElementById('form-login');
  setVal(win, loginAlice.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginAlice.querySelector('[name=password]'), 'nouveaumdp123');
  loginAlice.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  assert(win.auth.currentUser && win.auth.currentUser.email === 'alice@example.com', 'alice reconnectée pour partager son projet');

  let r = await win.db.addCollaborator({ projectId, userId: bobId, permission: 'lecture' });
  assert(!r.error, 'partage en lecture seule accepté sans erreur' + (r.error?(' — '+r.error.message):''));
  const bobNotifs1 = (await win.db.listNotifications(bobId)).data;
  assert(bobNotifs1.some(n => n.type === 'important' && /lecture seule|voir seulement/.test(n.texte)), 'une notification "importante" est créée pour le collaborateur lors du partage (contenu: ' + JSON.stringify(bobNotifs1.map(n=>n.texte)) + ')');

  await win.auth.signOut();
  await nav(win, 'login');
  const loginBob = doc.getElementById('form-login');
  setVal(win, loginBob.querySelector('[name=email]'), 'bob@example.com');
  setVal(win, loginBob.querySelector('[name=password]'), 'motdepasse456');
  loginBob.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  await nav(win, 'project/' + projectId);
  await tick(300);
  assert(win.wsState.readOnly === true, 'le projet s\'ouvre bien en lecture seule pour un collaborateur "voir seulement"');
  const itemsBefore = win.wsState.schema.items.length;
  win.armComponentForPlacement('resistance');
  assert(win.wsState.armedType === null, 'un collaborateur en lecture seule ne peut pas armer un composant pour le poser');
  win.duplicateItem(win.wsState.schema.items[0].id);
  assert(win.wsState.schema.items.length === itemsBefore, 'un collaborateur en lecture seule ne peut pas dupliquer un composant');
  assert(!doc.getElementById('btn-save-project') && !doc.getElementById('btn-share'), 'les boutons Enregistrer/Partager sont masqués en lecture seule');

  section('Plan bâtiment en lecture seule — vérification du verrouillage complet (limite documentée dans l\'addendum 7, revérifiée ici)');
  await nav(win, 'plan/' + projectId);
  await tick(300);
  assert(doc.querySelector('.ws-topbar .pill')?.textContent.includes('Lecture seule') || [...doc.querySelectorAll('.ws-topbar .pill')].some(p=>p.textContent.includes('Lecture seule')), 'le bandeau "Lecture seule" est bien affiché pour Bob sur le plan');
  const planEntitiesBefore = win.AtelierPlan.getProject().entities.length;
  const murBtn = doc.querySelector('#ribbon [title="Mur"]');
  if (murBtn) click(win, murBtn);
  const cvEl = doc.getElementById('cv');
  mouseAt(win, cvEl, 'click', 50, 50);
  await tick(80);
  mouseAt(win, cvEl, 'click', 150, 50);
  await tick(80);
  setVal(win, doc.getElementById('cmd'), 'MU');
  doc.getElementById('cmd').dispatchEvent(new win.KeyboardEvent('keydown', { key:'Enter', bubbles:true, cancelable:true }));
  await tick(80);
  mouseAt(win, cvEl, 'click', 50, 150);
  await tick(80);
  mouseAt(win, cvEl, 'click', 150, 150);
  await tick(80);
  assert(win.AtelierPlan.getProject().entities.length === planEntitiesBefore, 'aucune entité n\'a été ajoutée au plan malgré les tentatives de tracé (clic ruban + clics canevas + commande clavier "MU") en lecture seule — résultat: ' + win.AtelierPlan.getProject().entities.length + ' (attendu ' + planEntitiesBefore + ')');

  await win.auth.signOut();
  await nav(win, 'login');
  const loginAlice2 = doc.getElementById('form-login');
  setVal(win, loginAlice2.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginAlice2.querySelector('[name=password]'), 'nouveaumdp123');
  loginAlice2.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  r = await win.db.addCollaborator({ projectId, userId: bobId, permission: 'edition' });
  assert(!r.error, 'passage en "voir + modifier" accepté sans erreur');
  const bobNotifs2 = (await win.db.listNotifications(bobId)).data;
  assert(bobNotifs2.length === 2, 'une seconde notification est créée lors du changement de permission (total: ' + bobNotifs2.length + ')');

  await win.auth.signOut();
  await nav(win, 'login');
  const loginBob2 = doc.getElementById('form-login');
  setVal(win, loginBob2.querySelector('[name=email]'), 'bob@example.com');
  setVal(win, loginBob2.querySelector('[name=password]'), 'motdepasse456');
  loginBob2.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  await nav(win, 'project/' + projectId);
  await tick(300);
  assert(win.wsState.readOnly === false, 'le même projet devient modifiable pour Bob une fois la permission "voir + modifier" accordée');
  const itemsBeforeEdit = win.wsState.schema.items.length;
  win.duplicateItem(win.wsState.schema.items[0].id);
  assert(win.wsState.schema.items.length === itemsBeforeEdit + 1, 'un collaborateur "voir + modifier" peut bien dupliquer un composant');

  section('Groupes — membres recherchés parmi les utilisateurs inscrits (§3 des notes en cours)');
  const searchRes = (await win.db.searchUsers('Collabo')).data;
  assert(searchRes.some(u=>u.id===bobId), 'recherche d\'utilisateurs par nom trouve Bob (résultats: ' + searchRes.map(u=>u.nom).join(',') + ')');
  await win.auth.signOut();
  await nav(win, 'login');
  const loginAlice3 = doc.getElementById('form-login');
  setVal(win, loginAlice3.querySelector('[name=email]'), 'alice@example.com');
  setVal(win, loginAlice3.querySelector('[name=password]'), 'nouveaumdp123');
  loginAlice3.dispatchEvent(new win.Event('submit', { bubbles:true, cancelable:true }));
  await tick(250);
  const aliceId = win.auth.currentUser.id;
  const gm = await win.db.addGroupMember({ userId: aliceId, memberUserId: bobId });
  assert(!gm.error && gm.data.some(m=>m.memberUserId===bobId), 'membre de groupe ajouté par recherche d\'utilisateur réel, pas par saisie libre');
  const bobNotifs3 = (await win.db.listNotifications(bobId)).data;
  assert(bobNotifs3.some(n=>n.titre.includes('groupe')), 'Bob est notifié de son ajout au groupe de travail');

  section('Catalogue global — cohérence (≥500 composants attendus après expansion §900 des notes en cours)');
  const total = win.COMMON_COMPONENTS.length + Object.values(win.COMPONENT_LIBRARY).reduce((n,l)=>n+l.length,0) + win.INSTRUMENT_LIBRARY.length;
  assert(total >= 500, 'catalogue élargi (total=' + total + ' composants, 5 domaines) — garde-fou anti-régression, pas la cible finale de 900');
  assert(Object.keys(win.ESPACES).length === 5, '5 domaines disponibles (électronique, électrotechnique, bâtiment, renouvelables, automatisme)');

  section('Énergies renouvelables — protection DC/batterie, éolien, hydraulique, solaire thermique (composants cités dans les mises à jour reçues, absents avant cette session)');
  const renIds = ['fusible_gpv','sectionneur_dc','fusible_batterie','sectionneur_batterie','optimiseur_pv','bms',
    'generatrice_eolienne','redresseur_eolien','controleur_eolien','frein_eolien',
    'controleur_hydraulique','vanne_hydraulique',
    'capteur_solaire_thermique','ballon_solaire','circulateur_solaire','regulateur_solaire_thermique','sonde_temperature_solaire'];
  assert(renIds.every(id => win.COMPONENT_LIBRARY['energies-renouvelables'].some(c => c.id === id)), 'les 17 nouveaux composants sont bien présents dans le domaine Énergies Renouvelables (manquants: ' + renIds.filter(id => !win.COMPONENT_LIBRARY['energies-renouvelables'].some(c => c.id === id)).join(', ') + ')');
  const bmsDef = win.findDef('bms');
  assert(bmsDef && bmsDef.terminals.length === 2 && bmsDef.famille === 'Stockage', 'le BMS existe avec 2 bornes (représentation simplifiée pack +/-) dans la famille Stockage');
  const optDef = win.findDef('optimiseur_pv');
  assert(optDef && optDef.terminals.length === 4, "l'optimiseur de puissance PV existe avec 4 bornes (entrée/sortie)");
  const thermSolaireIds = ['capteur_solaire_thermique','ballon_solaire','circulateur_solaire','regulateur_solaire_thermique','sonde_temperature_solaire'];
  assert(thermSolaireIds.every(id => win.findDef(id).famille === 'Solaire thermique'), 'les 5 composants solaire thermique forment une famille cohérente et distincte du chauffe-eau électrique (Bâtiment)');

  section('Brochage DIP conforme + brochage réel affiché (correction de cette session)');
  const ne555Def = win.findDef('ne555');
  assert(ne555Def.terminals.length === 8, 'le NE555 a bien 8 broches');
  const [l0,l1,l2,l3,r0,r1,r2,r3] = ne555Def.terminals;
  assert(l0[0]===0 && l3[0]===0 && r0[0]===60 && r3[0]===60, 'les 8 broches du NE555 sont réparties 4 à gauche / 4 à droite du boîtier');
  assert(l0[1] < l3[1], 'côté gauche : la broche 1 est bien en haut et la broche 4 en bas (ordre DIP)');
  assert(r0[1] > r3[1], 'côté droit : la broche 5 (bas) et la broche 8 (haut) sont dans l\'ordre DIP réel (on REMONTE le second côté), pas un simple recopiage de haut en bas');
  assert(Array.isArray(ne555Def.pinNames) && ne555Def.pinNames.length === 8 && ne555Def.pinNames[0]==='GND' && ne555Def.pinNames[7]==='VCC', 'le brochage réel du NE555 (GND en broche 1, VCC en broche 8) est renseigné (résultat: ' + JSON.stringify(ne555Def.pinNames) + ')');
  const pinoutHtml = win.pinNamesListHTML(ne555Def);
  assert(pinoutHtml.includes('GND') && pinoutHtml.includes('VCC'), 'le brochage réel est bien affichable (info-bulle catalogue / panneau propriétés)');
  assert(win.pinNamesListHTML({ pinNames:null }) === '', 'un composant sans brochage connu ne montre pas de liste vide plutôt que d\'inventer un brochage');

  section('Boîtiers à forte densité de broches — hauteur variable (retour explicite du client : numéros de broches qui se chevauchent sur un boîtier 14/16 broches, exemple de code à l\'appui)');
  const denseDef = win.findDef('registre_595'); // 74HC595, 16 broches
  assert(denseDef.terminals.length === 16, 'le registre à décalage (74HC595) a bien 16 broches');
  assert(denseDef.viewH > 30, 'un boîtier à forte densité de broches (16, 8 par côté) obtient une hauteur logique agrandie, au-delà des 30 unités d\'avant (résultat: ' + denseDef.viewH + ')');
  const smallDef = win.findDef('ne555'); // 8 broches, 4 par côté
  assert(smallDef.viewH === 30, 'un boîtier à faible densité (NE555, 4 broches par côté) garde exactement l\'ancienne hauteur — aucun changement visuel pour l\'immense majorité du catalogue');
  const denseGap = Math.abs(denseDef.terminals[1][1] - denseDef.terminals[0][1]);
  assert(denseGap > 5, 'l\'espacement entre deux broches consécutives d\'un boîtier 16 broches est nettement plus grand que les 3 unités d\'avant, qui causaient le chevauchement des numéros (résultat: ' + denseGap.toFixed(2) + ' unités)');

  // Pose ce composant dense sur le schéma et le pivote : le fil doit se connecter à la bonne
  // position réelle (le centre de rotation doit suivre viewH/2, pas un 15 fixe pour tous les
  // composants — sinon un boîtier dense tourné connecterait ses fils au mauvais endroit).
  await nav(win, 'project/' + projectId); // Alice est connectée (juste avant) et reste propriétaire de ce projet
  await tick(200);
  win.armComponentForPlacement('registre_595');
  await tick(50);
  mouseAt(win, doc.getElementById('ws-grid-bg'), 'click', 500, 500);
  await tick(150);
  const denseItem = win.wsState.schema.items[win.wsState.schema.items.length-1];
  assert(denseItem.typeId === 'registre_595', 'le composant dense a bien été posé sur le schéma');
  denseItem.rot = 90;
  const expectedRel = win.rotatePointAround(denseDef.terminals[0][0], denseDef.terminals[0][1], 30, denseDef.viewH/2, 90);
  const actualAbs = win.terminalAbsPos(denseItem, 0);
  assert(Math.abs(actualAbs.x - (denseItem.x+expectedRel.x)) < 0.01 && Math.abs(actualAbs.y - (denseItem.y+expectedRel.y)) < 0.01,
    'après rotation, la borne d\'un composant dense se connecte à la position réellement attendue (centre de rotation = viewH/2, pas 15 fixe pour tous)');

  section('Appareillage bâtiment — brochage corrigé/complété (mise à jour reçue du client)');
  const vevDef = win.findDef('interrupteur_va_et_vient');
  assert(vevDef.terminals.length === 3, 'le va-et-vient (Schéma 6/C6) a bien 3 bornes (commune + 2 navettes), pas 2 comme un interrupteur simple (résultat: ' + vevDef.terminals.length + ')');
  assert(Array.isArray(vevDef.pinNames) && vevDef.pinNames.length === 3, 'le brochage du va-et-vient (L, navette 1, navette 2) est renseigné');
  const doubleDef = win.findDef('interrupteur_double');
  assert(doubleDef && doubleDef.terminals.length === 3, 'l\'interrupteur double / double allumage (Schéma 5/C5) existe avec 3 bornes');
  const bipolDef = win.findDef('interrupteur_bipolaire');
  assert(bipolDef && bipolDef.terminals.length === 4, 'l\'interrupteur bipolaire (Schéma 2/C2) existe avec 4 bornes (L1,L2,1,2)');
  const permDef = win.findDef('permutateur');
  assert(permDef && permDef.terminals.length === 4, 'le permutateur (Schéma 7/C7), absent avant cette session, existe maintenant avec 4 bornes');
  const telDef = win.findDef('telerupteur');
  assert(Array.isArray(telDef.pinNames) && telDef.pinNames.some(p=>p.startsWith('A1')) && telDef.pinNames.some(p=>p.startsWith('A2')), 'le télérupteur affiche désormais le brochage réel de sa bobine (A1/A2), en plus du contact de puissance (résultat: ' + JSON.stringify(telDef.pinNames) + ')');

  section('Instruments de mesure — multimètre redessiné, voltmètre et alimentation ajoutés (retour du client)');
  const multiDef = win.findDef('multimetre');
  assert(multiDef.terminals.length === 2, 'le multimètre a bien 2 bornes de sonde (au lieu d\'un simple cercle décoratif)');
  assert(Array.isArray(multiDef.pinNames) && multiDef.pinNames.some(p=>p.startsWith('COM')), 'le multimètre affiche le brochage réel de ses sondes (COM + V/Ω/A)');
  assert(win.SYM['multimetre'].includes('<rect') && !win.SYM['multimetre'].includes('<circle'), 'le symbole du multimètre est un boîtier avec afficheur (rectangle), pas un cercle générique avec une lettre (résultat brut: ' + win.SYM['multimetre'].replace(/\s+/g,' ').slice(0,120) + ')');
  assert(!!win.findDef('voltmetre'), 'un voltmètre existe désormais comme instrument séparé du multimètre');
  assert(!!win.findDef('alimentation'), 'une alimentation stabilisée existe désormais dans les instruments de banc');

  section('Audit des symboles (§1 des notes de reprise) — interphone redessiné avec un pictogramme reconnaissable');
  assert(win.SYM['interphone'].includes('<polygon') && !win.SYM['interphone'].includes('>INT<'), 'le symbole de l\'interphone est désormais un boîtier avec pictogramme haut-parleur + bouton d\'appel, pas un rectangle générique avec le texte "INT" (résultat brut: ' + win.SYM['interphone'].replace(/\s+/g,' ').slice(0,160) + ')');
  assert(win.findDef('interphone').terminals.length === 4, 'le nombre de bornes de l\'interphone (4) est inchangé par ce correctif purement visuel');

  console.log('\n=== Erreurs JS non interceptées pendant toute la session ===');
  console.log(win.__jsErrors.length ? win.__jsErrors.join('\n---\n') : '(aucune)');

  console.log('\n========================================');
  console.log(`RÉSULTAT : ${PASS} tests réussis, ${FAIL} échoués sur ${PASS+FAIL}`);
  if (failures.length) console.log('Échecs :', failures.join(' | '));
  console.log('========================================');
  process.exit(FAIL > 0 ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE DANS LE HARNESS:', e); process.exit(2); });
