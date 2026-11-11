/** Liefert das gebaute Frontend aus, damit ein einziges Deployment (Seite + WebSocket) genügt. */
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, sep } from 'node:path';

export type HttpHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const INDEX_FILE = 'index.html';
const HEALTH_PATH = '/health';
const FALLBACK_TYPE = 'application/octet-stream';
const READ_METHODS: readonly string[] = ['GET', 'HEAD'];

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
});

const respond = (response: ServerResponse, status: number, type: string, body: string | Buffer): void => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-cache' });
  response.end(body);
};

const safeDecode = (text: string): string | null => {
  try {
    return decodeURIComponent(text);
  } catch {
    // Fehlerhaft kodierte Pfade gelten als nicht vorhanden.
    return null;
  }
};

/** Datei unterhalb des Wurzelordners oder null – Pfade, die nach außen zeigen, werden verworfen. */
const resolveInside = (root: string, urlPath: string): string | null => {
  const decoded = safeDecode(urlPath);
  if (decoded === null) return null;
  const full = join(root, decoded);
  const target = full === root || full.endsWith(sep) ? join(full, INDEX_FILE) : full;
  return target.startsWith(root + sep) ? target : null;
};

const readIfFile = async (path: string): Promise<Buffer | null> => {
  try {
    const info = await stat(path);
    return info.isFile() ? await readFile(path) : null;
  } catch {
    // Eine fehlende Datei ist der Normalfall für unbekannte Pfade und führt zur 404-Antwort.
    return null;
  }
};

/**
 * HTTP-Antworten des Spielservers: `/health` für Betriebsprüfungen, sonst Dateien aus `root`.
 * Ohne `root` (kein gebautes Frontend vorhanden) gibt es nur einen kurzen Hinweistext.
 */
export const createHttpHandler = (root: string | null, roomCount: () => number): HttpHandler => async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (path === HEALTH_PATH) return respond(response, HTTP_OK, CONTENT_TYPES['.json'], JSON.stringify({ ok: true, rooms: roomCount() }));
  if (!READ_METHODS.includes(request.method ?? '')) return respond(response, HTTP_METHOD_NOT_ALLOWED, CONTENT_TYPES['.html'], 'Nicht erlaubt');
  if (!root) return respond(response, HTTP_OK, CONTENT_TYPES['.html'], 'Spielserver läuft. WebSocket unter /ws.');
  const file = resolveInside(root, path);
  const body = file ? await readIfFile(file) : null;
  if (file && body) return respond(response, HTTP_OK, CONTENT_TYPES[extname(file)] ?? FALLBACK_TYPE, body);
  const index = file && !extname(path) ? await readIfFile(join(root, INDEX_FILE)) : null;
  return index
    ? respond(response, HTTP_OK, CONTENT_TYPES['.html'], index)
    : respond(response, HTTP_NOT_FOUND, CONTENT_TYPES['.html'], 'Nicht gefunden');
};
