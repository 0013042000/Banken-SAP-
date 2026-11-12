import { PLAYER_BY_ID, type Player } from './players';

/**
 * Aussehen der stilisierten Avatare im Walkout. Das sind bewusst vereinfachte, eigene
 * Figuren (Hautton, Frisur, Statur, Trikotfarben) – keine originalgetreuen Nachbildungen.
 */
export type HairStyle = 'glatze' | 'stoppel' | 'kurz' | 'mittel' | 'lang' | 'locken' | 'dreads' | 'zopf' | 'tolle';
export type Celebration =
  | 'arme' | 'faust' | 'himmel' | 'einarm' | 'rutsche' | 'stolz' | 'kreuz' | 'siu' | 'samba' | 'frieren' | 'maske';

export type Build = 'schlank' | 'normal' | 'kraeftig';

export interface Look {
  readonly skin: string;
  readonly hair: HairStyle;
  readonly hairColor: string;
  readonly build: Build;
  /** Körpergröße als Faktor: klein, normal oder groß. */
  readonly height: number;
  readonly beard: boolean;
  readonly headband: boolean;
  readonly celebration: Celebration;
}

export interface Kit {
  readonly shirt: string;
  readonly trim: string;
  readonly shorts: string;
  readonly socks: string;
  readonly pattern?: 'streifen' | 'karo' | 'balken';
  readonly patternColor?: string;
}

/** Hauttöne von hell ('1') bis dunkel ('5'). */
const SKIN: Readonly<Record<string, string>> = { '1': '#f6d7c0', '2': '#e9bf9d', '3': '#cf9a72', '4': '#a06a43', '5': '#6b4226' };
const DEFAULT_SKIN = '#e9bf9d';
const BUILD: Readonly<Record<string, Build>> = { '1': 'schlank', '2': 'normal', '3': 'kraeftig' };
const HEIGHT_NORMAL = 1;
const HEIGHT_TALL = 1.06;
const HEIGHT_SHORT = 0.94;
/** Zusatzbuchstabe im Code → Größenfaktor. */
const HEIGHT_BY_FLAG: readonly (readonly [string, number])[] = [['T', HEIGHT_TALL], ['K', HEIGHT_SHORT]];
/** Die ersten vier Zeichen eines Codes sind Hautton, Frisur, Haarfarbe und Statur; danach folgen Zusätze. */
const CODE_BASE_LENGTH = 4;
const DEFAULT_HAIR_COLOR = '#2b1d14';
const HAIR_COLOR: Readonly<Record<string, string>> = { s: '#141210', d: '#2b1d14', b: '#5a3a22', h: '#d9b46a', r: '#b5532a', w: '#cfcfcf' };
const HAIR_STYLE: Readonly<Record<string, HairStyle>> = {
  g: 'glatze', z: 'stoppel', k: 'kurz', m: 'mittel', l: 'lang', a: 'locken', d: 'dreads', p: 'zopf', i: 'tolle',
};

/**
 * Kurzcode je Person: Hautton 1–5, Frisur, Haarfarbe, Statur 1–3.
 * Zusätze: B = Bart, T = groß, K = klein, S = Stirnband.
 */
