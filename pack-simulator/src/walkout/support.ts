/** Prüft einmalig, ob der Browser WebGL bereitstellt (ohne die 3D-Bibliothek zu laden). */
let cached: boolean | null = null;
let failedAtRuntime = false;

export const webglSupported = (): boolean => {
  if (failedAtRuntime) return false;
  if (cached !== null) return cached;
  try {
    const c = document.createElement('canvas');
    cached = Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch { cached = false; }
  return cached;
};

/** Merkt sich für diese Sitzung, dass die 3D-Szene nicht lief – danach gilt die Ersatzenthüllung. */
export const markWebglFailed = (): void => { failedAtRuntime = true; };
