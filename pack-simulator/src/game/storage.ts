import { PLAYER_BY_ID } from '../data/players';

export type Collection = Readonly<Record<string, number>>;

/** Automatisch folgt der Systemeinstellung; Voll und Reduziert sind bewusste Entscheidungen. */
export type AnimationMode = 'auto' | 'voll' | 'reduziert';

export interface Settings {
  readonly dreamLuck: boolean;
  readonly muted: boolean;
  readonly animation: AnimationMode;
}

const KEY_COLLECTION = 'fps.collection.v1';
const KEY_SETTINGS = 'fps.settings.v1';
const KEY_TEAM = 'fps.team.v1';
const KEY_TEAMS = 'fps.teams.v2';

const readRaw = (key: string): unknown => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch { return null; }
};

// Speicherstatus: wird beim ersten Fehlschlag auf false gesetzt und kann abonniert werden.
let storageOk = true;
const listeners = new Set<() => void>();
const markFailed = (): void => {
  if (!storageOk) return;
  storageOk = false;
  for (const l of listeners) l();
};
export const subscribeStorageStatus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getStorageOk = (): boolean => storageOk;

/** Schreibt einen Wert; liefert false, wenn der Speicher nicht verfügbar ist. */
const write = (key: string, value: unknown): boolean => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { markFailed(); return false; }
};

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Prüft, ob localStorage in dieser Umgebung benutzbar ist, und merkt sich das Ergebnis. */
export const probeStorage = (): boolean => {
  try {
    const k = 'fps.probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch { markFailed(); return false; }
};
probeStorage();

/** Sammlung laden; beschädigte Einträge und unbekannte Spieler-IDs werden verworfen. */
export const sanitizeCollection = (raw: unknown): Collection => {
  if (!isRecord(raw)) return {};
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw)) {
    if (PLAYER_BY_ID.has(id) && typeof n === 'number' && Number.isFinite(n) && n >= 1) out[id] = Math.floor(n);
  }
  return out;
};

export const loadCollection = (): Collection => sanitizeCollection(readRaw(KEY_COLLECTION));
export const saveCollection = (c: Collection): boolean => write(KEY_COLLECTION, c);

export const loadSettings = (): Settings => {
  const raw = readRaw(KEY_SETTINGS);
  const o = isRecord(raw) ? raw : {};
  const animation: AnimationMode = o.animation === 'voll' || o.animation === 'reduziert' ? o.animation : 'auto';
  return { dreamLuck: o.dreamLuck === true, muted: o.muted === true, animation };
};
export const saveSettings = (s: Settings): boolean => write(KEY_SETTINGS, s);

/** Mannschaften je Profil (neues Format); die Validierung übernimmt sanitizeTeamBook aus game/team. */
export const loadTeamsRaw = (): unknown => readRaw(KEY_TEAMS);
export const saveTeams = (book: unknown): boolean => write(KEY_TEAMS, book);

/** Altes gemeinsames Team (Format v1). Wird nur noch gelesen und bleibt als Sicherung im Speicher. */
export const loadTeamRaw = (): unknown => readRaw(KEY_TEAM);
export const saveTeam = (team: unknown): boolean => write(KEY_TEAM, team);