const CODES = `
mbappe:4zs2 haaland:1ph3T bellingham:4ks2T vinicius:5ks1 yamal:3ad1 musiala:4ad1 wirtz:1mb1 saka:5zs2 pedri:2kd1 salah:3as2B
messi:2kb1BK cr7:2is3T neymar:3is1 lewandowski:1kb2T kdb:1kr2 rodri:2kd3T kane:1kh2T vandijk:4ps3T courtois:1kb2T alisson:2kb3BT
valverde:1kb2 dembele:5zs1 odegaard:1mh1 lautaro:2ks2K hakimi:3zs2 raphinha:3ks1 palmer:1kb1 donnarumma:2ks3BT saliba:5zs3T
bruno:2md2 oblak:1kb3T isak:4zs1T kimmich:1kh1 rudiger:5zs3T son:2ms1 rice:1kb2T griezmann:1mh1 foden:1zh1K osimhen:5zh2T
terstegen:1kh2T gyokeres:1kh3T taa:4zs1 olise:4ds1 leao:5ds2T modric:1lb1K neuer:1kh3T doue:4ks1 simons:3ah1 gnabry:4zs2
havertz:1kb2T sane:4ks1 cubarsi:2kd2 guler:2kd1 rashford:5zs2 muller:1kb1T mitoma:2ms1 ekitike:5ds1T kudus:5zs2 fullkrug:1kb3BT
reus:1ih1 estevao:4ks1 endrick:4zs3K schlotterbeck:1kh3T tah:5zs3T adeyemi:4zs1 brandt:1mh1 undav:2kd3B wolt:1mb2T andrich:1zb3
baumann:1kb2T raum:1ib2 grimaldo:2kd1K frimpong:5ds1K bakayoko:4ks1 ryerson:1zh2 bensebaini:3ks2B kobel:1kb3T guirassy:5zs3T
beier:1kh2 nmecha:4zs2T
maignan:5zs3BT emartinez:2ks3BT ederson:2zh2T raya:2kd2B usimon:2kd3T sommer:1kb1 nmendes:5zs2 theo:3ks2T davies:5ks1
robertson:1kb1 mittelstadt:1kb1 carvajal:2kd2BK kounde:4ds2 walker:5zs3 dias:2kd3T bastoni:1kb2T gabriel:4zs3T marquinhos:3ks1
militao:4ks2T araujo:4zs3T kimminjae:2ks3T caicedo:5zs3 tchouameni:5zs3T zubimendi:2kd2 pavlovic:1kb2T vitinha:2kd1K barella:2kd1K
macallister:1kr1 kvara:2md2B nwilliams:5ds1 diaz:3ks1 rodrygo:3ks1 jalvarez:2kd1K
pele:5zs2 maradona:3as3K distefano:1zb2 r9:3gs3 zidane:2gs2T beckenbauer:1md2 cruyff:1mb1 maldini:2ld2T gerdmuller:1kd3K
yashin:1ks3T eusebio:5zs2 puskas:1ks3K ronaldinho:4ls1S garrincha:4zs2K vanbasten:1kb2T buffon:2md3T baresi:2kd2K henry:4gs2T
matthaus:1kb2 gullit:4ds3T casillas:2kd2 xavi:2kd1K iniesta:1zb1K kahn:1mh3T platini:2ad1 best:1ld1 kaka:2md2T rcarlos:4gs3K
pirlo:2ld1B nesta:2ld2T baggio:2ps1 charlton:1zh2 moore:1kh2 cafu:4zs2 vieira:5zs3T beckham:1mh2 drogba:5ms3T lahm:1kb1K
figo:2md2 rivaldo:3ks1T shevchenko:1mh2 bergkamp:1kh2T puyol:2ad2 ballack:1kd3T etoo:5zs2 gerrard:1zb2T nedved:1lh2 totti:2mb2S
delpiero:2kd1K rummenigge:1mh2 schweini:1kh2 rooney:1zb3K lampard:1kd2 raul:2kd1 seedorf:5ds3 riquelme:3md2 cantona:2kd3T
zanetti:2kd2 klose:1kb2 dalglish:1mb2 giggs:2ad1
schmeichel:1kh3T zoff:2kd2 vandersar:1kb1T banks:1kd2 maier:1ad2 cech:1kb3T facchetti:2kd2T breitner:1ad2B brehme:1mh2
marcelo:4as1K lizarazu:2kd1K acole:4zs1K zambrotta:2kd2 calberto:4zs2 thuram:5gs3T bergomi:2kd2 gneville:1kb2 cannavaro:2gs2K
scirea:2kd2 desailly:5zs3T sammer:1kr2 ferdinand:5zs3T koeman:1kh3 vidic:1zd3T kohler:1ad3 hierro:2kd3T blanc:2md2T
rijkaard:4as3T keane:1zd2 busquets:2kd1T xalonso:1kb2B makelele:5zs1K gattuso:2md3B socrates:3ad2BTS kroos:1kh2 scholes:1kr1K
netzer:1lh2 effenberg:1mh3T overath:1kd1 zico:2mb1K laudrup:1mb1 hagi:2kd1K ruicosta:2ld1 sneijder:2gs1K ozil:2kd1 deco:3ks1K
overmars:1kb1K littbarski:1md1K hassler:1kb1K stoichkov:2kd3 ribery:2zb2K hazard:2kd3K robben:1gh1 jairzinho:5as2 bale:1pb2T
romario:3zs2K batistuta:2lb3T ibra:2pd3T weah:5zs3T shearer:1zb3 vannistelrooy:2kd2T aguero:3ks3K seeler:1zh3K klinsmann:1mh1
villa:2kd1K lineker:2kd1 voller:1aw2 suker:2kd2 torres:1mh1
`;

