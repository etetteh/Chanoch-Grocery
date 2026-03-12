import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // API routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    
    // Inject env vars for dev
    app.get('*all', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        
        const envScript = `<script>
          window.__ENV__ = {
            GEMINI_API_KEY: ${JSON.stringify(process.env.GEMINI_API_KEY || '')},
            API_KEY: ${JSON.stringify(process.env.API_KEY || '')}
          };
        </script>`;
        
        const html = template.replace('</head>', `${envScript}</head>`);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    // Serve static files from the dist directory, except index.html
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath, { index: false }));

    // Handle React routing, return all requests to React app with injected env vars
    app.get('*all', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
          console.error('Error reading index.html:', err);
          return res.status(500).send('Error loading application');
        }
        
        // Inject environment variables
        const envScript = `<script>
          window.__ENV__ = {
            GEMINI_API_KEY: ${JSON.stringify(process.env.GEMINI_API_KEY || '')},
            API_KEY: ${JSON.stringify(process.env.API_KEY || '')}
          };
        </script>`;
        
        const injectedData = data.replace('</head>', `${envScript}</head>`);
        res.send(injectedData);
      });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
