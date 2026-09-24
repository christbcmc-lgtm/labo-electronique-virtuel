/* ==========================================================================
   VUE 3D DU BÂTIMENT — visualisation légère du plan (§32/§Phase 2 du cahier
   des charges reçu : "volontairement simple, visualiser, pas modéliser").
   --------------------------------------------------------------------------
   Lit les données du plan déjà enregistrées par js/plan.js (db.getPlan) et
   les transforme en une description 3D purement géométrique (aucune
   dépendance à Three.js dans cette partie — testable sans navigateur réel,
   sans WebGL). Le rendu proprement dit (caméra, contrôles, matériaux) utilise
   Three.js chargé en CDN dans index.html (même principe déjà en place pour
   @supabase/supabase-js) : si la bibliothèque n'est pas disponible (réseau
   coupé, bloqueur de script, environnement de test sans navigateur), la vue
   affiche un message clair au lieu de planter — jamais d'exception.
   Unité du plan : mm. Conversion 3D : plan (x, y) → 3D (x, z), altitude = Y,
   échelle appliquée par le groupe racine (1 unité Three.js = 1 mètre).
   ========================================================================== */

/* =====================================================================
   1. GÉOMÉTRIE PURE (aucun accès DOM/WebGL — testable directement)
   ===================================================================== */

// Combine les boîtes pleines d'un mur (avant/allège/linteau/après une ouverture),
// en repère LOCAL au mur : x = le long du mur (0..longueur), y = hauteur (0..H).
// N'assemble jamais l'ouverture elle-même : c'est l'absence de boîte qui la crée.
function wallOpeningBoxes(wallLen, openings, levelHeight) {
  const segs = [...openings].sort((a, b) => a.offset - b.offset);
  const boxes = [];
  let cur = 0;
  for (const o of segs) {
    const x0 = Math.max(0, Math.min(o.offset, wallLen));
    const x1 = Math.max(0, Math.min(o.offset + o.w, wallLen));
    if (x0 - cur > 1) boxes.push({ x0: cur, x1: x0, y0: 0, y1: levelHeight });
    const sill = Math.max(0, o.sill || 0);
    if (sill > 1) boxes.push({ x0, x1, y0: 0, y1: Math.min(sill, levelHeight) });
    const lintelY = sill + (o.h || 0);
    if (lintelY < levelHeight - 1) boxes.push({ x0, x1, y0: Math.min(lintelY, levelHeight), y1: levelHeight });
    cur = Math.max(cur, x1);
  }
  if (wallLen - cur > 1) boxes.push({ x0: cur, x1: wallLen, y0: 0, y1: levelHeight });
  return boxes;
}

// Une "boîte" 3D en repère LOCAL au mur : { cx, cy, w, h } — cx/w le long du mur, cy/h en hauteur.
// Le rendu la place ensuite via le point de départ du mur + son angle + son épaisseur.
function wallSegments(wall, openingsOfWall, levelHeight) {
  const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
  const ang = Math.atan2(wall.b.y - wall.a.y, wall.b.x - wall.a.x);
  const boxes = wallOpeningBoxes(len, openingsOfWall, levelHeight).map(b => ({
    cx: (b.x0 + b.x1) / 2, w: b.x1 - b.x0, cy: (b.y0 + b.y1) / 2, h: b.y1 - b.y0,
  })).filter(b => b.w > 0.5 && b.h > 0.5);
  return { origin: { x: wall.a.x, y: wall.a.y }, angle: ang, thickness: wall.t, boxes, kind: wall.kind };
}

// Construit la scène 3D d'un seul niveau à partir des entités du plan (format exact
// enregistré par js/plan.js — voir js/plan.js §3, section ÉTAT/newProject). Ne dépend
// que de tableaux/objets simples, aucune fonction de js/plan.js n'est appelée ici.
function buildLevelScene(entities, level) {
  const walls = entities.filter(e => e.type === 'wall' && e.level === level.id);
  const openings = entities.filter(e => e.type === 'opening' && e.level === level.id);
  const symbols = entities.filter(e => e.type === 'symbol' && e.level === level.id);
  const rooms = entities.filter(e => e.type === 'room' && e.level === level.id);
  const slabs = entities.filter(e => e.type === 'slab' && e.level === level.id);
  const columns = entities.filter(e => e.type === 'column' && e.level === level.id);

  const wallScene = walls.map(w => wallSegments(w, openings.filter(o => o.wall === w.id), level.height));

  // Emprise du niveau (murs + pièces + dalles) — sert de plancher par défaut si aucune dalle n'est dessinée.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const stretch = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
  walls.forEach(w => { stretch(w.a.x, w.a.y); stretch(w.b.x, w.b.y); });
  rooms.forEach(r => r.pts.forEach(p => stretch(p.x, p.y)));
  slabs.forEach(s => s.pts.forEach(p => stretch(p.x, p.y)));
  const hasFootprint = isFinite(x0);
  const floor = hasFootprint ? { x0: x0 - 100, y0: y0 - 100, x1: x1 + 100, y1: y1 + 100 } : null;

  return {
    levelId: level.id, name: level.name, elevation: level.elevation, height: level.height,
    walls: wallScene,
    columns: columns.map(c => ({ x: c.x, y: c.y, s: c.s, rot: c.rot || 0 })),
    symbols: symbols.map(s => ({ x: s.x, y: s.y, h: s.h || 0, label: s.sym, tag: s.tag || '' })),
    floor,
  };
}

