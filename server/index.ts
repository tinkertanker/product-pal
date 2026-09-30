// Entry point. One process, one port: Express serves the API, and either Vite
// (development) or the built files (production).

import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApi } from './api';
import { loadConfig } from './config';

const config = loadConfig();
const app = express();
if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
app.disable('x-powered-by');

app.use('/api', createApi(config));

const server = http.createServer(app);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  if (config.production) {
    const dist = path.join(root, 'dist');
    app.use(express.static(dist));
    app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root,
      appType: 'spa',
      server: { middlewareMode: true, hmr: { server } },
    });
    app.use(vite.middlewares);
  }

  server.listen(config.port, () => {
    console.log(`Product Thinker on http://localhost:${config.port} (${config.production ? 'production' : 'development'})`);
    if (config.codes.length === 0) console.warn('WORKSHOP_CODE is not set: nobody will be able to join.');
    if (!config.llm.baseUrl || !config.llm.apiKey || !config.llm.model) {
      console.warn('LLM_BASE_URL, LLM_API_KEY or LLM_MODEL is missing: the coach will not work.');
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
