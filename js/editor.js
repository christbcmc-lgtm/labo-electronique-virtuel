/* ==========================================================================
   ÉDITEUR DE SCHÉMA — le cœur de l'espace de travail (§3 à §7, priorité n°1
   et priorité critique du cahier des charges).

   Fonctionnalités par rapport à la version précédente :
   - placement "armé" (clic catalogue → aperçu qui suit le curseur → clic sur
     le canevas pour déposer), au lieu d'une apparition brutale au centre ;
   - grille + aimantation (magnétisme) sur la grille ;
   - bouton "Ranger le schéma" (aligne tout sur la grille sans jamais casser
     une connexion, les fils étant toujours recalculés depuis les positions) ;
   - fils routés en angles droits (horizontal/vertical), jamais en diagonale ;
   - jonctions visibles quand plusieurs fils partagent un même point ;
   - sélection d'un fil, suppression, reconnexion d'une extrémité par glisser ;
   - menu contextuel (clic droit / appui long) sur un composant ;
   - remplacement d'un composant par une variante de la même famille ;
   - diagnostic structurel enrichi (court-circuit direct, instrument mal
     branché en série/parallèle par analyse de connexité du circuit).
   ========================================================================== */

const GRID_SIZE = 20;
const wsState = {
  projectId:null, view:{ panX:100, panY:80, scale:1 }, tool:'select',
  wireStart:null, selectedId:null, selectedWireId:null, mobileTab:'canvas', schema:null,
  armedType:null, ghostPos:null, dragWireEnd:null,
  readOnly:false, isOwner:true, remotePeers:{}, presenceMode:null,
};

/* ---- Statut de projet (§6 des notes en cours) : Brouillon→En cours→Vérification→Finalisé→Exporté ---- */
const PROJECT_STATUTS = {
  brouillon:     { label:'Brouillon',      cls:'' },
  en_cours:      { label:'En cours',       cls:'pill-cyan' },
  verification:  { label:'Vérification',   cls:'pill-amber' },
  finalise:      { label:'Finalisé',       cls:'pill-cyan' },
  exporte:       { label:'Exporté',        cls:'pill-cyan' },
};
function statutPillHTML(statut){
  const cur = statut || 'brouillon';
  if (wsState.readOnly){
    const s = PROJECT_STATUTS[cur] || PROJECT_STATUTS.brouillon;
    return `<span class="pill ${s.cls}" style="margin-left:6px" title="Statut du projet">${esc(s.label)}</span>`;
  }
  return `<select id="statut-select" class="statut-select" title="Statut du projet">
    ${Object.entries(PROJECT_STATUTS).map(([k,s]) => `<option value="${k}" ${k===cur?'selected':''}>${esc(s.label)}</option>`).join('')}
  </select>`;
}

/* ---- Composants récents / favoris (§1 des notes en cours) ----
   Persistés par utilisateur (localStorage) : accès rapide sans rouvrir tout le catalogue.
   Volontairement séparés des données du composant lui-même (juste une liste d'identifiants). */
function favStorageKey(kind){ return `labo_${kind}_${(auth.currentUser && auth.currentUser.id) || 'anon'}`; }
function getRecents(){ try{ return JSON.parse(localStorage.getItem(favStorageKey('recents'))||'[]'); }catch(e){ return []; } }
function getFavoris(){ try{ return JSON.parse(localStorage.getItem(favStorageKey('favoris'))||'[]'); }catch(e){ return []; } }
function recordRecentComponent(typeId){
  const r = [typeId, ...getRecents().filter(id=>id!==typeId)].slice(0,15);
  try{ localStorage.setItem(favStorageKey('recents'), JSON.stringify(r)); }catch(e){}
}
function isFavorite(typeId){ return getFavoris().includes(typeId); }
function toggleFavorite(typeId){
  let f = getFavoris();
  f = f.includes(typeId) ? f.filter(id=>id!==typeId) : [typeId, ...f];
  try{ localStorage.setItem(favStorageKey('favoris'), JSON.stringify(f)); }catch(e){}
  return f.includes(typeId);
}
function getFavPanelState(){
  try{ return { x:null, y:null, collapsed:false, hidden:false, ...JSON.parse(localStorage.getItem('labo_favpanel_state')||'{}') }; }
  catch(e){ return { x:null, y:null, collapsed:false, hidden:false }; }
}
function setFavPanelState(st){ try{ localStorage.setItem('labo_favpanel_state', JSON.stringify(st)); }catch(e){} }

// Panneau flottant Outils (même mécanique que le panneau Favoris ci-dessus) — position par
// défaut à gauche pour ne pas se superposer au panneau Favoris, qui démarre à droite.
function getToolPanelState(){
  try{ return { x:null, y:null, collapsed:false, hidden:false, ...JSON.parse(localStorage.getItem('labo_toolpanel_state')||'{}') }; }
  catch(e){ return { x:null, y:null, collapsed:false, hidden:false }; }
}
function setToolPanelState(st){ try{ localStorage.setItem('labo_toolpanel_state', JSON.stringify(st)); }catch(e){} }

// Arme un composant pour dépôt (catalogue latéral, résultats de recherche, ou panneau flottant).
function armComponentForPlacement(typeId){
  if (guardReadOnly()) return;
  wsState.armedType = typeId;
  wsState.ghostPos = { x: 480, y: 280 };
  wsState.wireStart = null;
  redrawCanvas();
  toast('Cliquez sur le canevas pour poser le composant (Échap pour annuler).');
}

// Garde-fou "voir seulement" (§3 des notes en cours) : appelé au début de chaque action qui
// modifie le schéma. En mode Supabase réel, RLS refuserait de toute façon la sauvegarde côté
// serveur (policy projects_update_editor_collab) — ce garde évite en plus une UI trompeuse.
function guardReadOnly(){
  if (wsState.readOnly){ toast('Lecture seule : vous ne pouvez pas modifier ce projet.'); return true; }
  return false;
}

/* ==========================================================================
   ANNULER / RÉTABLIR (Ctrl+Z / Ctrl+Y) — demandé explicitement par le client.
   Pile d'instantanés du schéma (items+wires+junctions), sérialisés en JSON :
   assez petit et sans référence circulaire pour que cloner ainsi soit fiable
   et rapide, plutôt que de suivre chaque mutation en détail (undo/redo par
   "commande" serait plus économe en mémoire mais beaucoup plus risqué à
   maintenir correctement partout où le schéma est modifié).
   `pushUndoSnapshot(pre)` doit être appelé AVANT chaque mutation discrète
   (un `pre` déjà sérialisé peut être fourni quand l'état "avant" a été capturé
   plus tôt, ex. avant un glisser — voir le gestionnaire de déplacement).
   ========================================================================== */
const UNDO_STACK_MAX = 50;
function pushUndoSnapshot(pre){
  if (!wsState.schema) return;
  wsState.undoStack = wsState.undoStack || [];
  wsState.redoStack = [];
  wsState.undoStack.push(pre || JSON.stringify(wsState.schema));
  if (wsState.undoStack.length > UNDO_STACK_MAX) wsState.undoStack.shift();
}
function undoSchema(){
  if (guardReadOnly()) return;
  if (!wsState.undoStack || !wsState.undoStack.length){ toast('Rien à annuler.'); return; }
  wsState.redoStack = wsState.redoStack || [];
  wsState.redoStack.push(JSON.stringify(wsState.schema));
  wsState.schema = JSON.parse(wsState.undoStack.pop());
  wsState.selectedId = null; wsState.selectedWireId = null;
  persistSchema(); redrawCanvas();
  const panel = document.getElementById('ws-panel');
  if (panel && window.__wsPanels) panel.innerHTML = window.__wsPanels.proprietes();
  toast('Action annulée.');
}
function redoSchema(){
  if (guardReadOnly()) return;
  if (!wsState.redoStack || !wsState.redoStack.length){ toast('Rien à rétablir.'); return; }
  wsState.undoStack = wsState.undoStack || [];
  wsState.undoStack.push(JSON.stringify(wsState.schema));
  wsState.schema = JSON.parse(wsState.redoStack.pop());
  wsState.selectedId = null; wsState.selectedWireId = null;
  persistSchema(); redrawCanvas();
  const panel = document.getElementById('ws-panel');
  if (panel && window.__wsPanels) panel.innerHTML = window.__wsPanels.proprietes();
  toast('Action rétablie.');
}

function snap(v){ return Math.round(v/GRID_SIZE)*GRID_SIZE; }

function rotatePointAround(px,py,cx,cy,angleDeg){
  const rad = angleDeg*Math.PI/180;
  const dx=px-cx, dy=py-cy;
  return { x: cx + dx*Math.cos(rad) - dy*Math.sin(rad), y: cy + dx*Math.sin(rad) + dy*Math.cos(rad) };
}
function terminalAbsPos(item, idx){
  const def = findDef(item.typeId);
  const [tx,ty] = def.terminals[idx];
  // Centre de rotation = (30, viewH/2) — 15 pour tous les composants historiques (viewH=30),
  // mais plus haut pour les boîtiers à forte densité de broches (voir icTemplate, js/catalog.js) :
  // sans ça, un tel composant tourné à 90°/270° connecterait ses fils à la mauvaise position.
  const r = rotatePointAround(tx,ty,30,(def.viewH||30)/2,item.rot||0);
  return { x:item.x + r.x, y:item.y + r.y };
}

/* ---- Routage orthogonal (§5) : jamais de diagonale, angles à 90° ---- */
function orthoPoints(a, b){
  if (Math.abs(a.x-b.x) < 0.5 || Math.abs(a.y-b.y) < 0.5) return [a, b]; // déjà aligné
  const midX = a.x + (b.x - a.x)/2;
  return [a, { x:midX, y:a.y }, { x:midX, y:b.y }, b];
}
function polylinePoints(pts){ return pts.map(p=>`${p.x},${p.y}`).join(' '); }

/* ==========================================================================
   NŒUDS ÉLECTRIQUES À UNE INTERSECTION DE FILS (priorité explicitement
   demandée pour la réalisation des circuits).
   --------------------------------------------------------------------------
   Par défaut, deux fils qui se croisent au milieu de leur tracé NE sont PAS
   électriquement reliés (convention IEC/IEEE moderne : un point plein = nœud,
   une simple croix sans point = pas de connexion — plus simple et moins
   ambiguë que l'ancien symbole en "saut" par-dessus l'autre fil, qui oblige à
   deviner quel fil passe au-dessus). L'utilisateur choisit lui-même, en
   cliquant sur le point de croisement, s'il doit devenir un vrai nœud
   (schema.junctions) ou rester une simple superposition visuelle.
   Ceci est indépendant des jonctions "automatiques" (≥3 fils qui partagent
   réellement la même borne de composant) : celles-là sont toujours des nœuds
   réels, puisqu'elles sont physiquement la même broche.
   ========================================================================== */