// Construit la scène complète (tous les niveaux empilés selon leur élévation).
function buildBuildingScene(planProject) {
  if (!planProject || !Array.isArray(planProject.levels)) return { levels: [] };
  return { levels: planProject.levels.map(level => buildLevelScene(planProject.entities || [], level)) };
}

/* =====================================================================
   2. RENDU THREE.JS (dépend de window.THREE — jamais appelé si absent)
   ===================================================================== */
function threeAvailable() {
  return typeof window !== 'undefined' && typeof window.THREE === 'object' && typeof window.THREE.OrbitControls === 'function';
}
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch (e) { return false; }
}

const MM_TO_M = 0.001;
const MATS = {
  wallPorteur: 0x9aa0a8, wallAutre: 0xc7ccd1, floor: 0x6d7278, column: 0xff9800,
  edge: 0x2b2f33, symbol: 0xffee58, grid1: 0x3a3f45, grid2: 0x24272b,
};

function disposeObject3D(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose()); }
  });
}

// Crée un visualiseur attaché à `container` (élément DOM vide). Retourne un objet avec
// setScene(sceneData)/setView(name)/setClip(meters|null)/toggleLevel(id,visible)/resize()/dispose().
// N'appelle jamais THREE si threeAvailable()/webglAvailable() sont faux : à vérifier par l'appelant.
function createBuildingViewer(container, THREE) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = false;
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11151a);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(12, 10, 14);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.target.set(0, 1, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x33383f, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(10, 20, 8); scene.add(sun);

  const grid = new THREE.GridHelper(60, 60, MATS.grid1, MATS.grid2);
  scene.add(grid);

  const objectsGroup = new THREE.Group();
  scene.add(objectsGroup);
  const levelGroups = new Map();
  let clipPlane = null;
  let bounds = null;

  function clearScene() { disposeObject3D(objectsGroup); objectsGroup.clear(); levelGroups.clear(); }

  function addBoxMesh(parent, cx, cy, cz, sx, sy, sz, color) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    const geo = new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.02, clippingPlanes: clipPlane ? [clipPlane] : [] });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    parent.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: MATS.edge }));
    edges.position.copy(mesh.position);
    parent.add(edges);
  }

  function buildWallGroup(w) {
    const g = new THREE.Group();
    g.position.set(w.origin.x * MM_TO_M, 0, w.origin.y * MM_TO_M);
    g.rotation.y = -w.angle;
    const color = w.kind === 'porteur' ? MATS.wallPorteur : MATS.wallAutre;
    for (const b of w.boxes) {
      addBoxMesh(g, b.cx * MM_TO_M, b.cy * MM_TO_M, 0, b.w * MM_TO_M, b.h * MM_TO_M, w.thickness * MM_TO_M, color);
    }
    return g;
  }

  function setScene(sceneData) {
    clearScene();
    bounds = null;
    const grow = (x, y, z) => {
      if (!bounds) bounds = { minX: x, maxX: x, minY: y, maxY: y, minZ: z, maxZ: z };
      bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
      bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
    };
    for (const level of sceneData.levels) {
      const lg = new THREE.Group();
      lg.position.y = level.elevation * MM_TO_M;
      if (level.floor) {
        const fw = (level.floor.x1 - level.floor.x0) * MM_TO_M, fd = (level.floor.y1 - level.floor.y0) * MM_TO_M;
        const fcx = (level.floor.x0 + level.floor.x1) / 2 * MM_TO_M, fcz = (level.floor.y0 + level.floor.y1) / 2 * MM_TO_M;
        addBoxMesh(lg, fcx, -0.075, fcz, fw, 0.15, fd, MATS.floor);
        grow(level.floor.x0 * MM_TO_M, level.elevation * MM_TO_M, level.floor.y0 * MM_TO_M);
        grow(level.floor.x1 * MM_TO_M, (level.elevation + level.height) * MM_TO_M, level.floor.y1 * MM_TO_M);
      }
      for (const w of level.walls) { lg.add(buildWallGroup(w)); grow(w.origin.x * MM_TO_M, level.elevation * MM_TO_M, w.origin.y * MM_TO_M); }
      for (const c of level.columns) addBoxMesh(lg, c.x * MM_TO_M, level.height * MM_TO_M / 2, c.y * MM_TO_M, c.s * MM_TO_M, level.height * MM_TO_M, c.s * MM_TO_M, MATS.column);
      for (const s of level.symbols) {
        const geo = new THREE.SphereGeometry(0.05, 10, 8);
        const mat = new THREE.MeshBasicMaterial({ color: MATS.symbol });
        const m = new THREE.Mesh(geo, mat); m.position.set(s.x * MM_TO_M, s.h * MM_TO_M, s.y * MM_TO_M); lg.add(m);
      }
      levelGroups.set(level.levelId, lg);
      objectsGroup.add(lg);
    }
    if (bounds) {
      const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
      controls.target.set(cx, Math.max(cy, 1), cz);
    }
    render();
  }

  function frameAll() {
    if (!bounds) { setView('iso'); return; }
    const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
    const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, bounds.maxY - bounds.minY, 4);
    const d = span * 1.3;
    camera.position.set(cx + d * 0.6, cy + d * 0.5, cz + d * 0.6);
    controls.target.set(cx, cy, cz);
    controls.update(); render();
  }

  const VIEWS = {
    iso:    (b) => ({ pos: [1, 0.9, 1], name: 'Vue isométrique' }),
    dessus: (b) => ({ pos: [0, 1, 0.0001], name: 'Vue de dessus' }),
    face:   (b) => ({ pos: [0, 0.35, 1], name: 'Vue de face' }),
    droite: (b) => ({ pos: [1, 0.35, 0], name: 'Vue de droite' }),
  };
  function setView(name) {
    const v = VIEWS[name] || VIEWS.iso;
    const cx = bounds ? (bounds.minX + bounds.maxX) / 2 : 0, cy = bounds ? Math.max((bounds.minY + bounds.maxY) / 2, 1) : 1, cz = bounds ? (bounds.minZ + bounds.maxZ) / 2 : 0;
    const span = bounds ? Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 4) : 10;
    const d = span * 1.4;
    const dir = v(bounds).pos;
    camera.position.set(cx + dir[0] * d, cy + dir[1] * d + 1, cz + dir[2] * d);
    controls.target.set(cx, cy, cz);
    controls.update(); render();
  }

  function setClip(metersY) {
    if (metersY === null || metersY === undefined) { clipPlane = null; }
    else { if (!clipPlane) clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), metersY); else { clipPlane.constant = metersY; } }
    objectsGroup.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.clippingPlanes = clipPlane ? [clipPlane] : []; m.needsUpdate = true; }); });
    render();
  }
  function toggleLevel(levelId, visible) { const g = levelGroups.get(levelId); if (g) g.visible = visible; render(); }

  function resize() {
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); render();
  }
  function render() { renderer.render(scene, camera); }
  let raf = null;
  function loop() { raf = requestAnimationFrame(loop); controls.update(); render(); }
  loop();

  function dispose() {
    if (raf) cancelAnimationFrame(raf);
    controls.dispose(); clearScene(); renderer.dispose();
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  return { setScene, setView, setClip, toggleLevel, frameAll, resize, dispose, renderer, camera };
}

