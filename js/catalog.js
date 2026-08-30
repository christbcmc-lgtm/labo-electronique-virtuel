/* ==========================================================================
   BIBLIOTHÈQUE DE COMPOSANTS — architecture par gabarits (§16)
   --------------------------------------------------------------------------
   Chaque composant est une "fiche" : { id, nom, famille, domaine, terminals,
   unit, defaultValue, valueOptions, def, wiki, alias, complexite, simulable }.
   Le symbole SVG associé vit dans SYM[id] (chaîne SVG, viewBox de référence
   60×30, centre de rotation (30,15) — convention utilisée par tout l'éditeur).

   Pour ne pas dessiner des centaines de glyphes uniques à la main (ce qui
   ralentirait le développement sans valeur ajoutée réelle), les familles
   nombreuses (résistances, diodes, circuits intégrés, logique, capteurs,
   modules...) réutilisent un petit nombre de GABARITS DE SYMBOLE génériques
   mais distincts par famille, avec un libellé affiché sur le composant. Les
   composants "vedettes" (transistors, MOSFET, AOP, régulateur, transformateur
   à point milieu...) gardent leur symbole dessiné à la main, hérité de la
   version précédente et déjà vérifié (bornes ↔ tracé) — voir RAPPORT-FINAL.

   Ajouter un nouveau composant = ajouter une ligne à un tableau ci-dessous.
   Aucune autre partie du moteur (éditeur, PDF, diagnostic) n'a besoin d'être
   modifiée : c'est la garantie d'extensibilité demandée par le cahier (§16).
   ========================================================================== */