function wireSegments(schema, wire){
  const ai = schema.items.find(i=>i.id===wire.a.itemId), bi = schema.items.find(i=>i.id===wire.b.itemId);
  if (!ai || !bi) return [];
  const pts = orthoPoints(terminalAbsPos(ai, wire.a.term), terminalAbsPos(bi, wire.b.term));
  const segs = [];
  for (let i=0;i<pts.length-1;i++) segs.push([pts[i], pts[i+1]]);
  return segs;
}
// Intersection de deux segments alignés sur les axes, strictement à l'intérieur des deux
// (les croisements aux extrémités sont déjà couverts par les jonctions automatiques ci-dessus).
function segCrossPoint(s1, s2){
  const EPS = 0.5;
  const isHoriz = (s) => Math.abs(s[0].y-s[1].y) < EPS;
  const isVert  = (s) => Math.abs(s[0].x-s[1].x) < EPS;
  let H, V;
  if (isHoriz(s1) && isVert(s2)){ H = s1; V = s2; }
  else if (isVert(s1) && isHoriz(s2)){ H = s2; V = s1; }
  else return null; // parallèles (ou l'un des deux segments est dégénéré) — ignoré
  const y = H[0].y, x = V[0].x;
  const hx0 = Math.min(H[0].x,H[1].x), hx1 = Math.max(H[0].x,H[1].x);
  const vy0 = Math.min(V[0].y,V[1].y), vy1 = Math.max(V[0].y,V[1].y);
  if (x > hx0+EPS && x < hx1-EPS && y > vy0+EPS && y < vy1-EPS) return { x, y };
  return null;
}
function pointOnSegment(seg, pt, tol=1.5){
  const [a,b] = seg;
  const minX = Math.min(a.x,b.x)-tol, maxX = Math.max(a.x,b.x)+tol;
  const minY = Math.min(a.y,b.y)-tol, maxY = Math.max(a.y,b.y)+tol;
  if (pt.x < minX || pt.x > maxX || pt.y < minY || pt.y > maxY) return false;
  if (Math.abs(a.y-b.y) < 0.5) return Math.abs(pt.y-a.y) <= tol; // segment horizontal
  if (Math.abs(a.x-b.x) < 0.5) return Math.abs(pt.x-a.x) <= tol; // segment vertical
  return false;
}
// Toutes les intersections géométriques entre deux fils DIFFÉRENTS (hors extrémités partagées).
function computeWireCrossings(schema){
  const wires = schema.wires;
  const segsByWire = wires.map(w => wireSegments(schema, w));
  const crossings = [];
  for (let i=0;i<wires.length;i++){
    for (let j=i+1;j<wires.length;j++){
      segsByWire[i].forEach(s1 => segsByWire[j].forEach(s2 => {
        const pt = segCrossPoint(s1, s2);
        if (pt) crossings.push({ x:Math.round(pt.x), y:Math.round(pt.y), wireA:wires[i].id, wireB:wires[j].id });
      }));
    }
  }
  return crossings;
}
function junctionAt(schema, x, y){
  return (schema.junctions||[]).find(j => Math.abs(j.x-x)<3 && Math.abs(j.y-y)<3);
}
function toggleJunctionAt(x, y){
  if (guardReadOnly()) return;
  pushUndoSnapshot();
  if (!wsState.schema.junctions) wsState.schema.junctions = [];
  const existing = junctionAt(wsState.schema, x, y);
  if (existing){ wsState.schema.junctions = wsState.schema.junctions.filter(j=>j!==existing); toast('Nœud retiré — ces fils ne sont plus reliés à cette intersection.'); }
  else { wsState.schema.junctions.push({ id:'j_'+Math.random().toString(36).slice(2,8), x, y }); toast('Nœud ajouté — ces fils sont maintenant électriquement reliés.'); }
  persistSchema(); redrawCanvas();
}
function crossingsSvg(){
  return computeWireCrossings(wsState.schema).map(c => {
    const connected = !!junctionAt(wsState.schema, c.x, c.y);
    return `<circle class="wire-crossing ${connected?'connected':''}" data-cx="${c.x}" data-cy="${c.y}" cx="${c.x}" cy="${c.y}" r="${connected?3:6}"/>`;
  }).join('');
}

async function viewProject(id){
  const { data: project } = await db.getProject(id);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  if (wsState.projectId !== id){
    wsState.projectId = id;
    wsState.schema = project.schema && project.schema.items ? project.schema : { items:[], wires:[] };
    wsState.view = { panX:100, panY:80, scale:1 };
    wsState.tool = 'select'; wsState.wireStart = null; wsState.selectedId = null; wsState.selectedWireId = null;
    wsState.armedType = null; wsState.ghostPos = null;
  }
  openPresenceChannel(id); // toujours réabonné en entrant sur cette vue (y compris retour depuis Devis/Dimensionnement)
  wsState.isOwner = project.ownerId === auth.currentUser.id;
  const myCollab = (project.collaborateurs||[]).find(c=>c.userId===auth.currentUser.id);
  wsState.readOnly = !wsState.isOwner && (!myCollab || myCollab.permission !== 'edition');
  const { data: comments } = await db.listComments(id);
  const comps = COMPONENT_LIBRARY[project.espace] || [];

  window.__wsPanels = { mesures:panelMesures, diagnostic:panelDiagnostic, proprietes:panelProprietes,
    commentaires: () => panelCommentaires(comments) };

  return `
  <div class="workspace">
    <div class="ws-mobile-tabs">
      <button data-mtab="tools">Composants</button>
      <button data-mtab="canvas" class="active">Canevas</button>
      <button data-mtab="right">Mesures</button>
    </div>
    <aside class="ws-tools mobile-active">
      <a href="#/dashboard" class="sb-link">← Retour</a>
      <div class="field" style="margin:10px 0 4px">
        <input id="ws-search" placeholder="Rechercher (ex: BC547, transfo 230/12...)" autocomplete="off">
      </div>
      <div id="ws-search-results"></div>
      ${renderCatalogFamilies('Courants — ' + esc(ESPACES[project.espace]?.nom || project.espace), comps, true)}
      ${renderCatalogFamilies('Composants communs', COMMON_COMPONENTS, false)}
      ${renderCatalogFamilies('Instruments', INSTRUMENT_LIBRARY, false)}
    </aside>

    <div class="ws-canvas-wrap mobile-active">
      <div class="ws-topbar">
        <div><strong>${esc(project.titre)}</strong><span class="pill" style="margin-left:8px">${ESPACES[project.espace]?.nom}</span>
          <span class="pill pill-cyan" id="tool-indicator" style="margin-left:6px">Outil : Sélection</span>
          ${wsState.readOnly ? `<span class="pill" style="margin-left:6px;color:var(--amber);border-color:var(--amber-dim)">🔒 Lecture seule</span>` : ''}
          ${statutPillHTML(project.statut)}
          <span id="presence-bar" style="margin-left:6px"></span></div>
        <div class="ws-tabs-top">
          <a href="#/project/${id}" class="active">Schéma</a>
          <a href="#/devis/${id}">Devis</a>
          <a href="#/dimensionnement/${id}">Dimensionnement</a>
          <a href="#/plan/${id}">Plan</a>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${wsState.isOwner ? `<button class="btn btn-ghost btn-sm" id="btn-share">Partager</button>` : ''}
          <button class="btn btn-ghost btn-sm" id="btn-export-pdf">Exporter le schéma (PDF)</button>
          <button class="btn btn-ghost btn-sm" id="btn-export-pdf-full">Rapport complet (PDF)</button>
          <button class="btn btn-ghost btn-sm" id="btn-ai-interpret">🤖 Interpréter (IA)</button>
          <button class="btn btn-ghost btn-sm" id="btn-test-circuit">Tester le circuit</button>
          ${wsState.readOnly ? '' : `<button class="btn btn-primary btn-sm" id="btn-save-project">Enregistrer</button>`}
        </div>
      </div>
      <div class="ws-canvas" id="ws-canvas-holder" style="position:relative">
        ${renderCanvasSVG()}
        ${renderToolPanel()}
        ${renderFavPanel()}
        <div class="zoom-controls">
          <button id="zoom-in">+</button>
          <div class="zoom-pct" id="zoom-pct">${Math.round(wsState.view.scale*100)}%</div>
          <button id="zoom-out">−</button>
        </div>
      </div>
    </div>

    <aside class="ws-right mobile-active">
      <div class="ws-tabs">
        <button class="ws-tab active" data-tab="mesures">Mesures</button>
        <button class="ws-tab" data-tab="diagnostic">Diagnostic</button>
        <button class="ws-tab" data-tab="proprietes">Propriétés</button>
        <button class="ws-tab" data-tab="commentaires">💬 (${comments.length})</button>
      </div>
      <div class="ws-panel" id="ws-panel">${panelMesures()}</div>
    </aside>
  </div>`;

  function panelMesures(){
    return `<p style="font-size:.82em">Posez un multimètre (ou autre instrument) sur le canevas, reliez-le par un fil, puis sélectionnez-le pour voir sa valeur ici.</p>
      <div class="readout">-- . -- V</div>`;
  }
  function panelDiagnostic(){ return diagnosticHTML(wsState.schema); }
  function panelProprietes(){ return propertiesPanelHTML(); }
}

/* ---- Catalogue en familles repliables (§9, §36 : performance) ---- */
function renderCatalogFamilies(title, list, openFirst){
  const groups = groupByFamille(list);
  return `<h4 data-catfam>${esc(title)}</h4>
    <div class="ws-fam-body">
    ${groups.map(([fam, items], gi) => `
      <h4 class="fam-toggle ${gi>0?'collapsed':''}" data-fam-toggle><span>${esc(fam)}</span><span class="chev">▾</span></h4>
      <div class="ws-fam-body ${gi>0?'collapsed':''}">
        ${items.map(c => `<div class="catalog-item"><button class="ws-comp" data-place="${c.id}" title="${esc(c.def||'')}">▫ ${esc(c.nom)}</button><button class="fav-btn ${isFavorite(c.id)?'active':''}" data-fav="${c.id}" title="Favori">${isFavorite(c.id)?'★':'☆'}</button><button class="info-btn" data-info="${c.id}" title="En savoir plus">ⓘ</button></div>`).join('')}
      </div>`).join('')}
    </div>`;
}

/* ---- Panneau flottant Récents/Favoris (§1/§2 des notes en cours) ----
   Déplaçable, réductible, escamotable. Rendu comme sibling du canevas (pas de son contenu
   SVG) pour survivre à redrawCanvas() sans avoir à ré-attacher ses écouteurs à chaque frame
   — exactement le même principe que les .zoom-controls déjà préservés par redrawCanvas(). */
function favPanelRow(c){
  return `<div class="catalog-item"><button class="ws-comp" data-place="${c.id}" title="${esc(c.def||'')}">▫ ${esc(c.nom)}</button><button class="fav-btn ${isFavorite(c.id)?'active':''}" data-fav="${c.id}" title="Favori">${isFavorite(c.id)?'★':'☆'}</button></div>`;
}
function renderFavPanelBody(){
  const recents = getRecents().map(findDef).filter(Boolean);
  const favoris = getFavoris().map(findDef).filter(Boolean);
  return `
    <div class="fav-section"><h5>Récents</h5>${recents.length ? recents.map(favPanelRow).join('') : '<div class="empty" style="padding:6px 2px;font-size:.74em">Aucun composant récent.</div>'}</div>
    <div class="fav-section"><h5>Favoris</h5>${favoris.length ? favoris.map(favPanelRow).join('') : '<div class="empty" style="padding:6px 2px;font-size:.74em">Cliquez sur ☆ à côté d\'un composant pour l\'ajouter ici.</div>'}</div>`;
}
function renderFavPanel(){
  const st = getFavPanelState();
  const posStyle = (st.x!=null && st.y!=null) ? `left:${st.x}px;top:${st.y}px` : '';
  return `<div class="fav-panel ${st.collapsed?'collapsed':''} ${st.hidden?'hidden':''}" id="fav-panel" style="${posStyle}">
    <div class="fav-panel-head" id="fav-panel-head"><span>★ Récents / Favoris</span>
      <div style="display:flex;gap:2px">
        <button id="fav-panel-collapse" title="${st.collapsed?'Déplier':'Réduire'}">${st.collapsed?'▸':'▾'}</button>
        <button id="fav-panel-close" title="Masquer">✕</button>
      </div>
    </div>
    <div class="fav-panel-body" id="fav-panel-body">${renderFavPanelBody()}</div>
  </div>
  <button class="fav-panel-reopen ${st.hidden?'':'hidden'}" id="fav-panel-reopen" title="Afficher Récents/Favoris">★</button>`;
}
function refreshFavPanelBody(){
  const body = document.getElementById('fav-panel-body');
  if (body) body.innerHTML = renderFavPanelBody();
}
function wireFavPanel(){
  const panel = document.getElementById('fav-panel');
  const head = document.getElementById('fav-panel-head');
  const reopenBtn = document.getElementById('fav-panel-reopen');
  if (!panel || panel.dataset.wired) return;
  panel.dataset.wired = '1';

  let dragging = false, offX = 0, offY = 0;
  const startFavDrag = (e, isTouch) => {
    if (e.target.closest('button')) return;
    if (isTouch && e.cancelable) e.preventDefault();
    dragging = true;
    const holder = document.getElementById('ws-canvas-holder');
    const hb = holder.getBoundingClientRect(), pb = panel.getBoundingClientRect();
    const p0 = eventPoint(e);
    offX = p0.clientX - pb.left; offY = p0.clientY - pb.top;
    const onMove = (ev) => {
      if (isTouch && ev.cancelable) ev.preventDefault();
      const p = eventPoint(ev);
      let x = p.clientX - offX - hb.left, y = p.clientY - offY - hb.top;
      x = Math.max(0, Math.min(x, hb.width - 40)); y = Math.max(0, Math.min(y, hb.height - 30));
      panel.style.left = x + 'px'; panel.style.top = y + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); document.removeEventListener('touchcancel', onUp);
      dragging = false;
      setFavPanelState({ ...getFavPanelState(), x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) });
    };
    if (isTouch){ document.addEventListener('touchmove', onMove, { passive:false }); document.addEventListener('touchend', onUp); document.addEventListener('touchcancel', onUp); }
    else { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
  };
  head.addEventListener('mousedown', (e) => startFavDrag(e, false));
  head.addEventListener('touchstart', (e) => startFavDrag(e, true), { passive:false });

  document.getElementById('fav-panel-collapse').onclick = () => {
    const collapsed = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', collapsed);
    document.getElementById('fav-panel-collapse').textContent = collapsed ? '▸' : '▾';
    setFavPanelState({ ...getFavPanelState(), collapsed });
  };
  document.getElementById('fav-panel-close').onclick = () => {
    panel.classList.add('hidden'); reopenBtn.classList.remove('hidden');
    setFavPanelState({ ...getFavPanelState(), hidden:true });
  };
  reopenBtn.onclick = () => {
    panel.classList.remove('hidden'); reopenBtn.classList.add('hidden');
    setFavPanelState({ ...getFavPanelState(), hidden:false });
  };
  document.getElementById('fav-panel-body').addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn){ toggleFavorite(favBtn.dataset.fav); refreshFavPanelBody(); return; }
    const placeBtn = e.target.closest('[data-place]');
    if (placeBtn) armComponentForPlacement(placeBtn.dataset.place);
  });
}

