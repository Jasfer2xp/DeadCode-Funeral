/**
 * PHP parser for Laravel and generic PHP projects
 * - Looks for DocBlock-style @funeral annotations
 * - Supports PHP 8 attribute style #[DeadCode(...)]
 * This is a heuristic parser; tree-sitter-php can be integrated later for AST-accurate parsing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { customRequire } from '../requireHelper.js';

export interface BuriedItem {
  filePath: string;
  lineNumber: number;
  functionName: string;
  language: 'php';
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

  // Match PHP 8 attribute: #[DeadCode(expiry: "2025-01-01", reason: "x")]
  const attrRe = /#\s*\[\s*DeadCode\s*\(([^\)]*)\)\s*\]\s*(?:public\s+|protected\s+|private\s+)?(?:function\s+([A-Za-z0-9_]+)\s*\(|class\s+([A-Za-z0-9_]+)\b)/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(src))) {
    const args = m[1] || '';
    const name = m[2] || m[3] || 'unknown';
    const lineNumber = src.slice(0, m.index).split('\n').length;
    const expiryMatch = args.match(/expiry\s*[:=]\s*["']([^"']+)["']/);
    const reasonMatch = args.match(/reason\s*[:=]\s*["']([^"']+)["']/);
    const ticketMatch = args.match(/ticket\s*[:=]\s*["']([^"']+)["']/);
    const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);
    results.push({ filePath: abs, lineNumber, functionName: name, language: 'php', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
  }

  // Match DocBlock style /** @funeral { expiry: "2025-01-01", reason: "x" } */\nfunction name
  const docRe = /\/\*\*[\s\S]*?@funeral\s*\{([\s\S]*?)\}[\s\S]*?\*\/\s*(?:function\s+([A-Za-z0-9_]+)\s*\(|class\s+([A-Za-z0-9_]+)\b)/g;
  while ((m = docRe.exec(src))) {
    const args = m[1] || '';
    const name = m[2] || m[3] || 'unknown';
    const lineNumber = src.slice(0, m.index).split('\n').length;
    const expiryMatch = args.match(/expiry\s*[:=]\s*["']([^"']+)["']/);
    const reasonMatch = args.match(/reason\s*[:=]\s*["']([^"']+)["']/);
    const ticketMatch = args.match(/ticket\s*[:=]\s*["']([^"']+)["']/);
    const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);
    results.push({ filePath: abs, lineNumber, functionName: name, language: 'php', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
  }

  return results;
}

export function parseFile(filePath: string): BuriedItem[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Parser = customRequire('tree-sitter');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const PHP = customRequire('tree-sitter-php');

    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const parser = new Parser();
    parser.setLanguage(PHP);
    const tree = parser.parse(src);
    const results: BuriedItem[] = [];

    const visit = (node: any) => {
      if (!node) return;

      if (node.type === 'attribute') {
        const text = src.slice(node.startIndex, node.endIndex);
        if (/DeadCode/i.test(text)) {
          let decl = node.parent;
          while (decl && !/function_definition|class_declaration|method_declaration/.test(decl.type)) {
            decl = decl.parent;
          }

          let name = 'unknown';
          let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
          if (decl) {
            const idNode = decl.childForFieldName && decl.childForFieldName('name');
            if (idNode) {
              name = src.slice(idNode.startIndex, idNode.endIndex);
            }
            if (decl.startPosition) {
              lineNumber = decl.startPosition.row + 1;
            }
          }

          const expiryMatch = text.match(/expiry\s*[:=]\s*["']([^"']+)["']/);
          const reasonMatch = text.match(/reason\s*[:=]\s*["']([^"']+)["']/);
          const ticketMatch = text.match(/ticket\s*[:=]\s*["']([^"']+)["']/);
          const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);

          results.push({ filePath: abs, lineNumber, functionName: name, language: 'php', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
        }
      }

      if (node.type === 'comment') {
        const text = src.slice(node.startIndex, node.endIndex);
        if (/@funeral\b/i.test(text)) {
          let follow = node.nextSibling;
          let parent = node.parent;
          while (!follow && parent) {
            follow = parent.nextSibling;
            parent = parent.parent;
          }

          let name = 'unknown';
          let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
          if (follow) {
            const idNode = follow.childForFieldName && follow.childForFieldName('name');
            if (idNode) {
              name = src.slice(idNode.startIndex, idNode.endIndex);
            }
          }

          const expiryMatch = text.match(/expiry\s*[:=]\s*["']([^"']+)["']/);
          const reasonMatch = text.match(/reason\s*[:=]\s*["']([^"']+)["']/);
          const ticketMatch = text.match(/ticket\s*[:=]\s*["']([^"']+)["']/);
          const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);

          results.push({ filePath: abs, lineNumber, functionName: name, language: 'php', expiry, reason: reasonMatch ? reasonMatch[1] : '', ticket: ticketMatch ? ticketMatch[1] : undefined });
        }
      }

      if (node.children && node.children.length) {
        for (const c of node.children) visit(c);
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
