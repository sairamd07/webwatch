import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './src/server/config.js';
import { pagesRouter } from './src/server/routes/pages.js';
import { versionsRouter } from './src/server/routes/versions.js';
import { inspectorRouter } from './src/server/routes/inspector.js';
import { alertsRouter } from './src/server/routes/alerts.js';
import { healthRouter } from './src/server/routes/health.js';
import { demoRouter } from './src/server/routes/demo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = config.port || 3000;

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static storage endpoint for screenshots
  app.use('/api/storage/screenshots', express.static(config.screenshotsDir));

  // Mount API routes
  app.use('/api/pages', pagesRouter);
  app.use('/api/pages', versionsRouter);
  app.use('/api/inspect', inspectorRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/health', healthRouter);
  app.use('/demo', demoRouter);

  // Vite Dev Server Middleware or Production Static Assets
  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(__dirname, 'dist');

  if (isProduction && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[WebWatch] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[WebWatch] Fatal server startup error:', err);
  process.exit(1);
});
