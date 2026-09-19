import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDirectory = path.join(root, 'work', 'tmp');
mkdirSync(tempDirectory, { recursive: true });

const vitestCli = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const child = spawn(process.execPath, [vitestCli, ...process.argv.slice(2)], {
  env: { ...process.env, TEMP: tempDirectory, TMP: tempDirectory },
  stdio: 'inherit',
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

process.exit(exitCode);