const SIGNATURE: Readonly<Record<string, Celebration>> = {
  cr7: 'siu', mbappe: 'kreuz', lewandowski: 'kreuz', messi: 'himmel', salah: 'himmel', kaka: 'himmel', bellingham: 'arme', ibra: 'arme',
  beckham: 'arme', musiala: 'arme', kane: 'arme', r9: 'arme', pele: 'faust', maradona: 'faust', kahn: 'faust', batistuta: 'faust',
  haaland: 'faust', wirtz: 'faust', ronaldinho: 'samba', vinicius: 'samba', neymar: 'samba', rodrygo: 'samba', marcelo: 'samba',
  griezmann: 'samba', palmer: 'frieren', gyokeres: 'maske', shearer: 'einarm', zidane: 'einarm', saka: 'einarm', cantona: 'stolz',
  henry: 'stolz', totti: 'stolz', drogba: 'rutsche', torres: 'rutsche', gerrard: 'rutsche', robben: 'rutsche', klinsmann: 'rutsche',
};
const DEFAULT_CELEBRATIONS: readonly Celebration[] = ['arme', 'faust', 'himmel', 'einarm', 'rutsche', 'stolz'];

// FNV-1a: stabile, schnelle Streuung einer Zeichenkette auf eine Zahl.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const hash = (s: string): number =>
  [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), FNV_PRIME), FNV_OFFSET) >>> 0;

const defaultCelebration = (person: string): Celebration =>
  DEFAULT_CELEBRATIONS[hash(person) % DEFAULT_CELEBRATIONS.length] ?? 'arme';

const parse = (person: string, code: string): Look => {
  const [skinCode = '', hairCode = '', colorCode = '', buildCode = ''] = code;
  const extras = code.slice(CODE_BASE_LENGTH);
  return {
    skin: SKIN[skinCode] ?? DEFAULT_SKIN,
    hair: HAIR_STYLE[hairCode] ?? 'kurz',
    hairColor: HAIR_COLOR[colorCode] ?? DEFAULT_HAIR_COLOR,
    build: BUILD[buildCode] ?? 'normal',
    height: HEIGHT_BY_FLAG.find(([flag]) => extras.includes(flag))?.[1] ?? HEIGHT_NORMAL,
    beard: extras.includes('B'),
    headband: extras.includes('S'),
    celebration: SIGNATURE[person] ?? defaultCelebration(person),
  };
};

// Trennt die Tabelle an Leerraum: "mbappe:4zs2 haaland:1ph3T" ergibt zwei Einträge; "mbappe:4zs2" bleibt ein Eintrag.
const ENTRY_SEPARATOR = /\s+/;
const LOOKS: ReadonlyMap<string, Look> = new Map(
  CODES.split(ENTRY_SEPARATOR).filter(Boolean).map((entry) => {
    const [person = '', code = ''] = entry.split(':');
    return [person, parse(person, code)] as const;
  }),
);