/* =====================================================================
   3. INTÉGRATION AU ROUTEUR SPA — mêmes conventions que js/plan.js
   ===================================================================== */
let _p3dViewer = null, _p3dRO = null;

function unmountPlan3D() {
  if (_p3dRO) { try { _p3dRO.disconnect(); } catch (e) {} _p3dRO = null; }
  if (_p3dViewer) { try { _p3dViewer.dispose(); } catch (e) {} _p3dViewer = null; }
}

function fmtM(mm) { return (mm / 1000).toFixed(2) + ' m'; }

async function viewPlan3D(projectId) {
  const { data: project } = await db.getProject(projectId);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  window.__plan3dCtx = { projectId, title: project.titre };
  return `<div class="workspace" style="flex-direction:column">
    <div class="ws-topbar">
      <div><strong>${esc(project.titre)}</strong><span class="pill" style="margin-left:8px">Vue 3D du bâtiment</span></div>
      <div class="ws-tabs-top">
        <a href="#/project/${projectId}">Schéma</a>
        <a href="#/devis/${projectId}">Devis</a>
        <a href="#/dimensionnement/${projectId}">Dimensionnement</a>
        <a href="#/plan/${projectId}">Plan</a>
        <a href="#/plan3d/${projectId}" class="active">3D</a>
        <a href="#/cad3d/${projectId}">CAO 3D</a>
      </div>
    </div>
    <div id="plan3d-shell">
      <div class="p3d-toolbar">
        <div class="p3d-group">
          <button class="p3d-btn" data-v="iso">Isométrique</button>
          <button class="p3d-btn" data-v="dessus">Dessus</button>
          <button class="p3d-btn" data-v="face">Face</button>
          <button class="p3d-btn" data-v="droite">Droite</button>
          <button class="p3d-btn" id="p3d-fit">Cadrer tout</button>
        </div>
        <div class="p3d-group p3d-clipgroup">
          <label for="p3d-clip">Coupe horizontale</label>
          <input type="range" id="p3d-clip" min="0" max="1" step="0.01" value="1">
          <span id="p3d-clip-val" class="muted"></span>
        </div>
        <div class="p3d-group" id="p3d-levels"></div>
        <div class="p3d-group">
          <button class="p3d-btn" id="p3d-png">Exporter PNG</button>
        </div>
      </div>
      <div id="p3d-viewport"></div>
      <div id="p3d-fallback" class="p3d-fallback hidden"></div>
    </div>
  </div>`;
}

