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
};

function snap(v){ return Math.round(v/GRID_SIZE)*GRID_SIZE; }

function rotatePointAround(px,py,cx,cy,angleDeg){
  const rad = angleDeg*Math.PI/180;
  const dx=px-cx, dy=py-cy;
  return { x: cx + dx*Math.cos(rad) - dy*Math.sin(rad), y: cy + dx*Math.sin(rad) + dy*Math.cos(rad) };
}
function terminalAbsPos(item, idx){
  const def = findDef(item.typeId);
  const [tx,ty] = def.terminals[idx];
  const r = rotatePointAround(tx,ty,30,15,item.rot||0);
  return { x:item.x + r.x, y:item.y + r.y };
}

/* ---- Routage orthogonal (§5) : jamais de diagonale, angles à 90° ---- */
function orthoPoints(a, b){
  if (Math.abs(a.x-b.x) < 0.5 || Math.abs(a.y-b.y) < 0.5) return [a, b]; // déjà aligné
  const midX = a.x + (b.x - a.x)/2;
  return [a, { x:midX, y:a.y }, { x:midX, y:b.y }, b];
}
function polylinePoints(pts){ return pts.map(p=>`${p.x},${p.y}`).join(' '); }

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
      <h4>Outils</h4>
      <button class="ws-comp" data-tool="select">↖ Sélection / déplacer</button>
      <button class="ws-comp" data-tool="fil">⎯ Tracer un fil (Échap pour annuler)</button>
      <button class="ws-comp" data-tool="supprimer">✕ Supprimer (cliquer un élément)</button>
      <button class="ws-comp" id="btn-declutter">▦ Ranger le schéma</button>
    </aside>

    <div class="ws-canvas-wrap mobile-active">
      <div class="ws-topbar">
        <div><strong>${esc(project.titre)}</strong><span class="pill" style="margin-left:8px">${ESPACES[project.espace]?.nom}</span>
          <span class="pill pill-cyan" id="tool-indicator" style="margin-left:6px">Outil : Sélection</span></div>
        <div class="ws-tabs-top">
          <a href="#/project/${id}" class="active">Schéma</a>
          <a href="#/devis/${id}">Devis</a>
          <a href="#/dimensionnement/${id}">Dimensionnement</a>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" id="btn-share">Partager</button>
          <button class="btn btn-ghost btn-sm" id="btn-export-pdf">Exporter PDF</button>
          <button class="btn btn-ghost btn-sm" id="btn-ai-interpret">🤖 Interpréter (IA)</button>
          <button class="btn btn-ghost btn-sm" id="btn-test-circuit">Tester le circuit</button>
          <button class="btn btn-primary btn-sm" id="btn-save-project">Enregistrer</button>
        </div>
      </div>
      <div class="ws-canvas" id="ws-canvas-holder" style="position:relative">
        ${renderCanvasSVG()}
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
        ${items.map(c => `<div class="catalog-item"><button class="ws-comp" data-place="${c.id}" title="${esc(c.def||'')}">▫ ${esc(c.nom)}</button><button class="info-btn" data-info="${c.id}" title="En savoir plus">ⓘ</button></div>`).join('')}
      </div>`).join('')}
    </div>`;
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

  const okLines = `<div class="diag-ok">✓ ${items.length} composant(s) posé(s).</div><div class="diag-ok">✓ ${wires.length} connexion(s) tracée(s).</div>`;
  const errLines = errors.map(w => `<div class="diag-error">⚠ ${esc(w)}</div>`).join('');
  const warnLines = warnings.length ? warnings.map(w => `<div class="diag-warn">• ${esc(w)}</div>`).join('') : (errors.length ? '' : `<div class="diag-ok">✓ Toutes les bornes sont connectées.</div>`);
  return `${okLines}${errLines}${warnLines}
     <p style="font-size:.78em;margin-top:10px">Vérification structurelle et de connexité uniquement (bornes reliées, court-circuits directs, sens d'insertion des instruments). Aucun calcul électrique réel (tensions, courants) n'est effectué : ce diagnostic ne remplace pas un moteur de simulation.</p>`;
}
function findItem(schema,id){ return schema.items.find(i=>i.id===id); }