function leadLine(x1,y1,x2,y2){ return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="currentColor" stroke-width="2"/>`; }
function ctext(x,y,txt,size=7){ return `<text x="${x}" y="${y}" font-size="${size}" fill="currentColor" text-anchor="middle">${esc(String(txt))}</text>`; }

const SYM = {};

// ---- Gabarits de bornes fixes (coordonnées locales, avant rotation) ----
const T2 = [[0,15],[60,15]];
const T3_TRANSISTOR = [[0,15],[42,-4],[42,34]];              // base, collecteur, émetteur
const T3_MOSFET     = [[0,8],[42,-4],[42,34]];                // grille (y=8, PAS y=15), drain, source
const T3_AOP        = [[0,8],[0,22],[60,15]];                 // entrée +, entrée -, sortie
const T3_REGULATEUR = [[0,15],[60,15],[30,30]];                // entrée, sortie, masse
const T3_WIPER      = [[0,15],[60,15],[30,0]];                 // dipôle + curseur (potentiomètre)
const T4            = [[0,8],[0,22],[60,8],[60,22]];
const T5_TRANSFO_PM = [[0,8],[0,22],[60,4],[60,15],[60,26]];   // primaire haut/bas, secondaire haut/PM/bas
const T1_SIMPLE     = [[0,15]];                                 // borne unique (ex. terre)
const T3_BLOCK      = [[0,10],[0,20],[60,15]];                  // gabarit "bloc" (capteurs/modules)
const T3_LEFT3      = [[0,4],[0,15],[0,26]];                    // 3 entrées côte à côte, pas de sortie dessinée
const T6_TRIPHASE   = [[0,4],[0,15],[0,26],[60,4],[60,15],[60,26]]; // 3 entrées + 3 sorties
const T3_BUSBAR      = [[10,26],[30,26],[50,26]];               // jeu de barres : 3 piquages
const T4_CROSS      = [[0,15],[60,15],[30,0],[30,30]];          // boîte de dérivation : croisement 4 voies
const T4_RGB        = [[0,4],[0,15],[0,26],[60,15]];            // LED RGB : R,G,B + cathode commune
const T4_OPTOTRIAC  = [[0,10],[0,20],[60,8],[60,22]];           // LED d'entrée (10/20) + triac de sortie (8/22)
const T4_WIDE       = [[0,4],[0,26],[60,4],[60,26]];            // boîtier large (afficheur 7 segments)
const T2_COLE       = [[42,-4],[42,34]];                        // phototransistor : collecteur/émetteur (pas de base électrique)

// ---- Gabarit IC générique : n broches réparties gauche/droite, calculées
//      en même temps que le tracé pour garantir bornes ↔ traits toujours alignés
//      (c'est exactement la classe de bug corrigée dans la version précédente :
//      MOSFET/régulateur/transfo PM avaient des bornes qui ne correspondaient
//      à aucun trait réellement dessiné — voir RAPPORT-FINAL section B).
function icTemplate(n, label){
  const L = Math.ceil(n/2), R = n - L;
  const terms = []; let leads = '';
  for (let i=0;i<L;i++){ const y = 3 + (i+0.5)*(24/L); leads += leadLine(0,y,16,y); terms.push([0,y]); }
  for (let i=0;i<R;i++){ const y = 3 + (i+0.5)*(24/R); leads += leadLine(44,y,60,y); terms.push([60,y]); }
  const sym = `${leads}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,label,6.2)}`;
  return { sym, terminals: terms };
}

// ---- Gabarits de symboles à 2 bornes (dipôles), génériques par famille ----
const TPL = {
  boxLabel: (label) => `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,label,7)}`,
  boxDiag: (label, wiper=false) => `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,20,label,6)}${wiper
      ? `<line x1="14" y1="25" x2="28" y2="9" stroke="currentColor" stroke-width="1.6" marker-end="url(#arrow)"/>${leadLine(30,0,30,7)}`
      : `<line x1="10" y1="27" x2="50" y2="3" stroke="currentColor" stroke-width="1.6" marker-end="url(#arrow)"/>`}`,
  circleLetter: (letter) => `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,letter,11)}`,
  switchLike: (open=true) => `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/><circle cx="44" cy="15" r="2.2" fill="currentColor"/><line x1="16" y1="15" x2="${open?42:40}" y2="${open?4:15}" stroke="currentColor" stroke-width="2"/>`,
  diodeBase: (extra='') => `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<polygon points="20,5 20,25 40,15" fill="none" stroke="currentColor" stroke-width="2"/>${leadLine(40,5,40,25)}${extra}`,
  capBase: (extra='') => `${leadLine(0,15,26,15)}${leadLine(34,15,60,15)}${leadLine(26,4,26,26)}${leadLine(34,4,34,26)}${extra}`,
  block: (label) => `${leadLine(0,10,10,10)}${leadLine(0,20,10,20)}${leadLine(50,15,60,15)}<rect x="10" y="2" width="40" height="26" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,label,6.4)}`,
  gate2in: (path, bubble=false) => `${leadLine(0,8,15,8)}${leadLine(0,22,15,22)}${leadLine(bubble?49:45,15,60,15)}<path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/>${bubble?'<circle cx="47.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>':''}`,
  gate1in: (bubble=false) => `${leadLine(0,15,15,15)}${leadLine(bubble?49:45,15,60,15)}<path d="M15,4 L15,26 L45,15 Z" fill="none" stroke="currentColor" stroke-width="2"/>${bubble?'<circle cx="47.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>':''}`,
};
const AND_PATH = 'M15,2 H30 A13,13 0 0 1 30,28 H15 Z';
const OR_PATH  = 'M15,2 Q28,2 34,15 Q28,28 15,28 Q22,15 15,2 Z';

function icDefRow(id, nom, pins, opts={}){
  const t = icTemplate(pins, opts.label || nom.split(' ')[0].split('(')[0]);
  return defRow(id, nom, t.terminals, t.sym, opts);
}
function defRow(id, nom, terminals, sym, opts={}){
  SYM[id] = sym;
  // On étale d'abord `opts` (permet d'ajouter n'importe quel champ personnalisé — ex. `instrument`,
  // `pv` — sans devoir mettre cette fonction à jour à chaque fois, cf. §16), puis on complète les
  // champs standards avec leurs valeurs par défaut.
  return {
    ...opts,
    id, nom, terminals,
    unit: opts.unit||'', defaultValue: opts.defaultValue ?? '', valueOptions: opts.valueOptions||[],
    def: opts.def||'', wiki: opts.wiki || nom.replace(/[^\wÀ-ÿ]+/g,'_'),
    alias: opts.alias||'', famille: opts.famille||nom, complexite: opts.complexite||'simple',
    simulable: opts.simulable ?? false, variantes: opts.variantes || null,
  };
}

/* ==========================================================================
   COMPOSANTS COMMUNS — partagés par TOUS les domaines (évite la duplication ;
   findDef() les retrouve comme n'importe quel autre composant).
   ========================================================================== */
const COMMON_COMPONENTS = [
  defRow('resistance','Résistance', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { unit:'Ω', defaultValue:220, valueOptions:[10,22,47,100,220,330,470,1000,2200,4700,10000,47000,100000], famille:'Résistances',
      def:"Dipôle qui s'oppose au passage du courant et dissipe de l'énergie sous forme de chaleur (loi d'Ohm : U = R×I).", wiki:'Résistance_électrique', alias:'resistor ohm r', simulable:true }),
  defRow('condensateur','Condensateur', T2, `${leadLine(0,15,26,15)}${leadLine(34,15,60,15)}${leadLine(26,4,26,26)}${leadLine(34,4,34,26)}`,
    { unit:'µF', defaultValue:100, valueOptions:[0.001,0.01,0.1,1,10,100,470,1000,2200], famille:'Condensateurs',
      def:"Composant qui stocke de l'énergie électrique sous forme de champ électrique entre deux armatures.", wiki:'Condensateur_(électricité)', alias:'capacitor capa condo', simulable:true }),
  defRow('bobine','Bobine (inductance)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}${[10,20,30,40].map(x=>`<path d="M${x},15 a5,9 0 0 1 10,0" fill="none" stroke="currentColor" stroke-width="2"/>`).join('')}`,
    { unit:'mH', defaultValue:10, valueOptions:[0.1,1,10,47,100,470,1000], famille:'Bobines',
      def:"Composant qui stocke de l'énergie dans un champ magnétique lorsqu'il est traversé par un courant.", wiki:'Inductance', alias:'inductance self coil', simulable:true }),
  defRow('diode','Diode', T2, TPL.diodeBase(),
    { unit:'V (seuil)', defaultValue:0.7, valueOptions:[0.3,0.7,1.2], famille:'Diodes',
      def:"Ne laisse passer le courant que dans un seul sens (redressement, protection).", wiki:'Diode', alias:'1n4007 1n4148 redresseuse', simulable:true }),
  defRow('diode_zener','Diode Zener', T2, `${TPL.diodeBase()}${leadLine(36,5,40,5)}${leadLine(40,25,44,25)}`,
    { unit:'V (Zener)', defaultValue:5.1, valueOptions:[3.3,5.1,6.2,9.1,12], famille:'Diodes',
      def:"Diode conçue pour fonctionner en inverse à une tension précise, utilisée pour stabiliser une tension.", wiki:'Diode_Zener', alias:'zener stabilisation', simulable:true }),
  defRow('led','LED', T2, `${TPL.diodeBase()}<line x1="34" y1="2" x2="40" y2="-4" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><line x1="40" y1="4" x2="46" y2="-2" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/>`,
    { unit:'V (seuil)', defaultValue:2.0, valueOptions:[1.8,2.0,2.2,3.2], famille:'Diodes',
      def:"Diode électroluminescente : émet de la lumière lorsqu'elle est traversée par un courant dans le bon sens.", wiki:'Diode_électroluminescente', alias:'del lumiere', simulable:true }),
  defRow('interrupteur','Interrupteur', T2, TPL.switchLike(true),
    { unit:'état', defaultValue:'ouvert', valueOptions:['ouvert','fermé'], famille:'Électromécanique',
      def:"Ouvre ou ferme manuellement le circuit.", wiki:'Interrupteur_(électricité)', alias:'switch bouton on off' }),
  defRow('bouton_poussoir','Bouton-poussoir', T2, `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/><circle cx="44" cy="15" r="2.2" fill="currentColor"/><line x1="24" y1="15" x2="36" y2="15" stroke="currentColor" stroke-width="2"/><line x1="30" y1="6" x2="30" y2="15" stroke="currentColor" stroke-width="2"/>`,
    { unit:'type', defaultValue:'NO', valueOptions:['NO','NF'], famille:'Électromécanique',
      def:"Contact momentané actionné manuellement : revient à sa position au repos une fois relâché.", wiki:'Bouton-poussoir', alias:'poussoir push button' }),
  defRow('relais','Relais électromagnétique', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${[0,1,2,3].map(i=>`<path d="M${16+i*3},8 a3.5,7 0 0 1 0,14" fill="none" stroke="currentColor" stroke-width="1.4"/>`).join('')}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<line x1="44" y1="22" x2="58" y2="10" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'V (bobine)', defaultValue:12, valueOptions:[5,12,24,48], famille:'Électromécanique',
      def:"Interrupteur commandé par un électro-aimant : une bobine actionne un ou plusieurs contacts isolés électriquement.", wiki:'Relais_(électricité)', alias:'relay bobine contact' }),
  defRow('fusible','Fusible', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<rect x="14" y="10" width="32" height="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="14" y1="15" x2="46" y2="15" stroke="currentColor" stroke-width="1.2"/>`,
    { unit:'A', defaultValue:2, valueOptions:[0.1,0.5,1,2,5,10,16,20], famille:'Protections',
      def:"Coupe le circuit en fondant si le courant dépasse son calibre, protégeant ainsi le reste du montage.", wiki:'Fusible_(électricité)', alias:'fuse protection' }),
  defRow('buzzer','Buzzer / avertisseur', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M23,15 a7,7 0 0 1 14,0" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
    { unit:'V', defaultValue:5, valueOptions:[3,5,9,12], famille:'Électromécanique',
      def:"Émet un signal sonore lorsqu'il est alimenté.", wiki:'Buzzer', alias:'avertisseur sonore alarme' }),
  defRow('prise_courant','Prise de courant', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="26" cy="15" r="1.4" fill="currentColor"/><circle cx="34" cy="15" r="1.4" fill="currentColor"/>`,
    { unit:'A', defaultValue:16, valueOptions:[10,16,20,32], famille:'Bâtiment',
      def:"Point d'alimentation en courant alternatif pour brancher un appareil.", wiki:'Prise_de_courant', alias:'socket outlet' }),
  defRow('mise_a_la_terre','Mise à la terre', T1_SIMPLE, `${leadLine(0,15,30,15)}${leadLine(30,15,30,20)}<line x1="20" y1="20" x2="40" y2="20" stroke="currentColor" stroke-width="2"/><line x1="24" y1="24" x2="36" y2="24" stroke="currentColor" stroke-width="1.6"/><line x1="27" y1="28" x2="33" y2="28" stroke="currentColor" stroke-width="1.2"/>`,
    { famille:'Bâtiment', def:"Relie une masse métallique à la terre pour la sécurité des personnes.", wiki:'Mise_à_la_terre', alias:'terre ground pe' }),
  defRow('connecteur','Connecteur / bornier', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="9" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Câblage', def:"Point de jonction mécanique entre deux conducteurs (bornier, connecteur débrochable...).", wiki:'Connecteur_électrique', alias:'bornier terminal block' }),
];

/* ==========================================================================
   DOMAINE — ÉLECTRONIQUE (§9)
   ========================================================================== */
const ELECTRONIQUE = [
  // --- Résistances (variantes) ---
  defRow('resistance_variable','Résistance variable', T2, TPL.boxDiag('R'),
    { unit:'Ω', defaultValue:1000, valueOptions:[100,470,1000,4700,10000,47000], famille:'Résistances',
      def:"Résistance dont la valeur peut être ajustée manuellement.", wiki:'Résistance_variable', alias:'variable resistor' }),
  defRow('potentiometre','Potentiomètre', T3_WIPER, TPL.boxDiag('Pot', true),
    { unit:'Ω', defaultValue:10000, valueOptions:[1000,10000,47000,100000], famille:'Résistances',
      def:"Résistance variable à trois bornes utilisée comme diviseur de tension réglable (volume, réglage...).", wiki:'Potentiomètre_(électronique)', alias:'pot volume reglage' }),
  defRow('rheostat','Rhéostat', T2, TPL.boxDiag('Rh'),
    { unit:'Ω', defaultValue:100, valueOptions:[10,47,100,470,1000], famille:'Résistances',
      def:"Résistance variable de puissance utilisée pour limiter un courant (démarrage moteur, réglage de charge), généralement câblée à deux bornes.", wiki:'Rhéostat', alias:'rheostat puissance' }),
  defRow('thermistance_ntc','Thermistance NTC', T2, TPL.boxLabel('NTC'),
    { unit:'Ω (25°C)', defaultValue:10000, valueOptions:[1000,4700,10000,100000], famille:'Résistances',
      def:"Résistance dont la valeur diminue quand la température augmente (mesure/protection thermique).", wiki:'Thermistance', alias:'ntc temperature' }),
  defRow('thermistance_ptc','Thermistance PTC', T2, TPL.boxLabel('PTC'),
    { unit:'Ω (25°C)', defaultValue:100, valueOptions:[47,100,470,1000], famille:'Résistances',
      def:"Résistance dont la valeur augmente quand la température augmente (protection contre les surintensités).", wiki:'Thermistance', alias:'ptc autoreset fuse' }),
  defRow('ldr','LDR (photorésistance)', T2, TPL.boxLabel('LDR'),
    { unit:'Ω (obscurité)', defaultValue:1000000, valueOptions:[10000,100000,1000000], famille:'Résistances',
      def:"Résistance dont la valeur diminue avec la luminosité reçue (capteur de lumière simple).", wiki:'Photorésistance', alias:'ldr photoresistance capteur lumiere' }),
  defRow('reseau_resistances','Réseau de résistances', T3_BLOCK, TPL.block('RN'),
    { unit:'Ω', defaultValue:220, valueOptions:[100,220,470,1000,4700,10000], famille:'Résistances',
      def:"Plusieurs résistances de même valeur regroupées dans un seul boîtier (ex. tirage au repos de bus numérique).", wiki:'Réseau_résistif', alias:'resistor array pull-up' }),
  defRow('resistance_puissance','Résistance de puissance', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor" stroke-width="2.4"/>${ctext(30,18,'P',7)}`,
    { unit:'W', defaultValue:5, valueOptions:[1,2,5,10,25,50], famille:'Résistances',
      def:"Résistance dimensionnée pour dissiper une puissance importante sans surchauffe destructrice.", wiki:'Résistance_électrique', alias:'power resistor dissipation' }),

  // --- Condensateurs (variantes) ---
  defRow('condensateur_polarise','Condensateur polarisé', T2, TPL.capBase(`${ctext(22,10,'+',8)}`),
    { unit:'µF', defaultValue:100, valueOptions:[1,10,47,100,470,1000,2200], famille:'Condensateurs',
      def:"Condensateur qui doit être branché dans le bon sens (polarité +/-) sous peine de destruction.", wiki:'Condensateur_électrolytique', alias:'polarise electrolytique' }),
  defRow('condensateur_ceramique','Condensateur céramique', T2, TPL.capBase(),
    { unit:'nF', defaultValue:100, valueOptions:[1,10,100,220,470], famille:'Condensateurs',
      def:"Condensateur non polarisé de faible valeur, utilisé pour le découplage et les hautes fréquences.", wiki:'Condensateur_céramique', alias:'ceramique decouplage' }),
  defRow('condensateur_film','Condensateur film', T2, TPL.capBase(),
    { unit:'µF', defaultValue:1, valueOptions:[0.01,0.1,1,10], famille:'Condensateurs',
      def:"Condensateur non polarisé stable, souvent utilisé en filtrage audio et en alimentation.", wiki:'Condensateur_film', alias:'film polyester' }),
  defRow('condensateur_variable','Condensateur variable', T2, TPL.capBase(`<line x1="20" y1="27" x2="40" y2="3" stroke="currentColor" stroke-width="1.6" marker-end="url(#arrow)"/>`),
    { unit:'pF', defaultValue:100, valueOptions:[10,50,100,365], famille:'Condensateurs',
      def:"Condensateur dont la capacité peut être ajustée mécaniquement (accord d'un circuit résonnant).", wiki:'Condensateur_variable', alias:'trimmer accord' }),
  defRow('condensateur_demarrage','Condensateur de démarrage', T2, TPL.capBase(`${ctext(30,26,'START',5)}`),
    { unit:'µF', defaultValue:25, valueOptions:[10,16,25,40], famille:'Condensateurs',
      def:"Condensateur électrolytique utilisé brièvement au démarrage d'un moteur monophasé pour créer le couple de départ.", wiki:'Moteur_asynchrone_monophasé', alias:'demarrage moteur' }),
  defRow('condensateur_permanent','Condensateur permanent', T2, TPL.capBase(`${ctext(30,26,'RUN',5)}`),
    { unit:'µF', defaultValue:8, valueOptions:[1.5,4,6,8,12,16], famille:'Condensateurs',
      def:"Condensateur non polarisé qui reste en service en permanence pour déphaser l'enroulement auxiliaire d'un moteur monophasé.", wiki:'Moteur_asynchrone_monophasé', alias:'permanent moteur marche' }),

  // --- Diodes (variantes) ---
  defRow('diode_schottky','Diode Schottky', T2, TPL.diodeBase(`<path d="M36,6 l4,0 l0,4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M40,24 l4,0 l0,-4" fill="none" stroke="currentColor" stroke-width="1.2"/>`),
    { unit:'V (seuil)', defaultValue:0.3, valueOptions:[0.15,0.3,0.45], famille:'Diodes',
      def:"Diode à faible chute de tension directe et commutation rapide, utilisée en redressement haute fréquence.", wiki:'Diode_Schottky', alias:'schottky basse chute' }),
  defRow('photodiode','Photodiode', T2, `${TPL.diodeBase()}<line x1="46" y1="-4" x2="40" y2="2" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><line x1="52" y1="-2" x2="46" y2="4" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/>`,
    { famille:'Diodes', def:"Diode qui génère un courant proportionnel à la lumière reçue.", wiki:'Photodiode', alias:'capteur lumiere diode' }),
  defRow('diode_tvs','Diode TVS', T2, `${TPL.diodeBase()}${leadLine(36,5,40,5)}${leadLine(40,25,44,25)}${leadLine(20,5,24,5)}${leadLine(16,25,20,25)}`,
    { unit:'V (claquage)', defaultValue:15, valueOptions:[5,12,15,24], famille:'Diodes',
      def:"Diode de protection contre les surtensions transitoires (parasites, décharges électrostatiques).", wiki:'Diode_TVS', alias:'tvs protection surtension' }),
  defRow('varicap','Diode varicap', T2, `${TPL.diodeBase()}${leadLine(44,6,44,24)}`,
    { unit:'pF', defaultValue:20, valueOptions:[10,20,40], famille:'Diodes',
      def:"Diode dont la capacité de jonction varie avec la tension inverse appliquée (accord de fréquence).", wiki:'Diode_varactor', alias:'varactor accord vco' }),
  defRow('led_rgb','LED RGB', T4_RGB, `${leadLine(0,4,14,4)}${leadLine(0,15,14,15)}${leadLine(0,26,14,26)}${leadLine(46,15,60,15)}<polygon points="14,-2 14,32 46,15" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Diodes', def:"Trois LED (rouge, verte, bleue) dans un seul boîtier, dosées individuellement pour créer n'importe quelle couleur.", wiki:'Diode_électroluminescente', alias:'rgb tricolore' }),
  defRow('pont_diodes','Pont de diodes', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,13,'~ ~',6)}${ctext(30,23,'+ −',6)}`,
    { famille:'Diodes', def:"Quatre diodes assemblées pour redresser un courant alternatif en courant continu double alternance.", wiki:'Pont_de_diodes', alias:'redresseur bridge rectifier' }),

  // --- Transistors ---
  defRow('transistor_npn','Transistor NPN', T3_TRANSISTOR, `${leadLine(0,15,20,15)}${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="36" y1="21" x2="42" y2="30" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    { unit:'gain β', defaultValue:100, valueOptions:[50,100,150,200], famille:'Transistors',
      def:"Composant à 3 bornes (base, collecteur, émetteur) utilisé comme interrupteur ou amplificateur commandé par un faible courant de base.", wiki:'Transistor_bipolaire', alias:'2n2222 bc547 bipolaire', simulable:true }),
  defRow('transistor_pnp','Transistor PNP', T3_TRANSISTOR, `${leadLine(0,15,20,15)}${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="26" y1="14" x2="20" y2="9" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    { unit:'gain β', defaultValue:100, valueOptions:[50,100,150,200], famille:'Transistors',
      def:"Comme le NPN mais avec les polarités inversées : conduit quand la base est plus négative que l'émetteur.", wiki:'Transistor_bipolaire', alias:'2n2907 bc557 bipolaire', simulable:true }),
  defRow('mosfet_n','MOSFET canal N', T3_MOSFET, `${leadLine(0,8,18,8)}${leadLine(18,-2,18,4)}${leadLine(18,-2,42,-2)}${leadLine(42,-2,42,4)}${leadLine(18,26,18,20)}${leadLine(18,26,42,26)}${leadLine(42,26,42,20)}${leadLine(42,-4,42,34)}${leadLine(42,15,60,15)}<line x1="18" y1="4" x2="18" y2="20" stroke="currentColor" stroke-width="2"/>`,
    { unit:'V (seuil)', defaultValue:2, valueOptions:[1,2,3,4], famille:'Transistors',
      def:"Transistor à effet de champ commandé en tension par sa grille, très utilisé en commutation de puissance.", wiki:'Transistor_à_effet_de_champ_à_grille_isolée', alias:'irf540 fet grille source drain' }),
  defRow('mosfet_p','MOSFET canal P', T3_MOSFET, `${leadLine(0,8,18,8)}${leadLine(18,-2,18,4)}${leadLine(18,-2,42,-2)}${leadLine(42,-2,42,4)}${leadLine(18,26,18,20)}${leadLine(18,26,42,26)}${leadLine(42,26,42,20)}${leadLine(42,-4,42,34)}${leadLine(42,15,60,15)}<line x1="18" y1="20" x2="18" y2="4" stroke="currentColor" stroke-width="2"/><line x1="24" y1="8" x2="18" y2="8" stroke="currentColor" stroke-width="1.4" marker-end="url(#arrow)"/>`,
    { unit:'V (seuil)', defaultValue:-2, valueOptions:[-1,-2,-3,-4], famille:'Transistors',
      def:"MOSFET dont le canal conducteur est formé de porteurs positifs : commande en tension négative par rapport à la source.", wiki:'Transistor_à_effet_de_champ_à_grille_isolée', alias:'irf9540 fet p' }),
  defRow('jfet','Transistor JFET', T3_MOSFET, `${leadLine(0,8,18,8)}${leadLine(18,-4,18,34)}${leadLine(18,4,42,-4)}${leadLine(42,-4,42,-4)}${leadLine(18,26,42,34)}${leadLine(42,15,60,15)}<line x1="10" y1="8" x2="18" y2="8" stroke="currentColor" stroke-width="1.4" marker-end="url(#arrow)"/>`,
    { unit:'V (pincement)', defaultValue:-3, valueOptions:[-1,-2,-3,-5], famille:'Transistors',
      def:"Transistor à effet de champ à jonction, commandé en tension, souvent utilisé en faible signal.", wiki:'Transistor_à_effet_de_champ', alias:'fet jonction' }),
  defRow('igbt','IGBT', T3_MOSFET, `${leadLine(0,8,18,8)}${leadLine(18,-2,18,4)}${leadLine(18,-2,42,-2)}${leadLine(42,-2,42,4)}${leadLine(18,26,18,20)}${leadLine(18,26,42,26)}${leadLine(42,26,42,20)}${leadLine(42,-4,42,34)}${leadLine(42,15,60,15)}<line x1="18" y1="4" x2="18" y2="20" stroke="currentColor" stroke-width="3"/>`,
    { unit:'V (collecteur-émetteur)', defaultValue:600, valueOptions:[200,400,600,1200], famille:'Transistors',
      def:"Combine la commande en tension du MOSFET et la tenue en courant du transistor bipolaire ; utilisé en électronique de puissance.", wiki:'Transistor_bipolaire_à_grille_isolée', alias:'igbt puissance onduleur' }),
  defRow('phototransistor','Phototransistor', T2_COLE, `${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="36" y1="21" x2="42" y2="30" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="-4" x2="16" y2="4" stroke="currentColor" stroke-width="1.4" marker-end="url(#arrow)"/>`,
    { famille:'Transistors', def:"Transistor dont la base est commandée par la lumière reçue plutôt que par un courant électrique.", wiki:'Phototransistor', alias:'capteur optique transistor' }),
  defRow('darlington','Transistor Darlington', T3_TRANSISTOR, `${leadLine(0,15,20,15)}${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="36" y1="21" x2="42" y2="30" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="24" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1"/>`,
    { unit:'gain β', defaultValue:1000, valueOptions:[500,1000,5000], famille:'Transistors',
      def:"Deux transistors bipolaires couplés dans un seul boîtier pour obtenir un gain en courant très élevé.", wiki:'Montage_Darlington', alias:'darlington gain eleve' }),

  // --- Thyristors et commande de puissance ---
  defRow('scr','Thyristor (SCR)', T3_TRANSISTOR, `${leadLine(0,15,20,15)}${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="36" y1="21" x2="42" y2="30" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="20" y1="15" x2="30" y2="15" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Thyristors', def:"Redresseur commandé : conduit dans un sens une fois amorcé par la gâchette, jusqu'à annulation du courant.", wiki:'Thyristor', alias:'scr gachette redresseur commande' }),
  defRow('triac','TRIAC', T3_TRANSISTOR, `${leadLine(0,15,20,15)}${leadLine(20,4,20,26)}${leadLine(20,9,42,0)}${leadLine(42,0,42,-4)}${leadLine(20,21,42,30)}${leadLine(42,30,42,34)}<line x1="36" y1="9" x2="42" y2="0" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><line x1="36" y1="21" x2="42" y2="30" stroke="currentColor" stroke-width="1.5" marker-end="url(#arrow)"/><circle cx="21" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    { famille:'Thyristors', def:"Équivalent bidirectionnel du thyristor : conduit dans les deux sens, utilisé pour gérer une puissance en courant alternatif (gradateur).", wiki:'Triac', alias:'triac gradateur variateur' }),
  defRow('diac','DIAC', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<polygon points="22,5 22,25 38,15" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="38,25 38,5 22,15" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { unit:'V (retournement)', defaultValue:32, valueOptions:[20,32], famille:'Thyristors',
      def:"Diode bidirectionnelle qui devient conductrice au-delà d'une tension de seuil, utilisée pour amorcer un TRIAC.", wiki:'Diac', alias:'diac amorcage' }),
  defRow('optotriac','Optotriac', T4_OPTOTRIAC, `${leadLine(0,10,16,10)}${leadLine(0,20,16,20)}<polygon points="16,5 16,15 26,10" fill="none" stroke="currentColor" stroke-width="1.6"/>${leadLine(34,8,60,8)}${leadLine(34,22,60,22)}<polygon points="34,3 34,17 44,10" fill="none" stroke="currentColor" stroke-width="1.6"/><polygon points="44,17 44,3 34,10" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Thyristors', def:"TRIAC commandé optiquement par une LED interne, assurant une isolation galvanique de la commande.", wiki:'Optocoupleur', alias:'moc3021 isolation triac' }),
  defRow('relais_statique','Relais statique (SSR)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'SSR',6.5)}`,
    { unit:'A', defaultValue:25, valueOptions:[10,25,40], famille:'Thyristors',
      def:"Commute une charge en courant alternatif sans contact mécanique, via un composant à semi-conducteur (thyristor/triac interne).", wiki:'Relais_statique', alias:'ssr solid state relay' }),

  // --- Circuits intégrés ---
  ...[
    ['ne555','NE555','Temporisateur/oscillateur intégré très répandu (astable, monostable).',8],
    ['lm358','LM358','Double amplificateur opérationnel faible consommation.',8],
    ['tl082','TL082','Double amplificateur opérationnel à entrée JFET, faible bruit.',8],
    ['lm324','LM324','Quadruple amplificateur opérationnel en boîtier unique.',14],
    ['comparateur','Comparateur (LM393)','Compare deux tensions et bascule sa sortie logique en fonction du résultat.',8],
    ['regulateur_ajustable','Régulateur ajustable (LM317)','Régulateur de tension dont la sortie se règle avec deux résistances externes.',3],
    ['multiplexeur','Multiplexeur','Sélectionne une entrée parmi plusieurs vers une seule sortie, selon un code de commande.',16],
    ['demultiplexeur','Démultiplexeur','Redirige une entrée unique vers une sortie parmi plusieurs, selon un code de commande.',16],
    ['encodeur','Encodeur','Convertit un ensemble de lignes actives en un code binaire.',16],
    ['decodeur','Décodeur','Convertit un code binaire en activant une seule ligne de sortie parmi plusieurs.',16],
    ['compteur_ic','Compteur intégré','Incrémente un compte binaire à chaque front d\'horloge reçu.',14],
    ['bascule_ic','Bascule (flip-flop)','Mémorise un bit d\'information, base des registres et compteurs séquentiels.',8],
    ['registre','Registre à décalage','Mémorise et décale une suite de bits au rythme d\'une horloge.',16],
    ['driver_moteur','Driver de puissance','Circuit intégré qui amplifie un signal de commande pour piloter une charge de puissance (moteur, relais...).',8],
  ].map(([id,nom,def,pins]) => { const t = icTemplate(pins, nom.split(' ')[0].split('(')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Circuits intégrés', def, complexite:'avance', alias:id }); }),

  // --- Logique numérique (portes) ---
  defRow('porte_and','Porte logique ET (AND)', T3_AOP, TPL.gate2in(AND_PATH),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 1 uniquement si les deux entrées sont à 1 (logique combinatoire).", wiki:'Porte_ET', alias:'and gate 7408' }),
  defRow('porte_nand','Porte logique NON-ET (NAND)', T3_AOP, TPL.gate2in(AND_PATH, true),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 0 uniquement si les deux entrées sont à 1 — inverse de la porte ET.", wiki:'Porte_NON-ET', alias:'nand gate 7400' }),
  defRow('porte_or','Porte logique OU (OR)', T3_AOP, TPL.gate2in(OR_PATH),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 1 si au moins une des deux entrées est à 1.", wiki:'Porte_OU', alias:'or gate 7432' }),
  defRow('porte_nor','Porte logique NON-OU (NOR)', T3_AOP, TPL.gate2in(OR_PATH, true),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 1 uniquement si les deux entrées sont à 0 — inverse de la porte OU.", wiki:'Porte_NON-OU', alias:'nor gate 7402' }),
  defRow('porte_xor','Porte logique OU exclusif (XOR)', T3_AOP, `${leadLine(0,8,15,8)}${leadLine(0,22,15,22)}${leadLine(45,15,60,15)}<path d="M11,2 Q17,15 11,28" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="${OR_PATH}" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 1 uniquement si les deux entrées sont différentes.", wiki:'Porte_OU_exclusif', alias:'xor gate 7486' }),
  defRow('porte_xnor','Porte logique OU exclusif inversé (XNOR)', T3_AOP, `${leadLine(0,8,15,8)}${leadLine(0,22,15,22)}${leadLine(49,15,60,15)}<path d="M11,2 Q17,15 11,28" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="${OR_PATH}" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="37.5" cy="15" r="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Sortie à 1 uniquement si les deux entrées sont identiques.", wiki:'Porte_OU_exclusif', alias:'xnor gate' }),
  defRow('porte_not','Porte logique NON (NOT)', T2, TPL.gate1in(true),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Inverse l'état logique de son entrée (0 devient 1, et inversement).", wiki:'Porte_NON', alias:'not inverter 7404' }),
  defRow('buffer_logique','Buffer logique', T2, TPL.gate1in(false),
    { unit:'logique', defaultValue:'TTL', valueOptions:['TTL','CMOS'], famille:'Logique numérique',
      def:"Recopie son entrée sur sa sortie en renforçant le signal (amplification de courant, isolation).", wiki:'Porte_logique', alias:'buffer 7407' }),
  defRow('afficheur_7seg','Afficheur 7 segments', T4_WIDE, `${leadLine(0,4,14,4)}${leadLine(0,26,14,26)}${leadLine(46,4,60,4)}${leadLine(46,26,60,26)}<rect x="14" y="1" width="32" height="28" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,20,'8.',13)}`,
    { famille:'Affichage', def:"Sept segments lumineux (+ point) permettant d'afficher les chiffres de 0 à 9.", wiki:'Afficheur_sept_segments', alias:'7 segments digit display' }),
  icDefRow('adc','Convertisseur ADC', 8,
    { famille:'Logique numérique', complexite:'avance', def:"Convertit une tension analogique en une valeur numérique exploitable par un circuit logique.", wiki:'Convertisseur_analogique-numérique', alias:'analog to digital' }),
  icDefRow('dac','Convertisseur DAC', 8,
    { famille:'Logique numérique', complexite:'avance', def:"Convertit une valeur numérique en une tension analogique proportionnelle.", wiki:'Convertisseur_numérique-analogique', alias:'digital to analog' }),

  // --- Amplificateur opérationnel & régulateur (existants, conservés) ---
  defRow('aop','AOP', T3_AOP, `${leadLine(0,8,14,8)}${leadLine(0,22,14,22)}${leadLine(46,15,60,15)}<polygon points="14,2 14,28 46,15" fill="none" stroke="currentColor" stroke-width="2"/><text x="17" y="12" font-size="9" fill="currentColor">+</text><text x="17" y="26" font-size="9" fill="currentColor">−</text>`,
    { unit:'gain', defaultValue:100000, valueOptions:[1000,10000,100000], famille:'Circuits intégrés',
      def:"Amplificateur opérationnel : amplifie fortement la différence entre ses deux entrées (+ et −).", wiki:'Amplificateur_opérationnel', alias:'lm358 lm741 opamp' }),
  defRow('regulateur','Régulateur de tension', T3_REGULATEUR, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}${leadLine(30,26,30,30)}<rect x="12" y="4" width="36" height="22" fill="none" stroke="currentColor" stroke-width="2"/><text x="17" y="18" font-size="7" fill="currentColor">REG</text>`,
    { unit:'V', defaultValue:5, valueOptions:[3.3,5,9,12], famille:'Circuits intégrés',
      def:"Maintient une tension de sortie stable quelle que soit la charge ou les variations d'entrée.", wiki:'Régulateur_de_tension', alias:'7805 lm7805 ldo' }),

  // --- Capteurs et modules ---
  ...[
    ['recepteur_ir','Récepteur infrarouge','Détecte un signal lumineux infrarouge modulé (télécommande).'],
    ['emetteur_ir','Émetteur infrarouge','Émet un signal lumineux infrarouge modulé (télécommande, transmission de données).'],
    ['capteur_lumiere','Capteur de lumière','Module mesurant l\'intensité lumineuse ambiante.'],
    ['capteur_temperature','Capteur de température','Module mesurant la température (analogique ou numérique selon le modèle).'],
    ['capteur_proximite','Capteur de proximité','Détecte la présence d\'un objet à faible distance sans contact.'],
    ['capteur_ultrason','Capteur ultrason','Mesure une distance par écho d\'une onde ultrasonore.'],
    ['capteur_mouvement','Capteur de mouvement (PIR)','Détecte un mouvement par variation du rayonnement infrarouge ambiant.'],
    ['capteur_magnetique','Capteur magnétique (effet Hall)','Détecte la présence ou l\'intensité d\'un champ magnétique.'],
    ['capteur_pression','Capteur de pression','Convertit une pression physique en signal électrique.'],
    ['capteur_humidite','Capteur d\'humidité','Mesure le taux d\'humidité relative de l\'air.'],
  ].map(([id,nom,def]) => defRow(id, nom, T3_BLOCK, TPL.block(nom.split(' ')[0]), { famille:'Capteurs et modules', def, alias:id })),

  // --- Communication ---
  ...[
    ['module_uart','Module UART','Interface de communication série asynchrone entre deux appareils.'],
    ['module_i2c','Module I²C','Interface de communication série synchrone à deux fils (bus partagé multi-périphériques).'],
    ['module_spi','Module SPI','Interface de communication série synchrone rapide, souvent utilisée entre microcontrôleur et périphériques.'],
    ['module_bluetooth','Module Bluetooth','Émetteur-récepteur radio courte portée pour liaison sans fil entre appareils.'],
    ['module_wifi','Module Wi-Fi','Émetteur-récepteur radio permettant la connexion à un réseau local sans fil.'],
  ].map(([id,nom,def]) => { const t = icTemplate(6, nom.split(' ')[1]||nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Communication', complexite:'avance', def, alias:id }); }),

  // --- Affichage ---
  defRow('lcd','Afficheur LCD', T4, `${leadLine(0,8,14,8)}${leadLine(0,22,14,22)}${leadLine(46,8,60,8)}${leadLine(46,22,60,22)}<rect x="14" y="4" width="32" height="22" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,18,'LCD',7)}`,
    { famille:'Affichage', def:"Écran à cristaux liquides affichant du texte ou des caractères.", wiki:'Écran_à_cristaux_liquides', alias:'lcd 16x2 hd44780' }),
  defRow('oled','Afficheur OLED', T4, `${leadLine(0,8,14,8)}${leadLine(0,22,14,22)}${leadLine(46,8,60,8)}${leadLine(46,22,60,22)}<rect x="14" y="4" width="32" height="22" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,18,'OLED',6)}`,
    { famille:'Affichage', def:"Écran à diodes électroluminescentes organiques, contraste élevé et faible consommation.", wiki:'Diode_électroluminescente_organique', alias:'oled ssd1306' }),
  defRow('voyant','Voyant lumineux', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { unit:'V', defaultValue:12, valueOptions:[5,12,24,230], famille:'Affichage',
      def:"Indicateur lumineux signalant un état (marche, défaut, présence tension).", wiki:'Voyant_lumineux', alias:'lampe temoin pilot light' }),
  defRow('bargraph','Afficheur bargraph', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}${[14,20,26,32,38,44].map(x=>`<rect x="${x}" y="6" width="4" height="18" fill="none" stroke="currentColor" stroke-width="1.2"/>`).join('')}`,
    { famille:'Affichage', def:"Rangée de LED utilisée pour représenter un niveau (volume, signal, charge de batterie).", wiki:'Bargraph', alias:'vu-metre niveau led' }),
];

/* ==========================================================================
   DOMAINE — ÉLECTROTECHNIQUE (§11)
   ========================================================================== */
const ELECTROTECHNIQUE = [
  defRow('source_ac','Source AC', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M22,15 Q26,7 30,15 T38,15" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'V', defaultValue:230, valueOptions:[24,48,110,230,400], famille:'Sources', def:"Générateur de tension alternative.", wiki:'Courant_alternatif', alias:'alternateur secteur' }),
  defRow('source_dc','Source DC', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}${leadLine(22,6,22,24)}${leadLine(28,10,28,20)}${leadLine(32,6,32,24)}${leadLine(38,10,38,20)}`,
    { unit:'V', defaultValue:24, valueOptions:[5,12,24,48], famille:'Sources', def:"Générateur de tension continue.", wiki:'Courant_continu', alias:'alimentation dc source' }),
  defRow('generateur','Générateur', T2, TPL.circleLetter('G'),
    { unit:'kVA', defaultValue:10, valueOptions:[5,10,25,50,100], famille:'Sources', def:"Convertit une énergie mécanique en énergie électrique.", wiki:'Générateur_électrique', alias:'alternateur groupe electrogene' }),
  defRow('moteur_dc','Moteur DC', T2, TPL.circleLetter('M'),
    { unit:'W', defaultValue:100, valueOptions:[10,50,100,250,500], famille:'Machines', def:"Moteur alimenté en courant continu, vitesse facilement réglable par la tension.", wiki:'Moteur_à_courant_continu', alias:'moteur cc brushed' }),
  defRow('moteur_ac','Moteur AC (asynchrone)', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="25" y="20" font-size="12" fill="currentColor">M</text>`,
    { unit:'kW', defaultValue:1.5, valueOptions:[0.25,0.55,1.1,1.5,3,5.5], famille:'Machines', def:"Convertit l'énergie électrique alternative en énergie mécanique de rotation, le plus répandu en industrie.", wiki:'Moteur_asynchrone', alias:'moteur asynchrone induction' }),
  defRow('moteur_synchrone','Moteur synchrone', T2, `${TPL.circleLetter('MS')}`,
    { unit:'kW', defaultValue:5, valueOptions:[1,5,10,25], famille:'Machines', def:"Moteur dont la vitesse de rotation est rigoureusement liée à la fréquence d'alimentation.", wiki:'Machine_synchrone', alias:'synchrone servo' }),
  defRow('moteur_monophase','Moteur monophasé', T2, `${TPL.circleLetter('M1~')}`,
    { unit:'kW', defaultValue:0.75, valueOptions:[0.18,0.37,0.75,1.5], famille:'Machines', def:"Moteur alternatif conçu pour fonctionner sur une seule phase (usage domestique/petit atelier).", wiki:'Moteur_asynchrone_monophasé', alias:'monophase single phase' }),
  defRow('moteur_triphase','Moteur triphasé', T3_LEFT3, `${leadLine(0,4,14,4)}${leadLine(0,15,14,15)}${leadLine(0,26,14,26)}<circle cx="34" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(34,20,'M3~',7)}`,
    { unit:'kW', defaultValue:4, valueOptions:[1.1,2.2,4,7.5,15], famille:'Machines', def:"Moteur alimenté par les trois phases du réseau, robuste et très utilisé en industrie.", wiki:'Moteur_asynchrone_triphasé', alias:'triphase three phase' }),
  defRow('transformateur','Transformateur simple', T4, `${leadLine(0,8,22,8)}${leadLine(0,22,22,22)}${leadLine(38,8,60,8)}${leadLine(38,22,60,22)}<path d="M22,3 Q28,8 22,13 Q28,18 22,23 Q28,28 22,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/><line x1="30" y1="2" x2="30" y2="28" stroke="currentColor" stroke-width="1.5"/><line x1="34" y1="2" x2="34" y2="28" stroke="currentColor" stroke-width="1.5"/><path d="M38,3 Q32,8 38,13 Q32,18 38,23 Q32,28 38,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/>`,
    { unit:'rapport', defaultValue:'230/24V', valueOptions:['230/24V','230/12V','400/230V'], famille:'Transformateurs',
      def:"Modifie le niveau de tension d'un réseau alternatif par couplage magnétique entre deux bobinages.", wiki:'Transformateur_électrique', alias:'transfo monophasé élévateur abaisseur',
      variantes:['transfo_pointmilieu','transfo_isolement','transfo_courant','transfo_tension','transfo_triphase'] }),
  defRow('transfo_pointmilieu','Transformateur à point milieu', T5_TRANSFO_PM, `${leadLine(0,8,22,8)}${leadLine(0,22,22,22)}${leadLine(38,4,60,4)}${leadLine(38,26,60,26)}${leadLine(46,15,60,15)}<path d="M22,3 Q28,8 22,13 Q28,18 22,23 Q28,28 22,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/><line x1="30" y1="2" x2="30" y2="28" stroke="currentColor" stroke-width="1.5"/><line x1="34" y1="2" x2="34" y2="28" stroke="currentColor" stroke-width="1.5"/><path d="M38,3 Q32,8 38,13 Q32,18 38,23 Q32,28 38,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/>`,
    { unit:'rapport', defaultValue:'230/12-0-12V', valueOptions:['230/12-0-12V','230/9-0-9V','230/6-0-6V'], famille:'Transformateurs',
      def:"Transformateur dont le secondaire possède une prise centrale, utile pour un redressement double alternance symétrique.", wiki:'Transformateur_électrique', alias:'point milieu center tap' }),
  defRow('transfo_isolement','Transformateur d\'isolement', T4, `${leadLine(0,8,22,8)}${leadLine(0,22,22,22)}${leadLine(38,8,60,8)}${leadLine(38,22,60,22)}<path d="M22,3 Q28,8 22,13 Q28,18 22,23 Q28,28 22,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/><line x1="30" y1="0" x2="30" y2="30" stroke="currentColor" stroke-width="1"/><path d="M38,3 Q32,8 38,13 Q32,18 38,23 Q32,28 38,33" fill="none" stroke="currentColor" stroke-width="1.6" transform="translate(0,-3)"/>`,
    { unit:'rapport', defaultValue:'230/230V', valueOptions:['230/230V','400/400V'], famille:'Transformateurs',
      def:"Rapport 1:1 utilisé pour isoler galvaniquement un équipement du réseau, sans changer le niveau de tension.", wiki:'Transformateur_électrique', alias:'isolement galvanique securité' }),
  defRow('transfo_courant','Transformateur de courant (TC)', T4, `${leadLine(0,8,22,8)}${leadLine(0,22,22,22)}${leadLine(38,8,60,8)}${leadLine(38,22,60,22)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,'TC',7)}`,
    { unit:'rapport', defaultValue:'100/5A', valueOptions:['100/5A','200/5A','400/5A'], famille:'Transformateurs',
      def:"Réduit un courant important en un courant proportionnel mesurable en toute sécurité (protection, comptage).", wiki:'Transformateur_de_courant', alias:'tc ct current transformer' }),
  defRow('transfo_tension','Transformateur de tension (TT)', T4, `${leadLine(0,8,22,8)}${leadLine(0,22,22,22)}${leadLine(38,8,60,8)}${leadLine(38,22,60,22)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,'TT',7)}`,
    { unit:'rapport', defaultValue:'20000/100V', valueOptions:['20000/100V','5000/100V'], famille:'Transformateurs',
      def:"Réduit une haute tension en une tension proportionnelle mesurable en toute sécurité.", wiki:'Transformateur_de_tension', alias:'tt vt voltage transformer' }),
  defRow('transfo_triphase','Transformateur triphasé', T6_TRIPHASE, `${leadLine(0,4,22,4)}${leadLine(0,15,22,15)}${leadLine(0,26,22,26)}${leadLine(38,4,60,4)}${leadLine(38,15,60,15)}${leadLine(38,26,60,26)}<circle cx="24" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="36" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
    { unit:'rapport', defaultValue:'20000/400V', valueOptions:['20000/400V','400/230V'], famille:'Transformateurs',
      def:"Transformateur assurant la conversion de tension sur les trois phases d'un réseau triphasé.", wiki:'Transformateur_électrique', alias:'triphase HTA BT' }),
  defRow('contacteur','Contacteur', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="40" y2="6" stroke="currentColor" stroke-width="2"/>`,
    { unit:'A', defaultValue:25, valueOptions:[9,12,18,25,32,40], famille:'Appareillage', def:"Interrupteur commandé électriquement, utilisé pour démarrer/arrêter les moteurs à distance.", wiki:'Contacteur_(électricité)' }),
  defRow('relais_thermique','Relais thermique', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/><text x="24" y="19" font-size="9" fill="currentColor">F</text>`,
    { unit:'A', defaultValue:16, valueOptions:[6,10,16,25], famille:'Protections', def:"Protège un moteur contre les surintensités prolongées en coupant le circuit en cas de surchauffe.", wiki:'Relais_thermique' }),
  defRow('disjoncteur','Disjoncteur', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="38" y2="8" stroke="currentColor" stroke-width="2"/><line x1="24" y1="4" x2="32" y2="12" stroke="currentColor" stroke-width="2"/><line x1="32" y1="4" x2="24" y2="12" stroke="currentColor" stroke-width="2"/>`,
    { unit:'A', defaultValue:16, valueOptions:[6,10,16,20,32], famille:'Protections', def:"Coupe automatiquement le circuit en cas de court-circuit ou de surcharge.", wiki:'Disjoncteur' }),
  defRow('sectionneur','Sectionneur', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="38" y2="4" stroke="currentColor" stroke-width="2"/>`,
    { unit:'A', defaultValue:32, valueOptions:[16,32,63,100], famille:'Protections', def:"Isole visiblement une partie du circuit pour intervenir en sécurité (pas de coupure en charge).", wiki:'Sectionneur' }),
  defRow('demarreur','Démarreur progressif', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'START',5.5)}`,
    { famille:'Appareillage', def:"Limite le courant d'appel d'un moteur à son démarrage en augmentant progressivement la tension.", wiki:'Démarreur_(électricité)', alias:'soft starter' }),
  defRow('inverseur','Inverseur de sens', T3_WIPER, `${leadLine(0,15,60,15)}${leadLine(30,0,30,10)}<circle cx="30" cy="15" r="2" fill="currentColor"/>`,
    { famille:'Appareillage', def:"Permet d'inverser le sens de rotation d'un moteur en inversant deux phases.", wiki:'Inverseur_de_sens_de_marche', alias:'inverseur sens marche' }),
  defRow('charge_resistive','Charge résistive', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="19" font-size="7" fill="currentColor">CHARGE</text>`,
    { unit:'W', defaultValue:60, valueOptions:[15,60,100,500,1000], famille:'Charges', def:"Représente un appareil consommateur simple (ampoule, résistance de chauffe) pour tester une installation.", wiki:'Résistance_électrique' }),
  defRow('charge_inductive','Charge inductive', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}${[10,20,30,40].map(x=>`<path d="M${x},15 a5,9 0 0 1 10,0" fill="none" stroke="currentColor" stroke-width="2"/>`).join('')}`,
    { unit:'kVAR', defaultValue:1, valueOptions:[0.5,1,2,5], famille:'Charges', def:"Charge dont le courant est déphasé en retard sur la tension (moteur, transformateur à vide).", wiki:'Circuit_inductif' }),
  defRow('charge_capacitive','Charge capacitive', T2, `${leadLine(0,15,26,15)}${leadLine(34,15,60,15)}${leadLine(26,4,26,26)}${leadLine(34,4,34,26)}`,
    { unit:'kVAR', defaultValue:1, valueOptions:[0.5,1,2,5], famille:'Charges', def:"Charge dont le courant est déphasé en avance sur la tension (banc de condensateurs).", wiki:'Circuit_capacitif' }),
  defRow('compteur_electrique','Compteur électrique', T2, `${TPL.circleLetter('kWh')}`,
    { famille:'Mesure', def:"Totalise l'énergie électrique consommée dans le temps.", wiki:'Compteur_électrique', alias:'compteur energie kwh' }),
  defRow('jeu_de_barres','Jeu de barres', T3_BUSBAR, `${leadLine(0,4,60,4)}${leadLine(10,4,10,26)}${leadLine(30,4,30,26)}${leadLine(50,4,50,26)}`,
    { famille:'Câblage', def:"Barre conductrice rigide reliant plusieurs départs électriques dans une armoire ou un poste.", wiki:'Jeu_de_barres', alias:'busbar' }),
  defRow('cable','Câble', T2, `${leadLine(0,15,60,15)}`,
    { unit:'mm²', defaultValue:2.5, valueOptions:[1.5,2.5,4,6,10,16,25], famille:'Câblage', def:"Conducteur isolé reliant deux points du circuit ; sa section conditionne le courant admissible.", wiki:'Câble_électrique' }),
  defRow('borne','Borne de raccordement', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<circle cx="30" cy="15" r="5" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
    { famille:'Câblage', def:"Point de raccordement électrique entre deux conducteurs ou vers un appareil.", wiki:'Borne_électrique' }),
];

/* ==========================================================================
   DOMAINE — ÉLECTRICITÉ DU BÂTIMENT (§12, nouveau domaine)
   ========================================================================== */
const BATIMENT = [
  defRow('tableau_electrique','Tableau électrique', T6_TRIPHASE, `${leadLine(0,4,14,4)}${leadLine(0,15,14,15)}${leadLine(0,26,14,26)}${leadLine(46,4,60,4)}${leadLine(46,15,60,15)}${leadLine(46,26,60,26)}<rect x="14" y="1" width="32" height="28" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'TGBT',6)}`,
    { famille:'Distribution', def:"Regroupe les dispositifs de protection et de distribution d'une installation électrique.", wiki:'Tableau_électrique', alias:'tgbt armoire' }),
  defRow('disjoncteur_divisionnaire','Disjoncteur divisionnaire', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="14" y="6" width="32" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="24" y1="9" x2="32" y2="21" stroke="currentColor" stroke-width="2"/><line x1="32" y1="9" x2="24" y2="21" stroke="currentColor" stroke-width="2"/>`,
    { unit:'A', defaultValue:16, valueOptions:[2,10,16,20,32], famille:'Distribution', def:"Protège un circuit terminal de l'installation (éclairage, prises...) contre les surintensités.", wiki:'Disjoncteur' }),
  defRow('differentiel','Interrupteur différentiel', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="14" y="6" width="32" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'Δ',10)}`,
    { unit:'mA', defaultValue:30, valueOptions:[10,30,300,500], famille:'Distribution', def:"Détecte une fuite de courant vers la terre et coupe le circuit pour protéger les personnes.", wiki:'Disjoncteur_différentiel', alias:'dispositif differentiel residuel' }),
  defRow('interrupteur_va_et_vient','Va-et-vient', T2, TPL.switchLike(true),
    { famille:'Commande éclairage', def:"Commutateur unipolaire bidirectionnel : utilisé par paire pour commander un même point lumineux depuis deux endroits différents.", wiki:'Va-et-vient_(électricité)', alias:'commutateur double allumage' }),
  defRow('telerupteur','Télérupteur', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'TL',7)}`,
    { famille:'Commande éclairage', def:"Bascule un circuit d'éclairage à chaque impulsion reçue d'un ou plusieurs boutons-poussoirs.", wiki:'Télérupteur', alias:'telerupteur bistable' }),
  defRow('contacteur_jour_nuit','Contacteur jour/nuit', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="40" y2="6" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Distribution', def:"Bascule automatiquement une charge (ex. chauffe-eau) selon le signal tarifaire heures pleines/creuses.", wiki:'Contacteur_jour/nuit' }),
  defRow('luminaire','Luminaire', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="23" y1="8" x2="37" y2="22" stroke="currentColor" stroke-width="1.4"/><line x1="37" y1="8" x2="23" y2="22" stroke="currentColor" stroke-width="1.4"/>`,
    { unit:'W', defaultValue:60, valueOptions:[9,15,40,60,100], famille:'Éclairage', def:"Point d'éclairage (lampe, spot, luminaire LED).", wiki:'Luminaire' }),
  defRow('detecteur_mouvement','Détecteur de mouvement', T2, TPL.boxLabel('PIR'),
    { famille:'Commande éclairage', def:"Détecte une présence et commande automatiquement l'éclairage ou une alarme.", wiki:'Détecteur_de_mouvement', alias:'detecteur presence' }),
  defRow('circuit_specialise','Circuit spécialisé', T2, `${leadLine(0,15,60,15)}`,
    { famille:'Distribution', def:"Circuit dédié à un seul appareil de forte puissance (four, plaque de cuisson, lave-linge...).", wiki:'Installation_électrique_domestique' }),
  defRow('gaine','Gaine électrique', T2, `${leadLine(0,15,60,15)}<rect x="6" y="10" width="48" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="4 2"/>`,
    { famille:'Câblage', def:"Conduit protégeant les câbles électriques encastrés ou en apparent.", wiki:'Gaine_électrique' }),
  defRow('boite_derivation','Boîte de dérivation', T4_CROSS, `${leadLine(0,15,60,15)}${leadLine(30,0,30,30)}<rect x="20" y="5" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Câblage', def:"Boîtier où plusieurs conducteurs sont raccordés en dérivation.", wiki:'Boîte_de_dérivation' }),
  defRow('parafoudre','Parafoudre', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="26" y1="20" x2="34" y2="10" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'kA', defaultValue:15, valueOptions:[5,15,40], famille:'Protections', def:"Écoule les surtensions transitoires (foudre) vers la terre pour protéger l'installation.", wiki:'Parafoudre' }),
  defRow('equipement_protection','Équipement de protection', T2, TPL.boxLabel('PROT'),
    { famille:'Protections', def:"Représente un dispositif de protection générique (parasurtenseur, limiteur...) selon le contexte du schéma.", wiki:'Protection_électrique' }),
];

/* ==========================================================================
   DOMAINE — ÉNERGIES RENOUVELABLES (§13)
   ========================================================================== */
const RENOUVELABLES = [
  defRow('panneau_pv','Panneau PV', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor" stroke-width="2"/>${[16,22,28,34,40,46].map(x=>leadLine(x,5,x,25)).join('')}`,
    { unit:'Wc', defaultValue:400, valueOptions:[100,150,200,300,400,550], famille:'Photovoltaïque',
      def:"Convertit la lumière du soleil directement en électricité par effet photovoltaïque.", wiki:'Panneau_solaire', alias:'solaire photovoltaique',
      pv:{ voc:41.2, vmp:34.5, isc:13.9, imp:13.1, tempCoef:-0.35 } }),
  defRow('string_pv','String PV', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}${[0,1,2].map(i=>`<rect x="${10+i*13.5}" y="8" width="12" height="14" fill="none" stroke="currentColor" stroke-width="1.4"/>`).join('')}`,
    { famille:'Photovoltaïque', def:"Ensemble de panneaux PV connectés en série pour additionner leurs tensions.", wiki:'Panneau_solaire', alias:'chaine pv series' }),
  defRow('regulateur_pwm','Régulateur PWM', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,17,'PWM',7)}`,
    { unit:'A', defaultValue:20, valueOptions:[10,20,30,40], famille:'Régulation', def:"Régule la charge de la batterie en découpant la tension du panneau (technologie simple, moins efficace que le MPPT).", wiki:'Modulation_de_largeur_d\'impulsion', alias:'pwm regulateur charge' }),
  defRow('regulateur_mppt','Régulateur MPPT', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/><text x="16" y="18" font-size="7" fill="currentColor">MPPT</text>`,
    { unit:'A', defaultValue:20, valueOptions:[10,20,30,40,60], famille:'Régulation', def:"Optimise en permanence le point de fonctionnement du panneau PV pour en tirer le maximum de puissance.", wiki:'Maximum_power_point_tracking', alias:'mppt regulateur charge' }),
  defRow('batterie','Batterie', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,150,200], famille:'Stockage', def:"Stocke l'énergie électrique sous forme chimique pour la restituer plus tard.", wiki:'Batterie_(électricité)', alias:'accumulateur' }),
  defRow('batterie_plomb','Batterie plomb-acide', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'Pb',5)}`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,150,200], famille:'Stockage', def:"Technologie de batterie robuste et économique, mais plus lourde et à durée de vie plus courte que le lithium.", wiki:'Accumulateur_au_plomb', alias:'plomb agm gel' }),
  defRow('batterie_lithium','Batterie lithium', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'Li',5)}`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,150,280], famille:'Stockage', def:"Technologie légère à forte densité d'énergie et longue durée de vie.", wiki:'Batterie_lithium-ion', alias:'li-ion nmc' }),
  defRow('batterie_lifepo4','Batterie LiFePO4', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'LFP',4.5)}`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,200,280], famille:'Stockage', def:"Chimie lithium fer phosphate : très bonne durée de vie et sécurité, standard actuel du stockage solaire domestique.", wiki:'LiFePO4', alias:'lfp lithium fer phosphate' }),
  defRow('onduleur','Onduleur', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16,15 Q20,7 24,15 T32,15 T40,15" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
    { unit:'W', defaultValue:3000, valueOptions:[300,500,1000,2000,3000,6000], famille:'Conversion', def:"Transforme le courant continu (DC) des panneaux/batteries en courant alternatif (AC) utilisable par les appareils.", wiki:'Onduleur_(électronique)', alias:'inverter dc ac' }),
  defRow('onduleur_hybride','Onduleur hybride', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,17,'HYB',7)}`,
    { unit:'W', defaultValue:5000, valueOptions:[3000,5000,8000], famille:'Conversion', def:"Onduleur combinant la gestion du photovoltaïque et d'une batterie de stockage.", wiki:'Onduleur_(électronique)', alias:'hybrid inverter' }),
  defRow('micro_onduleur','Micro-onduleur', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="8" width="36" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
    { unit:'W', defaultValue:350, valueOptions:[250,300,350,400], famille:'Conversion', def:"Petit onduleur installé au dos de chaque panneau, optimisant la production panneau par panneau.", wiki:'Micro-onduleur', alias:'micro inverter enphase' }),
  defRow('coffret_dc','Coffret DC', T2, TPL.boxLabel('DC'),
    { famille:'Protections', def:"Boîtier regroupant les protections et sectionnement côté courant continu (panneaux).", wiki:'Installation_photovoltaïque', alias:'coffret protection dc' }),
  defRow('coffret_ac','Coffret AC', T2, TPL.boxLabel('AC'),
    { famille:'Protections', def:"Boîtier regroupant les protections côté courant alternatif (raccordement réseau/charges).", wiki:'Installation_photovoltaïque', alias:'coffret protection ac' }),
  defRow('parafoudre_pv','Parafoudre PV', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="26" y1="20" x2="34" y2="10" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'kA', defaultValue:10, valueOptions:[6.25,10,20], famille:'Protections', def:"Protège l'installation photovoltaïque contre les surtensions atmosphériques.", wiki:'Parafoudre' }),
  defRow('inverseur_source','Inverseur de source', T3_WIPER, `${leadLine(0,15,60,15)}${leadLine(30,0,30,10)}<circle cx="30" cy="15" r="2" fill="currentColor"/>`,
    { famille:'Distribution', def:"Bascule l'alimentation d'une installation entre deux sources (réseau/production locale/groupe électrogène).", wiki:'Commutateur_de_transfert', alias:'ats transfer switch' }),
  defRow('systeme_eolien','Éolienne', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<circle cx="30" cy="15" r="3" fill="currentColor"/><line x1="30" y1="15" x2="30" y2="2" stroke="currentColor" stroke-width="1.6"/><line x1="30" y1="15" x2="41" y2="22" stroke="currentColor" stroke-width="1.6"/><line x1="30" y1="15" x2="19" y2="22" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'W', defaultValue:1000, valueOptions:[300,600,1000,3000], famille:'Sources', def:"Convertit l'énergie cinétique du vent en électricité.", wiki:'Éolienne', alias:'eolien wind turbine' }),
  defRow('systeme_hydraulique','Turbine hydraulique', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<circle cx="30" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'H',9)}`,
    { unit:'kW', defaultValue:5, valueOptions:[1,5,10,50], famille:'Sources', def:"Convertit l'énergie d'un débit d'eau en électricité (micro-hydraulique).", wiki:'Centrale_hydroélectrique', alias:'hydro turbine' }),
  defRow('charge_renouvelable','Charge (consommateur)', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="19" font-size="7" fill="currentColor">CHARGE</text>`,
    { unit:'W', defaultValue:500, valueOptions:[100,500,1000,2000], famille:'Charges', def:"Représente la consommation électrique du site alimenté par l'installation.", wiki:'Consommation_électrique' }),
  defRow('compteur_energie','Compteur d\'énergie', T2, `${TPL.circleLetter('kWh')}`,
    { famille:'Mesure', def:"Mesure l'énergie produite, consommée ou injectée sur le réseau.", wiki:'Compteur_électrique', alias:'compteur production injection' }),
];

/* ==========================================================================
   DOMAINE — AUTOMATISME ET COMMANDE (§14, nouveau domaine)
   ========================================================================== */
const AUTOMATISME = [
  icDefRow('automate_api','Automate programmable (API)', 8, { label:'PLC',
    famille:'Commande', complexite:'avance', def:"Contrôleur programmable qui pilote un processus automatisé à partir de capteurs et actionneurs.", wiki:'Automate_programmable_industriel', alias:'plc api controleur' }),
  icDefRow('entree_sortie','Module entrées/sorties', 6, { label:'E/S',
    famille:'Commande', def:"Interface entre l'automate et les capteurs/actionneurs du terrain.", wiki:'Automate_programmable_industriel', alias:'io module' }),
  defRow('temporisateur','Temporisateur (relais temporisé)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'⏱',9)}`,
    { unit:'s', defaultValue:5, valueOptions:[1,5,10,30,60], famille:'Commande', def:"Retarde ou limite dans le temps l'activation ou la désactivation d'un contact.", wiki:'Relais_temporisé', alias:'timer minuterie' }),
  defRow('compteur_automate','Compteur (automatisme)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'CNT',6.5)}`,
    { famille:'Commande', def:"Compte des impulsions (pièces, cycles) pour déclencher une action au seuil programmé.", wiki:'Compteur_(électronique)', alias:'compteur cycles' }),
  defRow('electrovanne','Électrovanne', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<polygon points="20,5 20,25 40,15" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="40,25 40,5 20,15" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Actionneurs', def:"Vanne commandée électriquement pour ouvrir/fermer le passage d'un fluide.", wiki:'Électrovanne', alias:'solenoid valve' }),
  defRow('fin_de_course','Fin de course', T2, `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/><circle cx="44" cy="15" r="2.2" fill="currentColor"/><line x1="16" y1="15" x2="40" y2="6" stroke="currentColor" stroke-width="2"/><circle cx="40" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
    { famille:'Capteurs industriels', def:"Détecteur mécanique actionné par le déplacement d'une pièce mobile en fin de course.", wiki:'Interrupteur_de_position', alias:'limit switch fdc' }),
  defRow('detecteur_industriel','Détecteur de présence (industriel)', T3_BLOCK, TPL.block('DET'),
    { famille:'Capteurs industriels', def:"Détecteur inductif, capacitif ou optique utilisé pour la détection de pièces sur une ligne de production.", wiki:'Capteur_de_proximité', alias:'detecteur inductif capacitif' }),
  defRow('logique_commande','Bloc logique de commande', T3_AOP, TPL.gate2in(AND_PATH),
    { famille:'Commande', def:"Représente une fonction logique de commande (combinaison de conditions) dans un schéma d'automatisme.", wiki:'Logique_combinatoire', alias:'logique cablée' }),
];

const COMPONENT_LIBRARY = {
  electronique: ELECTRONIQUE,
  electrotechnique: ELECTROTECHNIQUE,
  batiment: BATIMENT,
  'energies-renouvelables': RENOUVELABLES,
  automatisme: AUTOMATISME,
};

const INSTRUMENT_LIBRARY = [
  defRow('multimetre','Multimètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="25" y="20" font-size="11" fill="currentColor">V</text>`,
    { famille:'Instruments', def:'Mesure tension, courant ou résistance selon le mode choisi.', wiki:'Multimètre', instrument:'tension' }),
  defRow('amperemetre','Ampèremètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="25" y="20" font-size="11" fill="currentColor">A</text>`,
    { famille:'Instruments', def:"Mesure l'intensité du courant qui le traverse (se branche en série).", wiki:'Ampèremètre', instrument:'courant' }),
  defRow('wattmetre','Wattmètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="23" y="20" font-size="10" fill="currentColor">W</text>`,
    { famille:'Instruments', def:'Mesure la puissance électrique consommée par une charge.', wiki:'Wattmètre', instrument:'puissance' }),
  defRow('ohmmetre','Ohmmètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="23" y="20" font-size="11" fill="currentColor">Ω</text>`,
    { famille:'Instruments', def:"Mesure la résistance d'un dipôle hors tension.", wiki:'Ohmmètre', instrument:'resistance' }),
];