/* ==========================================================================
   PANNEAU FLOTTANT OUTILS — demandé explicitement par le client : « la partie
   Outils doit flotter directement au-dessus ou à côté de la zone de schéma,
   comme le panneau Récents/Favoris... Sélection | Fil | Annuler [regroupés],
   sans obliger l'utilisateur à retourner dans un menu éloigné. » Même
   mécanique que le panneau Favoris ci-dessus (déplaçable/réductible/
   masquable), rendu comme sibling du canevas pour survivre à redrawCanvas().
   « Annuler » du premier groupe = annuler l'ACTION EN COURS (fil temporaire/
   placement armé, équivalent clic de la touche Échap) — à ne pas confondre
   avec Annuler/Rétablir (Ctrl+Z/Ctrl+Y, l'historique du schéma), qui restent
   des boutons séparés plus bas dans ce même panneau.
   ========================================================================== */
function renderToolPanel(){
  const st = getToolPanelState();
  const posStyle = (st.x!=null && st.y!=null) ? `left:${st.x}px;top:${st.y}px` : '';
  return `<div class="tool-panel ${st.collapsed?'collapsed':''} ${st.hidden?'hidden':''}" id="tool-panel" style="${posStyle}">
    <div class="tool-panel-head" id="tool-panel-head"><span>🛠 Outils</span>
      <div style="display:flex;gap:2px">
        <button id="tool-panel-collapse" title="${st.collapsed?'Déplier':'Réduire'}">${st.collapsed?'▸':'▾'}</button>
        <button id="tool-panel-close" title="Masquer">✕</button>
      </div>
    </div>
    <div class="tool-panel-body" id="tool-panel-body">
      <div class="tool-group">
        <button class="ws-comp" data-tool="select">↖ Sélection</button>
        <button class="ws-comp" data-tool="fil">⎯ Fil</button>
        <button class="ws-comp" id="tool-cancel" title="Annule le fil en cours ou le placement armé (Échap)">⎋ Annuler l'action</button>
      </div>
      <div class="tool-group">
        <button class="ws-comp" id="tool-rotate" title="Pivote le composant sélectionné">↻ Pivoter</button>
        <button class="ws-comp" id="tool-duplicate" title="Duplique le composant sélectionné">⧉ Dupliquer</button>
        <button class="ws-comp" data-tool="supprimer">✕ Supprimer</button>
      </div>
      ${wsState.readOnly ? '' : `
      <div class="tool-group">
        <button class="ws-comp" id="tool-undo" title="Ctrl+Z">↺ Annuler (Ctrl+Z)</button>
        <button class="ws-comp" id="tool-redo" title="Ctrl+Y">↷ Rétablir (Ctrl+Y)</button>
      </div>
      <div class="tool-group">
        <button class="ws-comp" id="tool-declutter">▦ Ranger le schéma</button>
      </div>`}
    </div>
  </div>
  <button class="tool-panel-reopen ${st.hidden?'':'hidden'}" id="tool-panel-reopen" title="Afficher les outils">🛠</button>`;
}
function wireToolPanel(){
  const panel = document.getElementById('tool-panel');
  const head = document.getElementById('tool-panel-head');
  const reopenBtn = document.getElementById('tool-panel-reopen');
  if (!panel || panel.dataset.wired) return;
  panel.dataset.wired = '1';

  let dragging = false, offX = 0, offY = 0;
  const startToolDrag = (e, isTouch) => {
    if (e.target.closest('button')) return;
    if (isTouch && e.cancelable) e.preventDefault();
    dragging = true;
    const holder = document.getElementById('ws-canvas-holder');
    const hb = holder.getBoundingClientRect(), pb = panel.getBoundingClientRect();
    const p0 = eventPoint(e);
    offX = p0.clientX - pb.left; offY = p0.clientY - pb.top;
    const onMove = (ev) => {
      if (isTouch && ev.cancelable) ev.preventDefault();
      const p = eventPoint(ev);
      let x = p.clientX - offX - hb.left, y = p.clientY - offY - hb.top;
      x = Math.max(0, Math.min(x, hb.width - 40)); y = Math.max(0, Math.min(y, hb.height - 30));
      panel.style.left = x + 'px'; panel.style.top = y + 'px';
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); document.removeEventListener('touchcancel', onUp);
      dragging = false;
      setToolPanelState({ ...getToolPanelState(), x: parseFloat(panel.style.left), y: parseFloat(panel.style.top) });
    };
    if (isTouch){ document.addEventListener('touchmove', onMove, { passive:false }); document.addEventListener('touchend', onUp); document.addEventListener('touchcancel', onUp); }
    else { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
  };
  head.addEventListener('mousedown', (e) => startToolDrag(e, false));
  head.addEventListener('touchstart', (e) => startToolDrag(e, true), { passive:false });

  document.getElementById('tool-panel-collapse').onclick = () => {
    const collapsed = !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', collapsed);
    document.getElementById('tool-panel-collapse').textContent = collapsed ? '▸' : '▾';
    setToolPanelState({ ...getToolPanelState(), collapsed });
  };
  document.getElementById('tool-panel-close').onclick = () => {
    panel.classList.add('hidden'); reopenBtn.classList.remove('hidden');
    setToolPanelState({ ...getToolPanelState(), hidden:true });
  };
  reopenBtn.onclick = () => {
    panel.classList.remove('hidden'); reopenBtn.classList.add('hidden');
    setToolPanelState({ ...getToolPanelState(), hidden:false });
  };

  document.getElementById('tool-panel-body').addEventListener('click', (e) => {
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn){
      wsState.tool = toolBtn.dataset.tool; wsState.wireStart = null; wsState.armedType = null;
      const label = { select:'Sélection', fil:'Tracer un fil', supprimer:'Supprimer' }[wsState.tool];
      const ind = document.getElementById('tool-indicator'); if (ind) ind.textContent = 'Outil : ' + label;
      redrawCanvas();
      return;
    }
    if (e.target.closest('#tool-cancel')){
      if (wsState.wireStart){ wsState.wireStart = null; redrawCanvas(); }
      else if (wsState.armedType){ wsState.armedType = null; wsState.ghostPos = null; redrawCanvas(); }
      else toast("Rien à annuler pour l'instant.");
      return;
    }
    if (e.target.closest('#tool-rotate')){
      if (guardReadOnly()) return;
      const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
      if (!item){ toast('Sélectionnez d\'abord un composant.'); return; }
      pushUndoSnapshot(); item.rot = ((item.rot||0)+90)%360; persistSchema(); redrawCanvas();
      return;
    }
    if (e.target.closest('#tool-duplicate')){
      if (!wsState.selectedId){ toast('Sélectionnez d\'abord un composant.'); return; }
      duplicateItem(wsState.selectedId);
      return;
    }
    if (e.target.closest('#tool-undo')){ undoSchema(); return; }
    if (e.target.closest('#tool-redo')){ redoSchema(); return; }
    if (e.target.closest('#tool-declutter')){
      pushUndoSnapshot();
      wsState.schema.items.forEach(it => { it.x = snap(it.x); it.y = snap(it.y); });
      persistSchema(); redrawCanvas(); toast('Schéma rangé sur la grille — les connexions sont conservées.');
    }
  });
}

function panelCommentaires(comments){
  return `<div class="thread">
    ${comments.length ? comments.map(c => { const u = db.userById(c.userId);
      return `<div class="msg ${c.userId===auth.currentUser.id?'mine':''}"><div class="who">${esc(u?.prenom)} ${esc(u?.nom)}</div>${esc(c.texte)}<div class="when">${c.createdAt}</div></div>`;
    }).join('') : '<div class="empty">Aucun commentaire pour l\'instant.</div>'}
  </div>
  <form class="composer" id="form-comment"><input name="texte" placeholder="Écrire un commentaire…" required><button class="btn btn-primary btn-sm" type="submit">Envoyer</button></form>`;
}

