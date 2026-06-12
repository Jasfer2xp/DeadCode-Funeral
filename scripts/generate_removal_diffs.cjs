const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Use a local remover implementation to avoid ESM/CJS interop issues with src/*.js

function removeBuriedCodeLocal(source, item) {
  if (!item || !item.language) return source;
  const lang = item.language;
  if (lang === 'php') {
    // simple: remove DocBlock with @funeral or attribute #[DeadCode] and following declaration
    const lines = source.split('\n');
    const idx = Math.max(0, (item.lineNumber || 1) - 1);
    // search upward for /** or attribute
    let start = idx;
    while (start >= 0 && !/\/\*/.test(lines[start]) && !/\[\s*#?DeadCode/.test(lines[start])) start--;
    if (start < 0) start = idx;
    // find following declaration line
    let decl = -1;
    for (let i = start + 1; i < Math.min(lines.length, start + 20); i++) {
      if (/function\s+[A-Za-z0-9_]+\s*\(|class\s+[A-Za-z0-9_]+\b/.test(lines[i])) { decl = i; break; }
    }
    const end = decl !== -1 ? decl : Math.min(start + 6, lines.length - 1);
    const before = lines.slice(0, Math.min(start, decl !== -1 ? start : start)).join('\n');
    const after = lines.slice(end + 1).join('\n');
    return before + '\n' + after;
  }

  // JS/TS heuristic similar to prCreator
  const startLineIdx = (item.lineNumber || 1) - 1;
  const lines = source.split('\n');
  let start = startLineIdx;
  while (start >= 0 && /\*\*/.test(lines[start]) === false && /\/\*/.test(lines[start]) === false) {
    start--;
  }
  if (start < 0) start = startLineIdx;

  let declStart = -1;
  let declEnd = -1;
  const declRegex = /(?:export\s+default\s+function|export\s+function|export\s+default|export\s+const|export\s+class|function\s+|class\s+|(?:const|let|var)\s+[A-Za-z0-9_]+\s*=)/i;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (declRegex.test(line)) {
      declStart = i;
      let braceCount = 0;
      const foundBlock = /\{/.test(line);
      if (foundBlock) {
        for (let j = i; j < lines.length; j++) {
          const l = lines[j];
          for (const ch of l) {
            if (ch === '{') braceCount++;
            if (ch === '}') braceCount--;
          }
          if (braceCount <= 0) { declEnd = j; break; }
        }
      } else {
        for (let j = i; j < Math.min(i + 6, lines.length); j++) {
          if (/;\s*$/.test(lines[j]) || lines[j].trim() === '') { declEnd = j; break; }
        }
        if (declEnd === -1) declEnd = i;
      }
      break;
    }
  }

  let startRemove = start;
  let endRemove = declEnd !== -1 ? declEnd : Math.min(start + 6, lines.length - 1);
  if (declStart !== -1 && declStart < start) startRemove = declStart;
  if (declStart !== -1) startRemove = Math.min(start, declStart);
  const before = lines.slice(0, startRemove).join('\n');
  const after = lines.slice(endRemove + 1).join('\n');
  return before + '\n' + after;
}

const prCreator = { removeBuriedCode: removeBuriedCodeLocal };

function unifiedDiff(original, modified) {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const diffs = [];
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

function generate(rootDir, outDir) {
  const absRoot = path.resolve(rootDir);
  // Instead of invoking the TypeScript scanner (ts-node issues in some envs),
  // perform a best-effort textual scan for buried annotations across common file types.
  const glob = require('glob');
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs', '**/*.php'];
  const IGNORES = ['**/node_modules/**', '**/.git/**', '**/dist/**', 'out/**'];
  const files = patterns.map(p => glob.sync(p, { cwd: absRoot, absolute: true, ignore: IGNORES })).flat();
  const items = [];
  for (const file of files) {
    try {
      const src = fs.readFileSync(file, 'utf8');
      if (!/\@funeral|\@bury|DeadCode/.test(src)) continue;
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\@funeral|\@bury|DeadCode/.test(line)) {
          // heuristically find following declaration name
          let name = 'unknown';
          for (let j = i; j < Math.min(i + 8, lines.length); j++) {
            const l = lines[j];
            const m1 = l.match(/function\s+([A-Za-z0-9_]+)/);
            if (m1) { name = m1[1]; break; }
            const m2 = l.match(/class\s+([A-Za-z0-9_]+)/);
            if (m2) { name = m2[1]; break; }
            const m3 = l.match(/(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/);
            if (m3) { name = m3[1]; break; }
            const m4 = l.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/);
            if (m4) { name = m4[1]; break; }
            const m5 = l.match(/\[\s*#?DeadCode/);
            if (m5) { name = 'unknown'; break; }
          }
          const lang = file.endsWith('.php') ? 'php' : file.endsWith('.py') ? 'python' : file.endsWith('.cs') ? 'csharp' : (file.endsWith('.ts') || file.endsWith('.tsx')) ? 'typescript' : 'javascript';
          items.push({ filePath: file, lineNumber: i + 1, functionName: name, language: lang, expiry: new Date(NaN), reason: '' });
        }
      }
    } catch (err) {
      // ignore
    }
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (const it of items) {
    try {
      const abs = path.resolve(it.filePath);
      const src = fs.readFileSync(abs, 'utf8');
      const newSrc = prCreator.removeBuriedCode(src, it);
      if (src === newSrc) continue;
      const rel = path.relative(absRoot, abs).replace(/\\/g, '/');
      const diff = unifiedDiff(src, newSrc);
      const outPath = path.join(outDir, rel + '.diff');
      const outFolder = path.dirname(outPath);
      if (!fs.existsSync(outFolder)) fs.mkdirSync(outFolder, { recursive: true });
      fs.writeFileSync(outPath, diff, 'utf8');
      results.push(outPath);
    } catch (err) {
      console.warn('Failed to process item', it.filePath, err.message);
    }
  }
  return results;
}

if (require.main === module) {
  const root = process.argv[2] || '.';
  const out = process.argv[3] || path.join(process.cwd(), 'out', 'diffs');
  const files = generate(root, out);
  console.log('Generated diffs:', files);
}
