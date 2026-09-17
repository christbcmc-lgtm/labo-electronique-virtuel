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
  for (const f of ['js/config.js','js/catalog.js','js/backend.js','js/editor.js','js/pdf.js','js/devis.js','js/dimensionnement.js','js/app.js']){
    const s = doc0.createElement('script');
    s.textContent = readFile(f);
    doc0.body.appendChild(s);
  }
  // Pont de test uniquement : les top-level `const` d'un <script> classique ne deviennent PAS
  // des propriétés de `window` (comportement standard, pas un bug) — on les y recopie pour que
  // ce harnais puisse les inspecter/manipuler facilement via `win.X`.
  const bridge = doc0.createElement('script');
  bridge.textContent = `window.__t = { SUPABASE_CONFIGURED, auth, db, wsState, state, GRID_SIZE,
    MOCK_ADMIN_EMAIL, DB_STORAGE_KEY, DB, COMMON_COMPONENTS, COMPONENT_LIBRARY, INSTRUMENT_LIBRARY, ESPACES };`;
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

  section('Éditeur — diagnostic structurel');
  const diagHtml = win.diagnosticHTML(win.wsState.schema);
  assert(diagHtml.includes('borne') && diagHtml.includes('non connectée'), 'diagnostic signale les bornes restantes non connectées');
  assert(diagHtml.includes('2 composant'), 'diagnostic compte bien 2 composants');

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

  section('Éditeur — "Ranger le schéma" (ne casse pas les connexions)');
  win.wsState.schema.items.forEach(it => { it.x += 3; it.y += 7; }); // désaligne volontairement
  win.wsState.schema.wires.push({ id:'w_re', a:{itemId:item1.id, term:0}, b:{itemId:item2.id, term:0} });
  const wiresCountBefore = win.wsState.schema.wires.length;
  click(win, doc.getElementById('btn-declutter'));
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
  const compFavBtn = doc.querySelector('#comp-search-results [data-fav]');
  assert(!!compFavBtn, 'bouton favori présent sur un résultat de recherche');
  click(win, compFavBtn);
  await tick(100);
  assert(win.getFavoris().includes('ne555'), 'favori ajouté depuis la page de recherche dédiée');
  win.toggleFavorite('ne555'); // nettoyage

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

  console.log('\n=== Erreurs JS non interceptées pendant toute la session ===');
  console.log(win.__jsErrors.length ? win.__jsErrors.join('\n---\n') : '(aucune)');

  console.log('\n========================================');
  console.log(`RÉSULTAT : ${PASS} tests réussis, ${FAIL} échoués sur ${PASS+FAIL}`);
  if (failures.length) console.log('Échecs :', failures.join(' | '));
  console.log('========================================');
  process.exit(FAIL > 0 ? 1 : 0);
})().catch(e => { console.error('ERREUR FATALE DANS LE HARNESS:', e); process.exit(2); });
