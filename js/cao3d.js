/* ==========================================================================
   CAO MÉCANIQUE 3D — Phase 3 du cahier reçu (esquisse/extrusion/révolution,
   bibliothèque de pièces paramétriques, mesures, export STL).
   --------------------------------------------------------------------------
   PÉRIMÈTRE VOLONTAIREMENT DÉLIMITÉ (voir NOTES_REPRISE_2026.md point 8) :
   pas d'opérations booléennes 3D générales (union/soustraction/intersection
   entre solides quelconques) — cela demanderait une bibliothèque CSG dédiée
   non incluse ici et dont la fiabilité n'aurait pas pu être vérifiée dans cet
   environnement sans navigateur réel. À la place :
     - les PERÇAGES se font en creusant des trous dans une esquisse 2D avant
       extrusion (Shape.holes, une vraie ouverture traversante, pas un
       artifice visuel) — couvre le cas le plus courant (plaques, brides,
       supports percés) ;
     - l'ASSEMBLAGE de plusieurs corps se fait par groupement/positionnement
       (comme un vrai assemblage mécanique), pas par fusion en un seul solide.
   C'est un choix honnête plutôt qu'un faux noyau CSG qui produirait des
   résultats non fiables. Documenté aussi dans l'interface (voir aide).

   Comme js/plan3d.js : la géométrie (profils, volumes, validation) est
   isolée dans des fonctions pures testables sans WebGL ; le rendu utilise
   Three.js + OrbitControls + STLExporter déjà chargés en CDN (index.html).
   ========================================================================== */

/* =====================================================================
   1. CONSTANTES
   ===================================================================== */
// Masses volumiques indicatives (kg/m³) — mêmes valeurs que celles documentées dans le cahier reçu.
const CAO_MATERIALS = {
  acier:     { label: 'Acier',            density: 7850, color: '#9aa4ad' },
  inox:      { label: 'Inox',             density: 8000, color: '#c7ccd1' },
  aluminium: { label: 'Aluminium',        density: 2700, color: '#d7dade' },
  laiton:    { label: 'Laiton',           density: 8500, color: '#c9a24a' },
  cuivre:    { label: 'Cuivre',           density: 8960, color: '#c07a4e' },
  fonte:     { label: 'Fonte',            density: 7200, color: '#6f7378' },
  abs:       { label: 'ABS (plastique)',  density: 1050, color: '#3f6fb0' },
  bois:      { label: 'Bois',             density: 700,  color: '#a9814f' },
};
// Vis/écrous/rondelles métriques courantes : diamètre nominal, pas gros filetage, cote de tête/écrou
// (sur plats), diamètre de rondelle — valeurs normalisées d'usage courant (ISO 4017/4032/7089).
const CAO_SCREW_SIZES = {
  M3:  { d: 3,  headD: 5.5,  headH: 2,   nutAF: 5.5,  washerD: 7 },
  M4:  { d: 4,  headD: 7,    headH: 2.8, nutAF: 7,    washerD: 9 },
  M5:  { d: 5,  headD: 8.5,  headH: 3.5, nutAF: 8,    washerD: 10 },
  M6:  { d: 6,  headD: 10,   headH: 4,   nutAF: 10,   washerD: 12 },
  M8:  { d: 8,  headD: 13,   headH: 5.3, nutAF: 13,   washerD: 16 },
  M10: { d: 10, headD: 16,   headH: 6.4, nutAF: 17,   washerD: 20 },
  M12: { d: 12, headD: 18,   headH: 7.5, nutAF: 19,   washerD: 24 },
};
const CAO_PROFILE_SHAPES = ['carre', 'rectangulaire', 'rond', 'cornière'];

/* =====================================================================
   2. GÉOMÉTRIE PURE (aucune dépendance Three.js — testable directement)
   ===================================================================== */