function plan3dFallback(reason) {
  const el = document.getElementById('p3d-fallback');
  const vp = document.getElementById('p3d-viewport');
  if (vp) vp.classList.add('hidden');
  if (el) {
    el.classList.remove('hidden');
    el.innerHTML = `<div class="p3d-fallback-box"><b>Aperçu 3D indisponible</b><p>${esc(reason)}</p>
      <p class="muted">Le plan reste consultable dans l'onglet <a href="#/plan/${esc(window.__plan3dCtx ? window.__plan3dCtx.projectId : '')}">Plan</a>.</p></div>`;
  }
}

async function afterPlan3DView() {
  unmountPlan3D();
  const ctx = window.__plan3dCtx;
  const shell = document.getElementById('plan3d-shell');
  if (!ctx || !shell) return;

  if (!webglAvailable()) { plan3dFallback("WebGL n'est pas disponible dans ce navigateur/cet environnement."); return; }
  if (!threeAvailable()) { plan3dFallback("La bibliothèque 3D (Three.js) n'a pas pu être chargée — vérifiez la connexion réseau ou qu'aucun bloqueur ne l'empêche de se charger depuis le CDN."); return; }

  const { data: plan } = await db.getPlan(ctx.projectId);
  if (!plan || !plan.levels || !plan.levels.length) {
    plan3dFallback(`Aucun plan n'a encore été dessiné pour ce projet — ouvrez l'onglet Plan pour commencer, la vue 3D se construira automatiquement à partir des murs et niveaux dessinés.`);
    return;
  }

  const viewport = document.getElementById('p3d-viewport');
  const sceneData = buildBuildingScene(plan);
  let viewer;
  try {
    viewer = createBuildingViewer(viewport, window.THREE);
  } catch (e) {
    plan3dFallback('La création de la scène 3D a échoué : ' + e.message);
    return;
  }
  _p3dViewer = viewer;
  viewer.resize();
  viewer.setScene(sceneData);
  viewer.frameAll();

  const maxH = Math.max(1, ...plan.levels.map(l => (l.elevation + l.height) / 1000));
  const clipInput = document.getElementById('p3d-clip'), clipVal = document.getElementById('p3d-clip-val');
  clipInput.max = String(maxH); clipInput.value = String(maxH);
  clipVal.textContent = fmtM(maxH * 1000);
  clipInput.addEventListener('input', () => {
    const v = Number(clipInput.value);
    clipVal.textContent = fmtM(v * 1000);
    viewer.setClip(v >= maxH - 0.001 ? null : v);
  });

  document.querySelectorAll('#plan3d-shell [data-v]').forEach(b => b.addEventListener('click', () => viewer.setView(b.dataset.v)));
  const fitBtn = document.getElementById('p3d-fit'); if (fitBtn) fitBtn.addEventListener('click', () => viewer.frameAll());
  const pngBtn = document.getElementById('p3d-png');
  if (pngBtn) pngBtn.addEventListener('click', () => {
    viewer.resize();
    try {
      const url = viewer.renderer.domElement.toDataURL('image/png');
      const a = document.createElement('a'); a.href = url; a.download = (ctx.title || 'batiment').replace(/[^\w-]+/g, '_') + '_3d.png';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast("Export PNG impossible : " + e.message); }
  });

  const levelsBox = document.getElementById('p3d-levels');
  if (levelsBox) levelsBox.innerHTML = plan.levels.map(l => `<label class="p3d-level"><input type="checkbox" data-lvl="${esc(l.id)}" checked> ${esc(l.name)}</label>`).join('');
  levelsBox && levelsBox.querySelectorAll('[data-lvl]').forEach(cb => cb.addEventListener('change', () => viewer.toggleLevel(cb.dataset.lvl, cb.checked)));

  if (typeof ResizeObserver !== 'undefined') {
    _p3dRO = new ResizeObserver(() => viewer.resize());
    _p3dRO.observe(viewport);
  }
}
