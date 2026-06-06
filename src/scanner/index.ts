/**
 * Main scanner
 * - Walks the project directory
 * - Invokes language-specific parsers
 * - Returns a consolidated list of BuriedItem
 */

import * as path from 'path';
import * as fs from 'fs';
import glob from 'glob';

import * as tsParser from './parsers/typescript';
import * as jsParser from './parsers/javascript';
import * as pyParser from './parsers/python';
import * as csParser from './parsers/csharp';

export type BuriedItem = tsParser.BuriedItem | pyParser.BuriedItem | csParser.BuriedItem;

export interface ScanOptions {
  root?: string;
  dryRun?: boolean;
}

const IGNORES = ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'];

/**
 * Scan a folder for buried items
 */
export function scan(options: ScanOptions = { root: '.' }): BuriedItem[] {
  const root = path.resolve(options.root || '.');

  // Find candidate files
  const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs'];
  const files = patterns
    .map((p) => glob.sync(p, { cwd: root, absolute: true, ignore: IGNORES }))
    .flat();

  const results: BuriedItem[] = [];

  for (const file of files) {
    try {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
        const parsed = tsParser.parseFile(file);
        results.push(...parsed as any);
      } else if (file.endsWith('.py')) {
        const parsed = pyParser.parseFile(file);
        results.push(...parsed as any);
      } else if (file.endsWith('.cs')) {
        const parsed = csParser.parseFile(file);
        results.push(...parsed as any);
      }
    } catch (err) {
      // Do not fail the whole scan on a single parse error
      console.warn(`Warning: failed to parse ${file}: ${(err as Error).message}`);
    }
  }

  return results;
}

export default { scan };
