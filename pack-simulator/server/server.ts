/**
 * Einstieg des Spielservers.
 *   node server/server.ts            (aus pack-simulator, Node ≥ 22.18)
 *   PORT=9000 node server/server.ts
 * Liefert zusätzlich das gebaute Frontend aus ../dist aus, falls vorhanden.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PORT, WS_PATH } from '../src/football/net/protocol.ts';
import { startGameServer } from './rooms.ts';

const MAX_PORT = 65_535;
const DIST_DIR = join(import.meta.dirname, '..', 'dist');

const portFromEnv = (raw: string | undefined): number => {
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 && port <= MAX_PORT ? port : DEFAULT_PORT;
};

const main = async (): Promise<void> => {
  const staticDir = existsSync(join(DIST_DIR, 'index.html')) ? DIST_DIR : null;
  const server = await startGameServer({ port: portFromEnv(process.env['PORT']), staticDir });
  console.log(`Spielserver läuft auf Port ${server.port} (WebSocket: ${WS_PATH}).`);
  console.log(staticDir ? `Frontend wird aus ${staticDir} ausgeliefert.` : 'Kein gebautes Frontend gefunden (npm run build) – nur WebSocket und /health.');
  const stop = async (): Promise<void> => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', () => { void stop(); });
  process.on('SIGTERM', () => { void stop(); });
};

await main();