/* ---- Diagnostic structurel (§18) ---- */
// Union-find des bornes reliées par des fils (nœuds électriques).
function buildWireUnion(schema){
  const parent = new Map();
  const find = (k) => { if (!parent.has(k)) parent.set(k,k); let r=k; while (parent.get(r)!==r) r=parent.get(r); parent.set(k,r); return r; };
  const union = (a,b) => { const ra=find(a), rb=find(b); if (ra!==rb) parent.set(ra,rb); };
  schema.wires.forEach(w => union(w.a.itemId+'#'+w.a.term, w.b.itemId+'#'+w.b.term));
  // Nœuds explicites à une intersection de fils (§2 des notes en cours) : deux fils qui se
  // croisent ne sont électriquement communs que si l'utilisateur a placé un nœud à ce point.
  (schema.junctions||[]).forEach(j => {
    const touching = schema.wires.filter(w => wireSegments(schema, w).some(seg => pointOnSegment(seg, j)));
    for (let i=1;i<touching.length;i++) union(touching[0].a.itemId+'#'+touching[0].a.term, touching[i].a.itemId+'#'+touching[i].a.term);
  });
  return { find, union };
}
// Détecte si les deux bornes d'un composant 2 bornes sont reliées par un AUTRE chemin
// (à travers d'autres composants passifs simples + fils), sans passer par le composant lui-même.
function hasAlternatePath(schema, item){
  const { find, union } = buildWireUnion(schema);
  schema.items.forEach(other => {
    if (other.id === item.id) return;
    const def = findDef(other.typeId);
    if (def.terminals.length === 2 && !def.instrument){
      union(other.id+'#0', other.id+'#1'); // conduction supposée pour un dipôle passif simple
    }
  });
  return find(item.id+'#0') === find(item.id+'#1');
}
function diagnosticHTML(schema){
  const items = schema.items, wires = schema.wires;
  if (items.length === 0) return `<div class="empty">Aucun composant posé pour l'instant.</div>`;
  const connected = new Set();
  wires.forEach(w => { connected.add(w.a.itemId+'#'+w.a.term); connected.add(w.b.itemId+'#'+w.b.term); });

  const errors = [], warnings = [];
  // Bornes non connectées
  items.forEach(item => {
    const def = findDef(item.typeId);
    def.terminals.forEach((t,idx) => {
      if (!connected.has(item.id+'#'+idx)) warnings.push(`${def.nom} — borne ${idx+1} non connectée.`);
    });
  });
  // Court-circuit direct : un fil relie les deux bornes du même composant
  wires.forEach(w => {
    if (w.a.itemId === w.b.itemId){
      const def = findDef(findItem(schema,w.a.itemId)?.typeId);
      errors.push(`${def?.nom||'Composant'} — un fil relie deux de ses propres bornes : cela court-circuite directement le composant.`);
    }
  });
  // Instruments mal branchés (voltmètre/ohmmètre en série, ampèremètre en parallèle)
  items.forEach(item => {
    const def = findDef(item.typeId);
    if (!def.instrument || def.terminals.length !== 2) return;
    if (!connected.has(item.id+'#0') || !connected.has(item.id+'#1')) return; // pas encore branché des deux côtés
    const altPath = hasAlternatePath(schema, item);
    if ((def.instrument === 'tension' || def.instrument === 'resistance') && !altPath){
      errors.push(`${def.nom} branché en série : pour mesurer une tension ou une résistance, il doit être placé en parallèle aux bornes du composant concerné.`);
    }
    if (def.instrument === 'courant' && altPath){
      errors.push(`${def.nom} branché en parallèle : un ampèremètre doit être inséré en série dans le circuit, jamais directement aux bornes d'une source (risque de court-circuit).`);
    }
  });

  const replacementWarnings = collectReplacementWarnings(schema);

  const okLines = `<div class="diag-ok">✓ ${items.length} composant(s) posé(s).</div><div class="diag-ok">✓ ${wires.length} connexion(s) tracée(s).</div>`;
  const errLines = errors.map(w => `<div class="diag-error">⚠ ${esc(w)}</div>`).join('');
  const warnLines = warnings.length ? warnings.map(w => `<div class="diag-warn">• ${esc(w)}</div>`).join('') : (errors.length ? '' : `<div class="diag-ok">✓ Toutes les bornes sont connectées.</div>`);
  const replLines = replacementWarnings.length ? `<h4 style="margin-top:14px;font-size:.78em;color:var(--text-faint);text-transform:uppercase">Composants de remplacement</h4>${replacementWarnings.map(w=>`<div class="diag-warn">⚠ ${esc(w)}</div>`).join('')}` : '';
  return `${okLines}${errLines}${warnLines}${replLines}
     <p style="font-size:.78em;margin-top:10px">Vérification structurelle et de connexité uniquement (bornes reliées, court-circuits directs, sens d'insertion des instruments). Aucun calcul électrique réel (tensions, courants) n'est effectué : ce diagnostic ne remplace pas un moteur de simulation.</p>
     <p style="font-size:.78em;margin-top:6px">💡 Quand deux fils se croisent sur le canevas sans point plein, ils ne sont <strong>pas</strong> reliés électriquement (ils se superposent juste visuellement). Cliquez sur le croisement pour y ajouter un nœud (point plein) — ou pour le retirer.</p>`;
}
function findItem(schema,id){ return schema.items.find(i=>i.id===id); }

/* ---- Composant de remplacement (§1 des notes en cours) ----
   Un composant réel peut manquer du catalogue ; l'utilisateur peut alors poser un composant
   proche et lui donner une étiquette commerciale libre (item.customRef). Le système ne doit
   jamais laisser croire silencieusement que cette étiquette EST le modèle réellement simulé :
   si elle ne correspond à aucun nom/alias/identifiant du composant réellement posé, un
   avertissement visible est affiché (canevas, propriétés, diagnostic, PDF). */
