FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source and inject build-time env vars
COPY . .
ARG VITE_API_URL=https://backend-production-a6b7.up.railway.app
ARG VITE_WS_URL=wss://backend-production-a6b7.up.railway.app
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# Production stage: minimal node image with a custom static file server
FROM node:20-alpine

WORKDIR /app

# Copy built assets
COPY --from=builder /app/dist ./dist

# Write a simple Node.js static file server inline
RUN cat > server.js << 'JSEOF'
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT) || 8080;
const DIST = path.join(__dirname, 'dist');

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  let filePath = path.join(DIST, urlPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Try exact file first, then index.html (SPA fallback)
  function tryServe(fp) {
    fs.stat(fp, (err, stat) => {
      if (err || stat.isDirectory()) {
        // SPA fallback: serve index.html
        const idx = path.join(DIST, 'index.html');
        fs.readFile(idx, (e, data) => {
          if (e) { res.writeHead(404); res.end('Not found'); return; }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(data);
        });
      } else {
        const ext = path.extname(fp);
        const mime = MIME[ext] || 'application/octet-stream';
        fs.readFile(fp, (e, data) => {
          if (e) { res.writeHead(500); res.end('Error'); return; }
          res.writeHead(200, { 'Content-Type': mime });
          res.end(data);
        });
      }
    });
  }

  tryServe(filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server listening on port ' + PORT);
});
JSEOF

EXPOSE 8080

CMD ["node", "server.js"]