// Retourne les points [x,y] (mm) d'un profil 2D fermé, sens direct, prêt pour Shape/ExtrudeGeometry.
function cao_profilePoints(profile){
  const t = profile.shape;
  if (t === 'rect'){
    const w = profile.w || 10, h = profile.h || 10;
    return [[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]];
  }
  if (t === 'circle'){
    const r = (profile.d || 10) / 2, n = 32, pts = [];
    for (let i = 0; i < n; i++){ const a = i/n*Math.PI*2; pts.push([r*Math.cos(a), r*Math.sin(a)]); }
    return pts;
  }
  if (t === 'polygon'){
    return (profile.pts || [[-5,-5],[5,-5],[0,5]]).map(p => [p[0], p[1]]);
  }
  throw new Error('Forme de profil inconnue : ' + t);
}
function cao_circlePoints(cx, cy, d, n){
  n = n || 24;
  const r = d/2, pts = [];
  for (let i = 0; i < n; i++){ const a = i/n*Math.PI*2; pts.push([cx + r*Math.cos(a), cy + r*Math.sin(a)]); }
  return pts;
}
function cao_polygonArea(pts){
  let a = 0;
  for (let i = 0; i < pts.length; i++){ const p = pts[i], q = pts[(i+1)%pts.length]; a += p[0]*q[1] - q[0]*p[1]; }
  return Math.abs(a)/2;
}
// Volume (mm³) d'un corps extrudé = aire du profil (moins les trous) × profondeur. Fonction pure,
// utilisée à la fois pour la masse ET comme garde-fou (dans les tests) indépendamment du rendu 3D.
function cao_extrudeVolume(feature){
  const outer = cao_polygonArea(cao_profilePoints(feature.profile));
  const holes = (feature.holes || []).reduce((s, h) => s + cao_polygonArea(cao_circlePoints(0, 0, h.d)), 0);
  return Math.max(0, outer - holes) * (feature.depth || 0);
}
function cao_revolveVolume(feature){
  // Théorème de Pappus-Guldin : V = 2π × (distance de l'axe au centroïde de l'aire) × aire.
  const pts = feature.profile && feature.profile.pts || [];
  if (pts.length < 3) return 0;
  let area = 0, cx = 0;
  for (let i = 0; i < pts.length; i++){
    const p = pts[i], q = pts[(i+1)%pts.length], cross = p[0]*q[1] - q[0]*p[1];
    area += cross; cx += (p[0]+q[0]) * cross;
  }
  area = area/2;
  if (Math.abs(area) < 1e-9) return 0;
  cx = cx/(6*area);
  const angle = (feature.angle === undefined ? 360 : feature.angle) * Math.PI/180;
  return Math.abs(2 * Math.PI * cx * Math.abs(area) * (angle/(2*Math.PI)));
}
function cao_primitiveVolume(feature){
  switch (feature.type){
    case 'box': return (feature.w||0) * (feature.h||0) * (feature.d||0);
    case 'cylinder': return Math.PI * Math.pow((feature.d||0)/2, 2) * (feature.h||0);
    case 'sphere': return (4/3) * Math.PI * Math.pow((feature.d||0)/2, 3);
    case 'cone': {
      const r1 = (feature.d1||0)/2, r2 = (feature.d2||0)/2, h = feature.h||0;
      return (Math.PI*h/3) * (r1*r1 + r1*r2 + r2*r2);
    }
    case 'tube': return Math.PI * (Math.pow((feature.dOut||0)/2,2) - Math.pow((feature.dIn||0)/2,2)) * (feature.h||0);
    case 'torus': return 2 * Math.PI*Math.PI * Math.pow((feature.dTube||0)/2, 2) * ((feature.dMajor||0)/2);
    case 'extrude': return cao_extrudeVolume(feature);
    case 'revolve': return cao_revolveVolume(feature);
    case 'screw': {
      const s = CAO_SCREW_SIZES[feature.size] || CAO_SCREW_SIZES.M6;
      const shaft = Math.PI*Math.pow(s.d/2,2)*(feature.length||20);
      const head = Math.PI*Math.pow(s.headD/2,2)*s.headH;
      return shaft + head;
    }
    case 'nut': {
      const s = CAO_SCREW_SIZES[feature.size] || CAO_SCREW_SIZES.M6;
      const hexArea = (3*Math.sqrt(3)/2) * Math.pow(s.nutAF/Math.sqrt(3), 2);
      const holeArea = Math.PI*Math.pow(s.d/2,2);
      return Math.max(0, hexArea - holeArea) * s.headH;
    }
    case 'washer': {
      const s = CAO_SCREW_SIZES[feature.size] || CAO_SCREW_SIZES.M6;
      return Math.PI*(Math.pow(s.washerD/2,2) - Math.pow(s.d/2,2)) * 1.5;
    }
    case 'tube_profile': {
      const th = feature.thickness || 2, len = feature.length || 100;
      if (feature.shape === 'rond'){
        const rOut = (feature.d||20)/2, rIn = Math.max(0, rOut - th);
        return Math.PI*(rOut*rOut - rIn*rIn) * len;
      }
      const wOut = feature.w || 20, wIn = Math.max(0, wOut - 2*th);
      return (wOut*wOut - wIn*wIn) * len;
    }
    case 'gear': {
      // Approximation : disque plein au diamètre primitif (m × Z), suffisant pour une masse indicative.
      const m = feature.module || 2, z = feature.teeth || 20, dp = m*z;
      const bore = feature.bore || 0;
      return Math.max(0, Math.PI*Math.pow(dp/2,2) - Math.PI*Math.pow(bore/2,2)) * (feature.thickness||5);
    }
  }
  return 0;
}
function cao_bodyVolume(body){ return cao_primitiveVolume(body.feature); }
function cao_bodyMassKg(body){
  const mat = CAO_MATERIALS[body.material] || CAO_MATERIALS.acier;
  return cao_bodyVolume(body) * 1e-9 * mat.density;
}
function cao_assemblyMassKg(bodies){ return (bodies||[]).reduce((s,b) => s + cao_bodyMassKg(b), 0); }

