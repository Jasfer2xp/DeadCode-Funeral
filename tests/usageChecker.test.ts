/**
 * Tests for the import-aware usage checker.
 *
 * We create temporary source files on disk, run checkUsage, then clean up.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { checkUsage } from '../src/scanner/usageChecker';

// Helper: create a temp directory, return its path and a cleanup function
function makeTempDir(): { dir: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcf-usage-test-'));
  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────
// 1. Named import — exact match
// ──────────────────────────────────────────────────────────────────
test('detects named import of the function', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'src', 'utils.ts');
    const consumerFile = path.join(dir, 'src', 'app.ts');

    fs.mkdirSync(path.dirname(definingFile), { recursive: true });
    fs.writeFileSync(definingFile, `export function myFunc() { return 42; }`);
    fs.writeFileSync(
      consumerFile,
      `import { myFunc } from './utils';\nconsole.log(myFunc());`,
    );

    const res = checkUsage(dir, definingFile, 'myFunc');
    expect(res.isUsed).toBe(true);
    // Should have at least one import-type detection
    expect(res.usageDetails.some((d) => d.via === 'import')).toBe(true);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 2. Wildcard namespace import — alias.functionName usage
// ──────────────────────────────────────────────────────────────────
test('detects wildcard namespace import (alias.functionName)', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'lib', 'helpers.ts');
    const consumerFile = path.join(dir, 'app', 'main.ts');

    fs.mkdirSync(path.dirname(definingFile), { recursive: true });
    fs.mkdirSync(path.dirname(consumerFile), { recursive: true });
    fs.writeFileSync(definingFile, `export function compute() {}`);
    fs.writeFileSync(
      consumerFile,
      `import * as H from '../lib/helpers';\nH.compute();`,
    );

    const res = checkUsage(dir, definingFile, 'compute');
    expect(res.isUsed).toBe(true);
    expect(res.usageDetails.some((d) => d.via === 'wildcard-import')).toBe(true);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 3. Function NOT imported from defining file → not flagged as import
// ──────────────────────────────────────────────────────────────────
test('word-match fallback: function used globally but not imported from defining file', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'orig.ts');
    const otherFile = path.join(dir, 'other.ts');

    // defining file exports `legacyHelper`
    fs.writeFileSync(definingFile, `export function legacyHelper() {}`);
    // other.ts defines its own `legacyHelper` locally — NOT importing from orig.ts
    fs.writeFileSync(
      otherFile,
      `function legacyHelper() { return 1; }\nlegacyHelper();`,
    );

    const res = checkUsage(dir, definingFile, 'legacyHelper');
    // Should still be detected via word-match fallback (conservative)
    expect(res.isUsed).toBe(true);
    expect(res.usageDetails.some((d) => d.via === 'word-match')).toBe(true);
    // Should NOT be flagged as an explicit import from defining file
    expect(res.usageDetails.some((d) => d.via === 'import')).toBe(false);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 4. Function with NO usages anywhere → isUsed = false
// ──────────────────────────────────────────────────────────────────
test('returns isUsed=false when function name appears nowhere else', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'module.ts');
    const unrelatedFile = path.join(dir, 'unrelated.ts');

    fs.writeFileSync(definingFile, `export function __orphanFn9z8__() {}`);
    fs.writeFileSync(unrelatedFile, `export const x = 1;`);

    const res = checkUsage(dir, definingFile, '__orphanFn9z8__');
    expect(res.isUsed).toBe(false);
    expect(res.usageLocations).toHaveLength(0);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 5. Named import with `as` alias — original exported name matters
// ──────────────────────────────────────────────────────────────────
test('detects renamed import (import { foo as bar }) by original exported name', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'svc.ts');
    const consumerFile = path.join(dir, 'consumer.ts');

    fs.writeFileSync(definingFile, `export function foo() {}`);
    fs.writeFileSync(
      consumerFile,
      `import { foo as bar } from './svc';\nbar();`,
    );

    const res = checkUsage(dir, definingFile, 'foo');
    expect(res.isUsed).toBe(true);
    // The import of `foo` (even aliased) should be detected
    expect(res.usageDetails.some((d) => d.via === 'import')).toBe(true);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 6. Side-effect import → conservatively flagged as used
// ──────────────────────────────────────────────────────────────────
test('side-effect import is conservatively flagged', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'setup.ts');
    const consumerFile = path.join(dir, 'bootstrap.ts');

    fs.writeFileSync(definingFile, `export function init() {}`);
    // Side-effect import: no binding at all
    fs.writeFileSync(consumerFile, `import './setup';`);

    const res = checkUsage(dir, definingFile, 'init');
    expect(res.isUsed).toBe(true);
    expect(res.usageDetails.some((d) => d.via === 'import')).toBe(true);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 7. Python file — word-boundary fallback
// ──────────────────────────────────────────────────────────────────
test('detects usage in a Python file via word-boundary search', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'utils.py');
    const consumerFile = path.join(dir, 'views.py');

    fs.writeFileSync(definingFile, `def my_helper():\n    pass`);
    fs.writeFileSync(
      consumerFile,
      `from utils import my_helper\nmy_helper()`,
    );

    const res = checkUsage(dir, definingFile, 'my_helper');
    expect(res.isUsed).toBe(true);
    expect(res.usageDetails.some((d) => d.via === 'word-match')).toBe(true);
  } finally {
    cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────
// 8. UsageResult backward-compat: usageLocations is file:line strings
// ──────────────────────────────────────────────────────────────────
test('usageLocations contains file:line strings', () => {
  const { dir, cleanup } = makeTempDir();
  try {
    const definingFile = path.join(dir, 'a.ts');
    const consumerFile = path.join(dir, 'b.ts');

    fs.writeFileSync(definingFile, `export function fn() {}`);
    fs.writeFileSync(consumerFile, `import { fn } from './a';\nfn();`);

    const res = checkUsage(dir, definingFile, 'fn');
    expect(res.usageLocations.length).toBeGreaterThan(0);
    for (const loc of res.usageLocations) {
      // Must be file:lineNumber format
      expect(loc).toMatch(/^.+:\d+$/);
    }
  } finally {
    cleanup();
  }
});