function normalizeRefText(s){
  const nfd = String(s||'').toLowerCase().normalize('NFD');
  let out = '';
  for (const ch of nfd){
    const code = ch.codePointAt(0);
    if (code >= 0x0300 && code <= 0x036f) continue; // marques diacritiques combinantes (accents)
    if (ch >= 'a' && ch <= 'z') out += ch;
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  return out;
}
function customRefMismatch(item, def){
  if (!item || !item.customRef || !String(item.customRef).trim()) return false;
  const custom = normalizeRefText(item.customRef);
  if (!custom) return false;
  const known = normalizeRefText([def.nom, def.id, def.alias].filter(Boolean).join(' '));
  const defId = normalizeRefText(def.id);
  return !(known.includes(custom) || (defId && custom.includes(defId)));
}
function collectReplacementWarnings(schema){
  return schema.items.filter(item => {
    const def = findDef(item.typeId);
    return def && customRefMismatch(item, def);
  }).map(item => {
    const def = findDef(item.typeId);
    return `« ${item.customRef} » est en réalité un(e) ${def.nom} posé(e) sur le schéma : son brochage et son comportement sont ceux du ${def.nom}, pas nécessairement ceux de la référence indiquée.`;
  });
}

/* ---- Panneau propriétés (avec variantes §10) ---- */
function propertiesPanelHTML(){
  const item = wsState.schema.items.find(i => i.id === wsState.selectedId);
  if (!item) return `<div class="empty">Sélectionnez un composant sur le canevas pour voir ses propriétés.</div>`;
  const def = findDef(item.typeId);
  const isCatalogComp = !!def.unit;
  const variantOptions = (def.variantes||[]).map(vid => findDef(vid)).filter(Boolean);
  const ro = wsState.readOnly;
  return `
    <h4 style="margin-bottom:.3em">${esc(def.nom)}</h4>
    ${ro ? `<div class="diag-warn">🔒 Lecture seule — vous consultez ce projet sans droit de modification.</div>` : ''}
    <p class="def-text">${esc(def.def)}</p>
    ${pinNamesListHTML(def)}
    <a class="wiki-link" href="${wikiUrl(def.wiki)}" target="_blank" rel="noopener">En savoir plus →</a>
    <div class="field" style="margin-top:10px">
      <label>Référence commerciale (remplacement, facultatif)</label>
      <input type="text" id="prop-customref" ${ro?'disabled':''} placeholder="ex. CD4017 — si ce composant en tient lieu" value="${esc(item.customRef||'')}">
      <div class="field-hint">À utiliser si la référence exacte n'existe pas encore dans le catalogue et que ce composant sert de remplacement. Son brochage et son comportement réels restent ceux du modèle ci-dessus, quelle que soit l'étiquette saisie ici.</div>
    </div>
    <div id="customref-warning">${customRefMismatch(item, def) ? `<div class="diag-warn" style="margin-bottom:10px">⚠ « ${esc(item.customRef)} » ne correspond pas au modèle « ${esc(def.nom)} » réellement posé — le brochage/comportement simulés restent ceux du ${esc(def.nom)}.</div>` : ''}</div>
    ${isCatalogComp ? (() => {
      const isPreset = def.valueOptions.some(v => String(v) === String(item.value));
      return `
    <div class="field" style="margin-top:14px"><label>Valeur (${esc(def.unit)})</label>
      <select id="prop-value" ${ro?'disabled':''}>
        ${def.valueOptions.map(v => `<option value="${v}" ${String(v)===String(item.value)?'selected':''}>${v}</option>`).join('')}
        <option value="__custom__" ${!isPreset?'selected':''}>Autre valeur…</option>
      </select>
      <input type="text" id="prop-value-custom" ${ro?'disabled':''} placeholder="Valeur personnalisée" value="${!isPreset?esc(item.value):''}" class="${isPreset?'hidden':''}" style="margin-top:.4em">
    </div>`;
    })() : ''}
    ${variantOptions.length ? `
    <div class="field"><label>Remplacer par une variante</label>
      <select id="prop-variant" ${ro?'disabled':''}>
        <option value="">— choisir —</option>
        ${variantOptions.map(v => `<option value="${v.id}">${esc(v.nom)}</option>`).join('')}
      </select>
    </div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="prop-rotate" ${ro?'disabled':''}>↻ Pivoter</button>
      <button class="btn btn-ghost btn-sm" id="prop-duplicate" ${ro?'disabled':''}>⧉ Dupliquer</button>
      <button class="btn btn-danger btn-sm" id="prop-delete" ${ro?'disabled':''}>✕ Supprimer</button>
    </div>`;
}

/* ---- Rendu SVG du canevas ---- */
function renderCanvasSVG(){
  const v = wsState.view;
  const items = wsState.schema.items, wires = wsState.schema.wires;

  // Jonctions : points partagés par au moins 2 extrémités de fils différentes (§5 : nœuds électriques).
  const endpointCount = new Map();
  const addPt = (p) => { const k = Math.round(p.x)+','+Math.round(p.y); endpointCount.set(k, (endpointCount.get(k)||0)+1); };
  wires.forEach(w => {
    const ai = items.find(i=>i.id===w.a.itemId), bi = items.find(i=>i.id===w.b.itemId);
    if (ai) addPt(terminalAbsPos(ai, w.a.term));
    if (bi) addPt(terminalAbsPos(bi, w.b.term));
  });

  const wiresSvg = wires.map(w => {
    const ai = items.find(i=>i.id===w.a.itemId), bi = items.find(i=>i.id===w.b.itemId);
    if (!ai || !bi) return '';
    const a = terminalAbsPos(ai, w.a.term), b = terminalAbsPos(bi, w.b.term);
    const pts = orthoPoints(a,b);
    const custom = w.color && w.id!==wsState.selectedWireId ? ` style="stroke:${esc(w.color)}"` : '';
    return `<polyline class="wire-line ${w.id===wsState.selectedWireId?'selected':''}" data-wire="${w.id}" points="${polylinePoints(pts)}" fill="none"${custom}/>`;
  }).join('');

  const junctionsSvg = [...endpointCount.entries()].filter(([,n])=>n>=3).map(([k]) => {
    const [x,y] = k.split(',').map(Number);
    return `<circle class="wire-junction" cx="${x}" cy="${y}" r="3"/>`;
  }).join('');

  const itemsSvg = items.map(item => {
    const def = findDef(item.typeId);
    const sym = SYM[item.typeId] || '';
    const selected = item.id === wsState.selectedId ? 'selected' : '';
    // viewH>30 (boîtiers denses, voir icTemplate) : centre de rotation et repères de bornes
    // suivent la hauteur réelle du composant plutôt qu'une valeur fixe à 30/15.
    const viewH = def.viewH || 30;
    const terms = def.terminals.map((t,idx) => {
      const isConnected = wires.some(w => (w.a.itemId===item.id&&w.a.term===idx)||(w.b.itemId===item.id&&w.b.term===idx));
      // Décalage réduit et symétrique (au lieu d'un +9 fixe qui débordait sur la broche
      // suivante dès que l'espacement entre broches se resserre sur un boîtier dense).
      const numDx = t[0] < 30 ? -7 : 7, numDy = t[1] < viewH/2 ? -3.5 : 6.5;
      return `<circle class="terminal-dot ${isConnected?'connected':''} ${wsState.wireStart && wsState.wireStart.itemId===item.id && wsState.wireStart.term===idx ? 'wiring-start':''}" data-term-item="${item.id}" data-term-idx="${idx}" cx="${t[0]}" cy="${t[1]}" r="3.4"/>
        <text class="pin-number" x="${t[0]+numDx}" y="${t[1]+numDy}">${idx+1}</text>`;
    }).join('');
    const UNIT_SUFFIX = { 'état':'', 'logique':'', 'rapport':'', 'gain β':' β', 'type':'' };
    const unitSuffix = def.unit ? (def.unit in UNIT_SUFFIX ? UNIT_SUFFIX[def.unit] : ' '+def.unit.split(' ')[0]) : '';
    const valueLabel = def.unit ? `<text class="comp-label" x="6" y="-4">${esc(item.value)}${esc(unitSuffix)}</text>` : '';
    const refLabel = item.ref ? `<text class="comp-ref" x="6" y="${viewH+8}">${esc(item.ref)}</text>` : '';
    const mismatch = customRefMismatch(item, def);
    const customRefLabel = item.customRef ? `<text class="comp-customref ${mismatch?'mismatch':''}" x="6" y="${viewH+16}">${mismatch?'⚠ ':''}${esc(item.customRef)}</text>` : '';
    return `<g class="comp-node ${selected}" data-item="${item.id}" transform="translate(${item.x},${item.y}) rotate(${item.rot||0},30,${viewH/2})">
      <g class="comp-body">${sym}</g>
      ${valueLabel}${refLabel}${customRefLabel}
      ${terms}
    </g>`;
  }).join('');

  const ghostSvg = (wsState.armedType && wsState.ghostPos) ? (() => {
    const def = findDef(wsState.armedType);
    const sym = SYM[wsState.armedType] || '';
    return `<g class="comp-node drop-preview" transform="translate(${wsState.ghostPos.x},${wsState.ghostPos.y})"><g class="comp-body">${sym}</g></g>`;
  })() : '';

  const peerGhostsSvg = remotePeerGhostsSvg();

  return `<svg class="ws-svg tool-${wsState.tool}" id="ws-svg" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet">
    <defs>
      <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="currentColor"/></marker>
      <pattern id="grid-pattern" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="var(--trace)"/>
      </pattern>
    </defs>
    <g id="ws-viewport" transform="translate(${v.panX},${v.panY}) scale(${v.scale})">
      <rect id="ws-grid-bg" x="-4000" y="-4000" width="9000" height="9000" fill="url(#grid-pattern)"/>
      ${wiresSvg}
      ${junctionsSvg}
      ${itemsSvg}
      ${crossingsSvg()}
      ${ghostSvg}
      ${peerGhostsSvg}
      <line id="wire-preview-line" class="wire-preview" style="display:none" x1="0" y1="0" x2="0" y2="0"/>
    </g>
  </svg>
  ${wsState.armedType ? `<div class="staging-tray">Cliquez sur le canevas pour poser <strong style="margin:0 4px">${esc(findDef(wsState.armedType).nom)}</strong><button id="btn-cancel-armed" title="Annuler">✕</button></div>` : ''}
  ${renderWireToolbar()}`;
}

/* ---- Barre d'outils du fil sélectionné (§2 des notes en cours) : couleur + premier plan ---- */
const WIRE_COLORS = ['#F5A623','#4FD1C5','#E4572E','#6FCF7A','#E8ECEA','#9B59B6'];
function renderWireToolbar(){
  if (wsState.readOnly) return '';
  const w = wsState.schema.wires.find(w=>w.id===wsState.selectedWireId);
  if (!w) return '';
  return `<div class="wire-toolbar">
    <span>Fil sélectionné —</span>
    <div class="wire-colors">${WIRE_COLORS.map(c => `<button class="wire-color-swatch ${(w.color||'#F5A623')===c?'active':''}" data-wire-color="${c}" style="background:${c}" title="Couleur du fil"></button>`).join('')}</div>
    <button class="btn btn-ghost btn-sm" id="btn-wire-front" title="Fait passer ce fil par-dessus les autres à une intersection">⤒ Premier plan</button>
  </div>`;
}
function isCanvasBackground(target, svg){ return target === svg || target.id === 'ws-grid-bg'; }
// Accepte indifféremment un événement souris ou tactile (demande explicite du client : le
// tracé de fil, le déplacement de composant et le pan du canevas doivent fonctionner au
// tactile — TouchEvent porte ses coordonnées dans .touches/.changedTouches, pas .clientX/Y
// directement) plutôt que de dupliquer la logique géométrique pour chaque type d'événement.
function eventPoint(evt){
  if (evt.touches && evt.touches.length) return evt.touches[0];
  if (evt.changedTouches && evt.changedTouches.length) return evt.changedTouches[0];
  return evt;
}
function clientToSvgUser(evt, svg){ const p = eventPoint(evt); const pt = svg.createSVGPoint(); pt.x=p.clientX; pt.y=p.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
function svgUserToCanvas(pt){ const v = wsState.view; return { x:(pt.x - v.panX)/v.scale, y:(pt.y - v.panY)/v.scale }; }

async function persistSchema(){
  if (wsState.readOnly) return; // filet de sécurité final : RLS refuserait de toute façon côté serveur en mode Supabase
  if (wsState.projectId) await db.saveSchema(wsState.projectId, wsState.schema);
  sendPresence({ type:'schema-updated' });
}

/* ==========================================================================
   PRÉSENCE / TRAVAIL PARTAGÉ EN TEMPS RÉEL (§3 des notes en cours)
   --------------------------------------------------------------------------
   Mode Supabase configuré : canal Realtime (broadcast), fonctionne entre
   n'importe quels navigateurs/appareils connectés au même projet Supabase.
   Mode démo locale : repli sur BroadcastChannel, qui ne fonctionne QU'ENTRE
   ONGLETS DU MÊME NAVIGATEUR (il n'existe pas de serveur en mode démo) — le
   badge de présence l'indique explicitement, pour ne jamais laisser croire
   à un temps réel multi-appareils qui n'existe pas en mode démo.
   Ce canal ne transporte que des aperçus éphémères (curseur/glisser en cours
   + accusé "schéma enregistré") : il ne remplace jamais persistSchema() côté
   base de données, qui reste la seule source de vérité.
   ========================================================================== */
let __presenceChannel = null;
let __presencePruneTimer = null;

function openPresenceChannel(projectId){
  closePresenceChannel();
  wsState.remotePeers = {};
  if (SUPABASE_CONFIGURED && supabaseClient){
    const ch = supabaseClient.channel('presence-project-'+projectId, { config:{ broadcast:{ self:false } } });
    ch.on('broadcast', { event:'peer' }, (msg) => handlePeerMessage(msg.payload));
    ch.subscribe();
    __presenceChannel = { send:(payload)=>ch.send({ type:'broadcast', event:'peer', payload }), close:()=>supabaseClient.removeChannel(ch) };
    wsState.presenceMode = 'realtime';
  } else if (typeof BroadcastChannel !== 'undefined'){
    const bc = new BroadcastChannel('labo_presence_'+projectId);
    bc.onmessage = (e) => handlePeerMessage(e.data);
    __presenceChannel = { send:(payload)=>bc.postMessage(payload), close:()=>bc.close() };
    wsState.presenceMode = 'demo';
  } else {
    __presenceChannel = null;
    wsState.presenceMode = null;
  }
  sendPresence({ type:'join' });
  __presencePruneTimer = setInterval(() => {
    const now = Date.now();
    let changed = false;
    Object.keys(wsState.remotePeers).forEach(id => { if (now - wsState.remotePeers[id].lastSeen > 12000){ delete wsState.remotePeers[id]; changed = true; } });
    if (changed){ redrawCanvasLight(); updatePresenceBar(); }
  }, 4000);
}
function closePresenceChannel(){
  if (__presenceChannel){ try{ __presenceChannel.close(); }catch(e){} __presenceChannel = null; }
  if (__presencePruneTimer){ clearInterval(__presencePruneTimer); __presencePruneTimer = null; }
  wsState.remotePeers = {}; wsState.presenceMode = null;
}
function sendPresence(payload){
  if (!__presenceChannel || !auth.currentUser) return;
  __presenceChannel.send({ ...payload, from:auth.currentUser.id, prenom:auth.currentUser.prenom, nom:auth.currentUser.nom, ts:Date.now() });
}
function handlePeerMessage(payload){
  if (!payload || !auth.currentUser || payload.from === auth.currentUser.id) return;
  const isNewPeer = !wsState.remotePeers[payload.from];
  wsState.remotePeers[payload.from] = { ...payload, lastSeen: Date.now() };
  if (payload.type === 'join' && isNewPeer) sendPresence({ type:'join' }); // se signaler en retour à un arrivant
  if (payload.type === 'schema-updated' && !wsState.__draggingLocally){
    db.getProject(wsState.projectId).then(({ data: p }) => {
      if (p && p.schema){ wsState.schema = p.schema; redrawCanvas(); }
    });
  }
  redrawCanvasLight();
  updatePresenceBar();
}
function remotePeerGhostsSvg(){
  const PEER_COLOR = '#9B59B6';
  return Object.values(wsState.remotePeers)
    .filter(p => p.type === 'move' && Date.now() - p.lastSeen < 4000)
    .map(p => `<g class="peer-ghost" style="pointer-events:none" transform="translate(${p.x},${p.y})">
        <rect x="-4" y="-4" width="68" height="38" rx="4" fill="none" stroke="${PEER_COLOR}" stroke-width="2" stroke-dasharray="4 3"/>
        <text x="0" y="-8" font-size="7" fill="${PEER_COLOR}">${esc(p.prenom||'?')}</text>
      </g>`).join('');
}
function updatePresenceBar(){
  const bar = document.getElementById('presence-bar');
  if (!bar) return;
  const peers = Object.values(wsState.remotePeers);
  if (!peers.length){ bar.innerHTML = ''; return; }
  const modeNote = wsState.presenceMode === 'demo' ? ' (entre onglets de ce navigateur — mode démo)' : '';
  bar.innerHTML = `<span class="pill pill-cyan" title="En ligne sur ce projet${esc(modeNote)}">👥 ${peers.map(p=>esc(p.prenom||'?')).join(', ')}${modeNote}</span>`;
}

function redrawCanvas(){
  const holder = document.getElementById('ws-canvas-holder');
  if (!holder) return;
  const zoomCtrls = holder.querySelector('.zoom-controls');
  const favPanel = holder.querySelector('#fav-panel');
  const favReopen = holder.querySelector('#fav-panel-reopen');
  const toolPanel = holder.querySelector('#tool-panel');
  const toolReopen = holder.querySelector('#tool-panel-reopen');
  holder.innerHTML = renderCanvasSVG();
  if (toolPanel) holder.appendChild(toolPanel);
  if (toolReopen) holder.appendChild(toolReopen);
  if (favPanel) holder.appendChild(favPanel);
  if (favReopen) holder.appendChild(favReopen);
  if (zoomCtrls) holder.appendChild(zoomCtrls);
  const pct = document.getElementById('zoom-pct'); if (pct) pct.textContent = Math.round(wsState.view.scale*100)+'%';
  wireCanvasEvents();
  wireFavPanel();
  wireToolPanel();
}

function wireCanvasEvents(){
  const svg = document.getElementById('ws-svg');
  if (!svg) return;

  document.getElementById('btn-cancel-armed')?.addEventListener('click', (e) => { e.stopPropagation(); wsState.armedType = null; wsState.ghostPos = null; redrawCanvas(); });

  document.querySelectorAll('[data-wire-color]').forEach(sw => sw.addEventListener('click', (e) => {
    e.stopPropagation();
    const w = wsState.schema.wires.find(w=>w.id===wsState.selectedWireId);
    if (!w) return;
    pushUndoSnapshot();
    w.color = sw.dataset.wireColor;
    persistSchema(); redrawCanvas();
  }));
  document.getElementById('btn-wire-front')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = wsState.schema.wires.findIndex(w=>w.id===wsState.selectedWireId);
    if (idx === -1) return;
    pushUndoSnapshot();
    const [w] = wsState.schema.wires.splice(idx,1);
    wsState.schema.wires.push(w);
    persistSchema(); redrawCanvas(); toast('Fil envoyé au premier plan.');
  });

  // Aperçu du fil en cours de traçage, et fantôme du composant "armé" en attente de dépôt.
  // Écouté aussi bien en souris qu'au doigt (touchmove) — demande explicite du client : sans
  // ça, tracer un fil au tactile posait bien le fil au second tapotement mais sans jamais
  // montrer la ligne de prévisualisation suivre le doigt entre les deux, contrairement à la
  // souris. `{ passive:false }` + preventDefault évite que le geste fasse défiler la page.
  const wirePreviewMove = (e) => {
    if (wsState.tool === 'fil' && wsState.wireStart){
      if (e.cancelable) e.preventDefault();
      const line = document.getElementById('wire-preview-line');
      const startItem = wsState.schema.items.find(i=>i.id===wsState.wireStart.itemId);
      if (line && startItem){
        const a = terminalAbsPos(startItem, wsState.wireStart.term);
        const cur = svgUserToCanvas(clientToSvgUser(e, svg));
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
        line.setAttribute('x2', cur.x); line.setAttribute('y2', cur.y);
        line.style.display = '';
      }
    }
    if (wsState.armedType){
      const cur = svgUserToCanvas(clientToSvgUser(e, svg));
      const armedViewH = (findDef(wsState.armedType).viewH || 30);
      wsState.ghostPos = { x: snap(cur.x-30), y: snap(cur.y-armedViewH/2) };
      const ghost = svg.querySelector('.drop-preview');
      if (ghost) ghost.setAttribute('transform', `translate(${wsState.ghostPos.x},${wsState.ghostPos.y})`);
    }
  };
  svg.addEventListener('mousemove', wirePreviewMove);
  svg.addEventListener('touchmove', wirePreviewMove, { passive:false });

  // Échap annule un fil en cours / un placement armé (lié une seule fois, jamais empilé aux redraws).
  if (!window.__wireEscBound){
    window.__wireEscBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        if (wsState.wireStart){ wsState.wireStart = null; redrawCanvas(); }
        else if (wsState.armedType){ wsState.armedType = null; wsState.ghostPos = null; redrawCanvas(); }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && wsState.selectedWireId && document.getElementById('ws-svg') && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
        e.preventDefault();
        if (guardReadOnly()) return;
        pushUndoSnapshot();
        wsState.schema.wires = wsState.schema.wires.filter(w=>w.id!==wsState.selectedWireId);
        wsState.selectedWireId = null; persistSchema(); redrawCanvas(); toast('Fil supprimé.');
      }
      // Ctrl+Z / Ctrl+Y (ou Ctrl+Maj+Z) : annuler/rétablir la dernière action sur le schéma.
      if ((e.ctrlKey || e.metaKey) && document.getElementById('ws-svg') && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
        if (e.key === 'z' || e.key === 'Z'){ e.preventDefault(); if (e.shiftKey) redoSchema(); else undoSchema(); }
        else if (e.key === 'y' || e.key === 'Y'){ e.preventDefault(); redoSchema(); }
      }
    });
  }

  // Clic sur le fond du canevas : dépose le composant armé, sinon démarre un pan.
  svg.addEventListener('click', (e) => {
    if (!isCanvasBackground(e.target, svg)) return;
    if (wsState.armedType){
      const cur = svgUserToCanvas(clientToSvgUser(e, svg));
      const def = findDef(wsState.armedType);
      pushUndoSnapshot();
      wsState.schema.items.push({ id:'i_'+Math.random().toString(36).slice(2,8), typeId:wsState.armedType, x:snap(cur.x-30), y:snap(cur.y-(def.viewH||30)/2), rot:0, value: def.defaultValue ?? '' });
      recordRecentComponent(wsState.armedType);
      wsState.armedType = null; wsState.ghostPos = null;
      persistSchema(); redrawCanvas(); refreshFavPanelBody(); toast(`${def.nom} posé.`);
    } else if (wsState.selectedWireId){
      wsState.selectedWireId = null; redrawCanvas();
    }
  });

  svg.querySelectorAll('.terminal-dot').forEach(dot => {
    dot.addEventListener('mousedown', (e) => e.stopPropagation());
    dot.addEventListener('touchstart', (e) => e.stopPropagation(), { passive:true });
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = dot.dataset.termItem, term = Number(dot.dataset.termIdx);
      // Reconnexion d'une extrémité de fil en cours de déplacement.
      if (wsState.dragWireEnd){
        if (guardReadOnly()) { wsState.dragWireEnd = null; return; }
        const w = wsState.schema.wires.find(w=>w.id===wsState.dragWireEnd.wireId);
        if (w){ pushUndoSnapshot(); w[wsState.dragWireEnd.end] = { itemId, term }; persistSchema(); }
        wsState.dragWireEnd = null; redrawCanvas(); return;
      }
      if (wsState.tool !== 'fil') return;
      if (guardReadOnly()) return;
      if (!wsState.wireStart){ wsState.wireStart = { itemId, term }; redrawCanvas(); return; }
      if (wsState.wireStart.itemId === itemId && wsState.wireStart.term === term){ wsState.wireStart = null; redrawCanvas(); return; }
      pushUndoSnapshot();
      wsState.schema.wires.push({ id:'w_'+Math.random().toString(36).slice(2,8), a:wsState.wireStart, b:{itemId,term} });
      wsState.wireStart = null; persistSchema(); redrawCanvas();
    });
  });

  // Menu contextuel composant (clic droit desktop, appui long tactile) — §6.
  svg.querySelectorAll('.comp-node').forEach(node => {
    let dragging=false, startPt=null, orig=null, moved=false, longPressTimer=null;

    node.addEventListener('contextmenu', (e) => { e.preventDefault(); openComponentContextMenu(node.dataset.item, e.clientX, e.clientY); });

    // Déplacement d'un composant — souris ET tactile (demande explicite du client : glisser un
    // composant du doigt doit fonctionner comme à la souris, pas seulement le sélectionner).
    // Au tactile, un minuteur d'appui long démarre EN PARALLÈLE pour le menu contextuel (§6) ;
    // si le doigt bouge avant son échéance, c'est un déplacement réel et le minuteur est annulé
    // dans onMove ci-dessous — les deux gestes ne peuvent donc pas aboutir en même temps.
    const startDrag = (e, isTouch) => {
      if (wsState.tool === 'supprimer') return; // géré au click
      if (wsState.tool === 'fil') return;
      if (!isTouch && e.button === 2) return;
      e.stopPropagation();
      if (wsState.readOnly){ selectItem(node.dataset.item); return; } // consultation seule : pas de déplacement
      const item = wsState.schema.items.find(i=>i.id===node.dataset.item);
      dragging = true; moved = false; startPt = clientToSvgUser(e, svg); orig = { x:item.x, y:item.y };
      // Capturé AVANT toute modification (item.x/y n'ont pas encore bougé ici) — poussé sur la pile
      // d'annulation seulement si le geste se révèle être un vrai déplacement (voir onUp), pas un
      // simple clic/tapotement de sélection.
      const preDragSnapshot = JSON.stringify(wsState.schema);
      wsState.__draggingLocally = true;
      let lastBroadcast = 0;
      const onMove = (ev) => {
        if (isTouch && ev.cancelable) ev.preventDefault();
        const cur = clientToSvgUser(ev, svg);
        const dx = (cur.x-startPt.x)/wsState.view.scale, dy=(cur.y-startPt.y)/wsState.view.scale;
        if (Math.abs(dx)+Math.abs(dy) > 2){ moved = true; if (isTouch) clearTimeout(longPressTimer); }
        item.x = orig.x+dx; item.y = orig.y+dy;
        redrawCanvasLight();
        const now = Date.now();
        if (now - lastBroadcast > 120){ lastBroadcast = now; sendPresence({ type:'move', itemId:item.id, x:item.x, y:item.y }); }
      };
      const onUp = () => {
        document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
        document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp); document.removeEventListener('touchcancel',onUp);
        if (isTouch) clearTimeout(longPressTimer); // relâché avant l'échéance : pas de menu contextuel différé
        dragging=false; wsState.__draggingLocally = false;
        if (!moved){ selectItem(item.id); return; }
        item.x = snap(item.x); item.y = snap(item.y);
        pushUndoSnapshot(preDragSnapshot);
        persistSchema(); redrawCanvas();
      };
      if (isTouch){ document.addEventListener('touchmove',onMove,{ passive:false }); document.addEventListener('touchend',onUp); document.addEventListener('touchcancel',onUp); }
      else { document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp); }
    };

    node.addEventListener('mousedown', (e) => startDrag(e, false));

    // Appui long tactile → menu contextuel (adapté téléphone, §6) ; voir startDrag ci-dessus
    // pour le déplacement au doigt, démarré en parallèle du minuteur.
    node.addEventListener('touchstart', (e) => {
      if (wsState.tool === 'supprimer' || wsState.tool === 'fil') return;
      const touch = e.touches[0];
      longPressTimer = setTimeout(() => { openComponentContextMenu(node.dataset.item, touch.clientX, touch.clientY); }, 550);
      startDrag(e, true);
    }, { passive:false });

    node.addEventListener('click', (e) => {
      if (wsState.tool === 'supprimer'){
        e.stopPropagation();
        deleteItem(node.dataset.item);
      }
    });
  });

  svg.querySelectorAll('.wire-line').forEach(line => {
    line.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = line.dataset.wire;
      if (wsState.tool === 'supprimer'){
        if (guardReadOnly()) return;
        pushUndoSnapshot();
        wsState.schema.wires = wsState.schema.wires.filter(w=>w.id!==id);
        persistSchema(); redrawCanvas(); toast('Fil supprimé.');
        return;
      }
      wsState.selectedWireId = (wsState.selectedWireId === id) ? null : id;
      redrawCanvas();
    });
    line.addEventListener('contextmenu', (e) => { e.preventDefault(); wsState.selectedWireId = line.dataset.wire; redrawCanvas(); });
  });

  // Nœud à une intersection de fils : clic pour relier/dissocier électriquement (priorité §2 des notes).
  svg.querySelectorAll('.wire-crossing').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleJunctionAt(Number(dot.dataset.cx), Number(dot.dataset.cy));
    });
  });

  // Poignées de reconnexion sur le fil sélectionné : glisser une extrémité vers une autre borne.
  if (wsState.selectedWireId){
    const w = wsState.schema.wires.find(w=>w.id===wsState.selectedWireId);
    if (w){
      ['a','b'].forEach(end => {
        const it = wsState.schema.items.find(i=>i.id===w[end].itemId);
        if (!it) return;
        const p = terminalAbsPos(it, w[end].term);
        const handle = document.createElementNS('http://www.w3.org/2000/svg','circle');
        handle.setAttribute('cx', p.x); handle.setAttribute('cy', p.y); handle.setAttribute('r', 6);
        handle.setAttribute('fill', 'transparent'); handle.setAttribute('stroke', 'var(--cyan)'); handle.setAttribute('stroke-width', '1.5'); handle.style.cursor = 'grab';
        handle.addEventListener('click', (e) => { e.stopPropagation(); if (guardReadOnly()) return; wsState.dragWireEnd = { wireId:w.id, end }; toast('Cliquez une borne pour reconnecter ce fil.'); });
        document.getElementById('ws-viewport').appendChild(handle);
      });
    }
  }

  // clic droit sur le fond : annule un fil en cours plutôt que d'ouvrir le menu du navigateur
  svg.addEventListener('contextmenu', (e) => {
    if (isCanvasBackground(e.target, svg) && wsState.tool === 'fil' && wsState.wireStart){ e.preventDefault(); wsState.wireStart = null; redrawCanvas(); }
  });

  // pan + zoom sur fond — souris ET tactile (glisser un doigt sur le fond du canevas déplace
  // la vue), demande explicite du client.
  let panning=false, panStart=null, panOrig=null;
  const startPan = (e) => {
    if (!isCanvasBackground(e.target, svg) || wsState.armedType) return;
    if (e.cancelable) e.preventDefault();
    panning = true; svg.classList.add('panning'); panStart = clientToSvgUser(e, svg); panOrig = { ...wsState.view };
    const onMove = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const cur = clientToSvgUser(ev, svg);
      wsState.view.panX = panOrig.panX + (cur.x - panStart.x);
      wsState.view.panY = panOrig.panY + (cur.y - panStart.y);
      document.getElementById('ws-viewport').setAttribute('transform', `translate(${wsState.view.panX},${wsState.view.panY}) scale(${wsState.view.scale})`);
    };
    const onUp = () => {
      panning=false; svg.classList.remove('panning');
      document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
      document.removeEventListener('touchmove',onMove); document.removeEventListener('touchend',onUp); document.removeEventListener('touchcancel',onUp);
    };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    document.addEventListener('touchmove',onMove,{ passive:false }); document.addEventListener('touchend',onUp); document.addEventListener('touchcancel',onUp);
  };
  svg.addEventListener('mousedown', startPan);
  svg.addEventListener('touchstart', startPan, { passive:false });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = svgUserToCanvas(clientToSvgUser(e, svg));
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    wsState.view.scale = Math.min(4, Math.max(0.35, wsState.view.scale*factor));
    const svgUserNow = clientToSvgUser(e, svg);
    wsState.view.panX = svgUserNow.x - before.x*wsState.view.scale;
    wsState.view.panY = svgUserNow.y - before.y*wsState.view.scale;
    redrawCanvas();
  }, { passive:false });
}

function deleteItem(id){
  if (guardReadOnly()) return;
  pushUndoSnapshot();
  wsState.schema.items = wsState.schema.items.filter(i=>i.id!==id);
  wsState.schema.wires = wsState.schema.wires.filter(w=>w.a.itemId!==id && w.b.itemId!==id);
  if (wsState.selectedId===id) wsState.selectedId=null;
  persistSchema(); redrawCanvas(); toast('Élément supprimé.');
}

function redrawCanvasLight(){
  // pendant un glisser de composant : on ne recalcule que positions + fils, sans réattacher tous les handlers
  const svg = document.getElementById('ws-svg');
  if (!svg) return;
  wsState.schema.items.forEach(item => {
    const g = svg.querySelector(`.comp-node[data-item="${item.id}"]`);
    if (g){ const viewH = findDef(item.typeId).viewH || 30; g.setAttribute('transform', `translate(${item.x},${item.y}) rotate(${item.rot||0},30,${viewH/2})`); }
  });
  const viewport = document.getElementById('ws-viewport');
  viewport.querySelectorAll('.wire-line, .wire-junction').forEach(l=>l.remove());
  const endpointCount = new Map();
  const addPt = (p) => { const k = Math.round(p.x)+','+Math.round(p.y); endpointCount.set(k, (endpointCount.get(k)||0)+1); };
  const wiresSvg = wsState.schema.wires.map(w => {
    const ai = wsState.schema.items.find(i=>i.id===w.a.itemId), bi = wsState.schema.items.find(i=>i.id===w.b.itemId);
    if (!ai || !bi) return '';
    const a = terminalAbsPos(ai, w.a.term), b = terminalAbsPos(bi, w.b.term);
    addPt(a); addPt(b);
    const custom = w.color && w.id!==wsState.selectedWireId ? ` style="stroke:${esc(w.color)}"` : '';
    return `<polyline class="wire-line ${w.id===wsState.selectedWireId?'selected':''}" data-wire="${w.id}" points="${polylinePoints(orthoPoints(a,b))}" fill="none"${custom}/>`;
  }).join('');
  const junctionsSvg = [...endpointCount.entries()].filter(([,n])=>n>=3).map(([k]) => { const [x,y]=k.split(',').map(Number); return `<circle class="wire-junction" cx="${x}" cy="${y}" r="3"/>`; }).join('');
  viewport.insertAdjacentHTML('afterbegin', wiresSvg + junctionsSvg);
  viewport.querySelectorAll('.wire-crossing').forEach(c=>c.remove());
  viewport.insertAdjacentHTML('beforeend', crossingsSvg());
  viewport.querySelectorAll('.peer-ghost').forEach(g=>g.remove());
  viewport.insertAdjacentHTML('beforeend', remotePeerGhostsSvg());
}

function selectItem(id){
  wsState.selectedId = id;
  wsState.selectedWireId = null;
  document.querySelectorAll('.ws-tab').forEach(t=>t.classList.remove('active'));
  const propsTab = [...document.querySelectorAll('.ws-tab')].find(t=>t.dataset.tab==='proprietes');
  propsTab?.classList.add('active');
  const panel = document.getElementById('ws-panel');
  if (panel) panel.innerHTML = window.__wsPanels.proprietes();
  redrawCanvas();
  wirePropsPanel();
}

function wirePropsPanel(){
  // customref/value-custom : évènement `input` (une entrée par frappe clavier) — on capture l'état
  // AVANT modification une seule fois, au premier focus de cette instance du champ, pour que toute
  // une saisie compte comme UNE seule étape d'annulation plutôt qu'une par caractère tapé.
  document.getElementById('prop-customref')?.addEventListener('focus', () => { if (!guardReadOnly()) pushUndoSnapshot(); }, { once:true });
  document.getElementById('prop-customref')?.addEventListener('input', (e) => {
    if (guardReadOnly()) return;
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    const def = findDef(item.typeId);
    item.customRef = e.target.value;
    const warnBox = document.getElementById('customref-warning');
    if (warnBox) warnBox.innerHTML = customRefMismatch(item, def) ? `<div class="diag-warn" style="margin-bottom:10px">⚠ « ${esc(item.customRef)} » ne correspond pas au modèle « ${esc(def.nom)} » réellement posé — le brochage/comportement simulés restent ceux du ${esc(def.nom)}.</div>` : '';
    persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-value')?.addEventListener('change', (e) => {
    if (guardReadOnly()) return;
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    const customInput = document.getElementById('prop-value-custom');
    if (e.target.value === '__custom__'){ customInput.classList.remove('hidden'); customInput.focus(); return; }
    customInput.classList.add('hidden');
    pushUndoSnapshot();
    item.value = e.target.value; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-value-custom')?.addEventListener('focus', () => { if (!guardReadOnly()) pushUndoSnapshot(); }, { once:true });
  document.getElementById('prop-value-custom')?.addEventListener('input', (e) => {
    if (guardReadOnly()) return;
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    item.value = e.target.value; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-variant')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    replaceVariant(wsState.selectedId, e.target.value);
  });
  document.getElementById('prop-rotate')?.addEventListener('click', () => {
    if (guardReadOnly()) return;
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    pushUndoSnapshot();
    item.rot = ((item.rot||0)+90)%360; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-duplicate')?.addEventListener('click', () => duplicateItem(wsState.selectedId));
  document.getElementById('prop-delete')?.addEventListener('click', () => { deleteItem(wsState.selectedId); const p=document.getElementById('ws-panel'); if(p) p.innerHTML = window.__wsPanels.proprietes(); });
}

function duplicateItem(id){
  if (guardReadOnly()) return;
  const item = wsState.schema.items.find(i=>i.id===id);
  if (!item) return;
  pushUndoSnapshot();
  const copy = { ...item, id:'i_'+Math.random().toString(36).slice(2,8), x:snap(item.x+40), y:snap(item.y+40) };
  wsState.schema.items.push(copy);
  wsState.selectedId = copy.id;
  persistSchema(); redrawCanvas();
  const panel = document.getElementById('ws-panel');
  if (panel){ panel.innerHTML = window.__wsPanels.proprietes(); wirePropsPanel(); }
  toast('Composant dupliqué.');
}

// Remplace un composant par une variante de la même famille (§6 "Remplacer par une variante"),
// en conservant position/rotation ; les fils reliés à des bornes qui n'existent plus sont retirés
// (les autres sont conservés — l'auto-organisation/le remplacement ne doit jamais casser sans raison).
function replaceVariant(itemId, newTypeId){
  if (guardReadOnly()) return;
  const item = wsState.schema.items.find(i=>i.id===itemId);
  const newDef = findDef(newTypeId);
  if (!item || !newDef) return;
  pushUndoSnapshot();
  item.typeId = newTypeId;
  if (item.value === undefined || !newDef.valueOptions?.length) item.value = newDef.defaultValue ?? '';
  wsState.schema.wires = wsState.schema.wires.filter(w =>
    !((w.a.itemId===itemId && w.a.term >= newDef.terminals.length) || (w.b.itemId===itemId && w.b.term >= newDef.terminals.length)));
  persistSchema(); redrawCanvas();
  const panel = document.getElementById('ws-panel');
  if (panel){ panel.innerHTML = window.__wsPanels.proprietes(); wirePropsPanel(); }
  toast(`Remplacé par : ${newDef.nom}.`);
}

/* ---- Menu contextuel (§6) ---- */
/* ---- Partage d'un projet (§3 des notes en cours) : permissions voir/voir+modifier,
   recherche parmi les utilisateurs déjà inscrits (plus de simple prompt() par e-mail). ---- */
async function openShareModal(projectId){
  const { data: project } = await db.getProject(projectId);
  if (!project) return;
  const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal" style="max-width:480px;text-align:left">
    <h3>Partager « ${esc(project.titre)} »</h3>
    <p style="font-size:.82em">Les personnes ajoutées voient (et, si autorisées, modifient) ce projet depuis leur espace « Partagés avec moi ». Une notification leur est envoyée.</p>
    <div id="share-collab-list">${renderCollabRows(project.collaborateurs||[])}</div>
    <div class="field" style="margin-top:14px">
      <label>Ajouter une personne (nom, prénom ou e-mail)</label>
      <input type="text" id="share-search" placeholder="Rechercher un utilisateur inscrit…" autocomplete="off">
      <div id="share-search-results"></div>
    </div>
    <div style="text-align:right;margin-top:1em"><button class="btn btn-ghost" id="btn-close-share">Fermer</button></div>
  </div>`;
  document.body.appendChild(backdrop);

  async function refreshCollabList(){
    const { data: p } = await db.getProject(projectId);
    document.getElementById('share-collab-list').innerHTML = renderCollabRows(p.collaborateurs||[]);
    wireCollabRows();
  }
  function wireCollabRows(){
    document.querySelectorAll('#share-collab-list [data-perm]').forEach(sel => sel.addEventListener('change', async () => {
      const { error } = await db.addCollaborator({ projectId, userId: sel.dataset.perm, permission: sel.value });
      if (error) toast(error.message); else toast('Permission mise à jour.');
    }));
    document.querySelectorAll('#share-collab-list [data-remove-collab]').forEach(b => b.addEventListener('click', async () => {
      await db.removeCollaborator({ projectId, userId: b.dataset.removeCollab });
      toast('Accès retiré.'); refreshCollabList();
    }));
  }
  wireCollabRows();

  const searchInput = document.getElementById('share-search');
  const resultsBox = document.getElementById('share-search-results');
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value;
    searchTimer = setTimeout(async () => {
      if (q.trim().length < 2){ resultsBox.innerHTML = ''; return; }
      const { data: users } = await db.searchUsers(q);
      const already = new Set((project.collaborateurs||[]).map(c=>c.userId));
      const options = users.filter(u => u.id !== auth.currentUser.id && u.id !== project.ownerId && !already.has(u.id));
      resultsBox.innerHTML = options.length ? options.map(u => `
        <div class="member-row"><span>${esc(u.prenom)} ${esc(u.nom)} <span style="color:var(--text-faint);font-size:.85em">${esc(u.email)}</span></span>
          <span style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm" data-add-collab="${u.id}" data-perm-val="lecture">Voir</button>
            <button class="btn btn-sm" data-add-collab="${u.id}" data-perm-val="edition">Voir + modifier</button>
          </span></div>`).join('') : '<div class="empty" style="padding:8px 0">Aucun utilisateur trouvé.</div>';
      resultsBox.querySelectorAll('[data-add-collab]').forEach(b => b.addEventListener('click', async () => {
        const { error } = await db.addCollaborator({ projectId, userId: b.dataset.addCollab, permission: b.dataset.permVal });
        if (error){ toast(error.message); return; }
        toast('Accès accordé.'); searchInput.value=''; resultsBox.innerHTML=''; refreshCollabList();
      }));
    }, 300);
  });

  backdrop.querySelector('#btn-close-share').onclick = () => backdrop.remove();
}
function renderCollabRows(collabs){
  if (!collabs.length) return '<div class="empty" style="padding:10px 0">Personne d\'autre n\'a encore accès à ce projet.</div>';
  return collabs.map(c => {
    const u = db.userById(c.userId);
    return `<div class="member-row"><span>${esc(u?.prenom||'?')} ${esc(u?.nom||'')} <span style="color:var(--text-faint);font-size:.85em">${esc(u?.email||'')}</span></span>
      <span style="display:flex;gap:6px;align-items:center">
        <select data-perm="${c.userId}">
          <option value="lecture" ${c.permission==='lecture'?'selected':''}>Voir seulement</option>
          <option value="edition" ${c.permission==='edition'?'selected':''}>Voir + modifier</option>
        </select>
        <button class="btn btn-ghost btn-sm" data-remove-collab="${c.userId}" title="Retirer l'accès">✕</button>
      </span></div>`;
  }).join('');
}

