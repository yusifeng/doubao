import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = [
  path.join(ROOT),
  path.join(ROOT, '../ui'),
  path.join(ROOT, 'dialog-orchestrator'),
];

function walkTsFiles(dir: string, output: string[]) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === '__mocks__') {
        continue;
      }
      walkTsFiles(fullPath, output);
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      output.push(fullPath);
    }
  }
}

describe('voice semantic event guard', () => {
  it('does not allow upper layers to branch on nativeMessageType', () => {
    const files: string[] = [];
    for (const dir of TARGET_DIRS) {
      walkTsFiles(path.resolve(dir), files);
    }

    const violations: string[] = [];
    const decisionPattern = /(if\s*\([^\n)]*nativeMessageType[^\n)]*\)|switch\s*\([^\n)]*nativeMessageType[^\n)]*\)|nativeMessageType\s*===|nativeMessageType\s*!==|nativeMessageType\s*==|nativeMessageType\s*!=)/;

    for (const file of files) {
      const rel = path.relative(path.resolve(__dirname, '../../..'), file);
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (decisionPattern.test(line)) {
          violations.push(`${rel}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(violations).toEqual([]);
  });
});
