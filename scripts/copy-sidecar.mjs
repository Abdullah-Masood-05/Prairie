// Copies the bisond server binary from the build output into
// src-tauri/bin/ so the local-database sidecar works.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load .env.local if it exists to retrieve BISONDB_BUILD_DIR
const envLocalPath = join(root, '.env.local');
if (existsSync(envLocalPath)) {
  try {
    const content = readFileSync(envLocalPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.substring(0, idx).trim();
          const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
          process.env[key] = val;
        }
      }
    }
  } catch (e) {
    console.warn(`Warning: failed to read .env.local file: ${e.message}`);
  }
}

const exe = process.platform === 'win32' ? 'bisond.exe' : 'bisond';
const target = join(root, 'src-tauri', 'bin', exe);

let source = null;
const buildDir = process.env.BISONDB_BUILD_DIR;

if (buildDir) {
  const candidate = resolve(root, buildDir, exe);
  if (existsSync(candidate)) {
    source = candidate;
  }
}

if (source) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`copied ${source} -> ${target}`);
} else {
  if (existsSync(target)) {
    console.log(`Using existing binary at target: ${target}`);
  } else {
    console.error(`Error: bisond binary not found.`);
    if (buildDir) {
      console.error(`Looked in BISONDB_BUILD_DIR: ${resolve(root, buildDir)}`);
    } else {
      console.error(`BISONDB_BUILD_DIR environment variable is not set.`);
    }
    console.error(`Please set the BISONDB_BUILD_DIR environment variable (or specify it in .env.local) to point to your BisonDB build output directory containing ${exe}.`);
    console.error(`Alternatively, place the ${exe} binary manually in the target directory: src-tauri/bin/${exe}`);
    process.exit(1);
  }
}

