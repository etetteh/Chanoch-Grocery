import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Serve static files from the dist directory, except index.html
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

// Handle React routing, return all requests to React app with injected env vars
app.get('*all', (req, res) => {
  const indexPath = path.join(__dirname, 'dist', 'index.html');
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