/* ==========================================================================
   RECHERCHE ET ACCÈS AU CATALOGUE
   ========================================================================== */
function fullCatalog(){
  const out = COMMON_COMPONENTS.map(c => ({ ...c, groupe:'commun' }));
  Object.entries(COMPONENT_LIBRARY).forEach(([espace, list]) => list.forEach(c => out.push({ ...c, groupe:espace })));
  INSTRUMENT_LIBRARY.forEach(c => out.push({ ...c, groupe:'instrument' }));
  return out;
}
function searchCatalog(query){
  const q = (query||'').trim().toLowerCase();
  if (!q) return [];
  return fullCatalog().filter(c =>
    c.id.toLowerCase().includes(q) || c.nom.toLowerCase().includes(q) || (c.alias||'').toLowerCase().includes(q) || (c.famille||'').toLowerCase().includes(q)
  ).slice(0, 20);
}
function findDef(typeId){
  const common = COMMON_COMPONENTS.find(c=>c.id===typeId); if (common) return common;
  for (const list of Object.values(COMPONENT_LIBRARY)) { const f = list.find(c=>c.id===typeId); if (f) return f; }
  return INSTRUMENT_LIBRARY.find(c=>c.id===typeId);
}
// Regroupe une liste de composants par famille, en conservant l'ordre d'apparition (pour affichage en catégories repliables — §36).
function groupByFamille(list){
  const map = new Map();
  list.forEach(c => { const k = c.famille || 'Autres'; if (!map.has(k)) map.set(k, []); map.get(k).push(c); });
  return [...map.entries()];
}
function wikiUrl(slug){ return `https://fr.wikipedia.org/wiki/${slug}`; }