const CAO_FEATURE_LABELS = {
  box:'Boîte', cylinder:'Cylindre', sphere:'Sphère', cone:'Cône/tronc', tube:'Tube', torus:'Tore',
  extrude:'Esquisse extrudée', revolve:'Révolution', screw:'Vis', nut:'Écrou', washer:'Rondelle',
  tube_profile:'Profilé', gear:'Engrenage',
};
function cao_defaultFeature(type){
  switch (type){
    case 'box': return { type:'box', w:60, h:40, d:10 };
    case 'cylinder': return { type:'cylinder', d:20, h:40 };
    case 'sphere': return { type:'sphere', d:20 };
    case 'cone': return { type:'cone', d1:20, d2:10, h:30 };
    case 'tube': return { type:'tube', dOut:30, dIn:24, h:50 };
    case 'torus': return { type:'torus', dMajor:40, dTube:6 };
    case 'extrude': return { type:'extrude', plane:'XY', profile:{ shape:'rect', w:80, h:40 }, holes:[{cx:-30,cy:0,d:6},{cx:30,cy:0,d:6}], depth:5, symmetric:false };
    case 'revolve': return { type:'revolve', profile:{ pts:[[0,-20],[10,-20],[10,20],[0,20]] }, angle:360 };
    case 'screw': return { type:'screw', size:'M6', length:25 };
    case 'nut': return { type:'nut', size:'M6' };
    case 'washer': return { type:'washer', size:'M6' };
    case 'tube_profile': return { type:'tube_profile', shape:'carre', w:20, thickness:2, length:200 };
    case 'gear': return { type:'gear', module:2, teeth:20, thickness:5, bore:6 };
  }
  throw new Error('Type de corps inconnu : ' + type);
}
function cao_slug(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function cao_uid(){ return 'b_' + Math.random().toString(36).slice(2,9); }
function cao_nextBodyName(bodies, type){
  const base = CAO_FEATURE_LABELS[type] || 'Corps';
  const n = (bodies||[]).filter(b => b.name && b.name.startsWith(base)).length;
  return base + ' ' + (n+1);
}
function cao_newBody(bodies, type){
  return { id: cao_uid(), name: cao_nextBodyName(bodies, type), visible: true, material: 'acier',
    transform: { pos:[0,0,0], rot:[0,0,0] }, feature: cao_defaultFeature(type) };
}
function cao_newProject(){ return { version:1, meta:{ name:'Nouvelle pièce' }, bodies:[] }; }
function cao_hexPoints(af){
  const R = af/Math.sqrt(3), pts = [];
  for (let i = 0; i < 6; i++){ const a = Math.PI/6 + i/6*Math.PI*2; pts.push([R*Math.cos(a), R*Math.sin(a)]); }
  return pts;
}
function cao_validateProject(o){
  if (!o || typeof o !== 'object' || o.version !== 1 || !Array.isArray(o.bodies)) throw new Error('Fichier CAO 3D non reconnu (version 1 attendue).');
  const P = cao_newProject();
  if (o.meta && typeof o.meta.name === 'string') P.meta.name = o.meta.name.slice(0,120);
  P.bodies = o.bodies.filter(b => b && typeof b.id === 'string' && b.feature && CAO_FEATURE_LABELS[b.feature.type]).map(b => ({
    id: b.id, name: String(b.name||'Corps').slice(0,60), visible: b.visible !== false,
    material: CAO_MATERIALS[b.material] ? b.material : 'acier',
    transform: { pos: Array.isArray(b.transform && b.transform.pos) ? b.transform.pos.slice(0,3).map(Number) : [0,0,0],
                 rot: Array.isArray(b.transform && b.transform.rot) ? b.transform.rot.slice(0,3).map(Number) : [0,0,0] },
    feature: b.feature,
  }));
  return P;
}

/* =====================================================================
   3. RENDU THREE.JS (dépend de window.THREE — jamais appelé si absent)
   ===================================================================== */
function cao_threeAvailable(){
  return typeof window !== 'undefined' && typeof window.THREE === 'object'
    && typeof window.THREE.OrbitControls === 'function' && typeof window.THREE.STLExporter === 'function';
}
function cao_webglAvailable(){
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')); }
  catch (e) { return false; }
}

function cao_shapeFromProfile(points, holes, THREE){
  const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], p[1])));
  (holes||[]).forEach(h => {
    const path = new THREE.Path(cao_circlePoints(h.cx||0, h.cy||0, h.d||1).map(p => new THREE.Vector2(p[0], p[1])));
    shape.holes.push(path);
  });
  return shape;
}
// Extrusion selon Y (convention commune à toutes les primitives de ce module, pour que la
// hauteur "h"/"depth" saisie par l'utilisateur pointe toujours vers le haut à l'écran).
function cao_extrudeAlongY(shape, depth, THREE, curveSegments){
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled:false, curveSegments: curveSegments||24 });
  g.rotateX(-Math.PI/2);
  g.translate(0, depth/2, 0);
  return g;
}
function cao_buildGeometry(feature, THREE){
  const f = feature;
  switch (f.type){
    case 'box': return new THREE.BoxGeometry(f.w, f.h, f.d);
    case 'cylinder': return new THREE.CylinderGeometry(f.d/2, f.d/2, f.h, 32);
    case 'sphere': return new THREE.SphereGeometry(f.d/2, 24, 16);
    case 'cone': return new THREE.CylinderGeometry(f.d2/2, f.d1/2, f.h, 32);
    case 'torus': return new THREE.TorusGeometry(f.dMajor/2, f.dTube/2, 16, 48);
    case 'tube': {
      const shape = cao_shapeFromProfile(cao_circlePoints(0,0,f.dOut), [{cx:0,cy:0,d:f.dIn}], THREE);
      return cao_extrudeAlongY(shape, f.h, THREE, 32);
    }
    case 'extrude': {
      const shape = cao_shapeFromProfile(cao_profilePoints(f.profile), f.holes, THREE);
      const g = cao_extrudeAlongY(shape, f.depth, THREE);
      if (!f.symmetric) g.translate(0, f.depth/2, 0); // par défaut : le plan d'esquisse est la base, pas le centre
      if (f.plane === 'XZ') g.rotateY(0);       // profil déjà dans le plan horizontal par construction (voir rotateX ci-dessus)
      else if (f.plane === 'YZ') g.rotateZ(Math.PI/2);
      return g;
    }
    case 'revolve': {
      const pts = (f.profile.pts||[]).map(p => new THREE.Vector2(Math.max(0,p[0]), p[1]));
      return new THREE.LatheGeometry(pts, 32, 0, (f.angle===undefined?360:f.angle) * Math.PI/180);
    }
    case 'nut': {
      const s = CAO_SCREW_SIZES[f.size] || CAO_SCREW_SIZES.M6;
      const shape = cao_shapeFromProfile(cao_hexPoints(s.nutAF), [{cx:0,cy:0,d:s.d}], THREE);
      return cao_extrudeAlongY(shape, s.headH, THREE);
    }
    case 'washer': {
      const s = CAO_SCREW_SIZES[f.size] || CAO_SCREW_SIZES.M6, th = Math.max(1, s.d*0.15);
      const shape = cao_shapeFromProfile(cao_circlePoints(0,0,s.washerD), [{cx:0,cy:0,d:s.d}], THREE);
      return cao_extrudeAlongY(shape, th, THREE, 32);
    }
    case 'tube_profile': {
      const th = f.thickness||2;
      if (f.shape === 'rond'){
        const shape = cao_shapeFromProfile(cao_circlePoints(0,0,f.d||20), [{cx:0,cy:0,d:Math.max(1,(f.d||20)-2*th)}], THREE);
        return cao_extrudeAlongY(shape, f.length||100, THREE, 32);
      }
      const w = f.w||20, wIn = Math.max(1, w-2*th);
      const outer = [[-w/2,-w/2],[w/2,-w/2],[w/2,w/2],[-w/2,w/2]];
      const shape = cao_shapeFromProfile(outer, [{cx:0,cy:0,d:0}], THREE);
      shape.holes = [new THREE.Path([[-wIn/2,-wIn/2],[wIn/2,-wIn/2],[wIn/2,wIn/2],[-wIn/2,wIn/2]].map(p=>new THREE.Vector2(p[0],p[1])))];
      return cao_extrudeAlongY(shape, f.length||100, THREE);
    }
    case 'gear': {
      const dp = (f.module||2) * (f.teeth||20);
      const shape = cao_shapeFromProfile(cao_circlePoints(0,0,dp), f.bore ? [{cx:0,cy:0,d:f.bore}] : [], THREE);
      return cao_extrudeAlongY(shape, f.thickness||5, THREE, 48);
    }
  }
  return new THREE.BoxGeometry(10,10,10);
}
// screw = corps composite (tête + tige) : seul cas où un "corps" produit un THREE.Group plutôt
// qu'un maillage unique — géré explicitement par le visualiseur (mêmes transform/matériau).
function cao_buildObject(body, THREE, material){
  if (body.feature.type === 'screw'){
    const s = CAO_SCREW_SIZES[body.feature.size] || CAO_SCREW_SIZES.M6, len = body.feature.length||25;
    const group = new THREE.Group();
    const headShape = cao_shapeFromProfile(cao_hexPoints(s.headD*0.95), null, THREE);
    const head = new THREE.Mesh(cao_extrudeAlongY(headShape, s.headH, THREE), material);
    head.position.y = len + s.headH/2;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(s.d/2, s.d/2, len, 24), material);
    shaft.position.y = len/2;
    group.add(head, shaft);
    return group;
  }
  return new THREE.Mesh(cao_buildGeometry(body.feature, THREE), material);
}

