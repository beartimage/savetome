import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'extension');
const buildRoot = path.join(root, 'build', 'extensions');
const downloads = path.join(root, 'public', 'extensions');
const sharedFiles = ['popup.html', 'popup.css', 'popup.js', 'service-worker.js', 'icons'];

async function assemble(name, manifestFile) {
  const target = path.join(buildRoot, name);
  await mkdir(target, { recursive: true });
  for (const entry of sharedFiles) {
    await cp(path.join(source, entry), path.join(target, entry), { recursive: true });
  }
  const manifest = await readFile(path.join(source, manifestFile), 'utf8');
  await writeFile(path.join(target, 'manifest.json'), manifest);
  return target;
}

function zipFolder(folder, output) {
  const result = spawnSync('/usr/bin/zip', ['-q', '-r', '-9', output, '.'], {
    cwd: folder,
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error(result.stderr || `Could not create ${output}`);
}

await rm(buildRoot, { recursive: true, force: true });
await rm(downloads, { recursive: true, force: true });
await mkdir(downloads, { recursive: true });

const chromium = await assemble('chromium', 'manifest.json');
const firefox = await assemble('firefox', 'manifest.firefox.json');

zipFolder(chromium, path.join(downloads, 'saveto-me-chrome-edge-brave-opera.zip'));
zipFolder(firefox, path.join(downloads, 'saveto-me-firefox.xpi'));
zipFolder(chromium, path.join(downloads, 'saveto-me-safari-web-extension-source.zip'));

console.log('Browser extension packages created in public/extensions/');
