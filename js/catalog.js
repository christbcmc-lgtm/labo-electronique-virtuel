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
const T3_SPDT       = [[0,15],[60,6],[60,24]];                  // commutateur unipolaire bidirectionnel : commune (L) + 2 sorties (navettes 1/2)

// ---- Gabarit IC générique : n broches réparties gauche/droite, calculées
//      en même temps que le tracé pour garantir bornes ↔ traits toujours alignés
//      (c'est exactement la classe de bug corrigée dans la version précédente :
//      MOSFET/régulateur/transfo PM avaient des bornes qui ne correspondaient
//      à aucun trait réellement dessiné — voir RAPPORT-FINAL section B).
// Numérotation conforme au boîtier DIP réel : broche 1 en haut à gauche, on descend le côté
// gauche (1..L), puis on REMONTE le côté droit (L+1..n se lit de bas en haut) — c'est l'ordre
// physique standard de n'importe quel circuit intégré DIP réel, pas un simple comptage de haut
// en bas des deux côtés (erreur corrigée cette session — voir addendum du rapport final).
function icTemplate(n, label){
  const L = Math.ceil(n/2), R = n - L;
  const terms = []; let leads = '';
  for (let i=0;i<L;i++){ const y = 3 + (i+0.5)*(24/L); leads += leadLine(0,y,16,y); terms.push([0,y]); }
  for (let i=0;i<R;i++){ const y = 3 + (R-1-i+0.5)*(24/R); leads += leadLine(44,y,60,y); terms.push([60,y]); }
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
  // Boîtier déduit du nombre de broches réel (donnée structurelle déjà connue, pas une invention
  // par pièce) uniquement pour les références dont le brochage est confirmé (`pinNames` présent) —
  // DIP-N/SOIC-N est la désignation générique standard d'un boîtier à N broches en 2 rangées.
  if (opts.pinNames && !opts.boitier) opts = { ...opts, boitier: `DIP-${pins} / SOIC-${pins}` };
  return defRow(id, nom, t.terminals, t.sym, opts);
}
function defRow(id, nom, terminals, sym, opts={}){
  SYM[id] = sym;
  // On étale d'abord `opts` (permet d'ajouter n'importe quel champ personnalisé — ex. `instrument`,
  // `pv` — sans devoir mettre cette fonction à jour à chaque fois, cf. §16), puis on complète les
  // champs standards avec leurs valeurs par défaut.
  const famille = opts.famille || nom;
  const alias = opts.alias || '';
  return {
    ...opts,
    id, nom, terminals,
    unit: opts.unit||'', defaultValue: opts.defaultValue ?? '', valueOptions: opts.valueOptions||[],
    def: opts.def||'', wiki: opts.wiki || nom.replace(/[^\wÀ-ÿ]+/g,'_'),
    alias, famille, complexite: opts.complexite||'simple',
    simulable: opts.simulable ?? false, variantes: opts.variantes || null,
    // --- Modèle de données enrichi (mise à jour « reprise, organisation et évolution » du client,
    // §4 : chaque composant doit posséder identifiant/nom/référence technique/famille/sous-famille/
    // boîtier/source/niveau de vérification, en plus des champs déjà existants). Rien n'est inventé
    // par pièce : `sousFamille` est dérivée par une règle générique (voir `deriveSousFamille`), pas
    // saisie une par une ; `boitier` n'est renseigné que pour les références nommées dont le
    // brochage est déjà connu avec confiance (`pinNames` présent) ; `source` reste vide par défaut
    // plutôt que de citer une documentation non vérifiée (voir NOTES_REPRISE_2026.md) ;
    // `niveauVerification` reflète ce qui est RÉELLEMENT vérifié automatiquement
    // (tests/verify_catalog.js, + présence de `pinNames`), pas une auto-évaluation arbitraire.
    sousFamille: opts.sousFamille || deriveSousFamille(famille, id, nom, alias),
    refTechnique: opts.refTechnique || nom,
    boitier: opts.boitier || '',
    source: opts.source || '',
    niveauVerification: opts.niveauVerification || (opts.pinNames
      ? 'Brochage réel documenté + symbole vérifié automatiquement (tests/verify_catalog.js)'
      : 'Symbole vérifié automatiquement (bornes ↔ tracé, tests/verify_catalog.js) — brochage détaillé non documenté'),
  };
}