// Volume (mm³) mesuré directement sur la géométrie Three.js réellement construite (somme de
// tétraèdres signés) — sert de vérification croisée avec cao_bodyVolume() (calcul analytique) :
// les deux méthodes doivent converger, ce qui garantit que le rendu correspond au calcul de masse.
function cao_geometryVolume(geometry){
  const pos = geometry.attributes.position;
  const a = { x:0,y:0,z:0 }, b = { x:0,y:0,z:0 }, c = { x:0,y:0,z:0 };
  let vol = 0;
  const idx = geometry.index;
  const readVec = (i, v) => { v.x = pos.getX(i); v.y = pos.getY(i); v.z = pos.getZ(i); };
  const signedVolTet = () => (a.x*(b.y*c.z - b.z*c.y) - a.y*(b.x*c.z - b.z*c.x) + a.z*(b.x*c.y - b.y*c.x)) / 6;
  if (idx){
    for (let i = 0; i < idx.count; i += 3){ readVec(idx.getX(i), a); readVec(idx.getX(i+1), b); readVec(idx.getX(i+2), c); vol += signedVolTet(); }
  } else {
    for (let i = 0; i < pos.count; i += 3){ readVec(i, a); readVec(i+1, b); readVec(i+2, c); vol += signedVolTet(); }
  }
  return Math.abs(vol);
}

/* =====================================================================
   4. VISUALISEUR — mêmes conventions de montage/démontage que js/plan3d.js
   ===================================================================== */
let _c3dViewer = null, _c3dRO = null;
function unmountCad3D(){
  if (_c3dRO) { try { _c3dRO.disconnect(); } catch (e) {} _c3dRO = null; }
  if (_c3dViewer) { try { _c3dViewer.dispose(); } catch (e) {} _c3dViewer = null; }
}

