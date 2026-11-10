export type Collection = Readonly<Record<string, number>>;

export interface Settings {
  readonly dreamLuck: boolean;
  readonly muted: boolean;
}

const KEY_COLLECTION = 'fps.collection.v1';
const KEY_SETTINGS = 'fps.settings.v1';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch { return fallback; }
};

const write = (key: string, value: unknown): void => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Speicher nicht verfügbar */ }
};

export const loadCollection = (): Collection => read<Collection>(KEY_COLLECTION, {});
export const saveCollection = (c: Collection): void => write(KEY_COLLECTION, c);
export const loadSettings = (): Settings => read<Settings>(KEY_SETTINGS, { dreamLuck: false, muted: false });
export const saveSettings = (s: Settings): void => write(KEY_SETTINGS, s);
