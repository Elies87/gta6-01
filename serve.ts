// Server statis kecil untuk memainkan game/ secara lokal: `node serve.ts [--port 8123]`
// menyajikan folder game/ di http://localhost:<port>. Hanya untuk pengembangan — ia menolak
// path yang keluar dari game/, mengirim MIME yang dibutuhkan game browser, dan tidak melakukan
// hal lain. Node 22, pustaka standar saja.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));

const cliArgs = process.argv.slice(2);
const portFlagAt = cliArgs.indexOf('--port');
const envPort = Number(process.env.PORT ?? '');
const flagPort = portFlagAt === -1 ? NaN : Number(cliArgs[portFlagAt + 1]);
const chosenPort = [flagPort, envPort, 8080].find((n) => Number.isInteger(n) && n > 0 && n < 65536) ?? 8080;

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = resolve(join(gameRoot, normalize(pathname)));
  if (target !== gameRoot && !target.startsWith(gameRoot + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let byteCount: number;
  try {
    const info = statSync(target);
    if (!info.isFile()) throw new Error('not a file');
    byteCount = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': byteCount,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(response);
});
server.listen(chosenPort, '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${chosenPort}`);
});
