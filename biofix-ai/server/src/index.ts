import express from 'express';
import path from 'node:path';
import { aiConfigured, MODEL } from './ai.js';
import { corsOrigins, demoPayments, isProd, securityWarnings } from './config.js';
import { createMailer, mailConfigured } from './mailer.js';
import { createPlayClient } from './play.js';
import { createRouter, errorHandler, type Deps } from './routes.js';
import { parseDataKey, Store } from './store.js';

/** Routes that accept large bodies (photos, manuals). Their parser runs after sign-in, inside the router. */
const LARGE_BODY = new Set([
  '/api/diagnose', '/api/identify-device', '/api/solutions', '/api/courses',
  '/api/admin/docs', '/api/admin/ingest-pdf', '/api/admin/ocr',
]);

export function createApp(store: Store, deps: Deps) {
  const app = express();
  app.disable('x-powered-by');
  // Behind a reverse proxy (nginx, Render, Fly…) set TRUST_PROXY=1 so rate limits and HTTPS detection see the real client.
  // The value is the number of proxies in front (usually 1). Trusting more would let clients fake their address.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

  // Security headers. The API only ever returns JSON, so nothing may be framed, sniffed, cached or embedded.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store'); // responses contain personal data
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // REQUIRE_HTTPS=1 refuses plain-http requests outright (needs TRUST_PROXY behind a proxy).
    if (process.env.REQUIRE_HTTPS && !req.secure) { res.status(403).json({ error: 'insecure_url' }); return; }
    next();
  });

  // CORS only matters for browsers; the phone app is not subject to it. In production only the listed
  // origins may call the API from a web page. In development any origin may (for `expo start --web`).
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin) {
      const allowed = corsOrigins();
      if (allowed.includes(origin) || allowed.includes('*') || (!isProd() && allowed.length === 0)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization, x-lang, x-admin-token');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Max-Age', '600');
      }
    }
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // Anonymous callers (sign-in, health, Play notifications) may send small JSON bodies only.
  const small = express.json({ limit: '64kb' });
  app.use((req, res, next) => (LARGE_BODY.has(req.path) ? next() : small(req, res, next)));

  app.use('/api', createRouter(store, deps));
  app.use((_req, res) => { res.status(404).json({ error: 'not_found' }); });
  app.use(errorHandler);
  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('src', 'index.ts'));
if (isMain) {
  const file = process.env.DATA_FILE || path.resolve('data', 'db.json');
  const store = new Store(file, parseDataKey(process.env.DATA_ENCRYPTION_KEY));
  const port = Number(process.env.PORT || 8787);
  const play = createPlayClient();
  const server = createApp(store, { mailer: createMailer(), play }).listen(port, () => {
    console.log(`BioFix AI server on :${port}  model=${MODEL}  data=${file}${store.encrypted ? ' (encrypted)' : ''}`);
    console.log(`  ai:    ${aiConfigured() ? 'on' : 'OFF (set ANTHROPIC_API_KEY)'}`);
    console.log(`  play:  ${play ? `on (${play.packageName})` : 'OFF (set GOOGLE_PLAY_PACKAGE + GOOGLE_SERVICE_ACCOUNT_FILE)'}`);
    console.log(`  mail:  ${mailConfigured() ? 'on' : 'OFF (set SMTP_URL)'}`);
    console.log(`  demo payments: ${demoPayments() ? 'ON' : 'off'}`);
    const warnings = securityWarnings({ play: !!play, mail: mailConfigured(), encrypted: store.encrypted });
    if (warnings.length) console.warn('Security notes:\n' + warnings.map((w) => '  - ' + w).join('\n'));
  });
  // Slow or stalled clients must not hold connections open forever.
  server.headersTimeout = 20_000;
  server.requestTimeout = 120_000;

  setInterval(() => store.purge(), 60 * 60 * 1000).unref();
  // One failed background task must not take the whole server down.
  process.on('unhandledRejection', (e) => console.error('Unhandled rejection:', e instanceof Error ? e.stack || e.message : 'unknown'));
  const stop = () => { store.flush(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
