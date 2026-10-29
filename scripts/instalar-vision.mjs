/** Download only the pinned local MediaPipe runtime; no npm install or account. */
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = path.resolve(projectRoot, 'public/vendor/mediapipe');
const manifest = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/vision-assets.json'), 'utf8'));
const verifyOnly = process.argv.includes('--verify-only');

function destination(relativePath) {
  const target = path.resolve(assetRoot, relativePath);
  if (!target.startsWith(assetRoot + path.sep)) throw new Error('La ruta del activo sale de la carpeta permitida.');
  return target;
}

function expectedHash(asset) {
  if (asset.sha256 && /^[a-f0-9]{64}$/.test(asset.sha256)) return asset.sha256;
  if (!asset.integrity?.startsWith('sha256-')) throw new Error('Falta SHA-256 para ' + asset.path);
  return Buffer.from(asset.integrity.slice(7), 'base64').toString('hex');
}

async function verifyFile(target, asset) {
  let stats;
  try { stats = await fs.stat(target); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  if (!stats.isFile() || stats.size !== asset.size) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest('hex') === expectedHash(asset);
}

async function download(asset, target) {
  const temporary = destination(asset.path + '.download');
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length !== asset.size) throw new Error('Tamaño inesperado: ' + body.length + ' bytes.');
    const actualHash = createHash('sha256').update(body).digest('hex');
    if (actualHash !== expectedHash(asset)) throw new Error('El SHA-256 no coincide con la versión fijada.');
    await fs.writeFile(temporary, body);
    await fs.rename(temporary, target);
  } catch (error) {
    // Only this installer's explicit temporary file is removed; never directories.
    await fs.rm(temporary, { force: true });
    throw new Error('No se pudo instalar ' + asset.path + ': ' + error.message);
  }
}

try {
  for (const asset of manifest.files) {
    const target = destination(asset.path);
    if (await verifyFile(target, asset)) {
      console.log('Verificado: ' + asset.path);
      continue;
    }
    if (verifyOnly) throw new Error('Activo ausente o alterado: ' + asset.path);
    await download(asset, target);
    if (!await verifyFile(target, asset)) throw new Error('Falló la verificación final de ' + asset.path);
    console.log('Instalado y verificado: ' + asset.path);
  }
  const totalBytes = manifest.files.reduce((sum, asset) => sum + asset.size, 0);
  console.log('MediaPipe ' + manifest.version + ': ' + manifest.files.length + ' archivos; ' + totalBytes + ' bytes verificados.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
