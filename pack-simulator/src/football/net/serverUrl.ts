/** Wo läuft der Spielserver? Rein rechnende Auswahl, damit sie testbar bleibt. */
import { DEFAULT_PORT, WS_PATH } from './protocol.ts';

export interface PageLocation {
  readonly protocol: string;
  readonly hostname: string;
  /** Hostname mit Port, wie in `location.host`. */
  readonly host: string;
}

const HTTPS = 'https:';
const SECURE_WS = 'wss:';
const PLAIN_WS = 'ws:';
const LOOPBACK_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]', '::1'];
const LOCAL_SUFFIX = '.local';
const IPV4_PARTS = 4;
const BYTE_MAX = 255;
const CLASS_A_PRIVATE = 10;
const CLASS_B_PRIVATE = 172;
const CLASS_B_MIN = 16;
const CLASS_B_MAX = 31;
const CLASS_C_FIRST = 192;
const CLASS_C_SECOND = 168;

const ipv4 = (hostname: string): readonly number[] | null => {
  const parts = hostname.split('.').map((part) => (part && [...part].every((ch) => ch >= '0' && ch <= '9') ? Number(part) : NaN));
  return parts.length === IPV4_PARTS && parts.every((n) => n >= 0 && n <= BYTE_MAX) ? parts : null;
};

/** Adresse im eigenen Netz (10.x, 172.16–31.x, 192.168.x, *.local) oder der eigene Rechner. */
export const isLocalHost = (hostname: string): boolean => {
  const name = hostname.toLowerCase();
  if (LOOPBACK_HOSTS.includes(name) || name.endsWith(LOCAL_SUFFIX)) return true;
  const ip = ipv4(name);
  if (!ip) return false;
  const [first, second] = ip;
  const classB = first === CLASS_B_PRIVATE && second >= CLASS_B_MIN && second <= CLASS_B_MAX;
  const classC = first === CLASS_C_FIRST && second === CLASS_C_SECOND;
  return first === CLASS_A_PRIVATE || classB || classC;
};

/**
 * 1. Fest eingestellte Adresse (VITE_GAME_SERVER), falls gesetzt.
 * 2. Lokal bzw. im Heimnetz: derselbe Rechner auf Port 8787 (Server per `npm run server`).
 * 3. Sonst dieselbe Adresse wie die Seite – der Spielserver liefert dann auch das Frontend aus.
 */
export const resolveServerUrl = (configured: string | undefined, page: PageLocation): string => {
  const fixed = configured?.trim();
  if (fixed) return fixed;
  const scheme = page.protocol === HTTPS ? SECURE_WS : PLAIN_WS;
  return isLocalHost(page.hostname)
    ? `${scheme}//${page.hostname}:${DEFAULT_PORT}${WS_PATH}`
    : `${scheme}//${page.host}${WS_PATH}`;
};

/** Adresse des Spielservers für die aktuell geöffnete Seite. */
export const gameServerUrl = (): string => {
  const configured: unknown = import.meta.env['VITE_GAME_SERVER'];
  return resolveServerUrl(typeof configured === 'string' ? configured : undefined, window.location);
};