function cao_createViewer(container, THREE){
  const renderer = new THREE.WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 20000);
  camera.position.set(180, 150, 220);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0,0,0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2e33, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65); sun.position.set(200,300,150); scene.add(sun);
  const grid = new THREE.GridHelper(400, 40, 0x3a3f45, 0x24272b); scene.add(grid);
  const axes = new THREE.AxesHelper(60); scene.add(axes);

  const group = new THREE.Group(); scene.add(group);
  const objById = new Map();
  let clipPlane = null;

  function clear(){ objById.forEach(o => { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material) (Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose&&m.dispose()); }); }); group.clear(); objById.clear(); }

  function setBodies(bodies, selectedId){
    clear();
    for (const b of (bodies||[])){
      if (!b.visible) continue;
      const mat = CAO_MATERIALS[b.material] || CAO_MATERIALS.acier;
      const material = new THREE.MeshStandardMaterial({ color: mat.color, roughness:0.55, metalness: b.material==='abs'||b.material==='bois' ? 0.05 : 0.55,
        clippingPlanes: clipPlane ? [clipPlane] : [], emissive: b.id===selectedId ? 0x2a4a5a : 0x000000 });
      let obj;
      try { obj = cao_buildObject(b, THREE, material); } catch (e) { continue; }
      obj.position.set(b.transform.pos[0]||0, b.transform.pos[1]||0, b.transform.pos[2]||0);
      obj.rotation.set((b.transform.rot[0]||0)*Math.PI/180, (b.transform.rot[1]||0)*Math.PI/180, (b.transform.rot[2]||0)*Math.PI/180);
      if (b.id === selectedId){
        const bbox = new THREE.Box3().setFromObject(obj);
        const helper = new THREE.Box3Helper(bbox, 0x4fc3f7); group.add(helper);
      }
      group.add(obj);
      objById.set(b.id, obj);
    }
    render();
  }

  function frameAll(){
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) { camera.position.set(180,150,220); controls.target.set(0,0,0); controls.update(); render(); return; }
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 10) * 1.6;
    camera.position.set(center.x+span, center.y+span*0.8, center.z+span);
    controls.target.copy(center); controls.update(); render();
  }
  const VIEWS = { iso:[1,0.85,1], dessus:[0,1,0.0001], face:[0,0.25,1], droite:[1,0.25,0] };
  function setView(name){
    const box = new THREE.Box3().setFromObject(group);
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(100,100,100) : box.getSize(new THREE.Vector3());
    const span = Math.max(size.x, size.y, size.z, 20) * 1.6;
    const dir = VIEWS[name] || VIEWS.iso;
    camera.position.set(center.x+dir[0]*span, center.y+dir[1]*span, center.z+dir[2]*span);
    controls.target.copy(center); controls.update(); render();
  }
  function setClip(y){
    clipPlane = (y===null||y===undefined) ? null : new THREE.Plane(new THREE.Vector3(0,-1,0), y);
    group.traverse(n => { if (n.material) (Array.isArray(n.material)?n.material:[n.material]).forEach(m => { m.clippingPlanes = clipPlane ? [clipPlane] : []; m.needsUpdate = true; }); });
    render();
  }
  function exportSTL(){
    const exporter = new THREE.STLExporter();
    return exporter.parse(group, { binary:true });
  }
  function resize(){ const w=Math.max(1,container.clientWidth), h=Math.max(1,container.clientHeight); renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); render(); }
  function render(){ renderer.render(scene, camera); }
  let raf = null;
  (function loop(){ raf = requestAnimationFrame(loop); controls.update(); render(); })();
  function dispose(){ if (raf) cancelAnimationFrame(raf); controls.dispose(); clear(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); }

  return { setBodies, frameAll, setView, setClip, exportSTL, resize, dispose, renderer, camera, objById };
}

/* =====================================================================
   5. INTERFACE — arbre de conception, panneau de propriétés, ruban
   ===================================================================== */
const CAO_SIZE_OPTS = Object.keys(CAO_SCREW_SIZES);
const CAO_MATERIAL_OPTS = Object.keys(CAO_MATERIALS);
// Champs numériques simples par type (hors vis/écrou/rondelle qui n'ont qu'une taille normalisée,
// et hors extrude/revolve gérés séparément ci-dessous car leur "esquisse" est une petite structure,
// pas une poignée de nombres).
const CAO_SIMPLE_FIELDS = {
  box: [['w','Largeur (mm)'],['h','Hauteur (mm)'],['d','Profondeur (mm)']],
  cylinder: [['d','Diamètre (mm)'],['h','Hauteur (mm)']],
  sphere: [['d','Diamètre (mm)']],
  cone: [['d1','Diamètre base (mm)'],['d2','Diamètre sommet (mm)'],['h','Hauteur (mm)']],
  tube: [['dOut','Diamètre extérieur (mm)'],['dIn','Diamètre intérieur (mm)'],['h','Hauteur (mm)']],
  torus: [['dMajor','Diamètre majeur (mm)'],['dTube','Diamètre du tube (mm)']],
  gear: [['module','Module (mm)'],['teeth','Nombre de dents'],['thickness','Épaisseur (mm)'],['bore','Alésage (mm)']],
};
function cao_fieldsHTML(feature){
  const simple = CAO_SIMPLE_FIELDS[feature.type];
  if (simple) return simple.map(([k,label]) => `<label>${esc(label)}</label><input data-f="${k}" type="number" step="any" value="${feature[k]}">`).join('');
  if (feature.type === 'screw' || feature.type === 'nut' || feature.type === 'washer'){
    let h = `<label>Taille</label><select data-f="size">${CAO_SIZE_OPTS.map(s=>`<option${s===feature.size?' selected':''}>${s}</option>`).join('')}</select>`;
    if (feature.type === 'screw') h += `<label>Longueur (mm)</label><input data-f="length" type="number" value="${feature.length}">`;
    return h;
  }
  if (feature.type === 'tube_profile') return `
    <label>Forme</label><select data-f="shape"><option value="carre"${feature.shape==='carre'?' selected':''}>Carré</option><option value="rond"${feature.shape==='rond'?' selected':''}>Rond</option></select>
    <label>Côté / diamètre (mm)</label><input data-f="w" type="number" value="${feature.w||feature.d||20}">
    <label>Épaisseur (mm)</label><input data-f="thickness" type="number" value="${feature.thickness}">
    <label>Longueur (mm)</label><input data-f="length" type="number" value="${feature.length}">`;
  if (feature.type === 'extrude'){
    const p = feature.profile;
    const holesTxt = (feature.holes||[]).map(h=>`${h.cx},${h.cy},${h.d}`).join(' ; ');
    return `
    <label>Forme du profil</label><select data-f="__shape"><option value="rect"${p.shape==='rect'?' selected':''}>Rectangle</option><option value="circle"${p.shape==='circle'?' selected':''}>Cercle</option></select>
    ${p.shape==='circle'
      ? `<label>Diamètre (mm)</label><input data-f="__pd" type="number" value="${p.d||20}">`
      : `<label>Largeur (mm)</label><input data-f="__pw" type="number" value="${p.w||40}"><label>Hauteur (mm)</label><input data-f="__ph" type="number" value="${p.h||20}">`}
    <label>Profondeur d'extrusion (mm)</label><input data-f="depth" type="number" value="${feature.depth}">
    <label>Symétrique / axe</label><input data-f="symmetric" type="checkbox" style="width:auto;justify-self:start"${feature.symmetric?' checked':''}>
    <label>Trous "cx,cy,d ; ..."</label><input data-f="__holes" value="${esc(holesTxt)}" placeholder="ex. -15,0,6 ; 15,0,6">`;
  }
  if (feature.type === 'revolve'){
    const ptsTxt = (feature.profile.pts||[]).map(p=>`${p[0]},${p[1]}`).join(' ; ');
    return `
    <label>Profil "rayon,hauteur ; ..."</label><input data-f="__pts" value="${esc(ptsTxt)}" placeholder="ex. 0,-20 ; 10,-20 ; 10,20 ; 0,20">
    <label>Angle (°, 360=plein tour)</label><input data-f="angle" type="number" value="${feature.angle===undefined?360:feature.angle}">`;
  }
  return '';
}
function cao_applyFieldChange(body, key, rawValue){
  const f = body.feature;
  if (f.type === 'extrude'){
    if (key === '__shape'){ f.profile = f.profile.shape==='circle' && rawValue==='rect' ? { shape:'rect', w:40, h:20 } : rawValue==='circle' ? { shape:'circle', d:20 } : f.profile; f.profile.shape = rawValue; if (rawValue==='rect' && f.profile.w===undefined){ f.profile.w=40; f.profile.h=20; } if (rawValue==='circle' && f.profile.d===undefined) f.profile.d=20; return; }
    if (key === '__pw'){ f.profile.w = Number(rawValue)||1; return; }
    if (key === '__ph'){ f.profile.h = Number(rawValue)||1; return; }
    if (key === '__pd'){ f.profile.d = Number(rawValue)||1; return; }
    if (key === '__holes'){
      f.holes = rawValue.split(';').map(s=>s.trim()).filter(Boolean).map(s => {
        const [cx,cy,d] = s.split(',').map(x=>Number(String(x).trim()));
        return Number.isFinite(cx)&&Number.isFinite(cy)&&Number.isFinite(d) ? { cx, cy, d } : null;
      }).filter(Boolean);
      return;
    }
    if (key === 'symmetric'){ f.symmetric = !!rawValue; return; }
  }
  if (f.type === 'revolve' && key === '__pts'){
    f.profile.pts = rawValue.split(';').map(s=>s.trim()).filter(Boolean).map(s => {
      const [x,y] = s.split(',').map(n=>Number(String(n).trim()));
      return Number.isFinite(x)&&Number.isFinite(y) ? [x,y] : null;
    }).filter(Boolean);
    return;
  }
  if (key === 'size' || key === 'shape'){ f[key] = rawValue; return; }
  f[key] = Number(rawValue);
}

