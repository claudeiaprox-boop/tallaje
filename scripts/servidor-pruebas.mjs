import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.join(project, 'public');
const config = JSON.parse(await readFile(path.join(project, 'firebase.json'), 'utf8'));
const types = { '.html':'text/html;charset=utf-8', '.mjs':'text/javascript;charset=utf-8', '.js':'text/javascript;charset=utf-8', '.wasm':'application/wasm', '.json':'application/json', '.md':'text/plain;charset=utf-8', '.task':'application/octet-stream', '.txt':'text/plain;charset=utf-8' };
const server = createServer(async (request,response) => {
 try {
  const route = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (route.split('/').some(part => part.startsWith('.'))) {response.writeHead(404);response.end();return;}
  let file = path.resolve(publicRoot, '.' + (route === '/' ? '/index.html' : route));
  if (!file.startsWith(publicRoot + path.sep)) {response.writeHead(403);response.end();return;}
  let code = 200;
  try { if (!(await stat(file)).isFile()) throw new Error('Not a file'); }
  catch { file = path.join(publicRoot,'404.html'); code = 404; }
  const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream'};
  for (const rule of config.hosting.headers) {
   if (rule.source === '**' || rule.source === route || (rule.source === '/vendor/**' && route.startsWith('/vendor/'))) {
    for (const header of rule.headers) headers[header.key] = header.value;
   }
  }
  response.writeHead(code,headers);if(request.method==='HEAD')response.end();else createReadStream(file).pipe(response);
 }catch {response.writeHead(500);response.end('No se pudo servir el archivo.');}
});
server.listen(5100,'127.0.0.1',()=>console.log('TallaLab: http://127.0.0.1:5100 (misma política de contenido que Hosting)'));
