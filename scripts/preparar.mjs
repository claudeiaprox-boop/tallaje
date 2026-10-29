import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const [template, styles, engine, fit, catalogs, app] = await Promise.all(
  ['src/index.html', 'src/style.css', 'src/engine.mjs', 'src/fit.mjs', 'src/catalogs.mjs', 'src/app.mjs'].map(path => readFile(new URL(path, root), 'utf8'))
);
const bundle = [engine, fit, catalogs, app].map(code => code.replace(/^import .+;\r?\n/gm, '')).join('\n').replace(/^export /gm, '');
const html = template.replace('<!--STYLES-->', () => `<style>\n${styles}\n</style>`).replace('<!--APP-->', () => `<script type="module">\n${bundle}\n</script>`);
if (!html.includes('getUserMedia') || html.includes('<!--APP-->')) throw new Error('La preparación de TallaLab no se completó.');
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
await writeFile(new URL('index.html', output), html, 'utf8');
await writeFile(new URL('TallaLab.html', output), html, 'utf8');
await writeFile(new URL('TallaLab.html', root), html, 'utf8');
for (const name of ['vision.mjs', 'pose-worker.mjs', 'pose-quality.mjs']) await copyFile(new URL(`src/${name}`, root), new URL(name, output));
for (const name of ['INVESTIGACION.md', 'PROMPT-DESARROLLO.md', 'METODO-PRECISION.md']) await copyFile(new URL(name, root), new URL(name, output));
await writeFile(new URL('404.html', output), `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Página no encontrada · TallaLab</title>
<body style="font:18px/1.6 system-ui;max-width:600px;margin:12vh auto;padding:24px;color:#16373c;background:#f3f6f2">
<h1>Esta página no existe</h1><p>Vuelve a TallaLab para iniciar una prueba.</p><a href="/">Abrir TallaLab</a></body></html>`, 'utf8');
console.log(`TallaLab listo para publicar en ${fileURLToPath(output)}`);
