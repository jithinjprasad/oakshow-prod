import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate dist directory (supports /app/dist inside container or local ./dist)
const DIST_DIR = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : fs.existsSync(path.join(process.cwd(), 'dist'))
    ? path.join(process.cwd(), 'dist')
    : fs.existsSync('/app/dist')
      ? '/app/dist'
      : fs.existsSync('/dist')
        ? '/dist'
        : path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const CDN_MEDIA_BASE = 'https://cdn.jsdelivr.net/gh/jithinjprasad/OakShow@main/public';

/**
 * Resolve the file on disk to serve for a given URL pathname
 */
function resolveFilePath(pathname) {
  let cleanPath = pathname;
  if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
  if (!cleanPath) cleanPath = 'index.html';

  // 1. Direct file match in DIST_DIR
  const resolvedDist = path.resolve(DIST_DIR, cleanPath);
  if (resolvedDist.startsWith(DIST_DIR) && fs.existsSync(resolvedDist) && fs.statSync(resolvedDist).isFile()) {
    return resolvedDist;
  }

  // 2. Clean URL match (e.g. /Jailer -> /Jailer.html) in DIST_DIR
  if (!path.extname(cleanPath)) {
    const withHtml = path.resolve(DIST_DIR, cleanPath + '.html');
    if (withHtml.startsWith(DIST_DIR) && fs.existsSync(withHtml) && fs.statSync(withHtml).isFile()) {
      return withHtml;
    }
  }

  // 3. Fallback to workspace root (for pics, Profiles, Galleries, favicon.png, etc.)
  const resolvedRoot = path.resolve(__dirname, cleanPath);
  if (resolvedRoot.startsWith(__dirname) && fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isFile()) {
    return resolvedRoot;
  }

  // 4. Fallback to public folder
  const resolvedPublic = path.resolve(__dirname, 'public', cleanPath);
  if (resolvedPublic.startsWith(path.join(__dirname, 'public')) && fs.existsSync(resolvedPublic) && fs.statSync(resolvedPublic).isFile()) {
    return resolvedPublic;
  }

  // 5. Image extension alias (.jpg <-> .jpeg) and directory alias (pics/Dhoomakethu <-> pics/Films/Dhoomakethu)
  const tryVariants = [];
  if (cleanPath.startsWith('pics/Dhoomakethu/')) {
    tryVariants.push(cleanPath.replace('pics/Dhoomakethu/', 'pics/Films/Dhoomakethu/'));
  } else if (cleanPath.startsWith('pics/Films/Dhoomakethu/')) {
    tryVariants.push(cleanPath.replace('pics/Films/Dhoomakethu/', 'pics/Dhoomakethu/'));
  }
  const baseVariants = [cleanPath, ...tryVariants];
  for (const p of baseVariants) {
    if (p.endsWith('.jpg')) tryVariants.push(p.replace(/\.jpg$/, '.jpeg'));
    if (p.endsWith('.jpeg')) tryVariants.push(p.replace(/\.jpeg$/, '.jpg'));
  }
  for (const altPath of tryVariants) {
    if (altPath === cleanPath) continue;
    const rDist = path.resolve(DIST_DIR, altPath);
    if (rDist.startsWith(DIST_DIR) && fs.existsSync(rDist) && fs.statSync(rDist).isFile()) return rDist;
    const rRoot = path.resolve(__dirname, altPath);
    if (rRoot.startsWith(__dirname) && fs.existsSync(rRoot) && fs.statSync(rRoot).isFile()) return rRoot;
  }

  return null;
}

/**
 * Serverless Handler for Scalix Functions (Web Request/Response API)
 */
export async function handler(req) {
  try {
    const rawUrl = typeof req === 'string' ? req : (req.url || '/');
    const url = new URL(rawUrl, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const method = (req.method || 'GET').toUpperCase();

    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Media CDN fallback for pictures not bundled locally
    if (pathname.startsWith('/pics/')) {
      const localFile = resolveFilePath(pathname);
      if (!localFile) {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': CDN_MEDIA_BASE + pathname,
            'Cache-Control': 'public, max-age=2592000, immutable'
          }
        });
      }
    }

    const matchedFile = resolveFilePath(pathname);

    if (matchedFile) {
      const ext = path.extname(matchedFile).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const isHtml = ext === '.html' || ext === '.htm';

      const headers = {
        'Content-Type': contentType,
      };

      if (isHtml) {
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      } else {
        headers['Cache-Control'] = 'public, max-age=2592000, immutable';
      }

      if (method === 'HEAD') {
        const stat = fs.statSync(matchedFile);
        headers['Content-Length'] = String(stat.size);
        return new Response(null, { status: 200, headers });
      }

      const fileBuffer = fs.readFileSync(matchedFile);
      headers['Content-Length'] = String(fileBuffer.length);
      return new Response(fileBuffer, { status: 200, headers });
    }

    // Static asset not found (don't serve SPA HTML for missing JS/CSS/image files)
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext !== '.html' && ext !== '.htm') {
      if (pathname === '/favicon.ico' || pathname === '/favicon.png') {
        const fav = path.resolve(DIST_DIR, 'favicon.ico');
        if (fs.existsSync(fav)) {
          const buf = fs.readFileSync(fav);
          return new Response(buf, {
            status: 200,
            headers: { 'Content-Type': 'image/x-icon', 'Cache-Control': 'public, max-age=2592000, immutable' }
          });
        }
      }
      return new Response('Not Found', { status: 404 });
    }

    // SPA Fallback: serve index.html for clean client routes
    const indexFile = path.resolve(DIST_DIR, 'index.html');
    if (fs.existsSync(indexFile)) {
      if (method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
          }
        });
      }
      const indexBuf = fs.readFileSync(indexFile);
      return new Response(indexBuf, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': String(indexBuf.length),
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export default handler;

// Standalone HTTP server for container execution
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain || process.env.STANDALONE_HTTP === 'true') {
  const PORT = process.env.PORT || 8080;
  const server = http.createServer(async (nodeReq, nodeRes) => {
    try {
      const fullUrl = 'http://' + (nodeReq.headers.host || 'localhost') + nodeReq.url;
      const webReq = new Request(fullUrl, {
        method: nodeReq.method,
        headers: nodeReq.headers,
      });

      const webRes = await handler(webReq);

      nodeRes.statusCode = webRes.status;
      webRes.headers.forEach((val, key) => {
        nodeRes.setHeader(key, val);
      });

      if (nodeReq.method === 'HEAD' || webRes.status === 302 || webRes.status === 204) {
        nodeRes.end();
        return;
      }

      const bodyBuffer = Buffer.from(await webRes.arrayBuffer());
      nodeRes.end(bodyBuffer);
    } catch (e) {
      console.error('Server error:', e);
      nodeRes.statusCode = 500;
      nodeRes.end('Internal Server Error');
    }
  });

  server.listen(PORT, () => {
    console.log(`OakShow server listening on port ${PORT} (dist: ${DIST_DIR})`);
  });
}