/* ==========================================================================
   CATALOGUE DE PRIX POUR LE DEVIS (§22/§23) — indépendant des composants de
   simulation : un devis peut contenir du PCB, de la soudure, du fil, un
   boîtier... même si ces éléments ne sont jamais posés sur le canevas.
   Prix indicatifs modifiables par l'utilisateur dans l'éditeur de devis.
   ========================================================================== */
const PRICE_CATALOG = [
  { id:'pcb', nom:'Plaque PCB / prototypage', unite:'pièce', prix:6.5 },
  { id:'soudure', nom:'Étain à souder', unite:'m', prix:0.4 },
  { id:'fil', nom:'Fil de câblage', unite:'m', prix:0.3 },
  { id:'connecteur', nom:'Connecteur / bornier', unite:'pièce', prix:1.2 },
  { id:'boitier', nom:'Boîtier', unite:'pièce', prix:12 },
  { id:'vis', nom:'Vis + écrou', unite:'lot de 10', prix:1.5 },
  { id:'entretoise', nom:'Entretoise', unite:'pièce', prix:0.4 },
  { id:'fusible_devis', nom:'Fusible + support', unite:'pièce', prix:1.8 },
  { id:'gaine', nom:'Gaine / conduit', unite:'m', prix:0.9 },
  { id:'accessoire', nom:'Accessoire divers', unite:'pièce', prix:3 },
  { id:'main_oeuvre', nom:"Main-d'œuvre", unite:'h', prix:35 },
  { id:'transport', nom:'Transport / livraison', unite:'forfait', prix:15 },
];
// Reprend aussi tous les composants du catalogue technique comme lignes de devis possibles (prix par défaut à ajuster).
function devisSuggestions(){
  return [...PRICE_CATALOG, ...fullCatalog().map(c => ({ id:c.id, nom:c.nom, unite:'pièce', prix: estimatePrice(c) }))];
}
function estimatePrice(def){
  if (def.complexite === 'avance') return 4.5;
  if (def.famille === 'Transformateurs' || def.famille === 'Machines') return 25;
  if (def.famille === 'Photovoltaïque' || def.famille === 'Conversion' || def.famille === 'Stockage') return 80;
  if (def.famille === 'Circuits intégrés') return 2.5;
  return 0.6;
}
