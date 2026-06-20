/**
 * Usage checker (import-aware)
 *
 * Strategy:
 * 1. Compute the module identifier for the defining file (relative paths, minus extension).
 * 2. For TypeScript/JavaScript consumer files:
 *    a. Scan import declarations to detect if any import from the defining module.
 *    b. If a named import, check if `functionName` is in the imported bindings.
 *    c. If a wildcard / default import, record the namespace alias and check for `alias.functionName` usage.
 *    d. If a bare side-effect import, treat as "used" (conservative).
 * 3. For all files (including non-TS/JS), apply the original word-boundary search as a fallback.
 *    This ensures Python (`from module import fn`), C# (`using`), etc. are covered heuristically.
 * 4. De-duplicate and return merged results.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';

export interface UsageLocation {
  file: string;
  line: number;
  /** How the usage was detected */
  via: 'import' | 'wildcard-import' | 'word-match';
}

export interface UsageResult {
  isUsed: boolean;
  /** Compact file:line strings for backward compatibility */
  usageLocations: string[];
  /** Detailed usage records */
  usageDetails: UsageLocation[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Given a file path, derive the set of module specifier strings that other
 * files might use to import it.  We generate multiple variants because
 * consumers may use relative paths with or without extensions, and index
 * files introduce additional forms.
 *
 * Returns lowercase-normalised specifiers (path sep → '/').
 */
function moduleSpecifiersFor(filePath: string, root: string): string[] {
  const abs = path.resolve(filePath);
  const absRoot = path.resolve(root);

  // Relative path from project root (forward slashes)
  const fromRoot = path.relative(absRoot, abs).replace(/\\/g, '/');

  // Strip known extensions
  const stripExt = (p: string) => p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  const noExt = stripExt(fromRoot);

  // e.g. src/utils/helper
  const specifiers: string[] = [noExt, fromRoot];

  // If the file is an index file, also add the parent dir
  const base = path.basename(noExt);
  if (base === 'index') {
    specifiers.push(path.dirname(noExt).replace(/\\/g, '/'));
  }

  // Add ./ prefix variants as consumers often use relative imports
  // We can't know the exact relative path from each consumer, so we store
  // a suffix match flag — handled by the caller.
  return [...new Set(specifiers)];
}

/**
 * Returns true if `importSpecifier` resolves to one of our module specifiers.
 * Handles relative imports by resolving against the consumer's directory.
 */
function specifierMatchesDefining(
  importSpecifier: string,
  consumerFile: string,
  definingSpecifiers: string[],
  absRoot: string,
): boolean {
  // Absolute / root-relative specifiers (rare in non-bundled projects)
  if (!importSpecifier.startsWith('.')) {
    // bare specifier — match against src-root-relative path (no leading ./)
    return definingSpecifiers.some(
      (s) => s === importSpecifier || s.endsWith('/' + importSpecifier),
    );
  }

  // Relative import: resolve from the consumer's directory
  const consumerDir = path.dirname(path.resolve(consumerFile));
  const resolved = path.resolve(consumerDir, importSpecifier).replace(/\\/g, '/');
  const rootNorm = absRoot.replace(/\\/g, '/');

  // Strip extension for comparison
  const stripExt = (p: string) => p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
  const resolvedNoExt = stripExt(resolved);

  return definingSpecifiers.some((spec) => {
    const absSpec = stripExt(path.resolve(absRoot, spec).replace(/\\/g, '/'));
    return resolvedNoExt === absSpec || resolved === path.resolve(absRoot, spec).replace(/\\/g, '/');
  });
}

// ---------------------------------------------------------------------------
// TS/JS import analysis
// ---------------------------------------------------------------------------

interface ImportRecord {
  specifier: string;
  /** Named bindings, e.g. `import { foo, bar }` → ['foo', 'bar'] */
  named: string[];
  /** Namespace alias, e.g. `import * as utils` → 'utils' */
  namespaceAlias: string | null;
  /** Default import name, e.g. `import React` → 'React' */
  defaultAlias: string | null;
  /** Side-effect only: `import './module'` */
  sideEffectOnly: boolean;
  /** Line number (1-based) */
  line: number;
}

/**
 * Extract all import declarations from TypeScript/JavaScript source text.
 * Uses regex-based parsing (no AST dependency) for speed and portability.
 */
function extractImports(src: string): ImportRecord[] {
  const records: ImportRecord[] = [];

  // Match static import declarations:
  //   import 'specifier'
  //   import defaultExport from 'specifier'
  //   import * as ns from 'specifier'
  //   import { a, b as c } from 'specifier'
  //   import defaultExport, { a, b } from 'specifier'
  //   import defaultExport, * as ns from 'specifier'
  const importRe =
    /^[ \t]*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;
  // Side-effect imports: import 'specifier'
  const sideEffectRe = /^[ \t]*import\s+['"]([^'"]+)['"]/gm;

  // Also handle dynamic imports inline for usage detection:
  // await import('specifier') / require('specifier')
  const dynamicRe = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  let m: RegExpExecArray | null;

  // Side-effect imports
  while ((m = sideEffectRe.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    records.push({
      specifier: m[1],
      named: [],
      namespaceAlias: null,
      defaultAlias: null,
      sideEffectOnly: true,
      line,
    });
  }

  // Static imports with `from`
  while ((m = importRe.exec(src)) !== null) {
    const clause = m[1].trim();
    const specifier = m[2];
    const line = src.slice(0, m.index).split('\n').length;

    const named: string[] = [];
    let namespaceAlias: string | null = null;
    let defaultAlias: string | null = null;

    // `* as ns`
    const nsMatch = clause.match(/\*\s+as\s+([A-Za-z0-9_$]+)/);
    if (nsMatch) {
      namespaceAlias = nsMatch[1];
    }

    // Named imports `{ foo, bar as baz }`
    const namedMatch = clause.match(/\{([^}]+)\}/);
    if (namedMatch) {
      const parts = namedMatch[1].split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        // "original as alias" — we want the original exported name
        const asMatch = trimmed.match(/^([A-Za-z0-9_$]+)\s+as\s+[A-Za-z0-9_$]+$/);
        if (asMatch) {
          named.push(asMatch[1]);
        } else if (/^[A-Za-z0-9_$]+$/.test(trimmed)) {
          named.push(trimmed);
        }
      }
    }

    // Default import: clause without `*` and without `{}`
    if (!nsMatch && !namedMatch) {
      // whole clause is the default alias
      if (/^[A-Za-z0-9_$]+$/.test(clause)) {
        defaultAlias = clause;
      }
    } else if (!nsMatch) {
      // Could be `defaultAlias, { named }` — check what comes before `{`
      const beforeBrace = clause.split('{')[0].trim().replace(/,$/, '').trim();
      if (beforeBrace && /^[A-Za-z0-9_$]+$/.test(beforeBrace)) {
        defaultAlias = beforeBrace;
      }
    }

    records.push({ specifier, named, namespaceAlias, defaultAlias, sideEffectOnly: false, line });
  }

  // Dynamic imports (record specifier, named=[],  namespaceAlias=null, treated as side-effect)
  while ((m = dynamicRe.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    records.push({
      specifier: m[1],
      named: [],
      namespaceAlias: null,
      defaultAlias: null,
      sideEffectOnly: true,
      line,
    });
  }

  return records;
}

/**
 * Analyze a single TS/JS consumer file for usage of `functionName` from the
 * defining module.
 */
function analyzeConsumer(
  consumerFile: string,
  functionName: string,
  definingSpecifiers: string[],
  absRoot: string,
): UsageLocation[] {
  let src: string;
  try {
    src = fs.readFileSync(consumerFile, 'utf8');
  } catch {
    return [];
  }

  const imports = extractImports(src);
  const usages: UsageLocation[] = [];

  for (const imp of imports) {
    if (!specifierMatchesDefining(imp.specifier, consumerFile, definingSpecifiers, absRoot)) {
      continue;
    }

    // This file imports from the defining module
    if (imp.sideEffectOnly) {
      // Side-effect import — conservatively flag as used
      usages.push({ file: consumerFile, line: imp.line, via: 'import' });
      continue;
    }

    if (imp.namespaceAlias) {
      // `import * as ns from '...'` — check if `ns.functionName` appears in the file
      const nsUsageRe = new RegExp(
        `\\b${escapeRegExp(imp.namespaceAlias)}\\.${escapeRegExp(functionName)}\\b`,
        'g',
      );
      let mu: RegExpExecArray | null;
      while ((mu = nsUsageRe.exec(src)) !== null) {
        const line = src.slice(0, mu.index).split('\n').length;
        usages.push({ file: consumerFile, line, via: 'wildcard-import' });
      }
      continue;
    }

    if (imp.named.includes(functionName)) {
      // Named import — confirmed import
      usages.push({ file: consumerFile, line: imp.line, via: 'import' });
      continue;
    }

    if (imp.defaultAlias && imp.named.length === 0) {
      // Default import. The default export could be the function itself,
      // or a module object (e.g. `export default { functionName }`).
      // Check both `alias(` and `alias.functionName` as likely usages.
      const aliasRe = new RegExp(
        `\\b${escapeRegExp(imp.defaultAlias)}(?:\\.${escapeRegExp(functionName)})?\\b`,
        'g',
      );
      let mu: RegExpExecArray | null;
      while ((mu = aliasRe.exec(src)) !== null) {
        const line = src.slice(0, mu.index).split('\n').length;
        usages.push({ file: consumerFile, line, via: 'import' });
      }
    }
  }

  return usages;
}

// ---------------------------------------------------------------------------
// Non-TS/JS heuristic search
// ---------------------------------------------------------------------------

const TS_JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

function isTsJs(file: string): boolean {
  return TS_JS_EXTS.has(path.extname(file).toLowerCase());
}

/**
 * Word-boundary search across file content.
 * Used for non-TS/JS files and as a supplementary fallback.
 */
function wordBoundarySearch(
  file: string,
  functionName: string,
): UsageLocation[] {
  let src: string;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }

  const nameRe = new RegExp(`\\b${escapeRegExp(functionName)}\\b`, 'g');
  const usages: UsageLocation[] = [];
  let m: RegExpExecArray | null;
  while ((m = nameRe.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length;
    usages.push({ file, line, via: 'word-match' });
  }
  return usages;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function checkUsage(
  root: string,
  definingFile: string,
  functionName: string,
): UsageResult {
  const absRoot = path.resolve(root || '.');
  const absDefining = path.resolve(definingFile);

  // Glob all candidate files (same patterns as scanner)
  const IGNORES = ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**', '**/dist/**', '**/out/**'];
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs', '**/*.php', '**/*.go', '**/*.rs'];
  const files = patterns
    .map((p) => glob.sync(p, { cwd: absRoot, absolute: true, ignore: IGNORES }))
    .flat()
    .filter((f) => path.resolve(f) !== absDefining);

  const definingSpecifiers = moduleSpecifiersFor(absDefining, absRoot);

  const allDetails: UsageLocation[] = [];
  const seenKeys = new Set<string>(); // deduplicate file:line

  for (const file of files) {
    let locations: UsageLocation[];

    if (isTsJs(file)) {
      // Import-aware analysis for TS/JS consumers
      locations = analyzeConsumer(file, functionName, definingSpecifiers, absRoot);

      // If the file has no matching import, still do a word-boundary scan
      // (e.g., dynamic usage, re-exported symbols, eval strings, etc.)
      // but mark it clearly as a weaker signal.
      if (locations.length === 0) {
        locations = wordBoundarySearch(file, functionName);
      }
    } else {
      // Non-TS/JS: fall back to word-boundary search
      locations = wordBoundarySearch(file, functionName);
    }

    for (const loc of locations) {
      const key = `${loc.file}:${loc.line}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        allDetails.push(loc);
      }
    }
  }

  return {
    isUsed: allDetails.length > 0,
    usageLocations: allDetails.map((l) => `${l.file}:${l.line}`),
    usageDetails: allDetails,
  };
}

export default { checkUsage };