function cao3dShellHTML(){
  return `<div id="cao3d-shell">
    <div class="c3d-toolbar">
      <div class="c3d-group">
        <button class="c3d-btn" data-v="iso">Isométrique</button>
        <button class="c3d-btn" data-v="dessus">Dessus</button>
        <button class="c3d-btn" data-v="face">Face</button>
        <button class="c3d-btn" data-v="droite">Droite</button>
        <button class="c3d-btn" id="c3d-fit">Cadrer tout</button>
      </div>
      <div class="c3d-group">
        <span class="muted" style="font-size:.78em">Ajouter :</span>
        ${['box','cylinder','sphere','cone','tube','torus'].map(t=>`<button class="c3d-btn" data-add="${t}">${esc(CAO_FEATURE_LABELS[t])}</button>`).join('')}
        <button class="c3d-btn" data-add="extrude">Esquisse extrudée</button>
        <button class="c3d-btn" data-add="revolve">Révolution</button>
      </div>
      <div class="c3d-group">
        ${['screw','nut','washer','tube_profile','gear'].map(t=>`<button class="c3d-btn" data-add="${t}">${esc(CAO_FEATURE_LABELS[t])}</button>`).join('')}
      </div>
      <div class="c3d-group c3d-clipgroup">
        <label for="c3d-clip">Coupe horizontale</label>
        <input type="range" id="c3d-clip" min="0" max="1" step="0.01" value="1">
      </div>
      <div class="c3d-group">
        <button class="c3d-btn" id="c3d-export-stl">Exporter STL</button>
        <button class="c3d-btn" id="c3d-export-csv">Nomenclature (CSV)</button>
        <button class="c3d-btn" id="c3d-help">Aide</button>
      </div>
    </div>
    <div class="c3d-main">
      <div id="c3d-viewport"></div>
      <div id="c3d-fallback" class="c3d-fallback hidden"></div>
      <aside id="c3d-side">
        <div class="c3d-tree" id="c3d-tree"></div>
        <div class="c3d-props" id="c3d-props"><div class="muted" style="padding:10px">Sélectionnez un corps dans l'arbre, ou ajoutez-en un depuis le ruban.</div></div>
        <div class="c3d-summary" id="c3d-summary"></div>
      </aside>
    </div>
  </div>`;
}
function cao_treeHTML(bodies, selectedId){
  if (!bodies.length) return '<div class="muted" style="padding:8px">Aucun corps — ajoutez-en un depuis le ruban.</div>';
  return bodies.map(b => `<div class="c3d-tree-row${b.id===selectedId?' sel':''}" data-body="${esc(b.id)}">
    <button class="c3d-eye" data-toggle-vis="${esc(b.id)}" title="Afficher/masquer">${b.visible?'👁':'◌'}</button>
    <span class="c3d-tree-name">${esc(b.name)}</span>
    <span class="muted" style="font-size:.72em">${esc(CAO_FEATURE_LABELS[b.feature.type]||'')}</span>
  </div>`).join('');
}
function cao_propsHTML(body){
  if (!body) return '<div class="muted" style="padding:10px">Sélectionnez un corps dans l\'arbre, ou ajoutez-en un depuis le ruban.</div>';
  const vol = cao_bodyVolume(body), mass = cao_bodyMassKg(body);
  return `<div style="padding:8px">
    <div class="field"><label style="font-size:.75em">Nom</label><input id="c3d-p-name" value="${esc(body.name)}"></div>
    <div class="field"><label style="font-size:.75em">Matériau</label><select id="c3d-p-material">${CAO_MATERIAL_OPTS.map(m=>`<option value="${m}"${m===body.material?' selected':''}>${esc(CAO_MATERIALS[m].label)}</option>`).join('')}</select></div>
    <div class="c3d-h4">Position (mm)</div>
    <div class="c3d-frm3">${['x','y','z'].map((a,i)=>`<input data-pos="${i}" type="number" step="any" value="${body.transform.pos[i]}" title="${a}">`).join('')}</div>
    <div class="c3d-h4">Rotation (°)</div>
    <div class="c3d-frm3">${['x','y','z'].map((a,i)=>`<input data-rot="${i}" type="number" step="any" value="${body.transform.rot[i]}" title="${a}">`).join('')}</div>
    <div class="c3d-h4">${esc(CAO_FEATURE_LABELS[body.feature.type])}</div>
    <div class="c3d-frm" id="c3d-feature-fields">${cao_fieldsHTML(body.feature)}</div>
    <div class="c3d-h4">Volume / masse</div>
    <div class="muted" style="font-size:.8em">${(vol/1000).toFixed(2)} cm³ · ${mass.toFixed(3)} kg</div>
    <button class="c3d-btn c3d-bad" id="c3d-p-delete" style="margin-top:10px">Supprimer ce corps</button>
  </div>`;
}
function cao_summaryHTML(project){
  const bodies = project.bodies;
  const total = cao_assemblyMassKg(bodies);
  return `<div style="padding:8px">
    <div class="c3d-h4">Nomenclature (${bodies.length} corps)</div>
    <table class="c3d-rep">${bodies.map(b=>`<tr><td>${esc(b.name)}</td><td class="n">${cao_bodyMassKg(b).toFixed(3)} kg</td></tr>`).join('') || '<tr><td class="muted">Aucun corps</td></tr>'}</table>
    <div style="margin-top:6px;font-weight:600">Masse totale : ${total.toFixed(3)} kg</div>
  </div>`;
}

