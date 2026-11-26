import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { initDatabaseConnection } from './server/config/database.js';
import { loadDb } from './server/repositories/dataStore.js';
import { initRealtimeServer } from './server/services/realtimeService.js';
import { apiRouter } from './server/routes/api.js';

export async function createAppServer(options: { skipVite?: boolean } = {}) {
  await initDatabaseConnection();
  loadDb();

  const app = express();
  const httpServer = http.createServer(app);
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Basic security headers compatible with iframe preview
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // REST API
  app.use('/api', apiRouter);

  // Socket.io attached on same HTTP server (Port 3000)
  initRealtimeServer(httpServer);

  const isProd = process.env.NODE_ENV === 'production';
  if (!options.skipVite) {
    if (!isProd) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distDir = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  // Multer & global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[+HR Server Error]', err.message);
    res.status(400).json({ error: err.message || 'Erreur serveur inattendue.' });
  });

  return { app, httpServer };
}

import { pathToFileURL } from 'url';
const isMainModule = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMainModule) {
  const PORT = Number(process.env.PORT || 3000);
  createAppServer().then(({ httpServer }) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[+HR] Server running on http://0.0.0.0:${PORT}`);
    });
  });
}
