import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const git = (cmd: string): string => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
};

// Build-Kennung für den Info-Bereich: kurzer Commit-Hash, "+" bei nicht eingecheckten Änderungen.
const sha = git('git rev-parse --short HEAD') || 'lokal';
const dirty = git('git status --porcelain -- .') ? '+' : '';
const buildDate = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true, port: 5173 },
  define: {
    __BUILD_ID__: JSON.stringify(`${sha}${dirty}`),
    __BUILD_DATE__: JSON.stringify(`${buildDate} UTC`),
  },
});
