/**
 * TypeScript / JavaScript annotation parser
 * - Looks for JSDoc comments containing @funeral { ... }
 * - Extracts expiry, reason, migration, ticket
 * - Attempts to find the function / class name that follows the JSDoc
 *
 * We prefer a simple, robust approach: regex to locate the JSDoc and heuristics
 * to find the next identifier. In a production implementation we'd use
 * tree-sitter for full AST reliability; this parser is written to be readable
 * and safe and to satisfy the initial project scaffolding.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BuriedItem {
  filePath: string;
  lineNumber: number;
  functionName: string;
  language: 'typescript' | 'javascript';
  expiry: Date;
  reason: string;
  migration?: string;
  ticket?: string;
  author?: string;
}

// Helper to extract fields using simple regexes from a JSDoc-like block
function extractFields(block: string) {
  const pick = (key: string) => {
    const re = new RegExp(key + '\\s*[:=]\\s*["']([^"']+)["']', 'i');
    const m = block.match(re);
    return m ? m[1] : undefined;
  };

  const expiry = pick('expiry');
  const reason = pick('reason');
  const migration = pick('migration');
  const ticket = pick('ticket');
  return { expiry, reason, migration, ticket };
}

// Find a name for the next top-level function/class/const after a position
function findFollowingName(source: string, idx: number) {
  const after = source.slice(idx);
  // Try function declaration: function name(
  const fnDecl = after.match(/function\s+([A-Za-z0-9_\$]+)\s*\(/);
  if (fnDecl) return fnDecl[1];

  // Try export function
  const expFn = after.match(/export\s+function\s+([A-Za-z0-9_\$]+)\s*\(/);
  if (expFn) return expFn[1];

  // Try const name = ( or = async (
  const constDecl = after.match(/(?:const|let|var)\s+([A-Za-z0-9_\$]+)\s*=\s*(?:async\s*)?[\(\w]/);
  if (constDecl) return constDecl[1];

  // Try class declaration
  const classDecl = after.match(/class\s+([A-Za-z0-9_\$]+)/);
  if (classDecl) return classDecl[1];

  // Fallback: attempt to read an exported default identifier
  const defaultExport = after.match(/export\s+default\s+function\s+([A-Za-z0-9_\$]+)/);
  if (defaultExport) return defaultExport[1];

  return 'unknown';
}

/**
 * Parse a TypeScript / JavaScript source file and return any buried items.
 * @param filePath absolute or relative path
 */
export function parseFile(filePath: string): BuriedItem[] {
  const abs = path.resolve(filePath);
  const src = fs.readFileSync(abs, 'utf8');

  const results: BuriedItem[] = [];

  // Regex to find JSDoc comment blocks
  const jsdocRe = /\/\*\*[\s\S]*?\*\//g;
  let m: RegExpExecArray | null;
  while ((m = jsdocRe.exec(src))) {
    const block = m[0];
    if (/\@funeral\b/i.test(block)) {
      // Extract fields
      const { expiry, reason, migration, ticket } = extractFields(block);
      // Determine line number where comment starts
      const startIndex = m.index;
      const lineNumber = src.slice(0, startIndex).split('\n').length;

      // Find the identifier that follows the comment
      const functionName = findFollowingName(src, m.index + m[0].length);

      // Parse expiry date defensively
      let expiryDate: Date = new Date(NaN);
      if (expiry) {
        const d = new Date(expiry);
        if (!isNaN(d.getTime())) expiryDate = d;
      }

      results.push({
        filePath: abs,
        lineNumber,
        functionName,
        language: filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript',
        expiry: expiryDate,
        reason: reason || '',
        migration: migration,
        ticket: ticket,
      });
    }
  }

  return results;
}

export default { parseFile };
