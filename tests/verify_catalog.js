// Vérifie automatiquement la cohérence du catalogue de composants (js/catalog.js) :
// - pas d'identifiant en double ;
// - chaque composant a bien un symbole SVG associé ;
// - chaque borne déclarée correspond réellement à l'extrémité d'un trait dessiné dans son
//   symbole (c'est la classe de bug trouvée et corrigée sur le MOSFET/régulateur/transfo à
//   point milieu dans une version antérieure — ce script empêche toute régression du même type
//   à mesure que de nouveaux composants sont ajoutés).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const PROJECT = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
function load(f){ vm.runInContext(fs.readFileSync(path.join(PROJECT,f),'utf8'), sandbox, { filename:f }); }
load('js/config.js');
load('js/catalog.js');

const COMMON_COMPONENTS = vm.runInContext('COMMON_COMPONENTS', sandbox);
const COMPONENT_LIBRARY = vm.runInContext('COMPONENT_LIBRARY', sandbox);
const INSTRUMENT_LIBRARY = vm.runInContext('INSTRUMENT_LIBRARY', sandbox);
const SYM = vm.runInContext('SYM', sandbox);

let all = [...COMMON_COMPONENTS];
Object.values(COMPONENT_LIBRARY).forEach(list => all.push(...list));
all.push(...INSTRUMENT_LIBRARY);

console.log('Total composants:', all.length);

const seen = new Map();
let dupCount = 0;
all.forEach(c => {
  if (seen.has(c.id)) { console.log('DOUBLON ID:', c.id); dupCount++; }
  seen.set(c.id, true);
});
console.log('Doublons id:', dupCount);

let missingSym = 0;
all.forEach(c => { if (!(c.id in SYM)) { console.log('SYM MANQUANT:', c.id); missingSym++; } });
console.log('SYM manquants:', missingSym);

function extractEndpoints(svg){
  const pts = [];
  const lineRe = /<line[^>]*x1="([-\d.]+)"[^>]*y1="([-\d.]+)"[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"/g;
  let m;
  while ((m = lineRe.exec(svg))){
    pts.push([parseFloat(m[1]), parseFloat(m[2])]);
    pts.push([parseFloat(m[3]), parseFloat(m[4])]);
  }
  return pts;
}
let mismatch = 0;
all.forEach(c => {
  const svg = SYM[c.id];
  if (!svg) return;
  const pts = extractEndpoints(svg);
  c.terminals.forEach((t, idx) => {
    const ok = pts.some(p => Math.abs(p[0]-t[0]) < 0.6 && Math.abs(p[1]-t[1]) < 0.6);
    if (!ok){ console.log(`BORNE NON ALIGNEE: ${c.id} borne#${idx} (${t[0]},${t[1]})`); mismatch++; }
  });
});
console.log('Bornes non alignées:', mismatch);

const ok = dupCount===0 && missingSym===0 && mismatch===0;
console.log(ok ? 'OK — catalogue cohérent' : 'ECHEC — voir ci-dessus');
process.exit(ok ? 0 : 1);
