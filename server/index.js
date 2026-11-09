// Runs the app on a PC. On Netlify, netlify/functions serves the same API instead.
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { createApi } from './api.js';
import { runJob } from './lib/store.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https://james-alderman-developer-portfolio.netlify.app'], upgradeInsecureRequests: null } } }));

const handle = createApi({
  startJob: async (id) => { runJob(id).catch((e) => console.error(`[report ${id}]`, e)); },
});

app.use('/api', express.raw({ type: '*/*', limit: '32kb' }), async (req, res, next) => {
  try {
    const headers = {};
    for (const name of ['content-type', 'authorization']) if (req.headers[name]) headers[name] = req.headers[name];
    const response = await handle(new Request(`http://${req.headers.host}${req.originalUrl}`, {
      method: req.method, headers, body: Buffer.isBuffer(req.body) && req.body.length ? req.body : undefined,
    }));
    res.status(response.status);
    response.headers.forEach((value, name) => res.set(name, value));
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (e) { next(e); }
});

const dist = path.join(config.root, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === 'GET' && !req.path.startsWith('/api') ? res.sendFile(path.join(dist, 'index.html')) : next()));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Something went wrong on the server.' });
});

app.listen(config.port, config.host, () => {
  console.log(`Industry Intelligence on http://${config.host}:${config.port}`);
});