/* =====================================================================
   6. ÉTAT ET CÂBLAGE
   ===================================================================== */
let C3D = null, c3dSelected = null, c3dStorage = null, c3dSaveT = null;
function c3dScheduleSave(){
  clearTimeout(c3dSaveT);
  c3dSaveT = setTimeout(() => { if (c3dStorage) c3dStorage.save(JSON.stringify(C3D)); }, 700);
}
function c3dRefreshScene(){
  if (!_c3dViewer) return;
  _c3dViewer.setBodies(C3D.bodies, c3dSelected);
}
function c3dRefreshSide(){
  const tree = document.getElementById('c3d-tree'); if (tree) tree.innerHTML = cao_treeHTML(C3D.bodies, c3dSelected);
  const props = document.getElementById('c3d-props'); if (props) props.innerHTML = cao_propsHTML(C3D.bodies.find(b=>b.id===c3dSelected));
  const summary = document.getElementById('c3d-summary'); if (summary) summary.innerHTML = cao_summaryHTML(C3D);
}
function c3dChanged(){ c3dRefreshScene(); c3dRefreshSide(); c3dScheduleSave(); }

function cao3dFallback(reason){
  const fb = document.getElementById('c3d-fallback'), vp = document.getElementById('c3d-viewport');
  if (vp) vp.classList.add('hidden');
  if (fb){ fb.classList.remove('hidden'); fb.innerHTML = `<div class="c3d-fallback-box"><b>Atelier 3D indisponible</b><p>${esc(reason)}</p></div>`; }
}

async function viewCad3D(projectId){
  const { data: project } = await db.getProject(projectId);
  if (!project) return `<div class="empty">Projet introuvable. <a href="#/dashboard">Retour</a></div>`;
  window.__c3dCtx = { projectId, title: project.titre };
  return `<div class="workspace" style="flex-direction:column">
    <div class="ws-topbar">
      <div><strong>${esc(project.titre)}</strong><span class="pill" style="margin-left:8px">CAO mécanique 3D</span></div>
      <div class="ws-tabs-top">
        <a href="#/project/${projectId}">Schéma</a>
        <a href="#/devis/${projectId}">Devis</a>
        <a href="#/dimensionnement/${projectId}">Dimensionnement</a>
        <a href="#/plan/${projectId}">Plan</a>
        <a href="#/plan3d/${projectId}">3D bâtiment</a>
        <a href="#/cad3d/${projectId}" class="active">CAO 3D</a>
      </div>
    </div>
    <div style="flex:1;min-height:0;position:relative">${cao3dShellHTML()}</div>
  </div>`;
}

