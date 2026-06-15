import * as path from 'path';
import * as fs from 'fs';
import { scan } from '../src/scanner/index.js';
import prCreator from '../src/github/prCreator.js';

function unifiedDiff(original: string, modified: string) {
  // Very small unified diff for review purposes
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const diffs: string[] = [];
  diffs.push('--- original');
  diffs.push('+++ modified');
  const max = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < max; i++) {
    const o = origLines[i];
    const m = modLines[i];
    if (o === m) {
      diffs.push(' ' + (o === undefined ? '' : o));
    } else {
      if (o !== undefined) diffs.push('-' + o);
      if (m !== undefined) diffs.push('+' + m);
    }
  }
  return diffs.join('\n');
}

export function generateDiffsForRoot(rootDir: string, outDir: string) {
  const items = scan({ root: rootDir });
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const results: string[] = [];
  for (const it of items) {
    try {
      const abs = (it as any).filePath;
      const src = fs.readFileSync(abs, 'utf8');
      const newSrc = prCreator.removeBuriedCode(src, it);
      if (src === newSrc) continue;
      const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
      const diff = unifiedDiff(src, newSrc);
      const outPath = path.join(outDir, rel + '.diff');
      const outFolder = path.dirname(outPath);
      if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });
      fs.writeFileSync(outPath, diff, 'utf8');
      results.push(outPath);
    } catch (err) {
      console.warn('Failed to process item', it, (err as Error).message);
    }
  }
  return results;
}

// CLI
if (require.main === module) {
  const root = process.argv[2] || '.';
  const out = process.argv[3] || path.join(process.cwd(), 'out', 'diffs');
  console.log('Scanning', root);
  const files = generateDiffsForRoot(root, out);
  console.log('Generated diffs:', files);
}