const NEUTRAL: Look = { skin: DEFAULT_SKIN, hair: 'kurz', hairColor: DEFAULT_HAIR_COLOR, build: 'normal', height: HEIGHT_NORMAL, beard: false, headband: false, celebration: 'arme' };

export const lookFor = (p: Player): Look => LOOKS.get(p.person) ?? { ...NEUTRAL, celebration: defaultCelebration(p.person) };
export const hasLook = (person: string): boolean => LOOKS.has(person);
/** Einträge der Tabelle, zu denen es keine Person im Bestand gibt (für Tests). */
export const orphanLooks = (): string[] => [...LOOKS.keys()].filter((k) => !PLAYER_BY_ID.has(k));

/** Eigene Trikotentwürfe in Anlehnung an Landesfarben. */
const KITS: Readonly<Record<string, Kit>> = {
  GER: { shirt: '#f4f4f0', trim: '#111111', shorts: '#111111', socks: '#f4f4f0' },
  FRA: { shirt: '#1f3c88', trim: '#ffffff', shorts: '#ffffff', socks: '#d22630' },
  BRA: { shirt: '#f7d117', trim: '#1a8a3a', shorts: '#1f4fb5', socks: '#ffffff' },
  ARG: { shirt: '#ffffff', trim: '#111827', shorts: '#111827', socks: '#ffffff', pattern: 'streifen', patternColor: '#6cb4ee' },
  ESP: { shirt: '#c8102e', trim: '#f6c700', shorts: '#12235a', socks: '#12235a' },
  ENG: { shirt: '#ffffff', trim: '#1b2a5c', shorts: '#1b2a5c', socks: '#ffffff' },
  POR: { shirt: '#a50f1e', trim: '#0b6b3a', shorts: '#0b6b3a', socks: '#a50f1e' },
  NED: { shirt: '#f36c21', trim: '#111111', shorts: '#111111', socks: '#f36c21' },
  ITA: { shirt: '#1f5fd0', trim: '#ffffff', shorts: '#ffffff', socks: '#1f5fd0' },
  BEL: { shirt: '#c8102e', trim: '#f6c700', shorts: '#111111', socks: '#c8102e' },
  NOR: { shirt: '#c8102e', trim: '#1b2a5c', shorts: '#ffffff', socks: '#1b2a5c' },
  POL: { shirt: '#ffffff', trim: '#d22630', shorts: '#d22630', socks: '#ffffff' },
  EGY: { shirt: '#c8102e', trim: '#ffffff', shorts: '#ffffff', socks: '#111111' },
  URU: { shirt: '#6cb4ee', trim: '#111111', shorts: '#111111', socks: '#111111' },
  KOR: { shirt: '#d22630', trim: '#111111', shorts: '#111111', socks: '#d22630' },
  MAR: { shirt: '#b0182b', trim: '#0b6b3a', shorts: '#0b6b3a', socks: '#b0182b' },
  SWE: { shirt: '#f7d117', trim: '#1f4fb5', shorts: '#1f4fb5', socks: '#f7d117' },
  CRO: { shirt: '#ffffff', trim: '#1f4fb5', shorts: '#ffffff', socks: '#1f4fb5', pattern: 'karo', patternColor: '#d22630' },
  SVN: { shirt: '#ffffff', trim: '#1f4fb5', shorts: '#ffffff', socks: '#ffffff' },
  JPN: { shirt: '#1b2f7a', trim: '#ffffff', shorts: '#1b2f7a', socks: '#1b2f7a' },
  NGA: { shirt: '#1a8a3a', trim: '#ffffff', shorts: '#ffffff', socks: '#1a8a3a' },
  CIV: { shirt: '#f28c1e', trim: '#0b6b3a', shorts: '#ffffff', socks: '#f28c1e' },
  CMR: { shirt: '#0b7a3b', trim: '#f6c700', shorts: '#c8102e', socks: '#f6c700' },
  CZE: { shirt: '#c8102e', trim: '#ffffff', shorts: '#ffffff', socks: '#1f4fb5' },
  UKR: { shirt: '#f7d117', trim: '#1f4fb5', shorts: '#1f4fb5', socks: '#f7d117' },
  RUS: { shirt: '#b0182b', trim: '#ffffff', shorts: '#ffffff', socks: '#b0182b' },
  HUN: { shirt: '#b0182b', trim: '#ffffff', shorts: '#ffffff', socks: '#0b6b3a' },
  NIR: { shirt: '#0b7a3b', trim: '#ffffff', shorts: '#ffffff', socks: '#0b7a3b' },
  SCO: { shirt: '#12235a', trim: '#ffffff', shorts: '#ffffff', socks: '#12235a' },
  WAL: { shirt: '#c8102e', trim: '#f6c700', shorts: '#c8102e', socks: '#c8102e' },
  TUR: { shirt: '#d22630', trim: '#ffffff', shorts: '#ffffff', socks: '#d22630', pattern: 'balken', patternColor: '#ffffff' },
  GHA: { shirt: '#ffffff', trim: '#111111', shorts: '#ffffff', socks: '#ffffff' },
  SUI: { shirt: '#d22630', trim: '#ffffff', shorts: '#ffffff', socks: '#d22630' },
  CAN: { shirt: '#d22630', trim: '#ffffff', shorts: '#d22630', socks: '#d22630' },
  ECU: { shirt: '#f7d117', trim: '#12235a', shorts: '#12235a', socks: '#d22630' },
  GEO: { shirt: '#ffffff', trim: '#d22630', shorts: '#ffffff', socks: '#ffffff' },
  COL: { shirt: '#f7d117', trim: '#12235a', shorts: '#12235a', socks: '#d22630' },
  DEN: { shirt: '#c8102e', trim: '#ffffff', shorts: '#ffffff', socks: '#c8102e' },
  SRB: { shirt: '#b0182b', trim: '#12235a', shorts: '#12235a', socks: '#ffffff' },
  IRL: { shirt: '#0b7a3b', trim: '#ffffff', shorts: '#ffffff', socks: '#0b7a3b' },
  ROU: { shirt: '#f7d117', trim: '#c8102e', shorts: '#f7d117', socks: '#f7d117' },
  BUL: { shirt: '#ffffff', trim: '#0b7a3b', shorts: '#0b7a3b', socks: '#ffffff' },
  LBR: { shirt: '#c8102e', trim: '#ffffff', shorts: '#12235a', socks: '#c8102e' },
};
const NEUTRAL_KIT: Kit = { shirt: '#2a3350', trim: '#f5c542', shorts: '#12182c', socks: '#2a3350' };
const KEEPER_SHIRTS = ['#1fd27a', '#ff8a1f', '#ffd21f', '#17191f', '#b04bff', '#22c7e8'] as const;

export const kitFor = (p: Player): Kit => {
  const base = KITS[p.nation] ?? NEUTRAL_KIT;
  if (p.pos !== 'TW') return base;
  const shirt = KEEPER_SHIRTS[hash(p.person) % KEEPER_SHIRTS.length] ?? NEUTRAL_KIT.shirt;
  return { shirt, trim: '#111111', shorts: shirt, socks: shirt };
};

const NUMBER_BY_POS: Readonly<Record<string, string>> = {
  TW: '1', RV: '2', LV: '3', IV: '4', ZDM: '6', ZM: '8', ZOM: '10', RM: '7', LM: '11', RF: '7', LF: '11', MS: '9', ST: '9',
};
const DEFAULT_NUMBER = '10';
/** Trikotnummer nach Position (als Text fürs Trikot) – bewusst generisch, keine historischen Angaben. */
export const numberFor = (p: Player): string => NUMBER_BY_POS[p.pos] ?? DEFAULT_NUMBER;
