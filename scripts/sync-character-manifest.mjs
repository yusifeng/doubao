#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const sourcePath = path.join(repoRoot, 'src/character/konan.md');
const outputPath = path.join(repoRoot, 'src/character/konanManifest.ts');

const source = fs.readFileSync(sourcePath, 'utf8').trim();
const generated = [
  '// AUTO-GENERATED FILE. DO NOT EDIT DIRECTLY.',
  '// Source: src/character/konan.md',
  '',
  `export const KONAN_CHARACTER_MANIFEST = ${JSON.stringify(source)};`,
  '',
].join('\n');

fs.writeFileSync(outputPath, generated, 'utf8');
console.log(`[sync-character-manifest] wrote ${path.relative(repoRoot, outputPath)}`);
