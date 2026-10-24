import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
// Explicit publish allowlist: no configuration, credentials, source maps, or
// arbitrary new files can enter the public artifact by being added to the repo.
const files = [
  'index.html', 'app.js', 'styles.css',
  'assets/glass-user-transparent.png', 'assets/glass-water-clean.png',
  'assets/lemon-photoreal-smooth.png', 'assets/yen-coin-real.png',
  'assets/woman-hand-crush-lemon.png', 'assets/woman-hand-crush-2-lemons.png',
];
execFileSync(process.execPath, ['--check', 'app.js'], { stdio: 'inherit' });
for (const file of files) {
  if (!(await lstat(file)).isFile()) throw new Error(`Not a regular publish file: ${file}`);
}
const source = await readFile('app.js', 'utf8');
if (/\beval\s*\(|new\s+Function\s*\(|\.innerHTML\s*=|\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(source)) throw new Error('Unexpected code execution, HTML injection, or network API. Review before publishing.');
const html = await readFile('index.html', 'utf8');
const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
for (const directive of ["default-src 'none'", "script-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
  if (!policy?.split(';').map(v => v.trim()).includes(directive)) throw new Error(`Missing security policy: ${directive}`);
}
if (/\son[a-z]+\s*=|<script\b[^>]*>\s*[^<\s]/i.test(html)) throw new Error('Inline scripts or event handlers are not allowed.');
const css = await readFile('styles.css', 'utf8');
if (/@import\b|url\s*\(/i.test(css)) throw new Error('Unexpected CSS resource loading.');
async function inspect(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isDirectory() && name === 'assets') await inspect(join(directory, entry.name), 'assets/');
    else if (!entry.isFile() || (!files.includes(name) && name !== '.nojekyll')) throw new Error(`Unexpected public artifact: ${name}`);
  }
}
await mkdir('dist/assets', { recursive: true });
await inspect('dist');
const hash = (content) => 'sha384-' + createHash('sha384').update(content).digest('base64');
let outputHtml = html.replace('href="styles.css"', `href="styles.css" integrity="${hash(css)}" crossorigin="anonymous"`)
  .replace(/src="app.js[^\"]*"/, `src="app.js?v=${createHash('sha256').update(source).digest('hex').slice(0, 16)}" integrity="${hash(source)}" crossorigin="anonymous"`);
for (const file of files) {
  if (file === 'index.html') await writeFile('dist/index.html', outputHtml);
  else await copyFile(file, join('dist', file));
}
await writeFile('dist/.nojekyll', '');
await inspect('dist');
console.log(`Built ${files.length + 1} allowlisted public files with integrity hashes.`);
