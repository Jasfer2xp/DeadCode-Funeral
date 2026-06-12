#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const git = simpleGit('.');

// We avoid requiring project modules to prevent ESM/CJS interop issues.
// Implement minimal removal heuristics for the example files here.

function removeBuriedFromPython(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*@bury\b/.test(l)) {
      // skip this decorator and the following indented block (class/def)
      // find next non-empty line
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) break;
      const indentMatch = lines[j].match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      // skip the declaration line
      j++;
      // skip indented block
      while (j < lines.length && (lines[j].startsWith(indent + '    ') || lines[j].trim() === '')) j++;
      i = j - 1;
      continue;
    }
    out.push(l);
  }
  return out.join('\n');
}

function removeBuriedFromPHP(src) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/(?:@funeral|DeadCode|\#\[DeadCode)/.test(l)) {
      // skip this line and following function/class until closing brace at same level
      // find next line that starts a function or class
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) break;
      // if starts with function or class, skip until matching braces
      if (/\b(function|class)\b/.test(lines[j])) {
        let brace = 0;
        // advance until we see matching braces
        while (j < lines.length) {
          if (lines[j].includes('{')) brace++;
          if (lines[j].includes('}')) brace--;
          j++;
          if (brace <= 0) break;
        }
        i = j - 1;
        continue;
      } else {
        // otherwise just skip the next line
        i = j;
        continue;
      }
    }
    out.push(l);
  }
  return out.join('\n');
}

const targets = [
  'tests/examples/django_project/views.py',
  'tests/examples/laravel_project/OldController.php'
];

function sanitizeBranch(name) {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

(async () => {
  for (const t of targets) {
    try {
      const filePath = path.resolve(t);
      if (!fs.existsSync(filePath)) {
        console.warn('Missing target file', filePath);
        continue;
      }
      const src = fs.readFileSync(filePath, 'utf8');
      // simple detection for burial annotations
      let language = 'unknown';
      if (/\.py$/.test(t)) language = 'python';
      if (/\.php$/.test(t)) language = 'php';
      if (/\.js$/.test(t) || /\.ts$/.test(t)) language = 'javascript';
      // find lines with @bury or @funeral or DeadCode
      const lines = src.split('\n');
      const matches = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/@bury\b|@funeral\b|DeadCode|DeadCodeAttribute|\[DeadCode/.test(l)) {
          // guess function/class name from a following def/class or function name
          let name = 'unknown';
          // look ahead a few lines
          for (let j = i; j < Math.min(i + 8, lines.length); j++) {
            const ll = lines[j];
            const mPy = ll.match(/class\s+([A-Za-z0-9_]+)/) || ll.match(/def\s+([A-Za-z0-9_]+)/);
            const mPhp = ll.match(/function\s+([A-Za-z0-9_]+)/) || ll.match(/class\s+([A-Za-z0-9_]+)/);
            if (mPy) { name = mPy[1]; break; }
            if (mPhp) { name = mPhp[1]; break; }
            const mJs = ll.match(/function\s+([A-Za-z0-9_]+)/) || ll.match(/class\s+([A-Za-z0-9_]+)/) || ll.match(/([A-Za-z0-9_]+)\s*=\s*\(/);
            if (mJs) { name = mJs[1]; break; }
          }
          matches.push({ line: i + 1, name });
        }
      }

      if (matches.length === 0) {
        console.log('No burial annotations found in', t);
        continue;
      }

      // For each match, attempt to remove and create branch
      for (let idx = 0; idx < matches.length; idx++) {
        const m = matches[idx];
        let newSrc = src;
        if (language === 'python') {
          newSrc = removeBuriedFromPython(src);
        } else if (language === 'php') {
          newSrc = removeBuriedFromPHP(src);
        } else {
          // fallback: remove the exact line with annotation
          const ls = src.split('\n');
          ls.splice(m.line - 1, 1);
          newSrc = ls.join('\n');
        }
        if (newSrc === src) {
          console.log('Remover made no change for', t, 'match', m);
          continue;
        }
        const branch = `deadcode-funeral/auto-remove-${sanitizeBranch(path.basename(t))}-${idx}-${new Date().toISOString().slice(0,10)}`;
        // ensure clean working tree
        const status = await git.status();
        if (status.files.length > 0) {
          console.warn('Working tree not clean; aborting branch creation for', t);
          break;
        }
        await git.checkoutLocalBranch(branch);
        fs.writeFileSync(filePath, newSrc, 'utf8');
        await git.add(t);
        await git.commit(`chore: apply DeadCode Funeral removal — ${t} (${m.name})`);
        await git.push('origin', branch);
        console.log('Pushed branch', branch);
        // switch back to main before next
        await git.checkout('main');
      }

    } catch (err) {
      console.error('Failed to apply for', t, err && err.message || err);
    }
  }
})();
