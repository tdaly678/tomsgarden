import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * GitHub Pages project-page hosting serves the site under
 * `https://<user>.github.io/<repo>/`, so the build must use that repo name as
 * the base path. Override with VITE_BASE in CI if the repo is renamed.
 */
const base = process.env.VITE_BASE ?? '/tomsgarden/';

export default defineConfig({
  base,
  plugins: [react()],
});
