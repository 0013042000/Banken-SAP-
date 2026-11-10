export type Position =
  | 'TW' | 'IV' | 'LV' | 'RV' | 'ZDM' | 'ZM' | 'ZOM' | 'LM' | 'RM' | 'LF' | 'RF' | 'MS' | 'ST';
export type Category = 'gold' | 'star' | 'legend';

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly nation: string; // ISO-ähnlicher Code
  readonly pos: Position;
  readonly cat: Category;
  readonly ovr: number;
}

export const FLAGS: Record<string, { flag: string; name: string }> = {
  FRA: { flag: '🇫🇷', name: 'Frankreich' }, NOR: { flag: '🇳🇴', name: 'Norwegen' },
  ENG: { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', name: 'England' }, BRA: { flag: '🇧🇷', name: 'Brasilien' },
  ESP: { flag: '🇪🇸', name: 'Spanien' }, GER: { flag: '🇩🇪', name: 'Deutschland' },
  EGY: { flag: '🇪🇬', name: 'Ägypten' }, ARG: { flag: '🇦🇷', name: 'Argentinien' },
  POR: { flag: '🇵🇹', name: 'Portugal' }, POL: { flag: '🇵🇱', name: 'Polen' },
  BEL: { flag: '🇧🇪', name: 'Belgien' }, NED: { flag: '🇳🇱', name: 'Niederlande' },
  URU: { flag: '🇺🇾', name: 'Uruguay' }, KOR: { flag: '🇰🇷', name: 'Südkorea' },
  MAR: { flag: '🇲🇦', name: 'Marokko' }, SWE: { flag: '🇸🇪', name: 'Schweden' },
  ITA: { flag: '🇮🇹', name: 'Italien' }, CRO: { flag: '🇭🇷', name: 'Kroatien' },
  SVN: { flag: '🇸🇮', name: 'Slowenien' }, JPN: { flag: '🇯🇵', name: 'Japan' },
  NGA: { flag: '🇳🇬', name: 'Nigeria' }, CIV: { flag: '🇨🇮', name: 'Elfenbeinküste' },
  CMR: { flag: '🇨🇲', name: 'Kamerun' }, CZE: { flag: '🇨🇿', name: 'Tschechien' },
  UKR: { flag: '🇺🇦', name: 'Ukraine' }, RUS: { flag: '🇷🇺', name: 'Russland' },
  HUN: { flag: '🇭🇺', name: 'Ungarn' }, NIR: { flag: '🇬🇧', name: 'Nordirland' },
  SCO: { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', name: 'Schottland' }, WAL: { flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', name: 'Wales' },
  TUR: { flag: '🇹🇷', name: 'Türkei' }, GHA: { flag: '🇬🇭', name: 'Ghana' },
};

const p = (id: string, name: string, nation: string, pos: Position, cat: Category, ovr: number): Player =>
  ({ id, name, nation, pos, cat, ovr });

export const PLAYERS: readonly Player[] = [
  // --- Aktuelle Stars ---
  p('mbappe', 'Kylian Mbappé', 'FRA', 'ST', 'star', 91),
  p('haaland', 'Erling Haaland', 'NOR', 'ST', 'star', 91),
  p('bellingham', 'Jude Bellingham', 'ENG', 'ZM', 'star', 90),
  p('vinicius', 'Vinícius Júnior', 'BRA', 'LF', 'star', 90),
  p('yamal', 'Lamine Yamal', 'ESP', 'RF', 'star', 89),
  p('musiala', 'Jamal Musiala', 'GER', 'ZOM', 'star', 88),
  p('wirtz', 'Florian Wirtz', 'GER', 'ZOM', 'star', 89),
  p('saka', 'Bukayo Saka', 'ENG', 'RF', 'star', 87),
  p('pedri', 'Pedri', 'ESP', 'ZM', 'star', 87),
  p('salah', 'Mohamed Salah', 'EGY', 'RF', 'star', 89),
  p('messi', 'Lionel Messi', 'ARG', 'RF', 'star', 90),
  p('cr7', 'Cristiano Ronaldo', 'POR', 'ST', 'star', 88),
  p('neymar', 'Neymar Jr', 'BRA', 'LF', 'star', 86),
  p('lewandowski', 'Robert Lewandowski', 'POL', 'ST', 'star', 88),
  p('kdb', 'Kevin De Bruyne', 'BEL', 'ZM', 'star', 89),
  p('rodri', 'Rodri', 'ESP', 'ZDM', 'star', 90),
  p('kane', 'Harry Kane', 'ENG', 'ST', 'star', 89),
  p('vandijk', 'Virgil van Dijk', 'NED', 'IV', 'star', 89),
  p('courtois', 'Thibaut Courtois', 'BEL', 'TW', 'star', 89),
  p('alisson', 'Alisson Becker', 'BRA', 'TW', 'star', 88),
  p('valverde', 'Federico Valverde', 'URU', 'ZM', 'star', 88),
  p('dembele', 'Ousmane Dembélé', 'FRA', 'RF', 'star', 88),
  p('odegaard', 'Martin Ødegaard', 'NOR', 'ZOM', 'star', 87),
  p('lautaro', 'Lautaro Martínez', 'ARG', 'ST', 'star', 87),
  p('hakimi', 'Achraf Hakimi', 'MAR', 'RV', 'star', 87),
  p('raphinha', 'Raphinha', 'BRA', 'LF', 'star', 87),
  p('palmer', 'Cole Palmer', 'ENG', 'ZOM', 'star', 87),
  p('donnarumma', 'Gianluigi Donnarumma', 'ITA', 'TW', 'star', 87),
  p('saliba', 'William Saliba', 'FRA', 'IV', 'star', 87),
  p('bruno', 'Bruno Fernandes', 'POR', 'ZOM', 'star', 86),
  p('oblak', 'Jan Oblak', 'SVN', 'TW', 'star', 86),
  p('isak', 'Alexander Isak', 'SWE', 'ST', 'star', 86),
  p('kimmich', 'Joshua Kimmich', 'GER', 'ZDM', 'star', 86),
  p('rudiger', 'Antonio Rüdiger', 'GER', 'IV', 'star', 86),
  p('son', 'Son Heung-min', 'KOR', 'LF', 'star', 86),
  p('rice', 'Declan Rice', 'ENG', 'ZDM', 'star', 86),
  p('griezmann', 'Antoine Griezmann', 'FRA', 'MS', 'star', 86),
  p('foden', 'Phil Foden', 'ENG', 'ZOM', 'star', 86),
  p('osimhen', 'Victor Osimhen', 'NGA', 'ST', 'gold', 85),
  p('terstegen', 'Marc-André ter Stegen', 'GER', 'TW', 'gold', 85),
  p('gyokeres', 'Viktor Gyökeres', 'SWE', 'ST', 'gold', 85),
  p('taa', 'Trent Alexander-Arnold', 'ENG', 'RV', 'gold', 85),
  p('olise', 'Michael Olise', 'FRA', 'RF', 'gold', 85),
  p('leao', 'Rafael Leão', 'POR', 'LF', 'gold', 84),
  p('modric', 'Luka Modrić', 'CRO', 'ZM', 'gold', 84),
  p('neuer', 'Manuel Neuer', 'GER', 'TW', 'gold', 84),
  p('doue', 'Désiré Doué', 'FRA', 'RF', 'gold', 84),
  p('simons', 'Xavi Simons', 'NED', 'ZOM', 'gold', 83),
  p('gnabry', 'Serge Gnabry', 'GER', 'RF', 'gold', 82),
  p('havertz', 'Kai Havertz', 'GER', 'ST', 'gold', 82),
  p('sane', 'Leroy Sané', 'GER', 'RF', 'gold', 82),
  p('cubarsi', 'Pau Cubarsí', 'ESP', 'IV', 'gold', 82),
  p('guler', 'Arda Güler', 'TUR', 'ZOM', 'gold', 81),
  p('rashford', 'Marcus Rashford', 'ENG', 'LF', 'gold', 80),
  p('muller', 'Thomas Müller', 'GER', 'ZOM', 'gold', 80),
  p('mitoma', 'Kaoru Mitoma', 'JPN', 'LF', 'gold', 80),
  p('ekitike', 'Hugo Ekitiké', 'FRA', 'ST', 'gold', 80),
  p('kudus', 'Mohammed Kudus', 'GHA', 'RF', 'gold', 79),
  p('fullkrug', 'Niclas Füllkrug', 'GER', 'ST', 'gold', 79),
  p('reus', 'Marco Reus', 'GER', 'ZOM', 'gold', 78),
  p('estevao', 'Estêvão', 'BRA', 'RF', 'gold', 78),
  p('endrick', 'Endrick', 'BRA', 'ST', 'gold', 77),
  p('schlotterbeck', 'Nico Schlotterbeck', 'GER', 'IV', 'gold', 81),
  p('tah', 'Jonathan Tah', 'GER', 'IV', 'gold', 82),
  p('adeyemi', 'Karim Adeyemi', 'GER', 'LF', 'gold', 79),
  p('brandt', 'Julian Brandt', 'GER', 'ZOM', 'gold', 80),
  p('undav', 'Deniz Undav', 'GER', 'ST', 'gold', 77),
  p('wolt', 'Nick Woltemade', 'GER', 'ST', 'gold', 78),
  p('andrich', 'Robert Andrich', 'GER', 'ZDM', 'gold', 78),
  p('baumann', 'Oliver Baumann', 'GER', 'TW', 'gold', 78),
  p('raum', 'David Raum', 'GER', 'LV', 'gold', 79),
  p('grimaldo', 'Alejandro Grimaldo', 'ESP', 'LV', 'gold', 83),
  p('frimpong', 'Jeremie Frimpong', 'NED', 'RV', 'gold', 82),
  p('bakayoko', 'Johan Bakayoko', 'BEL', 'RF', 'gold', 77),
  p('ryerson', 'Julian Ryerson', 'NOR', 'RV', 'gold', 76),
  p('bensebaini', 'Ramy Bensebaini', 'MAR', 'LV', 'gold', 77),
  p('kobel', 'Gregor Kobel', 'GER', 'TW', 'gold', 83),
  p('guirassy', 'Serhou Guirassy', 'FRA', 'ST', 'gold', 83),
  p('beier', 'Maximilian Beier', 'GER', 'ST', 'gold', 76),
  p('nmecha', 'Felix Nmecha', 'GER', 'ZM', 'gold', 76),
  // --- Legenden & Kultspieler ---
  p('pele', 'Pelé', 'BRA', 'MS', 'legend', 97),
  p('maradona', 'Diego Maradona', 'ARG', 'ZOM', 'legend', 96),
  p('distefano', 'Alfredo Di Stéfano', 'ARG', 'MS', 'legend', 95),
  p('r9', 'Ronaldo Nazário', 'BRA', 'ST', 'legend', 95),
  p('zidane', 'Zinédine Zidane', 'FRA', 'ZOM', 'legend', 95),
  p('beckenbauer', 'Franz Beckenbauer', 'GER', 'IV', 'legend', 95),
  p('cruyff', 'Johan Cruyff', 'NED', 'MS', 'legend', 94),
  p('maldini', 'Paolo Maldini', 'ITA', 'IV', 'legend', 94),
  p('gerdmuller', 'Gerd Müller', 'GER', 'ST', 'legend', 94),
  p('yashin', 'Lew Jaschin', 'RUS', 'TW', 'legend', 94),
  p('eusebio', 'Eusébio', 'POR', 'ST', 'legend', 94),
  p('puskas', 'Ferenc Puskás', 'HUN', 'ST', 'legend', 94),
  p('ronaldinho', 'Ronaldinho', 'BRA', 'LF', 'legend', 93),
  p('garrincha', 'Garrincha', 'BRA', 'RF', 'legend', 93),
  p('vanbasten', 'Marco van Basten', 'NED', 'ST', 'legend', 93),
  p('buffon', 'Gianluigi Buffon', 'ITA', 'TW', 'legend', 93),
  p('baresi', 'Franco Baresi', 'ITA', 'IV', 'legend', 93),
  p('henry', 'Thierry Henry', 'FRA', 'ST', 'legend', 92),
  p('matthaus', 'Lothar Matthäus', 'GER', 'ZM', 'legend', 92),
  p('gullit', 'Ruud Gullit', 'NED', 'ZM', 'legend', 92),
  p('casillas', 'Iker Casillas', 'ESP', 'TW', 'legend', 92),
  p('xavi', 'Xavi Hernández', 'ESP', 'ZM', 'legend', 92),
  p('iniesta', 'Andrés Iniesta', 'ESP', 'ZM', 'legend', 92),
  p('kahn', 'Oliver Kahn', 'GER', 'TW', 'legend', 92),
  p('platini', 'Michel Platini', 'FRA', 'ZOM', 'legend', 92),
  p('best', 'George Best', 'NIR', 'RF', 'legend', 92),
  p('kaka', 'Kaká', 'BRA', 'ZOM', 'legend', 91),
  p('rcarlos', 'Roberto Carlos', 'BRA', 'LV', 'legend', 91),
  p('pirlo', 'Andrea Pirlo', 'ITA', 'ZM', 'legend', 91),
  p('nesta', 'Alessandro Nesta', 'ITA', 'IV', 'legend', 91),
  p('baggio', 'Roberto Baggio', 'ITA', 'ZOM', 'legend', 91),
  p('charlton', 'Bobby Charlton', 'ENG', 'ZM', 'legend', 91),
  p('moore', 'Bobby Moore', 'ENG', 'IV', 'legend', 91),
  p('cafu', 'Cafu', 'BRA', 'RV', 'legend', 90),
  p('vieira', 'Patrick Vieira', 'FRA', 'ZDM', 'legend', 90),
  p('beckham', 'David Beckham', 'ENG', 'RM', 'legend', 90),
  p('drogba', 'Didier Drogba', 'CIV', 'ST', 'legend', 90),
  p('lahm', 'Philipp Lahm', 'GER', 'RV', 'legend', 90),
  p('figo', 'Luís Figo', 'POR', 'RF', 'legend', 90),
  p('rivaldo', 'Rivaldo', 'BRA', 'ZOM', 'legend', 90),
  p('shevchenko', 'Andrij Schewtschenko', 'UKR', 'ST', 'legend', 90),
  p('bergkamp', 'Dennis Bergkamp', 'NED', 'MS', 'legend', 90),
  p('puyol', 'Carles Puyol', 'ESP', 'IV', 'legend', 89),
  p('ballack', 'Michael Ballack', 'GER', 'ZM', 'legend', 89),
  p('etoo', "Samuel Eto'o", 'CMR', 'ST', 'legend', 89),
  p('gerrard', 'Steven Gerrard', 'ENG', 'ZM', 'legend', 89),
  p('nedved', 'Pavel Nedvěd', 'CZE', 'LM', 'legend', 89),
  p('totti', 'Francesco Totti', 'ITA', 'MS', 'legend', 89),
  p('delpiero', 'Alessandro Del Piero', 'ITA', 'MS', 'legend', 89),
  p('rummenigge', 'Karl-Heinz Rummenigge', 'GER', 'ST', 'legend', 89),
  p('schweini', 'Bastian Schweinsteiger', 'GER', 'ZM', 'legend', 88),
  p('rooney', 'Wayne Rooney', 'ENG', 'ST', 'legend', 88),
  p('lampard', 'Frank Lampard', 'ENG', 'ZM', 'legend', 88),
  p('raul', 'Raúl', 'ESP', 'ST', 'legend', 88),
  p('seedorf', 'Clarence Seedorf', 'NED', 'ZM', 'legend', 88),
  p('riquelme', 'Juan Román Riquelme', 'ARG', 'ZOM', 'legend', 87),
  p('cantona', 'Éric Cantona', 'FRA', 'MS', 'legend', 87),
  p('zanetti', 'Javier Zanetti', 'ARG', 'RV', 'legend', 87),
  p('klose', 'Miroslav Klose', 'GER', 'ST', 'legend', 86),
  p('dalglish', 'Kenny Dalglish', 'SCO', 'MS', 'legend', 88),
  p('giggs', 'Ryan Giggs', 'WAL', 'LM', 'legend', 87),
];

export const PLAYER_BY_ID: ReadonlyMap<string, Player> = new Map(PLAYERS.map((x) => [x.id, x]));

// ---- Sechs Werte, deterministisch aus Position + Bewertung abgeleitet ----
export interface StatLine { readonly label: string; readonly value: number }

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const OUTFIELD_LABELS = ['TEM', 'SCH', 'PAS', 'DRI', 'DEF', 'PHY'] as const;
const GK_LABELS = ['TWA', 'HAN', 'ABS', 'REF', 'SCH', 'POS'] as const;

// Offsets je Position: [TEM, SCH, PAS, DRI, DEF, PHY]
const PROFILE: Record<Position, readonly number[]> = {
  TW: [0, 0, 0, 0, 0, 0],
  IV: [-8, -22, -8, -12, 4, 6],
  LV: [4, -16, -2, -3, 0, -2],
  RV: [4, -16, -2, -3, 0, -2],
  ZDM: [-6, -12, 2, -4, 2, 4],
  ZM: [-2, -6, 4, 2, -8, -2],
  ZOM: [0, -2, 5, 5, -22, -8],
  LM: [4, -4, 2, 4, -16, -8],
  RM: [4, -4, 2, 4, -16, -8],
  LF: [6, -2, -2, 5, -26, -10],
  RF: [6, -2, -2, 5, -26, -10],
  MS: [2, 4, 2, 4, -26, -6],
  ST: [3, 6, -8, -2, -30, 2],
};

export const statsFor = (pl: Player): readonly StatLine[] => {
  const h = hash(pl.id);
  const labels = pl.pos === 'TW' ? GK_LABELS : OUTFIELD_LABELS;
  const prof = PROFILE[pl.pos];
  return labels.map((label, i) => {
    const jitter = ((h >> (i * 5)) % 7) - 3;
    const raw = pl.ovr + prof[i] + jitter;
    return { label, value: Math.max(35, Math.min(99, raw)) };
  });
};

export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).map((w) => w[0]!.toUpperCase()).slice(0, 2).join('');
