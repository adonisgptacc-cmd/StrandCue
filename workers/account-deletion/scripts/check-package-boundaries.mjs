import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(packageRoot, 'src');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return nested.flat().filter((path) => path.endsWith('.ts'));
}

for (const file of await sourceFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), match[1]);
    if (relative(packageRoot, target).startsWith('..')) {
      throw new Error(`Worker source import escapes its locked package: ${relative(packageRoot, file)}`);
    }
  }
}

console.log('Worker package imports are self-contained.');
