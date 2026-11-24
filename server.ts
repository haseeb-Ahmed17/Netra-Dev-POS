import 'dotenv/config';
import path from 'node:path';
import express from 'express';
import { createPosExpressApp } from './serverApp';

export { createPosExpressApp };

const PORT = Number(process.env.PORT || 3000);

async function startServer() {
  const app = createPosExpressApp();

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
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
    console.log(`Khaas Retail / SmartBitz POS listening on http://0.0.0.0:${PORT}`);
  });
}

const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('server.ts');

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start POS server:', err);
    process.exit(1);
  });
}