/* ---- Panneau propriétés (avec variantes §10) ---- */
function propertiesPanelHTML(){
  const item = wsState.schema.items.find(i => i.id === wsState.selectedId);
  if (!item) return `<div class="empty">Sélectionnez un composant sur le canevas pour voir ses propriétés.</div>`;
  const def = findDef(item.typeId);
  const isCatalogComp = !!def.unit;
  const variantOptions = (def.variantes||[]).map(vid => findDef(vid)).filter(Boolean);
  return `
    <h4 style="margin-bottom:.3em">${esc(def.nom)}</h4>
    <p class="def-text">${esc(def.def)}</p>
    <a class="wiki-link" href="${wikiUrl(def.wiki)}" target="_blank" rel="noopener">En savoir plus →</a>
    ${isCatalogComp ? (() => {
      const isPreset = def.valueOptions.some(v => String(v) === String(item.value));
      return `
    <div class="field" style="margin-top:14px"><label>Valeur (${esc(def.unit)})</label>
      <select id="prop-value">
        ${def.valueOptions.map(v => `<option value="${v}" ${String(v)===String(item.value)?'selected':''}>${v}</option>`).join('')}
        <option value="__custom__" ${!isPreset?'selected':''}>Autre valeur…</option>
      </select>
      <input type="text" id="prop-value-custom" placeholder="Valeur personnalisée" value="${!isPreset?esc(item.value):''}" class="${isPreset?'hidden':''}" style="margin-top:.4em">
    </div>`;
    })() : ''}
    ${variantOptions.length ? `
    <div class="field"><label>Remplacer par une variante</label>
      <select id="prop-variant">
        <option value="">— choisir —</option>
        ${variantOptions.map(v => `<option value="${v.id}">${esc(v.nom)}</option>`).join('')}
      </select>
    </div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" id="prop-rotate">↻ Pivoter</button>
      <button class="btn btn-ghost btn-sm" id="prop-duplicate">⧉ Dupliquer</button>
      <button class="btn btn-danger btn-sm" id="prop-delete">✕ Supprimer</button>
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
    return `<polyline class="wire-line ${w.id===wsState.selectedWireId?'selected':''}" data-wire="${w.id}" points="${polylinePoints(pts)}" fill="none"/>`;
  }).join('');

  const junctionsSvg = [...endpointCount.entries()].filter(([,n])=>n>=3).map(([k]) => {
    const [x,y] = k.split(',').map(Number);
    return `<circle class="wire-junction" cx="${x}" cy="${y}" r="3"/>`;
  }).join('');

  const itemsSvg = items.map(item => {
    const def = findDef(item.typeId);
    const sym = SYM[item.typeId] || '';
    const selected = item.id === wsState.selectedId ? 'selected' : '';
    const terms = def.terminals.map((t,idx) => {
      const isConnected = wires.some(w => (w.a.itemId===item.id&&w.a.term===idx)||(w.b.itemId===item.id&&w.b.term===idx));
      return `<circle class="terminal-dot ${isConnected?'connected':''} ${wsState.wireStart && wsState.wireStart.itemId===item.id && wsState.wireStart.term===idx ? 'wiring-start':''}" data-term-item="${item.id}" data-term-idx="${idx}" cx="${t[0]}" cy="${t[1]}" r="3.4"/>`;
    }).join('');
    const UNIT_SUFFIX = { 'état':'', 'logique':'', 'rapport':'', 'gain β':' β', 'type':'' };
    const unitSuffix = def.unit ? (def.unit in UNIT_SUFFIX ? UNIT_SUFFIX[def.unit] : ' '+def.unit.split(' ')[0]) : '';
    const valueLabel = def.unit ? `<text class="comp-label" x="6" y="-4">${esc(item.value)}${esc(unitSuffix)}</text>` : '';
    const refLabel = item.ref ? `<text class="comp-ref" x="6" y="38">${esc(item.ref)}</text>` : '';
    return `<g class="comp-node ${selected}" data-item="${item.id}" transform="translate(${item.x},${item.y}) rotate(${item.rot||0},30,15)">
      <g class="comp-body">${sym}</g>
      ${valueLabel}${refLabel}
      ${terms}
    </g>`;
  }).join('');

  const ghostSvg = (wsState.armedType && wsState.ghostPos) ? (() => {
    const def = findDef(wsState.armedType);
    const sym = SYM[wsState.armedType] || '';
    return `<g class="comp-node drop-preview" transform="translate(${wsState.ghostPos.x},${wsState.ghostPos.y})"><g class="comp-body">${sym}</g></g>`;
  })() : '';

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
      ${ghostSvg}
      <line id="wire-preview-line" class="wire-preview" style="display:none" x1="0" y1="0" x2="0" y2="0"/>
    </g>
  </svg>
  ${wsState.armedType ? `<div class="staging-tray">Cliquez sur le canevas pour poser <strong style="margin:0 4px">${esc(findDef(wsState.armedType).nom)}</strong><button id="btn-cancel-armed" title="Annuler">✕</button></div>` : ''}`;
}

function isCanvasBackground(target, svg){ return target === svg || target.id === 'ws-grid-bg'; }
function clientToSvgUser(evt, svg){ const pt = svg.createSVGPoint(); pt.x=evt.clientX; pt.y=evt.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
function svgUserToCanvas(pt){ const v = wsState.view; return { x:(pt.x - v.panX)/v.scale, y:(pt.y - v.panY)/v.scale }; }

async function persistSchema(){ if (wsState.projectId) await db.saveSchema(wsState.projectId, wsState.schema); }

function redrawCanvas(){
  const holder = document.getElementById('ws-canvas-holder');
  if (!holder) return;
  const zoomCtrls = holder.querySelector('.zoom-controls');
  holder.innerHTML = renderCanvasSVG();
  if (zoomCtrls) holder.appendChild(zoomCtrls);
  const pct = document.getElementById('zoom-pct'); if (pct) pct.textContent = Math.round(wsState.view.scale*100)+'%';
  wireCanvasEvents();
}

function wireCanvasEvents(){
  const svg = document.getElementById('ws-svg');
  if (!svg) return;

  document.getElementById('btn-cancel-armed')?.addEventListener('click', (e) => { e.stopPropagation(); wsState.armedType = null; wsState.ghostPos = null; redrawCanvas(); });

  // Aperçu du fil en cours de traçage, et fantôme du composant "armé" en attente de dépôt.
  svg.addEventListener('mousemove', (e) => {
    if (wsState.tool === 'fil' && wsState.wireStart){
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
      wsState.ghostPos = { x: snap(cur.x-30), y: snap(cur.y-15) };
      const ghost = svg.querySelector('.drop-preview');
      if (ghost) ghost.setAttribute('transform', `translate(${wsState.ghostPos.x},${wsState.ghostPos.y})`);
    }
  });

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
        wsState.schema.wires = wsState.schema.wires.filter(w=>w.id!==wsState.selectedWireId);
        wsState.selectedWireId = null; persistSchema(); redrawCanvas(); toast('Fil supprimé.');
      }
    });
  }

  // Clic sur le fond du canevas : dépose le composant armé, sinon démarre un pan.
  svg.addEventListener('click', (e) => {
    if (!isCanvasBackground(e.target, svg)) return;
    if (wsState.armedType){
      const cur = svgUserToCanvas(clientToSvgUser(e, svg));
      const def = findDef(wsState.armedType);
      wsState.schema.items.push({ id:'i_'+Math.random().toString(36).slice(2,8), typeId:wsState.armedType, x:snap(cur.x-30), y:snap(cur.y-15), rot:0, value: def.defaultValue ?? '' });
      wsState.armedType = null; wsState.ghostPos = null;
      persistSchema(); redrawCanvas(); toast(`${def.nom} posé.`);
    } else if (wsState.selectedWireId){
      wsState.selectedWireId = null; redrawCanvas();
    }
  });

  svg.querySelectorAll('.terminal-dot').forEach(dot => {
    dot.addEventListener('mousedown', (e) => e.stopPropagation());
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const itemId = dot.dataset.termItem, term = Number(dot.dataset.termIdx);
      // Reconnexion d'une extrémité de fil en cours de déplacement.
      if (wsState.dragWireEnd){
        const w = wsState.schema.wires.find(w=>w.id===wsState.dragWireEnd.wireId);
        if (w){ w[wsState.dragWireEnd.end] = { itemId, term }; persistSchema(); }
        wsState.dragWireEnd = null; redrawCanvas(); return;
      }
      if (wsState.tool !== 'fil') return;
      if (!wsState.wireStart){ wsState.wireStart = { itemId, term }; redrawCanvas(); return; }
      if (wsState.wireStart.itemId === itemId && wsState.wireStart.term === term){ wsState.wireStart = null; redrawCanvas(); return; }
      wsState.schema.wires.push({ id:'w_'+Math.random().toString(36).slice(2,8), a:wsState.wireStart, b:{itemId,term} });
      wsState.wireStart = null; persistSchema(); redrawCanvas();
    });
  });

  // Menu contextuel composant (clic droit desktop, appui long tactile) — §6.
  svg.querySelectorAll('.comp-node').forEach(node => {
    let dragging=false, startPt=null, orig=null, moved=false, longPressTimer=null;

    node.addEventListener('contextmenu', (e) => { e.preventDefault(); openComponentContextMenu(node.dataset.item, e.clientX, e.clientY); });

    node.addEventListener('mousedown', (e) => {
      if (wsState.tool === 'supprimer') return; // géré au click
      if (wsState.tool === 'fil') return;
      if (e.button === 2) return;
      e.stopPropagation();
      const item = wsState.schema.items.find(i=>i.id===node.dataset.item);
      dragging = true; moved = false; startPt = clientToSvgUser(e, svg); orig = { x:item.x, y:item.y };
      const onMove = (ev) => {
        const cur = clientToSvgUser(ev, svg);
        const dx = (cur.x-startPt.x)/wsState.view.scale, dy=(cur.y-startPt.y)/wsState.view.scale;
        if (Math.abs(dx)+Math.abs(dy) > 2) moved = true;
        item.x = orig.x+dx; item.y = orig.y+dy;
        redrawCanvasLight();
      };
      const onUp = () => { document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
        dragging=false;
        if (!moved){ selectItem(item.id); return; }
        item.x = snap(item.x); item.y = snap(item.y);
        persistSchema(); redrawCanvas();
      };
      document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    });

    // Appui long tactile → menu contextuel (adapté téléphone, §6).
    node.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      longPressTimer = setTimeout(() => { openComponentContextMenu(node.dataset.item, touch.clientX, touch.clientY); }, 550);
    }, { passive:true });
    node.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive:true });
    node.addEventListener('touchend', () => clearTimeout(longPressTimer), { passive:true });

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
        wsState.schema.wires = wsState.schema.wires.filter(w=>w.id!==id);
        persistSchema(); redrawCanvas(); toast('Fil supprimé.');
        return;
      }
      wsState.selectedWireId = (wsState.selectedWireId === id) ? null : id;
      redrawCanvas();
    });
    line.addEventListener('contextmenu', (e) => { e.preventDefault(); wsState.selectedWireId = line.dataset.wire; redrawCanvas(); });
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
        handle.addEventListener('click', (e) => { e.stopPropagation(); wsState.dragWireEnd = { wireId:w.id, end }; toast('Cliquez une borne pour reconnecter ce fil.'); });
        document.getElementById('ws-viewport').appendChild(handle);
      });
    }
  }

  // clic droit sur le fond : annule un fil en cours plutôt que d'ouvrir le menu du navigateur
  svg.addEventListener('contextmenu', (e) => {
    if (isCanvasBackground(e.target, svg) && wsState.tool === 'fil' && wsState.wireStart){ e.preventDefault(); wsState.wireStart = null; redrawCanvas(); }
  });

  // pan + zoom sur fond
  let panning=false, panStart=null, panOrig=null;
  svg.addEventListener('mousedown', (e) => {
    if (!isCanvasBackground(e.target, svg) || wsState.armedType) return;
    panning = true; svg.classList.add('panning'); panStart = clientToSvgUser(e, svg); panOrig = { ...wsState.view };
    const onMove = (ev) => {
      const cur = clientToSvgUser(ev, svg);
      wsState.view.panX = panOrig.panX + (cur.x - panStart.x);
      wsState.view.panY = panOrig.panY + (cur.y - panStart.y);
      document.getElementById('ws-viewport').setAttribute('transform', `translate(${wsState.view.panX},${wsState.view.panY}) scale(${wsState.view.scale})`);
    };
    const onUp = () => { panning=false; svg.classList.remove('panning'); document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  });

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
    if (g) g.setAttribute('transform', `translate(${item.x},${item.y}) rotate(${item.rot||0},30,15)`);
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
    return `<polyline class="wire-line ${w.id===wsState.selectedWireId?'selected':''}" data-wire="${w.id}" points="${polylinePoints(orthoPoints(a,b))}" fill="none"/>`;
  }).join('');
  const junctionsSvg = [...endpointCount.entries()].filter(([,n])=>n>=3).map(([k]) => { const [x,y]=k.split(',').map(Number); return `<circle class="wire-junction" cx="${x}" cy="${y}" r="3"/>`; }).join('');
  viewport.insertAdjacentHTML('afterbegin', wiresSvg + junctionsSvg);
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
  document.getElementById('prop-value')?.addEventListener('change', (e) => {
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    const customInput = document.getElementById('prop-value-custom');
    if (e.target.value === '__custom__'){ customInput.classList.remove('hidden'); customInput.focus(); return; }
    customInput.classList.add('hidden');
    item.value = e.target.value; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-value-custom')?.addEventListener('input', (e) => {
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    item.value = e.target.value; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-variant')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    replaceVariant(wsState.selectedId, e.target.value);
  });
  document.getElementById('prop-rotate')?.addEventListener('click', () => {
    const item = wsState.schema.items.find(i=>i.id===wsState.selectedId);
    item.rot = ((item.rot||0)+90)%360; persistSchema(); redrawCanvas();
  });
  document.getElementById('prop-duplicate')?.addEventListener('click', () => duplicateItem(wsState.selectedId));
  document.getElementById('prop-delete')?.addEventListener('click', () => { deleteItem(wsState.selectedId); const p=document.getElementById('ws-panel'); if(p) p.innerHTML = window.__wsPanels.proprietes(); });
}

function duplicateItem(id){
  const item = wsState.schema.items.find(i=>i.id===id);
  if (!item) return;
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
  const item = wsState.schema.items.find(i=>i.id===itemId);
  const newDef = findDef(newTypeId);
  if (!item || !newDef) return;
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
  menu.querySelector('[data-act="pivoter"]').onclick = () => { close(); item.rot=((item.rot||0)+90)%360; persistSchema(); redrawCanvas(); };
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

  document.getElementById('btn-declutter')?.addEventListener('click', () => {
    wsState.schema.items.forEach(it => { it.x = snap(it.x); it.y = snap(it.y); });
    persistSchema(); redrawCanvas(); toast('Schéma rangé sur la grille — les connexions sont conservées.');
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
  document.getElementById('btn-share')?.addEventListener('click', () => {
    const email = prompt("E-mail de la personne avec qui partager ce projet :");
    if (!email) return;
    db.addCollaborator({ projectId: wsState.projectId, email }).then(({error}) => {
      if (error) toast(error.message); else toast('Projet partagé.');
    });
  });

  document.getElementById('btn-export-pdf')?.addEventListener('click', () => exportProjectPDF(wsState.projectId, wsState.schema));

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
    const placeBtn = e.target.closest('[data-place]');
    if (placeBtn){
      wsState.armedType = placeBtn.dataset.place;
      wsState.ghostPos = { x: 480, y: 280 };
      wsState.wireStart = null;
      redrawCanvas();
      toast('Cliquez sur le canevas pour poser le composant (Échap pour annuler).');
      return;
    }
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
      ? results.map(c => `<div class="catalog-item"><button class="ws-comp" data-place="${c.id}">▫ ${esc(c.nom)} <span style="opacity:.6;font-size:.85em">— ${esc(c.famille||'')}</span></button><button class="info-btn" data-info="${c.id}" title="En savoir plus">ⓘ</button></div>`).join('')
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

function showCatalogPopover(def, anchorEl){
  document.querySelectorAll('.catalog-popover').forEach(p=>p.remove());
  const rect = anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left:anchorEl.style?.left?parseFloat(anchorEl.style.left):200, bottom:200 };
  const pop = document.createElement('div');
  pop.className = 'catalog-popover';
  pop.style.left = Math.min(rect.left, window.innerWidth-280) + 'px';
  pop.style.top = (rect.bottom+6) + 'px';
  pop.innerHTML = `<h4>${esc(def.nom)}</h4><p style="margin:0">${esc(def.def)}</p><a class="wiki-link" href="${wikiUrl(def.wiki)}" target="_blank" rel="noopener">En savoir plus (source externe) →</a>`;
  document.body.appendChild(pop);
  const close = (ev) => { if (!pop.contains(ev.target) && ev.target!==anchorEl){ pop.remove(); document.removeEventListener('click',close); } };
  setTimeout(()=>document.addEventListener('click', close), 10);
}
