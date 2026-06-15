/**
 * Python parser stub
 * NOTE: For the initial implementation this is a simple heuristic parser
 * that looks for @bury(...) decorators. A full implementation would use a
 * proper Python parser (tree-sitter-python) to reliably extract nodes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { customRequire } from '../requireHelper.js';

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

function fallback(filePath: string): BuriedItem[] {
  const abs = path.resolve(filePath);
  const src = fs.readFileSync(abs, 'utf8');
  const results: BuriedItem[] = [];

  // Tight regex: @bury(...) followed by class or def (handles Django class-based views and functions)
  const tightRe = /@bury\s*\(([^)]*)\)\s*(?:\r?\n|\s)*?(?:class|def)\s+([A-Za-z0-9_]+)/g;
  for (const m of Array.from(src.matchAll(tightRe))) {
    const args = m[1] || '';
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

export function parseFile(filePath: string): BuriedItem[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Parser = customRequire('tree-sitter');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Python = customRequire('tree-sitter-python');

    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const parser = new Parser();
    parser.setLanguage(Python);
    const tree = parser.parse(src);
    const results: BuriedItem[] = [];

    const visit = (node: any) => {
      if (!node) return;
      if (node.type === 'decorated_definition') {
        // Find any child decorator node that matches @bury
        let buryDec: any = null;
        if (node.namedChildren) {
          for (const c of node.namedChildren) {
            if (c.type === 'decorator') {
              const decText = src.slice(c.startIndex, c.endIndex);
              if (/@bury\b/i.test(decText)) {
                buryDec = c;
                break;
              }
            }
          }
        }

        if (buryDec) {
          // Find function or class child
          const targetNode = node.namedChildren && node.namedChildren.find((c: any) => c.type === 'function_definition' || c.type === 'class_definition');
          let name = 'unknown';
          let lineNumber = buryDec.startPosition ? buryDec.startPosition.row + 1 : 0;

          if (targetNode) {
            const idNode = targetNode.childForFieldName && targetNode.childForFieldName('name');
            if (idNode) {
              name = src.slice(idNode.startIndex, idNode.endIndex);
            }
            if (targetNode.startPosition) {
              // use the start of the actual definition for cleaner references
              lineNumber = targetNode.startPosition.row + 1;
            }
          }

          const decText = src.slice(buryDec.startIndex, buryDec.endIndex);
          const expiryMatch = decText.match(/expiry\s*=\s*["']([^"']+)["']/);
          const reasonMatch = decText.match(/reason\s*=\s*["']([^"']+)["']/);
          const ticketMatch = decText.match(/ticket\s*=\s*["']([^"']+)["']/);
          const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);

          results.push({ filePath: abs, lineNumber, functionName: name, language: 'python', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
        }
      }

      if (node.namedChildren && node.namedChildren.length) {
        for (const c of node.namedChildren) visit(c);
      }
    };

    visit(tree.rootNode);

    if (!results.length) return fallback(filePath);
    return results;
  } catch (err) {
    return fallback(filePath);
  }
}

export default { parseFile };