function openComponentContextMenu(itemId, x, y){
  document.querySelectorAll('.ctx-menu, .catalog-popover').forEach(m=>m.remove());
  const item = wsState.schema.items.find(i=>i.id===itemId);
  if (!item) return;
  const def = findDef(item.typeId);
  const variantOptions = (def.variantes||[]).map(vid => findDef(vid)).filter(Boolean);
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = Math.min(x, window.innerWidth-210) + 'px';
  menu.style.top = Math.min(y, window.innerHeight-320) + 'px';
  menu.innerHTML = `
    <button data-act="proprietes">⚙ Propriétés</button>
    <button data-act="pivoter">↻ Pivoter</button>
    <button data-act="dupliquer">⧉ Dupliquer</button>
    ${variantOptions.length ? `<hr>${variantOptions.map(v=>`<button data-act="variante" data-vid="${v.id}">⇄ Remplacer par : ${esc(v.nom)}</button>`).join('')}` : ''}
    <hr>
    <button data-act="info">ⓘ Informations</button>
    <button data-act="supprimer" class="danger">✕ Supprimer</button>`;
  document.body.appendChild(menu);
  menu.querySelector('[data-act="proprietes"]').onclick = () => { close(); selectItem(itemId); };
  menu.querySelector('[data-act="pivoter"]').onclick = () => { close(); if (guardReadOnly()) return; pushUndoSnapshot(); item.rot=((item.rot||0)+90)%360; persistSchema(); redrawCanvas(); };
  menu.querySelector('[data-act="dupliquer"]').onclick = () => { close(); duplicateItem(itemId); };
  menu.querySelector('[data-act="info"]').onclick = (e) => { close(); showCatalogPopover(def, menu); };
  menu.querySelector('[data-act="supprimer"]').onclick = () => { close(); deleteItem(itemId); };
  menu.querySelectorAll('[data-act="variante"]').forEach(b => b.onclick = () => { close(); selectItem(itemId); replaceVariant(itemId, b.dataset.vid); });
  function close(){ menu.remove(); document.removeEventListener('click', close); }
  setTimeout(()=>document.addEventListener('click', close), 10);
}