async function afterCad3DView(){
  unmountCad3D();
  const ctx = window.__c3dCtx;
  const shell = document.getElementById('cao3d-shell');
  if (!ctx || !shell) return;
  if (!cao_webglAvailable()){ cao3dFallback("WebGL n'est pas disponible dans ce navigateur/cet environnement."); return; }
  if (!cao_threeAvailable()){ cao3dFallback("La bibliothèque 3D (Three.js/STLExporter) n'a pas pu être chargée — vérifiez la connexion réseau ou qu'aucun bloqueur ne l'empêche de se charger depuis le CDN."); return; }

  c3dStorage = {
    async load(){ const { data } = await db.getCad3d(ctx.projectId); return data ? JSON.stringify(data) : null; },
    async save(json){ await db.saveCad3d(ctx.projectId, JSON.parse(json)); },
  };
  const raw = await c3dStorage.load();
  try { C3D = raw ? cao_validateProject(JSON.parse(raw)) : cao_newProject(); } catch (e) { C3D = cao_newProject(); }
  c3dSelected = null;

  const viewport = document.getElementById('c3d-viewport');
  let viewer;
  try { viewer = cao_createViewer(viewport, window.THREE); } catch (e) { cao3dFallback('La création de la scène 3D a échoué : ' + e.message); return; }
  _c3dViewer = viewer;
  viewer.resize();
  c3dRefreshScene();
  c3dRefreshSide();
  viewer.frameAll();

  document.querySelectorAll('#cao3d-shell [data-v]').forEach(b => b.addEventListener('click', () => viewer.setView(b.dataset.v)));
  document.getElementById('c3d-fit')?.addEventListener('click', () => viewer.frameAll());
  document.querySelectorAll('#cao3d-shell [data-add]').forEach(b => b.addEventListener('click', () => {
    const body = cao_newBody(C3D.bodies, b.dataset.add);
    C3D.bodies.push(body);
    c3dSelected = body.id;
    c3dChanged();
  }));
  document.getElementById('c3d-clip')?.addEventListener('input', (e) => {
    const v = Number(e.target.value);
    // Échelle 0..1 -> 0..hauteur max observée (recalculée à chaque fois pour rester correcte après ajout/suppression de corps)
    const maxY = C3D.bodies.reduce((m,b) => Math.max(m, (b.transform.pos[1]||0) + 500), 50);
    viewer.setClip(v >= 0.999 ? null : v*maxY);
  });
  document.getElementById('c3d-export-stl')?.addEventListener('click', () => {
    try {
      const buf = viewer.exportSTL();
      download3d((C3D.meta.name||'piece').replace(/[^\w-]+/g,'_') + '.stl', new Blob([buf], { type:'application/sla' }));
    } catch (e) { toast('Export STL impossible : ' + e.message); }
  });
  document.getElementById('c3d-export-csv')?.addEventListener('click', () => {
    const rows = [['Corps','Type','Matériau','Volume (cm³)','Masse (kg)']].concat(C3D.bodies.map(b => [b.name, CAO_FEATURE_LABELS[b.feature.type], CAO_MATERIALS[b.material].label, (cao_bodyVolume(b)/1000).toFixed(2), cao_bodyMassKg(b).toFixed(3)]));
    const csv = '﻿' + rows.map(r => r.map(v => { const s=String(v??''); return /[;"\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }).join(';')).join('\r\n');
    download3d('nomenclature_' + (C3D.meta.name||'piece').replace(/[^\w-]+/g,'_') + '.csv', new Blob([csv], { type:'text/csv;charset=utf-8' }));
  });
  document.getElementById('c3d-help')?.addEventListener('click', () => {
    alert("Atelier CAO mécanique 3D :\n\n- Primitives (boîte, cylindre, sphère, cône, tube, tore) et bibliothèque (vis, écrou, rondelle, profilé, engrenage) paramétriques.\n- Esquisse extrudée : profil rectangle/cercle avec trous traversants optionnels (perçage), révolution : profil rayon/hauteur tourné autour de l'axe vertical.\n- L'assemblage se fait en positionnant plusieurs corps (pas de fusion booléenne 3D entre solides quelconques dans cette version — voir la documentation du projet).\n- La coupe horizontale masque progressivement le haut de l'assemblage pour voir l'intérieur.\n- Export STL (impression 3D) et nomenclature CSV (masse par corps, matériau).");
  });

  document.getElementById('c3d-tree')?.addEventListener('click', (e) => {
    const vis = e.target.closest('[data-toggle-vis]');
    if (vis){ const b = C3D.bodies.find(x=>x.id===vis.dataset.toggleVis); if (b){ b.visible = !b.visible; c3dChanged(); } return; }
    const row = e.target.closest('[data-body]');
    if (row){ c3dSelected = row.dataset.body; c3dRefreshScene(); c3dRefreshSide(); }
  });

  document.getElementById('c3d-props')?.addEventListener('change', (e) => {
    const body = C3D.bodies.find(b=>b.id===c3dSelected); if (!body) return;
    if (e.target.id === 'c3d-p-name'){ body.name = e.target.value.slice(0,60) || body.name; c3dChanged(); return; }
    if (e.target.id === 'c3d-p-material'){ body.material = e.target.value; c3dChanged(); return; }
    if (e.target.dataset.pos !== undefined){ body.transform.pos[+e.target.dataset.pos] = Number(e.target.value)||0; c3dChanged(); return; }
    if (e.target.dataset.rot !== undefined){ body.transform.rot[+e.target.dataset.rot] = Number(e.target.value)||0; c3dChanged(); return; }
    if (e.target.dataset.f !== undefined){
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      cao_applyFieldChange(body, e.target.dataset.f, val);
      c3dChanged();
      return;
    }
  });
  document.getElementById('c3d-props')?.addEventListener('click', (e) => {
    if (e.target.id === 'c3d-p-delete'){
      const body = C3D.bodies.find(b=>b.id===c3dSelected); if (!body) return;
      if (!confirm(`Supprimer "${body.name}" ?`)) return;
      C3D.bodies = C3D.bodies.filter(b=>b.id!==c3dSelected);
      c3dSelected = null;
      c3dChanged();
    }
  });

  if (typeof ResizeObserver !== 'undefined'){ _c3dRO = new ResizeObserver(() => viewer.resize()); _c3dRO.observe(viewport); }
}
function download3d(name, blob){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
