/**
 * Python parser stub
 * NOTE: For the initial implementation this is a simple heuristic parser
 * that looks for @bury(...) decorators. A full implementation would use a
 * proper Python parser (tree-sitter-python) to reliably extract nodes.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BuriedItem {
  filePath: string;
  lineNumber: number;
  functionName: string;
  language: 'python';
  expiry: Date;
  reason: string;
  migration?: string;
  ticket?: string;
  author?: string;
}

export function parseFile(filePath: string): BuriedItem[] {
  const abs = path.resolve(filePath);
  const src = fs.readFileSync(abs, 'utf8');
  const results: BuriedItem[] = [];

  // Tight regex: @bury(...) followed by class or def (handles Django class-based views and functions)
  const tightRe = /@bury\s*\(([^)]*)\)\s*(?:\r?\n|\s)*?(?:class|def)\s+([A-Za-z0-9_]+)/g;
  for (const m of Array.from(src.matchAll(tightRe))) {
    const args = m[1];
    const name = m[2] || 'unknown';
    const lineNumber = src.slice(0, (m.index || 0)).split('\n').length;
    const expiryMatch = args.match(/expiry\s*=\s*["']([^"']+)["']/);
    const reasonMatch = args.match(/reason\s*=\s*["']([^"']+)["']/);
    const ticketMatch = args.match(/ticket\s*=\s*["']([^"']+)["']/);
    const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);
    results.push({ filePath: abs, lineNumber, functionName: name, language: 'python', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
  }

  return results;
}

export default { parseFile };