// Dérive une sous-famille (Colonne 2 de la bibliothèque, §6 de la mise à jour) à partir de champs
// déjà réels (famille/id/nom/alias) — une RÈGLE générique, pas une saisie manuelle par composant
// (503 fiches). Couvre les familles les plus nombreuses avec une taxonomie électronique standard
// bien établie ; retombe sur la famille elle-même pour les familles plus restreintes plutôt que
// d'inventer une subdivision arbitraire.
function deriveSousFamille(famille, id, nom, alias){
  const s = (id + ' ' + nom + ' ' + alias).toLowerCase();
  const has = (...words) => words.some(w => s.includes(w));
  switch (famille){
    case 'Diodes':
      if (has('zener')) return 'Zener';
      if (has('schottky')) return 'Schottky';
      if (has('led')) return 'LED / optoélectronique émissive';
      if (has('tvs')) return 'Protection (TVS)';
      if (has('varicap', 'varactor')) return 'Varicap';
      if (has('photodiode')) return 'Photodiode';
      return 'Redressement / signal';
    case 'Transistors':
      if (has('mosfet')) return 'MOSFET';
      if (has('jfet')) return 'JFET';
      if (has('igbt')) return 'IGBT';
      if (has('darlington')) return 'Darlington';
      if (has('phototransistor')) return 'Phototransistor';
      if (/\(npn\)/.test(s) || /^transistor npn/.test(s)) return 'Bipolaire NPN';
      if (/\(pnp\)/.test(s) || /^transistor pnp/.test(s)) return 'Bipolaire PNP';
      return 'Transistors (autre)';
    case 'Circuits intégrés':
      if (has('555')) return 'Temporisateur (NE555 et dérivés)';
      if (has('lm358','tl08','tl07','ua741','lm324','comparateur','lm339','lm386','ne5532',' aop')) return 'Amplificateur opérationnel / comparateur';
      if (has('regulateur','reg_78','reg_79','lm1117','ams1117','mcp1700','lm337')) return 'Régulateur de tension linéaire';
      if (has('module_buck','module_boost','mc34063')) return 'Convertisseur DC-DC';
      if (has('module_chargeur','module_usbc')) return "Module d'alimentation / charge";
      if (has('multiplex','demultiplex','decodeur','encodeur')) return 'Multiplexage / décodage';
      if (has('compteur','bascule','registre','latch','buffer_octal','transceiver_octal')) return 'Logique séquentielle (compteurs, registres, bascules)';
      if (has('driver','uln28','uln20','l293','a4988')) return 'Driver de puissance / moteur';
      if (has('eeprom','pcf8574','mcp23017')) return 'Mémoire / interface I²C';
      if (has('max232','ft232')) return 'Interface de communication série';
      if (has(' adc','adc0804')) return 'Conversion analogique-numérique';
      if (has('atmega','attiny','pic16')) return 'Microcontrôleur';
      if (has('oscillateur')) return 'Oscillateur';
      return 'Circuit intégré (autre)';
    case 'Logique numérique':
      if (/\bci_74/.test(s) || has(' 74hc','74 hc')) return 'Famille 74HC (TTL/CMOS rapide)';
      if (/\bci_40/.test(s)) return 'Famille CD4000 (CMOS)';
      if (/^porte_/.test(id)) return 'Porte logique discrète';
      if (has(' adc',' dac')) return 'Conversion analogique-numérique';
      if (has('buffer')) return 'Buffer / driver logique';
      return 'Logique numérique (autre)';
    case 'Protections':
      if (has('fusible')) return 'Fusible';
      if (has('parafoudre')) return 'Parafoudre';
      if (has('disjoncteur')) return 'Disjoncteur';
      if (has('sectionneur')) return 'Sectionneur';
      if (has('varistance')) return 'Varistance';
      if (has('tvs')) return 'Protection semi-conductrice (TVS)';
      if (has('relais_thermique','relais_protection')) return 'Relais de protection';
      if (has('coffret')) return 'Coffret de protection';
      if (has('rcbo')) return 'Protection combinée (RCBO)';
      return 'Protections (autre)';
    case 'Capteurs et modules':
      if (has('temperature','dht11','dht22','ds18b20','lm35','tmp36','sht31')) return 'Température / humidité';
      if (has('pression','bmp180','bmp280','bme280','bmp388')) return 'Pression / environnement';
      if (has('mpu6050','mpu9250','adxl345','l3g4200d','hmc5883l','inclinaison','mouvement')) return 'Mouvement / inertie';
      if (has('ultrason','hc_sr04','vl53l0x','proximite','tcrt5000','obstacle')) return 'Distance / proximité';
      if (has('mq2','mq3','mq4','mq5','mq6','mq7','mq8','mq9','mq135')) return 'Gaz / qualité de l\'air';
      if (has('acs712','ina219','hx711','sct013')) return 'Courant / tension / énergie';
      if (has('lumiere','ky018','tcs3200','bh1750','guva','infrarouge','ir (')) return 'Lumière / couleur / UV';
      if (has('rtc','ds3231','ds1307')) return 'Horloge temps réel (RTC)';
      if (has('module_relais')) return 'Module relais';
      if (has('joystick','clavier_matriciel','fingerprint','pulse_sensor')) return 'Interface utilisateur';
      if (has('fc28','pluie','niveau_eau','sol_capacitif','yfs201')) return 'Eau / sol / environnement';
      if (has('neom8n','gps')) return 'Position (GPS)';
      if (has('flamme')) return 'Détection incendie';
      if (has('sw420','vibration','choc')) return 'Vibration / choc';
      return 'Capteurs et modules (autre)';
    case 'Communication':
      if (has('esp8266','esp32','esp01','esp-01','module_wifi')) return 'Wi-Fi';
      if (has('bluetooth','hc05','hc06')) return 'Bluetooth';
      if (has('nrf24l01','lora','cc2530','zigbee')) return 'RF longue portée / maillage';
      if (has('rc522','pn532','rfid','nfc')) return 'RFID / NFC';
      if (has('sim800l','neo6m','gsm','gprs','gps')) return 'Cellulaire / GPS';
      return 'Bus série / filaire';
    case 'Câblage':
      if (has('connecteur','antenne')) return 'Connectique';
      if (has('jeu_de_barres','chemin_de_cables','boite_derivation','boite_jonction')) return 'Distribution / dérivation';
      if (has('cable','gaine')) return 'Câbles et gaines';
      if (has('borne')) return 'Bornes de raccordement';
      return 'Câblage (autre)';
    case 'Électromécanique':
      if (has('interrupteur','commutateur','microswitch','bouton')) return 'Interrupteurs et commutateurs';
      if (has('relais')) return 'Relais';
      if (has('buzzer','haut_parleur','microphone')) return 'Transducteurs sonores';
      if (has('ventilateur','servo_moteur')) return 'Moteurs et actionneurs';
      return 'Électromécanique (autre)';
    case 'Résistances':
      if (has('thermistance')) return 'Thermistance (NTC/PTC)';
      if (has('ldr')) return 'Photorésistance (LDR)';
      if (has('potentiometre','rheostat','variable')) return 'Résistance variable';
      if (has('reseau')) return 'Réseau de résistances';
      if (has('shunt','precision','puissance')) return 'Résistance de mesure / puissance';
      return 'Résistance fixe';
    case 'Condensateurs':
      if (has('ceramique')) return 'Céramique';
      if (has('film')) return 'Film';
      if (has('tantale')) return 'Tantale';
      if (has('polarise','demarrage','permanent')) return 'Électrolytique / polarisé';
      if (has('supercondensateur')) return 'Supercondensateur';
      if (has('variable')) return 'Variable';
      return 'Condensateur (autre)';
    case 'Stockage':
      if (has('pile')) return 'Pile primaire (non rechargeable)';
      if (has('18650','lithium','lifepo4')) return 'Accumulateur lithium';
      if (has('plomb','agm','gel')) return 'Batterie plomb';
      return 'Stockage (autre)';
    case 'Commande éclairage':
      if (has('va_et_vient','permutateur','bipolaire','double','telerupteur','interrupteur')) return 'Commutation manuelle (interrupteurs, va-et-vient, permutateur, télérupteur)';
      if (has('detecteur','thermostat','minuterie','variateur')) return 'Détection et automatisation';
      return 'Commande éclairage (autre)';
    case 'Affichage':
      if (has('7seg')) return '7 segments';
      if (has('lcd')) return 'LCD';
      if (has('oled','tft','epaper')) return 'Écran (OLED/TFT/e-paper)';
      if (has('matrice_led','bargraph','voyant')) return 'Voyants / matrices LED';
      if (has('driver')) return "Driver d'afficheur";
      return 'Affichage (autre)';
    default:
      return famille;
  }
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
  defRow('quartz','Quartz (résonateur à cristal)', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="26" y1="6" x2="26" y2="24" stroke="currentColor" stroke-width="1.2"/><line x1="34" y1="6" x2="34" y2="24" stroke="currentColor" stroke-width="1.2"/>`,
    { unit:'MHz', defaultValue:16, valueOptions:[4,8,11.0592,16,20,32.768/1000], famille:'Bobines',
      def:"Fournit une fréquence d'horloge très stable par oscillation mécanique d'un cristal de quartz.", wiki:'Résonateur_à_quartz', alias:'crystal oscillateur horloge' }),
  defRow('resonateur_ceramique','Résonateur céramique', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<polygon points="22,6 38,6 34,24 26,24" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'MHz', defaultValue:8, valueOptions:[2,4,8,16], famille:'Bobines',
      def:"Résonateur moins précis mais moins cher qu'un quartz, suffisant pour de nombreux microcontrôleurs.", wiki:'Résonateur_céramique', alias:'ceramic resonator' }),
  defRow('oscillateur_module','Oscillateur à quartz (module actif)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'OSC',6.5)}`,
    { unit:'MHz', defaultValue:16, valueOptions:[8,16,25,50], famille:'Circuits intégrés',
      def:"Module autonome (avec alimentation) délivrant directement un signal d'horloge carré, sans composants externes.", wiki:'Oscillateur_à_quartz', alias:'oscillator module can' }),
  defRow('condensateur_tantale','Condensateur tantale', T2, TPL.capBase(`${ctext(22,10,'+',8)}`),
    { unit:'µF', defaultValue:10, valueOptions:[1,10,47,100], famille:'Condensateurs',
      def:"Condensateur polarisé à forte densité de capacité, plus stable qu'un électrolytique mais plus fragile en surtension.", wiki:'Condensateur_au_tantale', alias:'tantalum capacitor' }),
  defRow('supercondensateur','Supercondensateur (ultracapacitor)', T2, TPL.capBase(`${ctext(22,10,'+',8)}`),
    { unit:'F', defaultValue:1, valueOptions:[0.1,1,10,100], famille:'Condensateurs',
      def:"Capacité énorme comparée à un condensateur classique, charge/décharge très rapide, complète une batterie.", wiki:'Supercondensateur', alias:'ultracapacitor edlc' }),
  defRow('resistance_precision','Résistance de précision', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
    { unit:'Ω', defaultValue:1000, valueOptions:[100,1000,10000], famille:'Résistances',
      def:"Résistance à tolérance très serrée (souvent 0,1 à 1 %), utilisée en instrumentation et mesure.", wiki:'Résistance_électrique', alias:'precision low tolerance' }),
  defRow('resistance_shunt','Résistance de shunt (mesure de courant)', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="9" width="36" height="12" fill="none" stroke="currentColor" stroke-width="3"/>`,
    { unit:'mΩ', defaultValue:100, valueOptions:[10,50,100,500], famille:'Résistances',
      def:"Résistance de très faible valeur traversée par le courant à mesurer, la chute de tension à ses bornes est proportionnelle au courant.", wiki:'Shunt_(métrologie)', alias:'shunt mesure courant' }),
  defRow('interrupteur_bascule','Interrupteur à bascule (toggle)', T2, TPL.switchLike(true),
    { famille:'Électromécanique', def:"Interrupteur à levier maintenu dans sa position (marche/arrêt).", wiki:'Interrupteur_(électricité)', alias:'toggle switch bascule' }),
  defRow('interrupteur_bascule_rocker','Interrupteur à bascule (rocker)', T2, TPL.switchLike(true),
    { famille:'Électromécanique', def:"Interrupteur à bascule plat encastrable, très courant sur les appareils électroniques.", wiki:'Interrupteur_(électricité)', alias:'rocker switch encastrable' }),
  defRow('interrupteur_dip','Interrupteur DIP (banc de mini-interrupteurs)', T2, TPL.switchLike(true),
    { famille:'Électromécanique', def:"Petit banc de plusieurs interrupteurs miniatures montés sur circuit imprimé, pour configurer un équipement.", wiki:'Interrupteur_DIP', alias:'dip switch configuration' }),
  defRow('interrupteur_glissiere','Interrupteur à glissière (slide)', T2, TPL.switchLike(true),
    { famille:'Électromécanique', def:"Interrupteur commandé par un curseur coulissant.", wiki:'Interrupteur_(électricité)', alias:'slide switch curseur' }),
  defRow('bouton_tactile_smd','Bouton-poussoir tactile (SMD)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="8" width="28" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Électromécanique', def:"Petit bouton-poussoir 4 broches monté en surface, très utilisé sur cartes électroniques.", wiki:'Bouton-poussoir', alias:'tactile switch 4 pattes' }),
  defRow('commutateur_rotatif','Commutateur rotatif (sélecteur)', T3_WIPER, TPL.boxDiag('SEL', true),
    { famille:'Électromécanique', def:"Sélectionne une position parmi plusieurs par rotation d'un axe (choix de gamme, de mode).", wiki:'Commutateur_rotatif', alias:'selecteur rotatif' }),
  defRow('interrupteur_reed','Interrupteur reed (ampoule à lame souple)', T2, `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<rect x="14" y="10" width="32" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/><line x1="20" y1="15" x2="40" y2="15" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Électromécanique', def:"Contact scellé qui se ferme en présence d'un champ magnétique (détection de porte/fenêtre).", wiki:'Interrupteur_reed', alias:'reed switch magnetique' }),
  defRow('microswitch','Microrupteur (microswitch)', T2, `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/><circle cx="44" cy="15" r="2.2" fill="currentColor"/><line x1="16" y1="15" x2="40" y2="9" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Électromécanique', def:"Petit interrupteur mécanique à came, actionné par un faible déplacement (fin de course miniature).", wiki:'Interrupteur_de_position', alias:'microswitch levier' }),
  defRow('connecteur_jst','Connecteur JST', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="9" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'JST',5)}`,
    { famille:'Câblage', def:"Petit connecteur débrochable à verrouillage, très répandu sur batteries et petites cartes.", wiki:'Connecteur_électrique', alias:'jst-xh ph batterie' }),
  defRow('connecteur_dupont','Connecteur Dupont', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="9" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'DU',6)}`,
    { famille:'Câblage', def:"Connecteur à broches au pas de 2,54 mm, standard des maquettes et cartes de prototypage.", wiki:'Connecteur_électrique', alias:'dupont header 2.54mm' }),
  defRow('connecteur_usb','Connecteur USB', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="6" width="28" height="18" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'USB',6)}`,
    { famille:'Câblage', def:"Connecteur d'alimentation et/ou de données USB (A, B, C ou micro selon le montage).", wiki:'Universal_Serial_Bus', alias:'usb type-a type-c micro-usb' }),
  defRow('connecteur_rj45','Connecteur RJ45', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="6" width="28" height="18" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'RJ45',5)}`,
    { famille:'Câblage', def:"Connecteur standard des réseaux Ethernet filaires.", wiki:'RJ45', alias:'ethernet rj45 reseau' }),
  defRow('connecteur_bnc','Connecteur BNC', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="30" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Câblage', def:"Connecteur coaxial à verrouillage à baïonnette, courant en instrumentation (oscilloscope, RF).", wiki:'Connecteur_BNC', alias:'bnc coaxial rf' }),
  defRow('connecteur_banane','Connecteur banane', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<circle cx="30" cy="15" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Câblage', def:"Fiche/douille de laboratoire pour cordons de mesure (multimètre, alimentation de labo).", wiki:'Fiche_banane', alias:'banane douille labo' }),
  defRow('pile_aa','Pile AA', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'AA',5)}`,
    { unit:'V', defaultValue:1.5, valueOptions:[1.2,1.5], famille:'Stockage', def:"Pile ou accumulateur cylindrique standard (alcaline 1,5 V ou NiMH rechargeable 1,2 V).", wiki:'Pile_électrique', alias:'aa lr6 nimh' }),
  defRow('pile_aaa','Pile AAA', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="8" x2="22" y2="22" stroke="currentColor" stroke-width="3"/><line x1="28" y1="11" x2="28" y2="19" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'AAA',4.5)}`,
    { unit:'V', defaultValue:1.5, valueOptions:[1.2,1.5], famille:'Stockage', def:"Pile ou accumulateur cylindrique de petit format.", wiki:'Pile_électrique', alias:'aaa lr03 nimh' }),
  defRow('pile_9v','Pile 9V (bloc)', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'9V',5)}`,
    { unit:'V', defaultValue:9, valueOptions:[9], famille:'Stockage', def:"Pile rectangulaire 9 V à connecteur clip, courante en petits appareils portables.", wiki:'Pile_électrique', alias:'bloc 9v 6lr61' }),
  defRow('pile_bouton','Pile bouton (CR2032)', T2, `${leadLine(0,15,24,15)}${leadLine(36,15,60,15)}<circle cx="30" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
    { unit:'V', defaultValue:3, valueOptions:[1.5,3], famille:'Stockage', def:"Petite pile plate utilisée pour l'horloge/mémoire de sauvegarde ou de petits appareils.", wiki:'Pile_bouton', alias:'cr2032 lr44 bouton' }),
  defRow('cellule_18650','Cellule Li-ion 18650', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'18650',4)}`,
    { unit:'V', defaultValue:3.7, valueOptions:[3.6,3.7], famille:'Stockage', def:"Cellule lithium-ion cylindrique standard, brique de base de nombreuses batteries (outillage, vélo électrique).", wiki:'Batterie_lithium-ion', alias:'18650 cellule li-ion' }),
  defRow('haut_parleur','Haut-parleur', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<polygon points="10,10 25,10 40,2 40,28 25,20 10,20" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'Ω', defaultValue:8, valueOptions:[4,8,16], famille:'Électromécanique', def:"Convertit un signal électrique en son par vibration d'une membrane.", wiki:'Haut-parleur', alias:'speaker enceinte' }),
  defRow('microphone','Microphone (électret)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'MIC',5)}`,
    { famille:'Électromécanique', def:"Convertit un son en signal électrique, capsule électret très répandue en petite électronique.", wiki:'Microphone', alias:'micro electret capsule' }),
  defRow('buzzer_piezo_passif','Buzzer piézo passif', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,'PZ',7)}`,
    { famille:'Électromécanique', def:"Élément piézoélectrique nécessitant un signal externe pour produire un son (fréquence réglable).", wiki:'Buzzer', alias:'piezo passif sans oscillateur' }),
  defRow('antenne','Antenne', T1_SIMPLE, `${leadLine(0,15,20,15)}<line x1="20" y1="15" x2="45" y2="0" stroke="currentColor" stroke-width="1.8"/><line x1="20" y1="15" x2="45" y2="30" stroke="currentColor" stroke-width="1.8"/>`,
    { famille:'Câblage', def:"Convertit un signal électrique en onde radio (émission) ou inversement (réception).", wiki:'Antenne_(radioélectricité)', alias:'antenne radio wifi gsm' }),
  defRow('ventilateur_12v','Ventilateur (refroidissement) 12V', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M30,15 L24,7 M30,15 L38,9 M30,15 L34,23 M30,15 L22,20" stroke="currentColor" stroke-width="1.2"/>`,
    { unit:'V', defaultValue:12, valueOptions:[5,12,24], famille:'Électromécanique', def:"Ventilateur électrique de refroidissement pour dissiper la chaleur d'un composant ou boîtier.", wiki:'Ventilateur_(mécanique)', alias:'fan refroidissement 12v' }),
  defRow('servo_moteur','Servo-moteur', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<rect x="14" y="6" width="32" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'SG90',5.5)}`,
    { unit:'°', defaultValue:180, valueOptions:[90,180,360], famille:'Électromécanique', def:"Moteur asservi en position angulaire par un signal PWM, très utilisé en robotique/modélisme.", wiki:'Servomoteur', alias:'servo sg90 rc' }),
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
  // Gabarit générique (boîtier + broches numérotées, §16/§36) réutilisé pour chaque référence :
  // ajouter une puce = ajouter une ligne de données, jamais un nouveau symbole ni toucher le moteur.
  // Le 5e élément optionnel {famille, pinNames, alias, wiki} permet de préciser le brochage réel
  // (voir pinNamesListHTML côté éditeur) uniquement quand il est connu avec confiance (§7 des
  // notes en cours : le modèle réel reste rattaché à la fiche même si le boîtier est partagé) —
  // laissé volontairement absent plutôt qu'inventé quand la référence exacte n'est pas garantie.
  ...[
    ['ne555','NE555','Temporisateur/oscillateur intégré très répandu (astable, monostable).',8,{ pinNames:['GND','Déclenchement (TRIG)','Sortie (OUT)','Reset','Contrôle (CTRL)','Seuil (THRES)','Décharge (DISCH)','VCC'] }],
    ['ne556','NE556 (double 555)','Deux temporisateurs NE555 dans un seul boîtier.',14,{ pinNames:['1-DISCH','1-THRES','1-CTRL','1-RESET','1-OUT','1-TRIG','GND','2-TRIG','2-OUT','2-RESET','2-CTRL','2-THRES','2-DISCH','VCC'] }],
    ['lm358','LM358','Double amplificateur opérationnel faible consommation, alimentation simple ou double.',8,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','GND / V−','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','VCC / V+'] }],
    ['tl082','TL082','Double amplificateur opérationnel à entrée JFET, faible bruit.',8,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','V−','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','V+'] }],
    ['tl071','TL071','Amplificateur opérationnel simple à entrée JFET.',8,{ pinNames:['Ajust. offset 1','Entrée (−)','Entrée (+)','V−','Ajust. offset 2','Sortie','V+','NC'] }],
    ['tl074','TL074','Quadruple amplificateur opérationnel à entrée JFET.',14,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','V+','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','Sortie 3','Entrée 3 (−)','Entrée 3 (+)','V−','Entrée 4 (+)','Entrée 4 (−)','Sortie 4'] }],
    ['ua741','µA741','Amplificateur opérationnel simple, référence historique très enseignée.',8,{ pinNames:['Ajust. offset 1','Entrée (−)','Entrée (+)','V−','Ajust. offset 2','Sortie','V+','NC'] }],
    ['lm324','LM324','Quadruple amplificateur opérationnel en boîtier unique.',14,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','VCC','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','Sortie 3','Entrée 3 (−)','Entrée 3 (+)','GND','Entrée 4 (+)','Entrée 4 (−)','Sortie 4'] }],
    ['comparateur','Comparateur (LM393)','Compare deux tensions et bascule sa sortie logique en fonction du résultat.',8,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','GND','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','VCC'], alias:'lm393' }],
    ['lm339','LM339','Quadruple comparateur de tension en boîtier unique.',14,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','VCC','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','Sortie 3','Entrée 3 (−)','Entrée 3 (+)','GND','Entrée 4 (+)','Entrée 4 (−)','Sortie 4'] }],
    ['lm386','LM386','Amplificateur audio basse puissance très utilisé (petits haut-parleurs).',8,{ pinNames:['Gain','Entrée (−)','Entrée (+)','GND','Sortie','VS','Bypass','Gain'] }],
    ['ne5532','NE5532','Double amplificateur opérationnel audio faible bruit.',8,{ pinNames:['Sortie 1','Entrée 1 (−)','Entrée 1 (+)','V−','Entrée 2 (+)','Entrée 2 (−)','Sortie 2','V+'] }],
    ['regulateur_ajustable','Régulateur ajustable (LM317)','Régulateur de tension dont la sortie se règle avec deux résistances externes.',3],
    ['lm337','LM337','Régulateur de tension négative ajustable, complément du LM317.',3],
    ['multiplexeur','Multiplexeur (74HC151)','Sélectionne une entrée parmi plusieurs vers une seule sortie, selon un code de commande.',16,{ alias:'74hc151 mux' }],
    ['demultiplexeur','Démultiplexeur (74HC138)','Redirige une entrée unique vers une sortie parmi plusieurs, selon un code de commande.',16,{ alias:'74hc138 demux' }],
    ['multiplexeur_quad','Multiplexeur quadruple (74HC157)','Sélectionne, pour 4 paires d\'entrées en parallèle, l\'une des deux sources selon une seule commande.',16,{ alias:'74hc157' }],
    ['encodeur','Encodeur','Convertit un ensemble de lignes actives en un code binaire.',16],
    ['decodeur','Décodeur (74HC138)','Convertit un code binaire en activant une seule ligne de sortie parmi plusieurs.',16,{ alias:'74hc138 decoder' }],
    ['decodeur_dual','Décodeur double (74HC139)','Deux décodeurs 2 vers 4 indépendants dans un seul boîtier.',16,{ alias:'74hc139' }],
    ['compteur_ic','Compteur intégré (74HC193)','Incrémente/décrémente un compte binaire à chaque front d\'horloge reçu.',16,{ alias:'74hc193 74hc163' }],
    ['compteur_bcd','Compteur BCD (74HC192)','Compte en décimal codé binaire, comptage avant/arrière.',16,{ alias:'74hc192' }],
    ['bascule_ic','Bascule (flip-flop) simple',"Mémorise un bit d'information, base des registres et compteurs séquentiels.",8],
    ['bascule_hex_d','Bascule D hexuple (74HC174)','Six bascules D indépendantes déclenchées par le même front d\'horloge.',16,{ alias:'74hc174' }],
    ['registre','Registre à décalage (74HC164)','Mémorise et décale une suite de bits au rythme d\'une horloge.',14,{ alias:'74hc164' }],
    ['registre_parallele','Registre à décalage parallèle (74HC165)','Charge un octet en parallèle puis le décale en série, ou l\'inverse.',16,{ alias:'74hc165' }],
    ['registre_595','Registre à décalage à verrou (74HC595)','Décale un octet en série puis le recopie d\'un coup en parallèle (pilotage de LED/afficheurs).',16,{ pinNames:['QB','QC','QD','QE','QF','QG','QH','GND','SER (donnée)','OE\\ (validation)','RCLK (verrou)','SRCLK (horloge)','SRCLR\\ (reset)','QH\'','VCC','QA'], alias:'74hc595 shift register latch' }],
    ['registre_tristate','Registre tri-state (74HC173)','Registre 4 bits à sorties trois états, utile pour partager un bus.',16,{ alias:'74hc173' }],
    ['buffer_octal','Buffer octal trois états (74HC244)','Huit tampons de ligne à sorties trois états, pour renforcer un bus.',20,{ alias:'74hc244' }],
    ['transceiver_octal','Transceiver octal bidirectionnel (74HC245)','Huit lignes bidirectionnelles à sorties trois états entre deux bus.',20,{ alias:'74hc245' }],
    ['latch_octal','Verrou octal (74HC373)','Mémorise huit bits tant que le signal de validation est actif.',20,{ alias:'74hc373' }],
    ['bascule_octal','Bascule D octale (74HC374)','Huit bascules D déclenchées par le même front d\'horloge.',20,{ alias:'74hc374' }],
    ['mux_analogique','Multiplexeur analogique (4051/74HC4051)','Aiguille un signal analogique parmi 8 voies vers une seule ligne commune.',16,{ alias:'4051 74hc4051' }],
    ['driver_moteur','Driver de puissance générique','Circuit intégré qui amplifie un signal de commande pour piloter une charge de puissance (moteur, relais...).',8],
    ['uln2003','ULN2003','Sept transistors Darlington en réseau, pour piloter des charges (relais, moteur pas-à-pas) depuis une sortie logique.',16,{ alias:'darlington array driver relais' }],
    ['uln2803','ULN2803','Huit transistors Darlington en réseau, version plus large de l\'ULN2003.',18,{ alias:'darlington array 8 canaux' }],
    ['l293d','L293D','Double pont en H pour piloter deux moteurs DC ou un moteur pas-à-pas en deux sens.',16,{ alias:'pont h double moteur dc' }],
    ['a4988','A4988','Driver de moteur pas-à-pas avec micro-pas configurable, très utilisé (imprimantes 3D, CNC).',16,{ alias:'driver pas a pas stepper' }],
    ['mc34063','MC34063','Contrôleur de conversion DC-DC (élévateur/abaisseur/inverseur) à faible coût.',8,{ alias:'dc-dc converter' }],
    ['eeprom_i2c','Mémoire EEPROM I²C (24LC256)','Mémoire non volatile accessible par bus I²C, conserve les données hors tension.',8,{ pinNames:['A0','A1','A2','GND','SDA','SCL','WP (protection écriture)','VCC'], alias:'24lc256 at24c32 eeprom' }],
    ['max232','MAX232','Convertit les niveaux logiques TTL vers les niveaux RS-232 (liaison série PC).',16,{ alias:'rs232 driver liaison serie' }],
    ['ft232rl','FT232RL','Convertisseur USB vers liaison série UART, très utilisé pour programmer des cartes.',28,{ alias:'usb serie usb uart' }],
    ['pcf8574','PCF8574','Extenseur d\'entrées/sorties 8 bits piloté par bus I²C.',16,{ alias:'io expander i2c' }],
    ['mcp23017','MCP23017','Extenseur d\'entrées/sorties 16 bits piloté par bus I²C.',28,{ alias:'io expander i2c 16 bits' }],
    ['adc0804','ADC0804','Convertisseur analogique-numérique 8 bits autonome.',20,{ alias:'adc convertisseur' }],
    ['atmega328p','ATmega328P','Microcontrôleur 8 bits très répandu (cœur des cartes Arduino Uno/Nano).',28,{ alias:'arduino uno nano microcontroleur' }],
    ['attiny85','ATtiny85','Petit microcontrôleur 8 bits à 8 broches, pour projets compacts à faible coût.',8,{ alias:'microcontroleur miniature' }],
    ['pic16f84a','PIC16F84A','Microcontrôleur 8 bits historique, largement utilisé en apprentissage.',18,{ alias:'pic microcontroleur' }],
    ['pic16f877a','PIC16F877A','Microcontrôleur 8 bits avec ADC, PWM et nombreuses broches d\'E/S.',40,{ alias:'pic microcontroleur' }],
    // --- Portes logiques en boîtier réel (§9) : même fonction que les portes "vedettes" plus
    // haut, mais sous forme de circuit intégré multi-portes tel qu'on l'achète réellement.
    ['ci_7400','74HC00 (quad NAND)','Quatre portes NON-ET à 2 entrées dans un seul boîtier.',14,{ pinNames:['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'], famille:'Logique numérique', alias:'7400 nand quad' }],
    ['ci_7402','74HC02 (quad NOR)','Quatre portes NON-OU à 2 entrées dans un seul boîtier.',14,{ pinNames:['1Y','1A','1B','2Y','2A','2B','GND','3A','3B','3Y','4A','4B','4Y','VCC'], famille:'Logique numérique', alias:'7402 nor quad' }],
    ['ci_7404','74HC04 (hex NOT)','Six inverseurs indépendants dans un seul boîtier.',14,{ pinNames:['1A','1Y','2A','2Y','3A','3Y','GND','4Y','4A','5Y','5A','6Y','6A','VCC'], famille:'Logique numérique', alias:'7404 not inverter hex' }],
    ['ci_7408','74HC08 (quad AND)','Quatre portes ET à 2 entrées dans un seul boîtier.',14,{ pinNames:['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'], famille:'Logique numérique', alias:'7408 and quad' }],
    ['ci_7432','74HC32 (quad OR)','Quatre portes OU à 2 entrées dans un seul boîtier.',14,{ pinNames:['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'], famille:'Logique numérique', alias:'7432 or quad' }],
    ['ci_7486','74HC86 (quad XOR)','Quatre portes OU exclusif à 2 entrées dans un seul boîtier.',14,{ pinNames:['1A','1B','1Y','2A','2B','2Y','GND','3Y','3A','3B','4Y','4A','4B','VCC'], famille:'Logique numérique', alias:'7486 xor quad' }],
    ['ci_4001','CD4001 (quad NOR CMOS)','Quatre portes NON-OU CMOS à 2 entrées, tension d\'alimentation large.',14,{ pinNames:['1Y','1A','1B','2Y','2A','2B','VSS','3A','3B','3Y','4A','4B','4Y','VDD'], famille:'Logique numérique', alias:'4001 nor cmos' }],
    ['ci_4011','CD4011 (quad NAND CMOS)','Quatre portes NON-ET CMOS à 2 entrées.',14,{ pinNames:['1A','1B','1Y','2A','2B','2Y','VSS','3Y','3A','3B','4Y','4A','4B','VDD'], famille:'Logique numérique', alias:'4011 nand cmos' }],
    ['ci_4013','CD4013 (double bascule D)','Deux bascules D indépendantes en technologie CMOS.',14,{ pinNames:['1Q','1Q̄','1CLK','1RESET','1D','1SET','VSS','2SET','2D','2RESET','2CLK','2Q̄','2Q','VDD'], famille:'Logique numérique', alias:'4013 flip-flop d cmos' }],
    ['ci_4017','CD4017 (compteur décade)','Compteur/diviseur décimal à 10 sorties séquentielles, très utilisé en chenillard.',16,{ pinNames:['Q5','Q1','Q0','Q2','Q6','Q7','Q3','VSS','Q8','Q4','Q9','Carry Out','Clock Inhibit','Clock','Reset','VDD'], famille:'Logique numérique', alias:'4017 compteur decade chenillard' }],
    ['ci_4020','CD4020 (compteur 14 bits)','Compteur binaire asynchrone à 14 étages.',16,{ famille:'Logique numérique', alias:'4020 compteur binaire' }],
    ['ci_4027','CD4027 (double bascule JK)','Deux bascules JK indépendantes en technologie CMOS.',16,{ famille:'Logique numérique', alias:'4027 flip-flop jk' }],
    ['ci_4040','CD4040 (compteur 12 bits)','Compteur binaire asynchrone à 12 étages.',16,{ famille:'Logique numérique', alias:'4040 compteur binaire' }],
    ['ci_4046','CD4046 (PLL)','Boucle à verrouillage de phase intégrée (synthèse de fréquence, démodulation FM).',16,{ famille:'Logique numérique', alias:'4046 pll boucle phase' }],
    ['ci_4049','CD4049 (hex buffer inverseur)','Six tampons inverseurs, adaptés à l\'interfaçage entre niveaux logiques différents.',16,{ famille:'Logique numérique', alias:'4049 buffer hex' }],
    ['ci_4060','CD4060 (compteur + oscillateur)','Compteur binaire 14 étages avec oscillateur RC/quartz intégré.',16,{ famille:'Logique numérique', alias:'4060 compteur oscillateur' }],
    ['ci_4066','CD4066 (quad interrupteur analogique)','Quatre interrupteurs analogiques bidirectionnels commandés numériquement.',14,{ famille:'Logique numérique', alias:'4066 switch analogique' }],
    ['ci_4069','CD4069 (hex inverseur)','Six portes inverseuses CMOS indépendantes.',14,{ famille:'Logique numérique', alias:'4069 not hex cmos' }],
    ['ci_4070','CD4070 (quad XOR CMOS)','Quatre portes OU exclusif CMOS à 2 entrées.',14,{ famille:'Logique numérique', alias:'4070 xor cmos' }],
    ['ci_4081','CD4081 (quad AND CMOS)','Quatre portes ET CMOS à 2 entrées.',14,{ famille:'Logique numérique', alias:'4081 and cmos' }],
    ['ci_4093','CD4093 (quad NAND trigger de Schmitt)','Quatre portes NON-ET à entrée déclencheur de Schmitt, robustes aux signaux bruités.',14,{ famille:'Logique numérique', alias:'4093 nand schmitt' }],
  ].map(([id,nom,def,pins,extra]) => { const t = icTemplate(pins, (extra&&extra.label) || nom.split(' ')[0].split('(')[0]);
    const opts = { famille:'Circuits intégrés', def, complexite:'avance', alias:id, ...extra };
    // Boîtier déduit du nombre de broches réel, uniquement quand le brochage est confirmé (pinNames).
    if (opts.pinNames && !opts.boitier) opts.boitier = `DIP-${pins} / SOIC-${pins}`;
    return defRow(id, nom, t.terminals, t.sym, opts); }),

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
  ...[
    ['hc05','HC-05 (Bluetooth)',"Module Bluetooth classique maître/esclave, liaison série sans fil courte portée.",'HC-05'],
    ['hc06','HC-06 (Bluetooth esclave)',"Module Bluetooth esclave uniquement, simple à mettre en œuvre en liaison série.",'HC-06'],
    ['nrf24l01','NRF24L01 (2,4 GHz)',"Émetteur-récepteur radio 2,4 GHz bas coût, bus SPI, portée courte à moyenne.",'NRF24L01'],
    ['esp8266','ESP8266 (module Wi-Fi)',"Module Wi-Fi autonome avec microcontrôleur intégré, très utilisé en objets connectés.",'ESP8266'],
    ['esp32','ESP32 (module Wi-Fi/Bluetooth)',"Module Wi-Fi + Bluetooth avec microcontrôleur double cœur intégré.",'ESP32'],
    ['esp01','ESP-01 (module Wi-Fi minimal)',"Petit module Wi-Fi ESP8266 à 8 broches, souvent piloté en commandes AT.",'ESP8266'],
    ['rc522','RC522 (lecteur RFID)',"Lecteur/écrivain de badges RFID 13,56 MHz, bus SPI.",'RFID'],
    ['pn532','PN532 (lecteur NFC)',"Contrôleur NFC polyvalent (lecture/écriture/émulation), I²C/SPI/UART.",'Near_field_communication'],
    ['sim800l','SIM800L (module GSM/GPRS)',"Module de communication cellulaire 2G pour appels, SMS et données.",'GSM'],
    ['neo6m','NEO-6M (module GPS)',"Récepteur GPS fournissant position et heure via liaison série NMEA.",'Global_Positioning_System'],
    ['lora_sx1278','SX1278 / RA-02 (module LoRa)',"Émetteur-récepteur longue portée basse consommation, bande sub-GHz.",'LoRa'],
    ['w5500','W5500 (module Ethernet)',"Contrôleur Ethernet matériel TCP/IP, interface SPI.",'Ethernet'],
    ['mcp2515','MCP2515 (contrôleur CAN)',"Contrôleur de bus CAN autonome, interface SPI, utilisé en réseau embarqué automobile/industriel.",'Bus_CAN'],
  ].map(([id,nom,def,wiki]) => { const t = icTemplate(8, nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Communication', complexite:'avance', def, wiki, alias:id }); }),

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
  ...[
    ['afficheur_7seg_double','Afficheur 7 segments double',"Deux chiffres 7 segments dans un seul boîtier (dizaines/unités).",'Afficheur_sept_segments'],
    ['afficheur_7seg_quad','Afficheur 7 segments quadruple',"Quatre chiffres 7 segments dans un seul boîtier (horloge, compteur).",'Afficheur_sept_segments'],
    ['matrice_led','Matrice LED 8x8',"Grille de 64 LED pilotée ligne par ligne/colonne par colonne pour afficher des motifs.",'Affichage_à_matrice_de_LED'],
    ['driver_afficheur','Driver d\'afficheur (MAX7219)',"Circuit dédié au pilotage d'une matrice LED ou de plusieurs afficheurs 7 segments avec peu de broches.",'MAX7219'],
    ['ecran_tft','Écran TFT couleur',"Petit écran couleur à matrice active, piloté en SPI (interfaces graphiques embarquées).",'Thin-film-transistor_liquid-crystal_display'],
    ['ecran_epaper','Écran e-paper (encre électronique)',"Affichage bistable très faible consommation, conserve l'image même hors tension.",'Papier_électronique'],
  ].map(([id,nom,def,wiki]) => { const t = icTemplate(id.includes('quad')?12:id.includes('double')?10:8, nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Affichage', def, wiki, alias:id }); }),

  // --- Références commerciales précises réutilisant un symbole déjà vérifié (§7 des notes en
  // cours) : la référence/le nom sont propres à la fiche, le symbole/brochage restent ceux de la
  // famille technique réelle (diode, transistor, MOSFET...) — pas de nouveau dessin à risque.
  ...[
    ['1n4001','1N4001','diode', 'V (seuil)', 0.9, [0.7,0.9,1.1], "Diode de redressement 1 A / 50 V, la plus courante de la série 1N400x.", 'diode redresseuse 1a'],
    ['1n4004','1N4004','diode', 'V (seuil)', 0.9, [0.7,0.9,1.1], "Diode de redressement 1 A / 400 V.", 'diode redresseuse 1a 400v'],
    ['1n4007','1N4007','diode', 'V (seuil)', 0.9, [0.7,0.9,1.1], "Diode de redressement 1 A / 1000 V, la plus utilisée en alimentation basse tension.", 'diode redresseuse 1a 1000v'],
    ['1n5401','1N5401','diode', 'V (seuil)', 0.9, [0.7,0.9,1.1], "Diode de redressement 3 A, pour des courants plus importants que la série 1N400x.", 'diode redresseuse 3a'],
    ['1n5408','1N5408','diode', 'V (seuil)', 0.9, [0.7,0.9,1.1], "Diode de redressement 3 A / 1000 V.", 'diode redresseuse 3a 1000v'],
    ['1n4148','1N4148','diode', 'V (seuil)', 0.6, [0.5,0.6,0.7], "Diode de commutation rapide signal faible, très répandue en électronique numérique/analogique.", 'diode signal rapide switching'],
    ['1n5817','1N5817','diode', 'V (seuil)', 0.3, [0.2,0.3,0.45], "Diode Schottky 1 A, faible chute de tension directe, commutation très rapide.", 'diode schottky 1a'],
    ['1n5819','1N5819','diode', 'V (seuil)', 0.3, [0.2,0.3,0.45], "Diode Schottky 1 A / 40 V, protection et redressement basse tension.", 'diode schottky 1a 40v'],
    ['bat85','BAT85','diode', 'V (seuil)', 0.3, [0.2,0.3,0.4], "Diode Schottky signal faible, commutation très rapide.", 'diode schottky signal'],
  ].map(([id,nom,baseId,unit,defaultValue,valueOptions,def,alias]) =>
    defRow(id, nom, T2, SYM[baseId], { unit, defaultValue, valueOptions, famille:'Diodes', def, wiki:'Diode', alias })),
  ...[
    ['zener_3v3','Zener 3V3','diode_zener',3.3,"Diode Zener stabilisant à 3,3 V, très utilisée pour référencer un niveau logique 3,3 V."],
    ['zener_5v1','Zener 5V1','diode_zener',5.1,"Diode Zener stabilisant à 5,1 V."],
    ['zener_6v2','Zener 6V2','diode_zener',6.2,"Diode Zener stabilisant à 6,2 V."],
    ['zener_9v1','Zener 9V1','diode_zener',9.1,"Diode Zener stabilisant à 9,1 V."],
    ['zener_12v','Zener 12V','diode_zener',12,"Diode Zener stabilisant à 12 V."],
    ['zener_15v','Zener 15V','diode_zener',15,"Diode Zener stabilisant à 15 V."],
    ['zener_18v','Zener 18V','diode_zener',18,"Diode Zener stabilisant à 18 V."],
    ['zener_24v','Zener 24V','diode_zener',24,"Diode Zener stabilisant à 24 V, protection d'alimentation 24 V industrielle."],
  ].map(([id,nom,baseId,v,def]) =>
    defRow(id, nom, T2, SYM[baseId], { unit:'V (Zener)', defaultValue:v, valueOptions:[v], famille:'Diodes', def, wiki:'Diode_Zener', alias:id })),
  ...[
    ['led_rouge','LED rouge 5mm','led',2.0,'rouge'], ['led_verte','LED verte 5mm','led',2.1,'verte'],
    ['led_jaune','LED jaune 5mm','led',2.1,'jaune'], ['led_bleue','LED bleue 5mm','led',3.2,'bleue'],
    ['led_blanche','LED blanche 5mm','led',3.2,'blanche'], ['led_orange','LED orange 5mm','led',2.0,'orange'],
    ['led_ir','LED infrarouge (émetteur)','led',1.2,'infrarouge (invisible, télécommande)'],
    ['led_uv','LED ultraviolette','led',3.4,'ultraviolette'],
    ['led_haute_puissance','LED de puissance (1W/3W)','led',3.2,'de forte puissance (éclairage, nécessite un dissipateur)'],
  ].map(([id,nom,baseId,v,couleur]) =>
    defRow(id, nom, T2, SYM[baseId], { unit:'V (seuil)', defaultValue:v, valueOptions:[v], famille:'Diodes', def:`LED ${couleur}, émet de la lumière visible ou non lorsqu'elle est traversée par un courant dans le bon sens.`, wiki:'Diode_électroluminescente', alias:id })),
  ...[
    ['tvs_diode','Diode TVS (protection)','diode_zener',0,"Diode conçue pour écrêter très rapidement une surtension transitoire (foudre, décharge électrostatique)."],
    ['varistance','Varistance (MOV)','diode_zener',0,"Composant dont la résistance chute fortement au-delà d'une tension seuil, pour absorber les surtensions."],
  ].map(([id,nom,baseId,v,def]) =>
    defRow(id, nom, T2, SYM[baseId], { famille:'Protections', def, wiki:'Parasurtenseur', alias:id })),
  ...[
    ['2n2222','2N2222 (NPN)','transistor_npn',"Transistor bipolaire NPN usage général, très répandu (commutation, amplification faible signal)."],
    ['2n3904','2N3904 (NPN)','transistor_npn',"Transistor bipolaire NPN usage général en boîtier TO-92."],
    ['2n4401','2N4401 (NPN)','transistor_npn',"Transistor bipolaire NPN pour commutation, gain élevé."],
    ['bc547','BC547 (NPN)','transistor_npn',"Transistor bipolaire NPN très courant en apprentissage et petits montages."],
    ['bc548','BC548 (NPN)','transistor_npn',"Transistor bipolaire NPN, variante du BC547."],
    ['bc549','BC549 (NPN)','transistor_npn',"Transistor bipolaire NPN faible bruit."],
    ['bc337','BC337 (NPN)','transistor_npn',"Transistor bipolaire NPN de puissance moyenne (courant plus élevé que le BC547)."],
    ['tip41','TIP41 (NPN)','transistor_npn',"Transistor bipolaire NPN de puissance, boîtier TO-220."],
    ['tip120','TIP120 (Darlington NPN)','transistor_npn',"Transistor Darlington NPN de puissance, fort gain en courant."],
    ['bd139','BD139 (NPN)','transistor_npn',"Transistor bipolaire NPN de puissance moyenne, boîtier TO-126."],
    ['2n2907','2N2907 (PNP)','transistor_pnp',"Transistor bipolaire PNP usage général, complémentaire du 2N2222."],
    ['2n3906','2N3906 (PNP)','transistor_pnp',"Transistor bipolaire PNP usage général en boîtier TO-92."],
    ['bc557','BC557 (PNP)','transistor_pnp',"Transistor bipolaire PNP, complémentaire du BC547."],
    ['bc558','BC558 (PNP)','transistor_pnp',"Transistor bipolaire PNP, variante du BC557."],
    ['bc327','BC327 (PNP)','transistor_pnp',"Transistor bipolaire PNP de puissance moyenne."],
    ['tip42','TIP42 (PNP)','transistor_pnp',"Transistor bipolaire PNP de puissance, complémentaire du TIP41."],
    ['tip125','TIP125 (Darlington PNP)','transistor_pnp',"Transistor Darlington PNP de puissance, complémentaire du TIP120."],
    ['bd140','BD140 (PNP)','transistor_pnp',"Transistor bipolaire PNP de puissance moyenne, complémentaire du BD139."],
  ].map(([id,nom,baseId,def]) =>
    defRow(id, nom, T3_TRANSISTOR, SYM[baseId], { famille:'Transistors', def, wiki:baseId==='transistor_npn'?'Transistor_bipolaire':'Transistor_bipolaire', alias:id })),
  ...[
    ['irf520','IRF520 (MOSFET canal N)','mosfet_n',"MOSFET canal N de puissance moyenne, commutation de charges (moteurs, LED de puissance)."],
    ['irf540','IRF540 (MOSFET canal N)','mosfet_n',"MOSFET canal N de puissance, très utilisé en commutation haute intensité."],
    ['irfz44n','IRFZ44N (MOSFET canal N)','mosfet_n',"MOSFET canal N logic-level, pilotable directement par une sortie microcontrôleur."],
    ['irlz44n','IRLZ44N (MOSFET canal N logic-level)','mosfet_n',"MOSFET canal N logic-level basse tension de grille, idéal en pilotage 5 V/3,3 V."],
    ['2n7000','2N7000 (MOSFET canal N signal)','mosfet_n',"Petit MOSFET canal N pour commutation de signal faible puissance."],
    ['bs170','BS170 (MOSFET canal N signal)','mosfet_n',"Petit MOSFET canal N usage général, boîtier TO-92."],
    ['irf9540','IRF9540 (MOSFET canal P)','mosfet_p',"MOSFET canal P de puissance, commutation côté haut (high-side)."],
    ['irf4905','IRF4905 (MOSFET canal P)','mosfet_p',"MOSFET canal P de puissance pour commutation côté haut à fort courant."],
  ].map(([id,nom,baseId,def]) =>
    defRow(id, nom, T3_MOSFET, SYM[baseId], { famille:'Transistors', def, wiki:'MOSFET', alias:id })),
  ...[
    ['2n5457','2N5457 (JFET canal N)',"Transistor à effet de champ à jonction, utilisé en amplification faible bruit et sources de courant."],
    ['j201','J201 (JFET canal N)',"Petit JFET canal N pour applications analogiques faible signal."],
  ].map(([id,nom,def]) => defRow(id, nom, T3_MOSFET, SYM['jfet'], { famille:'Transistors', def, wiki:'Transistor_à_effet_de_champ', alias:id })),

  // --- Capteurs et modules réels (§9, très demandés en projets pédagogiques) ---
  ...[
    ['dht11','DHT11 (température/humidité)',"Capteur numérique combiné de température et d'humidité relative, faible coût.",'DHT11'],
    ['dht22','DHT22 (température/humidité précis)',"Capteur numérique température/humidité plus précis et plus rapide que le DHT11.",'DHT22'],
    ['ds18b20','DS18B20 (température numérique)',"Capteur de température numérique à bus 1-Wire, étanche en version sonde.",'DS18B20'],
    ['lm35','LM35 (température analogique)',"Capteur de température analogique, tension de sortie proportionnelle en °C.",'LM35'],
    ['tmp36','TMP36 (température analogique)',"Capteur de température analogique à faible consommation.",'TMP36'],
    ['bmp180','BMP180 (pression barométrique)',"Capteur de pression atmosphérique et de température, bus I²C.",'BMP180'],
    ['bmp280','BMP280 (pression barométrique)',"Capteur de pression atmosphérique haute précision, bus I²C/SPI.",'BMP280'],
    ['bme280','BME280 (pression/humidité/température)',"Capteur combiné pression, humidité et température, bus I²C/SPI.",'BME280'],
    ['mpu6050','MPU6050 (accéléromètre/gyroscope)',"Centrale inertielle 6 axes (accéléromètre + gyroscope) sur bus I²C.",'MPU-6050'],
    ['mpu9250','MPU9250 (centrale inertielle 9 axes)',"Centrale inertielle 9 axes (accéléromètre + gyroscope + magnétomètre).",'MPU-9250'],
    ['hc_sr04','HC-SR04 (télémètre ultrason)',"Mesure une distance par temps de vol d'une impulsion ultrasonore.",'Capteur_ultrasonique'],
    ['hc_sr501','HC-SR501 (détecteur PIR)',"Détecteur de mouvement infrarouge passif, portée et temporisation réglables.",'Capteur_de_mouvement'],
    ['tcrt5000','TCRT5000 (capteur réflectif IR)',"Détecte la présence/couleur d'une surface proche par réflexion infrarouge (suivi de ligne).",'Capteur_optique'],
    ['vs1838b','VS1838B (récepteur infrarouge)',"Récepteur infrarouge démodulé pour télécommandes.",'Récepteur_infrarouge'],
    ['mq2','MQ-2 (gaz inflammables/fumée)',"Capteur de gaz semi-conducteur sensible au GPL, fumée et gaz inflammables.",'Capteur_de_gaz'],
    ['mq3','MQ-3 (alcool)',"Capteur de gaz sensible aux vapeurs d'alcool.",'Capteur_de_gaz'],
    ['mq7','MQ-7 (monoxyde de carbone)',"Capteur de gaz sensible au monoxyde de carbone.",'Capteur_de_gaz'],
    ['mq135','MQ-135 (qualité de l\'air)',"Capteur de gaz sensible à divers polluants (CO2, ammoniac, benzène).",'Capteur_de_gaz'],
    ['fc28','FC-28 / YL-69 (humidité du sol)',"Mesure la teneur en eau du sol par résistance entre deux électrodes.",'Capteur_d\'humidité'],
    ['acs712','ACS712 (capteur de courant)',"Mesure un courant par effet Hall, sortie analogique proportionnelle.",'Capteur_à_effet_Hall'],
    ['ina219','INA219 (courant/tension I²C)',"Mesure courant, tension bus et puissance, communication I²C.",'INA219'],
    ['hx711','HX711 (amplificateur de cellule de charge)',"Convertisseur analogique-numérique 24 bits dédié aux capteurs de pesée.",'HX711'],
    ['vl53l0x','VL53L0X (télémètre laser)',"Mesure une distance courte portée par temps de vol laser (ToF), bus I²C.",'VL53L0X'],
    ['sw420','SW-420 (capteur de vibration/choc)',"Détecte un choc ou une vibration via un interrupteur à bille.",'Capteur_de_vibration'],
    ['tcs3200','TCS3200 (capteur de couleur)',"Identifie une couleur en mesurant l'intensité lumineuse rouge/vert/bleu réfléchie.",'Capteur_de_couleur'],
    ['ky018','Module LDR (photorésistance)',"Module prêt à l'emploi intégrant une photorésistance et un comparateur.",'Photorésistance'],
    ['module_relais','Module relais 1 canal',"Carte relais prête à l'emploi pilotable par un signal logique faible courant.",'Relais_(électricité)'],
    ['module_relais_4','Module relais 4 canaux',"Carte de 4 relais indépendants pilotables par signaux logiques.",'Relais_(électricité)'],
    ['ds3231','Module RTC DS3231',"Horloge temps réel de haute précision avec pile de sauvegarde, bus I²C.",'Horloge_temps_réel'],
    ['ds1307','Module RTC DS1307',"Horloge temps réel économique avec pile de sauvegarde, bus I²C.",'Horloge_temps_réel'],
    ['joystick_module','Module joystick analogique',"Manette 2 axes (potentiomètres) + bouton-poussoir intégré.",'Manette_de_jeu'],
    ['clavier_matriciel','Clavier matriciel 4x4',"Clavier à membrane organisé en matrice de lignes/colonnes pour saisie de code.",'Clavier_matriciel'],
    ['capteur_flamme','Capteur de flamme',"Détecte la lumière infrarouge émise par une flamme.",'Détecteur_de_flamme'],
    ['capteur_inclinaison','Capteur d\'inclinaison (bille)',"Interrupteur mécanique à bille détectant un changement d'orientation.",'Inclinomètre'],
    ['fingerprint','Capteur d\'empreinte digitale',"Module optique de capture et de reconnaissance d'empreinte digitale.",'Biométrie'],
    ['pulse_sensor','Capteur de battement cardiaque',"Mesure optiquement (photopléthysmographie) le rythme cardiaque au doigt ou à l'oreille.",'Photopléthysmographie'],
  ].map(([id,nom,def,wiki]) => { const t = icTemplate(id.includes('relais_4')?10:6, nom.split(' ')[0].split('(')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Capteurs et modules', complexite:'avance', def, wiki, alias:id }); }),

  // --- Régulateurs de tension à valeur fixe (§7 des notes en cours : chaque référence est un
  // circuit intégré réellement différent — référence de tension interne propre — même si le
  // boîtier/brochage générique IN-OUT-GND est partagé par toute la famille 78xx/79xx). ---
  ...[
    ['reg_7806','7806 (régulateur +6V)',6], ['reg_7808','7808 (régulateur +8V)',8],
    ['reg_7809','7809 (régulateur +9V)',9], ['reg_7815','7815 (régulateur +15V)',15],
    ['reg_7818','7818 (régulateur +18V)',18], ['reg_7824','7824 (régulateur +24V)',24],
  ].map(([id,nom,v]) => defRow(id, nom, T3_REGULATEUR, SYM['regulateur'],
    { unit:'V', defaultValue:v, valueOptions:[v], famille:'Circuits intégrés', def:`Régulateur linéaire délivrant une tension fixe de +${v} V, boîtier TO-220 (série 78xx).`, wiki:'Régulateur_de_tension', alias:id })),
  ...[
    ['reg_7905','7905 (régulateur −5V)',-5], ['reg_7909','7909 (régulateur −9V)',-9],
    ['reg_7912','7912 (régulateur −12V)',-12], ['reg_7915','7915 (régulateur −15V)',-15],
    ['reg_7924','7924 (régulateur −24V)',-24],
  ].map(([id,nom,v]) => defRow(id, nom, T3_REGULATEUR, SYM['regulateur'],
    { unit:'V', defaultValue:v, valueOptions:[v], famille:'Circuits intégrés', def:`Régulateur linéaire délivrant une tension négative fixe de ${v} V, complément de la série 78xx pour une alimentation symétrique.`, wiki:'Régulateur_de_tension', alias:id })),
  ...[
    ['lm1117_33','LM1117-3.3 (LDO 3,3V)',3.3,"Régulateur linéaire faible chute de tension (LDO) délivrant 3,3 V, très utilisé en électronique numérique."],
    ['lm1117_50','LM1117-5.0 (LDO 5V)',5,"Régulateur linéaire faible chute de tension (LDO) délivrant 5 V."],
    ['ams1117_33','AMS1117-3.3 (LDO SMD 3,3V)',3.3,"Régulateur LDO 3,3 V en boîtier CMS, très répandu sur les petites cartes électroniques."],
    ['mcp1700','MCP1700 (LDO très faible courant)',3.3,"Régulateur LDO à très faible consommation propre, adapté aux montages sur pile."],
  ].map(([id,nom,v,def]) => defRow(id, nom, T3_REGULATEUR, SYM['regulateur'],
    { unit:'V', defaultValue:v, valueOptions:[v], famille:'Circuits intégrés', def, wiki:'Régulateur_de_tension', alias:id })),

  // --- Transistors de puissance et portes logiques supplémentaires ---
  ...[
    ['2n3055','2N3055 (NPN puissance)','transistor_npn',"Transistor bipolaire NPN de puissance historique (amplification/commutation forte puissance)."],
    ['tip3055','TIP3055 (NPN puissance)','transistor_npn',"Transistor bipolaire NPN de puissance, équivalent moderne du 2N3055."],
    ['bd135','BD135 (NPN)','transistor_npn',"Transistor bipolaire NPN de puissance moyenne, boîtier TO-126."],
    ['mje3055','MJE3055 (NPN puissance)','transistor_npn',"Transistor bipolaire NPN de puissance moyenne, boîtier TO-220."],
    ['mj2955','MJ2955 (PNP puissance)','transistor_pnp',"Transistor bipolaire PNP de puissance, complémentaire du 2N3055."],
    ['bd136','BD136 (PNP)','transistor_pnp',"Transistor bipolaire PNP de puissance moyenne, complémentaire du BD135."],
    ['mje2955','MJE2955 (PNP puissance)','transistor_pnp',"Transistor bipolaire PNP de puissance moyenne, complémentaire du MJE3055."],
  ].map(([id,nom,baseId,def]) => defRow(id, nom, T3_TRANSISTOR, SYM[baseId], { famille:'Transistors', def, wiki:'Transistor_bipolaire', alias:id })),
  ...[
    ['irfp250','IRFP250 (MOSFET canal N puissance)','mosfet_n',"MOSFET canal N haute puissance, boîtier TO-247 (amplification audio, onduleurs)."],
    ['irf640','IRF640 (MOSFET canal N)','mosfet_n',"MOSFET canal N de puissance moyenne, alimentations à découpage."],
    ['irf730','IRF730 (MOSFET canal N)','mosfet_n',"MOSFET canal N haute tension, alimentations à découpage."],
  ].map(([id,nom,baseId,def]) => defRow(id, nom, T3_MOSFET, SYM[baseId], { famille:'Transistors', def, wiki:'MOSFET', alias:id })),

  // --- Portes logiques supplémentaires en boîtier réel ---
  ...[
    ['ci_7410','74HC10 (triple NAND 3 entrées)','Trois portes NON-ET à 3 entrées dans un seul boîtier.',14],
    ['ci_7420','74HC20 (double NAND 4 entrées)','Deux portes NON-ET à 4 entrées dans un seul boîtier.',14],
    ['ci_7427','74HC27 (triple NOR 3 entrées)','Trois portes NON-OU à 3 entrées dans un seul boîtier.',14],
    ['ci_7430','74HC30 (NAND 8 entrées)','Une seule porte NON-ET à 8 entrées.',14],
    ['ci_7414','74HC14 (hex NOT trigger de Schmitt)','Six inverseurs à entrée déclencheur de Schmitt, robustes aux signaux lents/bruités.',14],
    ['ci_74125','74HC125 (quad buffer 3 états)','Quatre tampons à sortie trois états, activables indépendamment.',14],
    ['ci_74266','74HC266 (quad XNOR)','Quatre portes OU exclusif inversé à 2 entrées.',14],
  ].map(([id,nom,def,pins]) => { const t = icTemplate(pins, nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Logique numérique', complexite:'avance', def, alias:id }); }),

  // --- Modules d'alimentation prêts à l'emploi (très utilisés en projets pédagogiques) ---
  ...[
    ['module_buck_lm2596','Module abaisseur (buck) LM2596',"Carte convertisseur DC-DC abaisseur réglable, très utilisée pour adapter une tension d'alimentation.",'Convertisseur_Buck'],
    ['module_boost_mt3608','Module élévateur (boost) MT3608',"Carte convertisseur DC-DC élévateur réglable.",'Convertisseur_Boost'],
    ['module_chargeur_tp4056','Module chargeur Li-ion TP4056',"Carte de charge/protection pour cellule lithium-ion, entrée micro-USB ou USB-C.",'Batterie_lithium-ion'],
    ['module_usbc_pd','Module déclencheur USB-C PD',"Négocie une tension spécifique auprès d'un chargeur USB-C Power Delivery.",'USB_Power_Delivery'],
  ].map(([id,nom,def,wiki]) => { const t = icTemplate(4, nom.split(' ')[1]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Circuits intégrés', complexite:'avance', def, wiki, alias:id }); }),
  defRow('connecteur_jack_dc','Connecteur jack d\'alimentation (DC)', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="30" cy="15" r="9" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="30" cy="15" r="3" fill="currentColor"/>`,
    { famille:'Câblage', def:"Connecteur cylindrique standard pour alimenter un appareil en courant continu.", wiki:'Connecteur_d\'alimentation', alias:'jack dc alimentation 5.5mm' }),
  defRow('connecteur_xt60','Connecteur XT60', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="9" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'XT60',4.5)}`,
    { famille:'Câblage', def:"Connecteur débrochable haute intensité, standard des batteries LiPo (drones, modélisme).", wiki:'Connecteur_électrique', alias:'xt60 xt30 lipo drone' }),

  // --- Capteurs et modules — deuxième série (couverture élargie, même gabarit vérifié) ---
  ...[
    ['mq4','MQ-4 (gaz méthane/GNV)',"Capteur de gaz sensible au méthane et gaz naturel."],
    ['mq5','MQ-5 (gaz naturel/GPL)',"Capteur de gaz sensible au GPL et gaz naturel."],
    ['mq6','MQ-6 (GPL/butane)',"Capteur de gaz sensible au GPL et au butane."],
    ['mq8','MQ-8 (hydrogène)',"Capteur de gaz sensible à l'hydrogène."],
    ['mq9','MQ-9 (CO/gaz inflammables)',"Capteur de gaz sensible au monoxyde de carbone et aux gaz inflammables."],
    ['yfs201','YF-S201 (débitmètre à eau)',"Mesure le débit d'un liquide par rotation d'une turbine interne."],
    ['sct013','SCT-013 (transformateur de courant pince)',"Mesure un courant alternatif sans contact par pince à ouvrir autour du conducteur."],
    ['sht31','SHT31 (température/humidité précis)',"Capteur numérique température/humidité de haute précision, bus I²C."],
    ['bmp388','BMP388 (pression barométrique précis)',"Capteur de pression atmosphérique de haute précision, bus I²C/SPI."],
    ['neom8n','NEO-M8N (module GPS précis)',"Récepteur GPS/GNSS multi-constellations, précision améliorée par rapport au NEO-6M."],
    ['adxl345','ADXL345 (accéléromètre 3 axes)',"Mesure l'accélération sur trois axes, bus I²C/SPI."],
    ['l3g4200d','L3G4200D (gyroscope 3 axes)',"Mesure la vitesse de rotation sur trois axes."],
    ['hmc5883l','HMC5883L (boussole numérique)',"Magnétomètre 3 axes utilisé comme boussole électronique."],
    ['bh1750','BH1750 (capteur de luminosité)',"Mesure l'éclairement lumineux ambiant en lux, bus I²C."],
    ['guva_s12sd','GUVA-S12SD (capteur UV)',"Mesure l'intensité du rayonnement ultraviolet."],
    ['capteur_pluie','Capteur de pluie',"Détecte la présence de gouttes d'eau sur une plaque à pistes conductrices."],
    ['capteur_niveau_eau','Capteur de niveau d\'eau (résistif)',"Mesure un niveau d'eau approximatif par résistance entre pistes conductrices immergées."],
    ['module_ir_obstacle','Module évitement d\'obstacle infrarouge',"Détecte un obstacle proche par réflexion infrarouge (robot mobile)."],
    ['capteur_sol_capacitif','Capteur d\'humidité du sol capacitif',"Mesure l'humidité du sol par capacité, plus durable qu'un capteur résistif (pas de corrosion)."],
  ].map(([id,nom,def]) => { const t = icTemplate(6, nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Capteurs et modules', complexite:'avance', def, alias:id }); }),

  // --- Communication — deuxième série ---
  ...[
    ['max485','MAX485 (transceiver RS-485)',"Interface de communication série RS-485 différentielle, robuste sur de longues distances."],
    ['cc2530','CC2530 (module Zigbee)',"Module radio Zigbee pour réseaux de capteurs sans fil maillés basse consommation."],
    ['lorawan_module','Module LoRaWAN',"Module radio longue portée conforme au protocole LoRaWAN (objets connectés bas débit)."],
    ['can_tja1050','TJA1050 (transceiver CAN)',"Adapte les niveaux logiques d'un contrôleur CAN au bus différentiel CAN physique."],
  ].map(([id,nom,def]) => { const t = icTemplate(8, nom.split(' ')[0]);
    return defRow(id, nom, t.terminals, t.sym, { famille:'Communication', complexite:'avance', def, alias:id }); }),
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
  defRow('moteur_dc_serie','Moteur DC série', T2, TPL.circleLetter('M'),
    { unit:'W', defaultValue:200, valueOptions:[50,200,500,1000], famille:'Machines', def:"Moteur à courant continu dont l'inducteur est en série avec l'induit : fort couple au démarrage (traction, outillage).", wiki:'Moteur_à_courant_continu', alias:'moteur cc serie fort couple' }),
  defRow('moteur_dc_shunt','Moteur DC shunt', T2, TPL.circleLetter('M'),
    { unit:'W', defaultValue:200, valueOptions:[50,200,500,1000], famille:'Machines', def:"Moteur à courant continu dont l'inducteur est en parallèle de l'induit : vitesse stable quelle que soit la charge.", wiki:'Moteur_à_courant_continu', alias:'moteur cc shunt derivation' }),
  defRow('moteur_universel','Moteur universel', T2, TPL.circleLetter('M~='),
    { unit:'W', defaultValue:500, valueOptions:[200,500,800,1500], famille:'Machines', def:"Moteur série fonctionnant aussi bien en alternatif qu'en continu, utilisé dans l'outillage portatif.", wiki:'Moteur_universel', alias:'outillage portatif perceuse' }),
  defRow('moteur_pas_a_pas','Moteur pas-à-pas', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,'PAP',6)}`,
    { unit:'pas/tour', defaultValue:200, valueOptions:[48,200,400], famille:'Machines', def:"Moteur tournant par petits incréments angulaires précis, sans capteur de position (CNC, robotique).", wiki:'Moteur_pas-à-pas', alias:'stepper 28byj-48 nema17' }),
  defRow('variateur_vitesse','Variateur de vitesse (VFD)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'VFD',6.5)}`,
    { unit:'kW', defaultValue:1.5, valueOptions:[0.75,1.5,4,7.5,15], famille:'Appareillage', def:"Fait varier la fréquence/tension d'alimentation d'un moteur pour en régler la vitesse en continu.", wiki:'Variateur_de_fréquence', alias:'variateur frequence drive inverter' }),
  defRow('gradateur_puissance','Gradateur de puissance', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'GRAD',5.5)}`,
    { unit:'A', defaultValue:16, valueOptions:[8,16,25,40], famille:'Appareillage', def:"Règle la puissance délivrée à une charge alternative en découpant la tension (chauffage, éclairage industriel).", wiki:'Gradateur_de_lumière', alias:'dimmer industriel' }),
  defRow('redresseur_triphase','Redresseur triphasé (pont de diodes)', [[0,4],[0,15],[0,26],[60,10],[60,20]], `${leadLine(0,4,20,4)}${leadLine(0,15,20,15)}${leadLine(0,26,20,26)}<rect x="20" y="2" width="20" height="26" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'~/=',7)}${leadLine(40,10,60,10)}${leadLine(40,20,60,20)}`,
    { famille:'Appareillage', def:"Convertit une tension triphasée alternative en tension continue pour l'alimentation de puissance.", wiki:'Redressement_(électricité)', alias:'pont diodes triphase redressement puissance' }),
  defRow('hacheur','Hacheur (convertisseur DC-DC)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'DC/DC',5)}`,
    { famille:'Appareillage', def:"Convertit une tension continue en une autre tension continue en découpant le courant à haute fréquence.", wiki:'Hacheur_(électronique)', alias:'chopper buck boost' }),
  defRow('relais_auxiliaire','Relais auxiliaire de commande', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${[0,1,2,3].map(i=>`<path d="M${16+i*3},8 a3.5,7 0 0 1 0,14" fill="none" stroke="currentColor" stroke-width="1.4"/>`).join('')}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<line x1="44" y1="22" x2="58" y2="10" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'V (bobine)', defaultValue:24, valueOptions:[12,24,48,230], famille:'Appareillage', def:"Petit relais utilisé pour la logique de commande d'une armoire, sans couper directement la puissance.", wiki:'Relais_(électricité)', alias:'relais commande auxiliaire' }),
  defRow('disjoncteur_moteur','Disjoncteur moteur (magnétothermique)', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="38" y2="8" stroke="currentColor" stroke-width="2"/>${ctext(30,6,'M',6)}`,
    { unit:'A', defaultValue:10, valueOptions:[2.5,6.3,10,16,25], famille:'Protections', def:"Combine protection magnétique (court-circuit) et thermique (surcharge) réglable, dédié à un moteur.", wiki:'Disjoncteur_moteur', alias:'disjoncteur moteur reglable' }),
  defRow('sectionneur_porte_fusible','Sectionneur porte-fusible', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="10" width="24" height="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="18" y1="15" x2="42" y2="15" stroke="currentColor" stroke-width="1"/>`,
    { unit:'A', defaultValue:32, valueOptions:[16,32,63,100], famille:'Protections', def:"Sectionneur intégrant un fusible remplaçable, isolement et protection dans le même appareil.", wiki:'Sectionneur', alias:'sectionneur fusible' }),
  defRow('parafoudre_htA','Parafoudre HTA', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="26" y1="20" x2="34" y2="10" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'kV', defaultValue:24, valueOptions:[12,24,36], famille:'Protections', def:"Protège un poste haute tension contre les surtensions de foudre ou de manœuvre.", wiki:'Parafoudre', alias:'parafoudre haute tension' }),
  defRow('poste_transformation','Poste de transformation', T6_TRIPHASE, `${leadLine(0,4,14,4)}${leadLine(0,15,14,15)}${leadLine(0,26,14,26)}${leadLine(46,4,60,4)}${leadLine(46,15,60,15)}${leadLine(46,26,60,26)}<rect x="14" y="1" width="32" height="28" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'HTA/BT',5)}`,
    { famille:'Distribution', def:"Ouvrage transformant la tension du réseau de distribution (HTA) vers la basse tension.", wiki:'Poste_de_transformation_électrique', alias:'poste hta bt transformation' }),
  defRow('groupe_electrogene','Groupe électrogène', T2, `${TPL.circleLetter('GE')}`,
    { unit:'kVA', defaultValue:20, valueOptions:[5,10,20,50,100], famille:'Sources', def:"Génère de l'électricité de secours à partir d'un moteur thermique couplé à un alternateur.", wiki:'Groupe_électrogène', alias:'generatrice secours diesel' }),
  defRow('varmetre','Varmètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="20" font-size="9" fill="currentColor">VAR</text>`,
    { famille:'Mesure', def:"Mesure la puissance réactive échangée dans une installation alternative.", wiki:'Puissance_réactive', alias:'mesure puissance reactive' }),
  defRow('cosphimetre','Cosphimètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="17" y="20" font-size="8" fill="currentColor">cosφ</text>`,
    { famille:'Mesure', def:"Mesure le facteur de puissance (déphasage entre tension et courant) d'une installation.", wiki:'Facteur_de_puissance', alias:'facteur puissance mesure' }),
  defRow('analyseur_reseau','Analyseur de réseau électrique', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'ANA',6.5)}`,
    { famille:'Mesure', def:"Mesure et enregistre en continu tensions, courants, puissances et harmoniques d'une installation.", wiki:'Analyseur_de_réseau', alias:'centrale mesure harmoniques' }),
  defRow('relais_protection','Relais de protection numérique', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'PROT',5.5)}`,
    { famille:'Protections', def:"Surveille en continu les grandeurs électriques et ordonne l'ouverture d'un disjoncteur en cas de défaut.", wiki:'Relais_de_protection', alias:'protection numerique surintensite' }),
  defRow('condensateur_puissance','Batterie de condensateurs (compensation)', T2, `${leadLine(0,15,26,15)}${leadLine(34,15,60,15)}${leadLine(26,4,26,26)}${leadLine(34,4,34,26)}`,
    { unit:'kVAR', defaultValue:25, valueOptions:[5,25,50,100], famille:'Charges', def:"Compense l'énergie réactive d'une installation pour améliorer le facteur de puissance.", wiki:'Compensation_de_l\'énergie_réactive', alias:'compensation cosphi condensateurs' }),
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
  defRow('interrupteur_va_et_vient','Va-et-vient (Schéma 6 / C6)', T3_SPDT,
    `${leadLine(0,15,16,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/>${leadLine(44,6,60,6)}${leadLine(44,24,60,24)}<circle cx="44" cy="6" r="2" fill="currentColor"/><circle cx="44" cy="24" r="2" fill="currentColor"/><line x1="16" y1="15" x2="42" y2="7" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Commande éclairage', pinNames:['L (commun)','1 (navette)','2 (navette)'],
      def:"Commutateur unipolaire à un contact inverseur (SPDT) : la commune L bascule vers la navette 1 ou 2. Utilisé par paire (relié par les deux navettes) pour commander un même point lumineux depuis deux endroits différents.", wiki:'Va-et-vient_(électricité)', alias:'commutateur va et vient schema 6 c6' }),
  defRow('interrupteur_double','Interrupteur double / double allumage (Schéma 5 / C5)', T3_SPDT,
    `${leadLine(0,15,10,15)}${leadLine(10,8,10,22)}<circle cx="10" cy="8" r="2" fill="currentColor"/><circle cx="10" cy="22" r="2" fill="currentColor"/>${leadLine(44,6,60,6)}${leadLine(44,24,60,24)}<circle cx="44" cy="6" r="2" fill="currentColor"/><circle cx="44" cy="24" r="2" fill="currentColor"/><line x1="10" y1="8" x2="40" y2="7" stroke="currentColor" stroke-width="2"/><line x1="10" y1="22" x2="40" y2="23" stroke="currentColor" stroke-width="2"/>`,
    { famille:'Commande éclairage', pinNames:['L (commun)','1 (sortie zone 1)','2 (sortie zone 2)'],
      def:"Deux contacts simples indépendants sous un même mécanisme, partageant une phase commune : commande séparément deux zones d'éclairage depuis un seul point.", wiki:'Va-et-vient_(électricité)', alias:'commutateur double allumage schema 5 c5' }),
  defRow('interrupteur_bipolaire','Interrupteur bipolaire (Schéma 2 / C2)', T4,
    `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}<circle cx="16" cy="8" r="2" fill="currentColor"/><circle cx="16" cy="22" r="2" fill="currentColor"/>${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<circle cx="44" cy="8" r="2" fill="currentColor"/><circle cx="44" cy="22" r="2" fill="currentColor"/><line x1="16" y1="8" x2="40" y2="4" stroke="currentColor" stroke-width="2"/><line x1="16" y1="22" x2="40" y2="18" stroke="currentColor" stroke-width="2"/><line x1="30" y1="4" x2="30" y2="18" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>`,
    { famille:'Commande éclairage', pinNames:['L1 (entrée)','L2 (entrée)','1 (sortie L1)','2 (sortie L2)'],
      def:"Coupe simultanément phase et neutre (2 contacts couplés) : isolation totale d'un circuit, utilisé en milieu humide ou extérieur.", wiki:'Interrupteur_(électricité)', alias:'interrupteur bipolaire schema 2 c2' }),
  defRow('permutateur','Permutateur (Schéma 7 / C7)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'PERM',5.5)}`,
    { famille:'Commande éclairage', pinNames:['L1 (entrée navette)','L2 (entrée navette)','1 (sortie navette)','2 (sortie navette)'],
      def:"Double inverseur croisé s'intercalant entre deux va-et-vient pour ajouter un 3ᵉ point de commande (ou plus) sur une même ligne d'éclairage.", wiki:'Va-et-vient_(électricité)', alias:'permutateur schema 7 c7 troisieme point commande' }),
  defRow('telerupteur','Télérupteur', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'TL',7)}`,
    { famille:'Commande éclairage', pinNames:['1 (puissance, entrée)','A1 (bobine, commande poussoirs)','2 (puissance, sortie vers lampe)','A2 (bobine, neutre)'],
      def:"Bascule un circuit d'éclairage à chaque impulsion reçue d'un ou plusieurs boutons-poussoirs (relais bistable) : contact de puissance 1-2, bobine de commande A1-A2.", wiki:'Télérupteur', alias:'telerupteur bistable' }),
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
  defRow('disjoncteur_branchement','Disjoncteur de branchement (AGCP)', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="14" y="6" width="32" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'AGCP',5.5)}`,
    { unit:'A', defaultValue:30, valueOptions:[15,30,45,60], famille:'Distribution', def:"Appareil général de commande et de protection en tête d'installation, à l'origine de la distribution.", wiki:'Disjoncteur_de_branchement', alias:'agcp origine installation' }),
  defRow('rcbo','Disjoncteur différentiel combiné (RCBO)', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="14" y="6" width="32" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'Δ+M',5.5)}`,
    { unit:'A', defaultValue:16, valueOptions:[10,16,20,32], famille:'Protections', def:"Combine dans un seul appareil la protection différentielle et la protection contre les surintensités.", wiki:'Disjoncteur_différentiel', alias:'rcbo combine' }),
  defRow('parafoudre_type1','Parafoudre type 1', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'T1',7)}`,
    { unit:'kA', defaultValue:25, valueOptions:[12.5,25,50], famille:'Protections', def:"Protège contre les effets directs de la foudre (bâtiment avec paratonnerre/ligne aérienne HTA).", wiki:'Parafoudre', alias:'parafoudre coup direct foudre' }),
  defRow('parafoudre_type2','Parafoudre type 2', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'T2',7)}`,
    { unit:'kA', defaultValue:20, valueOptions:[5,15,20,40], famille:'Protections', def:"Protège contre les surtensions induites (effet indirect de la foudre), le plus courant en tableau domestique.", wiki:'Parafoudre', alias:'parafoudre tableau domestique' }),
  defRow('parafoudre_type3','Parafoudre type 3 (fin de ligne)', T2, `${leadLine(0,15,25,15)}${leadLine(35,15,60,15)}<rect x="22" y="6" width="16" height="18" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,20,'T3',7)}`,
    { unit:'kA', defaultValue:5, valueOptions:[2.5,5,10], famille:'Protections', def:"Protection fine complémentaire installée au plus près d'un équipement sensible.", wiki:'Parafoudre', alias:'parafoudre fin de ligne equipement' }),
  defRow('irve','Borne de recharge véhicule électrique (IRVE)', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<rect x="16" y="4" width="28" height="22" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'EV',9)}`,
    { unit:'kW', defaultValue:7.4, valueOptions:[3.7,7.4,11,22], famille:'Distribution', def:"Point de charge dédié à la recharge d'un véhicule électrique, avec protections spécifiques.", wiki:'Infrastructure_de_recharge_pour_véhicule_électrique', alias:'irve borne recharge vehicule electrique' }),
  defRow('chauffe_eau','Chauffe-eau électrique', T2, `${leadLine(0,15,12,15)}${leadLine(48,15,60,15)}<rect x="12" y="7" width="36" height="16" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="19" font-size="6.5" fill="currentColor">CHFE</text>`,
    { unit:'W', defaultValue:2400, valueOptions:[1200,1800,2400,3000], famille:'Bâtiment', def:"Appareil de production d'eau chaude sanitaire par résistance électrique.", wiki:'Chauffe-eau', alias:'ballon eau chaude cumulus' }),
  defRow('thermostat','Thermostat d\'ambiance', T2, TPL.boxLabel('°C'),
    { unit:'°C', defaultValue:19, valueOptions:[16,19,21,25], famille:'Commande éclairage', def:"Régule le fonctionnement du chauffage en fonction de la température ambiante mesurée.", wiki:'Thermostat', alias:'regulation chauffage' }),
  defRow('variateur_eclairage','Variateur d\'éclairage (mural)', T2, TPL.switchLike(true),
    { famille:'Commande éclairage', def:"Permet de régler l'intensité lumineuse d'un point d'éclairage compatible.", wiki:'Gradateur_de_lumière', alias:'dimmer mural variateur' }),
  defRow('minuterie_escalier','Minuterie d\'escalier', T2, TPL.boxLabel('MIN'),
    { unit:'s', defaultValue:120, valueOptions:[60,120,300], famille:'Commande éclairage', def:"Coupe automatiquement l'éclairage des parties communes après une durée réglable.", wiki:'Minuterie', alias:'minuterie temporisee escalier' }),
  defRow('detecteur_fumee','Détecteur de fumée (DAAF)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,19,'DAAF',5)}`,
    { famille:'Bâtiment', def:"Détecte les fumées d'incendie et déclenche une alarme sonore, obligatoire dans l'habitat.", wiki:'Détecteur_de_fumée', alias:'daaf alarme incendie' }),
  defRow('interphone','Interphone / visiophone', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'INT',7)}`,
    { famille:'Bâtiment', def:"Permet la communication (audio ou vidéo) entre l'entrée d'un logement et l'intérieur.", wiki:'Portier_(sécurité)', alias:'visiophone portier' }),
  defRow('prise_usb_murale','Prise murale avec USB', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'USB',5)}`,
    { unit:'A', defaultValue:16, valueOptions:[16,20], famille:'Bâtiment', def:"Prise de courant intégrant un ou deux ports de charge USB.", wiki:'Prise_de_courant', alias:'prise usb chargeur mural' }),
  defRow('prise_etanche','Prise de courant étanche (extérieur)', T2, `${leadLine(0,15,20,15)}${leadLine(40,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'IP44',4.5)}`,
    { unit:'A', defaultValue:16, valueOptions:[16,32], famille:'Bâtiment', def:"Prise de courant à indice de protection renforcé, pour installation extérieure ou humide.", wiki:'Prise_de_courant', alias:'prise ip44 exterieur etanche' }),
  defRow('luminaire_spot','Spot LED encastré', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="2"/><line x1="23" y1="8" x2="37" y2="22" stroke="currentColor" stroke-width="1.4"/><line x1="37" y1="8" x2="23" y2="22" stroke="currentColor" stroke-width="1.4"/>`,
    { unit:'W', defaultValue:5, valueOptions:[3,5,7,10], famille:'Éclairage', def:"Point d'éclairage LED encastré au plafond, faible puissance et longue durée de vie.", wiki:'Spot_(éclairage)', alias:'spot led encastre plafond' }),
  defRow('luminaire_tube_led','Tube LED (réglette)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="11" width="40" height="8" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
    { unit:'W', defaultValue:18, valueOptions:[9,18,24,36], famille:'Éclairage', def:"Réglette ou tube LED remplaçant les anciens tubes fluorescents, usage domestique ou tertiaire.", wiki:'Tube_LED', alias:'tube led reglette fluo' }),
  defRow('luminaire_panneau_led','Panneau LED (dalle)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="4" width="40" height="22" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { unit:'W', defaultValue:40, valueOptions:[24,36,40,60], famille:'Éclairage', def:"Dalle LED plate encastrée en faux-plafond, éclairage tertiaire courant.", wiki:'Panneau_LED', alias:'dalle led faux plafond' }),
  defRow('coffret_communication','Coffret de communication (VDI)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'VDI',6.5)}`,
    { famille:'Distribution', def:"Regroupe les arrivées et départs des réseaux de communication (téléphone, internet, TV) du logement.", wiki:'Réseau_de_communication_(bâtiment)', alias:'vdi coffret communication reseau' }),
  defRow('compteur_communicant','Compteur communicant', T2, `${TPL.circleLetter('kWh')}`,
    { famille:'Mesure', def:"Compteur d'énergie transmettant automatiquement ses index au gestionnaire de réseau.", wiki:'Compteur_communicant', alias:'compteur intelligent linky' }),
  defRow('chemin_de_cables','Chemin de câbles', T2, `${leadLine(0,15,60,15)}<rect x="4" y="11" width="52" height="8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>`,
    { famille:'Câblage', def:"Support métallique perforé recevant plusieurs câbles dans une installation tertiaire/industrielle.", wiki:'Chemin_de_câbles', alias:'dalle marchable cablage' }),
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
  defRow('panneau_pv_mono','Panneau PV monocristallin', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor" stroke-width="2"/>${[16,22,28,34,40,46].map(x=>leadLine(x,5,x,25)).join('')}`,
    { unit:'Wc', defaultValue:400, valueOptions:[300,400,500,600], famille:'Photovoltaïque',
      def:"Cellules en silicium monocristallin : meilleur rendement, coloration uniforme noire.", wiki:'Panneau_solaire', alias:'monocristallin haut rendement',
      pv:{ voc:41.2, vmp:34.5, isc:13.9, imp:13.1, tempCoef:-0.35 } }),
  defRow('panneau_pv_poly','Panneau PV polycristallin', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor" stroke-width="2"/>${[16,22,28,34,40,46].map(x=>leadLine(x,5,x,25)).join('')}`,
    { unit:'Wc', defaultValue:330, valueOptions:[250,330,400], famille:'Photovoltaïque',
      def:"Cellules en silicium polycristallin : coût plus faible, rendement légèrement inférieur au monocristallin.", wiki:'Panneau_solaire', alias:'polycristallin economique',
      pv:{ voc:38.5, vmp:31.2, isc:11.2, imp:10.6, tempCoef:-0.40 } }),
  defRow('panneau_pv_couche_mince','Panneau PV couche mince (thin-film)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="10" y="5" width="40" height="20" fill="none" stroke="currentColor" stroke-width="2"/>`,
    { unit:'Wc', defaultValue:120, valueOptions:[80,120,150], famille:'Photovoltaïque',
      def:"Technologie souple à faible poids et bon comportement par faible luminosité, rendement plus faible.", wiki:'Cellule_photovoltaïque_en_couche_mince', alias:'thin film souple flexible' }),
  defRow('diode_bypass','Diode de bypass (panneau PV)', T2, TPL.diodeBase(),
    { famille:'Photovoltaïque', def:"Court-circuite une section de cellules ombragées pour éviter un point chaud destructeur.", wiki:'Panneau_solaire', alias:'bypass diode ombrage' }),
  defRow('diode_antiretour_pv','Diode anti-retour (chaîne PV)', T2, TPL.diodeBase(),
    { famille:'Photovoltaïque', def:"Empêche un courant de circuler en sens inverse entre chaînes PV en parallèle.", wiki:'Panneau_solaire', alias:'diode anti-retour blocking' }),
  defRow('connecteur_mc4','Connecteur MC4', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<rect x="18" y="9" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,17,'MC4',5)}`,
    { famille:'Câblage', def:"Connecteur débrochable étanche standard pour le câblage des panneaux photovoltaïques.", wiki:'Connecteur_MC4', alias:'connecteur pv etanche' }),
  defRow('boite_jonction_pv','Boîte de jonction PV', T4_CROSS, `${leadLine(0,15,60,15)}${leadLine(30,0,30,30)}<rect x="20" y="5" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Câblage', def:"Boîtier au dos du panneau regroupant les diodes de bypass et les sorties de câblage.", wiki:'Panneau_solaire', alias:'junction box pv' }),
  defRow('disjoncteur_dc_pv','Disjoncteur DC photovoltaïque', T2, `${leadLine(0,15,18,15)}${leadLine(42,15,60,15)}<circle cx="18" cy="15" r="2.2" fill="currentColor"/><circle cx="42" cy="15" r="2.2" fill="currentColor"/><line x1="18" y1="15" x2="38" y2="8" stroke="currentColor" stroke-width="2"/>${ctext(30,6,'DC',6)}`,
    { unit:'A', defaultValue:16, valueOptions:[10,16,20,32], famille:'Protections', def:"Disjoncteur conçu pour interrompre un courant continu photovoltaïque, technologie d'arc différente d'un disjoncteur AC.", wiki:'Installation_photovoltaïque', alias:'disjoncteur continu pv' }),
  defRow('batterie_agm','Batterie plomb AGM', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'AGM',4.5)}`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,150,200], famille:'Stockage', def:"Batterie plomb à électrolyte absorbé, sans entretien et utilisable en toute position.", wiki:'Accumulateur_au_plomb', alias:'agm sans entretien' }),
  defRow('batterie_gel','Batterie plomb gel', T2, `${leadLine(0,15,22,15)}${leadLine(38,15,60,15)}<line x1="22" y1="6" x2="22" y2="24" stroke="currentColor" stroke-width="3"/><line x1="28" y1="10" x2="28" y2="20" stroke="currentColor" stroke-width="1.5"/><line x1="32" y1="6" x2="32" y2="24" stroke="currentColor" stroke-width="3"/><line x1="38" y1="10" x2="38" y2="20" stroke="currentColor" stroke-width="1.5"/>${ctext(30,29,'GEL',4.5)}`,
    { unit:'Ah', defaultValue:100, valueOptions:[50,100,150,200], famille:'Stockage', def:"Batterie plomb à électrolyte gélifié, bonne tenue aux décharges profondes répétées.", wiki:'Accumulateur_au_plomb', alias:'gel decharge profonde' }),
  defRow('onduleur_string','Onduleur string', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,17,'STR',6.5)}`,
    { unit:'W', defaultValue:5000, valueOptions:[3000,5000,10000], famille:'Conversion', def:"Onduleur unique convertissant la production d'une ou plusieurs chaînes de panneaux en série.", wiki:'Onduleur_(électronique)', alias:'string inverter' }),
  defRow('onduleur_central','Onduleur central', T4, `${leadLine(0,8,12,8)}${leadLine(0,22,12,22)}${leadLine(48,8,60,8)}${leadLine(48,22,60,22)}<rect x="12" y="3" width="36" height="24" fill="none" stroke="currentColor" stroke-width="2"/>${ctext(30,17,'CTR',6.5)}`,
    { unit:'kW', defaultValue:100, valueOptions:[50,100,250,500], famille:'Conversion', def:"Onduleur de forte puissance regroupant la production de tout un champ photovoltaïque (centrale au sol).", wiki:'Onduleur_(électronique)', alias:'central inverter centrale solaire' }),
  defRow('eolienne_verticale','Éolienne à axe vertical', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<circle cx="30" cy="15" r="10" fill="none" stroke="currentColor" stroke-width="1.6"/>${ctext(30,19,'V',8)}`,
    { unit:'W', defaultValue:600, valueOptions:[300,600,1000], famille:'Sources', def:"Éolienne dont l'axe de rotation est vertical, fonctionne quelle que soit la direction du vent.", wiki:'Éolienne_à_axe_vertical', alias:'eolienne verticale savonius darrieus' }),
  defRow('hydrolienne','Hydrolienne', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<circle cx="30" cy="15" r="12" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,19,'HL',8)}`,
    { unit:'kW', defaultValue:2, valueOptions:[0.5,2,5], famille:'Sources', def:"Convertit l'énergie cinétique d'un courant d'eau (fleuve, marée) en électricité.", wiki:'Hydrolienne', alias:'energie maree courant' }),
  defRow('pyranometre','Pyranomètre (capteur d\'irradiation)', T2, TPL.boxLabel('W/m²'),
    { famille:'Mesure', def:"Mesure le rayonnement solaire reçu, utile pour évaluer la production réelle d'une installation PV.", wiki:'Pyranomètre', alias:'capteur irradiance solaire' }),
  defRow('data_logger_pv','Enregistreur de données (data logger)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'LOG',6.5)}`,
    { famille:'Mesure', def:"Enregistre en continu les grandeurs de production/consommation pour analyse et supervision.", wiki:'Enregistreur_de_données', alias:'monitoring supervision pv' }),
  defRow('compteur_bidirectionnel','Compteur bidirectionnel (net metering)', T2, `${TPL.circleLetter('kWh')}`,
    { famille:'Mesure', def:"Mesure séparément l'énergie injectée sur le réseau et l'énergie soutirée.", wiki:'Compteur_communicant', alias:'net metering injection soutirage' }),
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
  defRow('detecteur_inductif','Détecteur de proximité inductif', T3_BLOCK, TPL.block('IND'),
    { famille:'Capteurs industriels', def:"Détecte la présence d'un objet métallique sans contact, par variation d'un champ électromagnétique.", wiki:'Capteur_de_proximité', alias:'inductif proximite metal' }),
  defRow('detecteur_capacitif','Détecteur de proximité capacitif', T3_BLOCK, TPL.block('CAP'),
    { famille:'Capteurs industriels', def:"Détecte la présence d'un objet (métallique ou non) par variation de capacité électrique.", wiki:'Capteur_de_proximité', alias:'capacitif proximite' }),
  defRow('detecteur_optique','Détecteur de proximité optique', T3_BLOCK, TPL.block('OPT'),
    { famille:'Capteurs industriels', def:"Détecte un objet par interruption ou réflexion d'un faisceau lumineux (barrage, reflex, proximité).", wiki:'Capteur_de_proximité', alias:'optique photoelectrique barrage' }),
  defRow('codeur_rotatif','Codeur rotatif (encodeur)', T3_BLOCK, TPL.block('ENC'),
    { unit:'points/tour', defaultValue:1000, valueOptions:[100,360,500,1000], famille:'Capteurs industriels', def:"Mesure la position ou la vitesse angulaire d'un axe en rotation.", wiki:'Codeur_rotatif', alias:'encoder position vitesse' }),
  defRow('capteur_pression_industriel','Capteur de pression 4-20 mA', T3_BLOCK, TPL.block('P'),
    { unit:'bar', defaultValue:10, valueOptions:[6,10,16,25], famille:'Capteurs industriels', def:"Transmet une pression sous forme d'un courant standard 4-20 mA vers un automate.", wiki:'Capteur_de_pression', alias:'transmetteur pression 4-20ma' }),
  defRow('capteur_niveau','Capteur de niveau industriel', T3_BLOCK, TPL.block('NIV'),
    { famille:'Capteurs industriels', def:"Détecte ou mesure le niveau d'un liquide dans une cuve ou un réservoir.", wiki:'Capteur_de_niveau', alias:'sonde niveau cuve reservoir' }),
  defRow('verin_pneumatique','Vérin pneumatique', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<rect x="14" y="8" width="24" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="38" y1="15" x2="46" y2="15" stroke="currentColor" stroke-width="3"/>`,
    { famille:'Actionneurs', def:"Convertit l'énergie de l'air comprimé en mouvement linéaire (poussée/traction).", wiki:'Vérin_pneumatique', alias:'verin air comprime' }),
  defRow('verin_electrique','Vérin électrique', T2, `${leadLine(0,15,14,15)}${leadLine(46,15,60,15)}<rect x="14" y="8" width="24" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><line x1="38" y1="15" x2="46" y2="15" stroke="currentColor" stroke-width="3"/>${ctext(26,17,'E',6)}`,
    { famille:'Actionneurs', def:"Convertit une rotation de moteur électrique en mouvement linéaire via une vis.", wiki:'Vérin_électrique', alias:'actionneur lineaire electrique' }),
  defRow('distributeur_pneumatique','Distributeur pneumatique', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'5/2',6.5)}`,
    { famille:'Actionneurs', def:"Oriente l'air comprimé vers l'une ou l'autre chambre d'un vérin pneumatique.", wiki:'Distributeur_pneumatique', alias:'electrovanne pneumatique 5/2' }),
  defRow('arret_urgence','Arrêt d\'urgence (coup de poing)', T2, `${leadLine(0,15,16,15)}${leadLine(44,15,60,15)}<circle cx="16" cy="15" r="2.2" fill="currentColor"/><circle cx="44" cy="15" r="2.2" fill="currentColor"/><line x1="24" y1="15" x2="36" y2="15" stroke="currentColor" stroke-width="2"/><circle cx="30" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
    { famille:'Commande', def:"Bouton-poussoir à accrochage qui coupe immédiatement l'alimentation d'un équipement en cas de danger.", wiki:'Arrêt_d\'urgence', alias:'coup de poing urgence securite' }),
  defRow('relais_securite','Relais de sécurité', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'SIL',6.5)}`,
    { famille:'Commande', def:"Surveille les circuits de sécurité (arrêt d'urgence, barrières immatérielles) et coupe la puissance en cas de défaut.", wiki:'Relais_de_sécurité', alias:'relais securite sil pl' }),
  defRow('colonne_lumineuse','Colonne lumineuse (tour de signalisation)', T2, `${leadLine(0,15,10,15)}${leadLine(50,15,60,15)}<rect x="20" y="4" width="20" height="7" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="20" y="12" width="20" height="7" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="20" y="20" width="20" height="7" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
    { famille:'Commande', def:"Empile des voyants colorés (souvent vert/orange/rouge) pour signaler l'état d'une machine à distance.", wiki:'Colonne_lumineuse', alias:'tour signalisation feu machine' }),
  defRow('ihm','Écran de supervision (IHM)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'IHM',6.5)}`,
    { famille:'Commande', def:"Écran tactile permettant à un opérateur de visualiser et commander un processus automatisé.", wiki:'Interface_homme-machine', alias:'ihm hmi ecran tactile' }),
  defRow('module_extension','Module d\'extension automate', T3_BLOCK, TPL.block('EXT'),
    { famille:'Commande', def:"Ajoute des entrées/sorties supplémentaires à un automate de base.", wiki:'Automate_programmable_industriel', alias:'extension io module' }),
  defRow('interface_modbus','Interface bus de terrain (Modbus/Profibus)', T4, `${leadLine(0,8,16,8)}${leadLine(0,22,16,22)}${leadLine(44,8,60,8)}${leadLine(44,22,60,22)}<rect x="16" y="3" width="28" height="24" fill="none" stroke="currentColor" stroke-width="1.8"/>${ctext(30,17,'BUS',6.5)}`,
    { famille:'Commande', def:"Relie plusieurs équipements industriels sur un même réseau de communication série.", wiki:'Bus_de_terrain', alias:'modbus profibus rs485' }),
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
  defRow('frequencemetre','Fréquencemètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="18" y="20" font-size="9" fill="currentColor">Hz</text>`,
    { famille:'Instruments', def:"Mesure la fréquence d'un signal périodique.", wiki:'Fréquencemètre' }),
  defRow('phasemetre','Phasemètre', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><text x="20" y="20" font-size="9" fill="currentColor">φ</text>`,
    { famille:'Instruments', def:"Mesure le déphasage entre deux signaux alternatifs.", wiki:'Déphasage' }),
  defRow('pince_amperemetrique','Pince ampèremétrique', T1_SIMPLE, `${leadLine(0,15,7,15)}<circle cx="30" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20,10 A12,12 0 0 0 20,20" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
    { famille:'Instruments', def:"Mesure un courant sans ouvrir le circuit, en enserrant le conducteur (effet Hall ou transformateur de courant).", wiki:'Pince_ampèremétrique' }),
  defRow('oscilloscope','Oscilloscope', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<rect x="7" y="4" width="46" height="22" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12,20 L18,10 L24,20 L30,10 L36,20 L42,10 L48,20" fill="none" stroke="currentColor" stroke-width="1.2"/>`,
    { famille:'Instruments', def:"Visualise l'évolution d'une tension dans le temps (forme d'onde).", wiki:'Oscilloscope' }),
  defRow('generateur_fonctions','Générateur de fonctions (GBF)', T2, `${leadLine(0,15,7,15)}${leadLine(53,15,60,15)}<rect x="7" y="4" width="46" height="22" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14,15 Q20,6 26,15 T38,15" fill="none" stroke="currentColor" stroke-width="1.4"/>`,
    { unit:'Hz', defaultValue:1000, valueOptions:[50,1000,10000,100000], famille:'Instruments', def:"Génère un signal périodique (sinus, carré, triangle) à fréquence et amplitude réglables.", wiki:'Générateur_de_fonctions' }),
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
