import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  const relative = pathname.includes('/pull/')
    ? 'tests/fixtures/github-files.html'
    : pathname.replace(/^\//, '');
  const file = normalize(join(root, relative));

  if (!file.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  response.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
  createReadStream(file)
    .on('error', () => response.writeHead(404).end('Not found'))
    .pipe(response);
}).listen(4173, '127.0.0.1', () => {
  console.log('Fixture: http://127.0.0.1:4173/eoinest/example/pull/1/files');
});

