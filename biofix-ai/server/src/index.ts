import express from 'express';
import path from 'node:path';
import { aiConfigured, MODEL } from './ai.js';
import { createRouter, errorHandler } from './routes.js';
import { Store } from './store.js';

export function createApp(store: Store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '45mb' }));
  // The app runs on phones (no CORS) and on web during development.
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.header('Access-Control-Allow-Headers', 'content-type, x-user-id, x-user-name, x-lang, x-admin-token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });
  app.use('/api', createRouter(store));
  app.use(errorHandler);
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('src', 'index.ts'));
if (isMain) {
  const file = process.env.DATA_FILE || path.resolve('data', 'db.json');
  const store = new Store(file);
  const port = Number(process.env.PORT || 8787);
  createApp(store).listen(port, () => {
    console.log(`BioFix AI server on :${port}  model=${MODEL}  ai=${aiConfigured() ? 'on' : 'OFF (set ANTHROPIC_API_KEY)'}  data=${file}`);
  });
  const stop = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
