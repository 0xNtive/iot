#!/usr/bin/env node

/**
 * wavepx CLI — launch the wavepx app locally.
 *
 * Usage:
 *   npx wavepx          # start on port 3000
 *   npx wavepx -p 8080  # custom port
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const APP_DIR = join(__dirname, '..', 'dist', 'app');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function parseArgs(args) {
  let port = 3000;
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-p' || args[i] === '--port') && args[i + 1]) {
      port = parseInt(args[i + 1], 10) || 3000;
    }
  }
  return { port };
}

const { port } = parseArgs(process.argv.slice(2));

const server = createServer(async (req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;

  // Strip query string
  filePath = filePath.split('?')[0];

  const fullPath = join(APP_DIR, filePath);

  // Prevent directory traversal
  if (!fullPath.startsWith(APP_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(fullPath);
    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    // Try index.html for SPA routing
    try {
      const index = await readFile(join(APP_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(index);
    } catch {
      res.writeHead(404);
      res.end('Not found — run "npm run build" first');
    }
  }
});

server.listen(port, () => {
  console.log();
  console.log('  \x1b[32m\x1b[1mWAVEPX\x1b[0m  data over sound');
  console.log();
  console.log(`  Local:   \x1b[36mhttp://localhost:${port}\x1b[0m`);
  console.log();
  console.log('  Press Ctrl+C to stop');
  console.log();
});