function afterProjectView(){
  if (!window.__wsPanels) return;
  wireCanvasEvents();
  wireFavPanel();
  wireToolPanel();
  updatePresenceBar();

  const $panel = document.getElementById('ws-panel');
  document.querySelectorAll('.ws-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.ws-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      $panel.innerHTML = window.__wsPanels[tab.dataset.tab]();
      wireCommentForm(); wirePropsPanel();
    };
  });
  wireCommentForm();

  document.getElementById('statut-select')?.addEventListener('change', async (e) => {
    if (guardReadOnly()) return;
    await db.setProjectStatut(wsState.projectId, e.target.value);
    toast('Statut du projet mis à jour.');
  });

  document.getElementById('btn-test-circuit')?.addEventListener('click', () => {
    const panel = document.getElementById('ws-panel');
    document.querySelectorAll('.ws-tab').forEach(t=>t.classList.remove('active'));
    const dtab = [...document.querySelectorAll('.ws-tab')].find(t=>t.dataset.tab==='diagnostic');
    dtab?.classList.add('active');
    if (panel) panel.innerHTML = window.__wsPanels.diagnostic();
    toast('Vérification structurelle affichée dans l\'onglet Diagnostic — moteur de calcul électrique à intégrer dans une prochaine étape.');
  });
  document.getElementById('btn-save-project')?.addEventListener('click', async () => { await persistSchema(); toast('Projet enregistré.'); });
  document.getElementById('btn-share')?.addEventListener('click', () => openShareModal(wsState.projectId));

  document.getElementById('btn-export-pdf')?.addEventListener('click', async () => {
    if (!confirm('Exporter le schéma en PDF maintenant ? Le contenu reflétera l\'état actuel du schéma (composants, connexions, diagnostic).')) return;
    await exportSchemaPDF(wsState.projectId, wsState.schema);
    if (!wsState.readOnly){ await db.setProjectStatut(wsState.projectId, 'exporte'); render(); }
  });
  document.getElementById('btn-export-pdf-full')?.addEventListener('click', async () => {
    if (!confirm('Générer le rapport complet en PDF maintenant ? Le contenu reflétera l\'état actuel du schéma, du devis et du dimensionnement.')) return;
    await exportRapportCompletPDF(wsState.projectId, wsState.schema);
    if (!wsState.readOnly){ await db.setProjectStatut(wsState.projectId, 'exporte'); render(); }
  });

  document.getElementById('btn-ai-interpret')?.addEventListener('click', async () => {
    if (!AI_CONFIGURED){ toast("Interprétation IA non configurée — voir AI_EDGE_FUNCTION_URL en tête de fichier et supabase/functions/ai-interpret."); return; }
    const items = wsState.schema.items, wires = wsState.schema.wires;
    const connected = new Set();
    wires.forEach(w => { connected.add(w.a.itemId+'#'+w.a.term); connected.add(w.b.itemId+'#'+w.b.term); });
    const nonConnectees = items.reduce((n,item) => n + findDef(item.typeId).terminals.filter((t,idx)=>!connected.has(item.id+'#'+idx)).length, 0);
    const { data: project } = await db.getProject(wsState.projectId);
    toast('Interprétation en cours…');
    try {
      const res = await fetch(AI_EDGE_FUNCTION_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          domaine: project?.espace,
          composants: items.map(i => ({ type:i.typeId, valeur:i.value })),
          connexions: wires.length,
          diagnostic: { bornesNonConnectees: nonConnectees },
        }),
      });
      const data = await res.json();
      if (data.error){ toast('IA : ' + data.error); return; }
      const backdrop = document.createElement('div'); backdrop.className='modal-backdrop';
      backdrop.innerHTML = `<div class="modal" style="max-width:520px;text-align:left"><h3>Interprétation IA</h3><p style="white-space:pre-wrap;font-size:.9em">${esc(data.interpretation || '(réponse vide)')}</p><div style="text-align:right;margin-top:1em"><button class="btn btn-ghost" id="btn-close-ai">Fermer</button></div></div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector('#btn-close-ai').onclick = () => backdrop.remove();
    } catch (err) {
      toast("Erreur d'appel à l'IA : " + err.message);
    }
  });

  // Repli/dépli des familles du catalogue (§36 : performance, catalogue potentiellement très grand).
  document.querySelectorAll('[data-fam-toggle]').forEach(h => h.addEventListener('click', () => {
    h.classList.toggle('collapsed');
    h.nextElementSibling?.classList.toggle('collapsed');
  }));

  // Délégation sur le panneau outils : couvre aussi les résultats de recherche injectés dynamiquement.
  const $tools = document.querySelector('.ws-tools');
  $tools?.addEventListener('click', (e) => {
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn){
      const nowFav = toggleFavorite(favBtn.dataset.fav);
      favBtn.textContent = nowFav ? '★' : '☆';
      favBtn.classList.toggle('active', nowFav);
      refreshFavPanelBody();
      return;
    }
    const placeBtn = e.target.closest('[data-place]');
    if (placeBtn){ armComponentForPlacement(placeBtn.dataset.place); return; }
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn){
      wsState.tool = toolBtn.dataset.tool; wsState.wireStart = null; wsState.armedType = null;
      const label = { select:'Sélection', fil:'Tracer un fil', supprimer:'Supprimer' }[wsState.tool];
      document.getElementById('tool-indicator').textContent = 'Outil : ' + label;
      redrawCanvas();
      return;
    }
    const infoBtn = e.target.closest('[data-info]');
    if (infoBtn){
      const def = findDef(infoBtn.dataset.info);
      showCatalogPopover(def, infoBtn);
    }
  });

  document.getElementById('ws-search')?.addEventListener('input', (e) => {
    const results = searchCatalog(e.target.value);
    const $r = document.getElementById('ws-search-results');
    $r.innerHTML = !e.target.value.trim() ? '' : (results.length
      ? results.map(c => `<div class="catalog-item"><button class="ws-comp" data-place="${c.id}">▫ ${esc(c.nom)} <span style="opacity:.6;font-size:.85em">— ${esc(c.famille||'')}</span></button><button class="fav-btn ${isFavorite(c.id)?'active':''}" data-fav="${c.id}" title="Favori">${isFavorite(c.id)?'★':'☆'}</button><button class="info-btn" data-info="${c.id}" title="En savoir plus">ⓘ</button></div>`).join('')
      : `<div class="empty" style="padding:10px 4px;font-size:.78em">Aucun résultat.</div>`);
  });

  document.getElementById('zoom-in')?.addEventListener('click', () => { wsState.view.scale = Math.min(4, wsState.view.scale*1.2); redrawCanvas(); });
  document.getElementById('zoom-out')?.addEventListener('click', () => { wsState.view.scale = Math.max(0.35, wsState.view.scale/1.2); redrawCanvas(); });

  document.querySelectorAll('[data-mtab]').forEach(b => b.onclick = () => {
    document.querySelectorAll('[data-mtab]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelector('.ws-tools').classList.toggle('mobile-active', b.dataset.mtab==='tools');
    document.querySelector('.ws-canvas-wrap').classList.toggle('mobile-active', b.dataset.mtab==='canvas');
    document.querySelector('.ws-right').classList.toggle('mobile-active', b.dataset.mtab==='right');
  });

  function wireCommentForm(){
    const form = document.getElementById('form-comment');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      await db.addComment({ projectId: wsState.projectId, userId:auth.currentUser.id, texte:f.get('texte') });
      toast('Commentaire ajouté.'); render();
    };
  }
}

// Brochage réel (nom de chaque broche, dans l'ordre des bornes du composant) pour les références
// précises qui en déclarent un (§7 des notes en cours : le brochage réel reste rattaché au modèle,
// affiché ici en toutes lettres plutôt que seulement numéroté sur le petit symbole du canevas).
function pinNamesListHTML(def){
  if (!def.pinNames || !def.pinNames.length) return '';
  return `<div class="pinout-list"><strong style="font-size:.85em">Brochage :</strong>
    ${def.pinNames.map((n,i) => `<div class="pinout-row"><span class="mono">${i+1}</span><span>${esc(n)}</span></div>`).join('')}
  </div>`;
}
function showCatalogPopover(def, anchorEl){
  document.querySelectorAll('.catalog-popover').forEach(p=>p.remove());
  const rect = anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left:anchorEl.style?.left?parseFloat(anchorEl.style.left):200, bottom:200 };
  const pop = document.createElement('div');
  pop.className = 'catalog-popover';
  pop.style.left = Math.min(rect.left, window.innerWidth-280) + 'px';
  pop.style.top = (rect.bottom+6) + 'px';
  pop.innerHTML = `<h4>${esc(def.nom)}</h4><p style="margin:0">${esc(def.def)}</p>${pinNamesListHTML(def)}<a class="wiki-link" href="${wikiUrl(def.wiki)}" target="_blank" rel="noopener">En savoir plus (source externe) →</a>`;
  document.body.appendChild(pop);
  const close = (ev) => { if (!pop.contains(ev.target) && ev.target!==anchorEl){ pop.remove(); document.removeEventListener('click',close); } };
  setTimeout(()=>document.addEventListener('click', close), 10);
}
