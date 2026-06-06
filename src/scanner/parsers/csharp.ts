/**
 * C# parser using tree-sitter-c-sharp when available, with a safe fallback.
 *
 * This scans for attribute nodes named `DeadCode` (or `DeadCodeAttribute`) and
 * extracts named arguments like expiry, reason, migration, ticket.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BuriedItem {
  filePath: string;
  lineNumber: number;
  functionName: string;
  language: 'csharp';
  expiry: Date;
  reason: string;
  migration?: string;
  ticket?: string;
  author?: string;
}

function extractArgs(text: string) {
  const pick = (key: string) => {
    const pattern = `${key}\\s*[:=]?\\s*\\"([^\\"]+)\\"`;
    const re = new RegExp(pattern, 'i');
    const m = text.match(re);
    return m ? m[1] : undefined;
  };
  return {
    expiry: pick('expiry'),
    reason: pick('reason'),
    migration: pick('migration'),
    ticket: pick('ticket'),
  };
}

function fallback(filePath: string): BuriedItem[] {
  const abs = path.resolve(filePath);
  const src = fs.readFileSync(abs, 'utf8');
  const results: BuriedItem[] = [];
  // Heuristic: iterate occurrences of [DeadCode(...)], then look forward for next identifier followed by '('
  let idx = 0;
  while ((idx = src.indexOf('[DeadCode', idx)) !== -1) {
    const startIdx = idx;
    const openParen = src.indexOf('(', startIdx);
    const closeBracket = src.indexOf(']', startIdx);
    const argsText = (openParen !== -1 && closeBracket !== -1 && closeBracket > openParen) ? src.slice(openParen + 1, closeBracket) : '';
    const after = closeBracket !== -1 ? src.slice(closeBracket + 1, closeBracket + 400) : src.slice(startIdx, startIdx + 400);
    const nameMatch = after.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    const lineNumber = src.slice(0, startIdx).split('\n').length;
    const { expiry, reason, migration, ticket } = extractArgs(argsText || '');
    const expiryDate = expiry ? new Date(expiry) : new Date(NaN);
    const name = nameMatch ? nameMatch[1] : 'unknown';
    if (name === 'unknown') {
      // debug assistance when tests fail — harmless in production
      // eslint-disable-next-line no-console
      console.log('csharp fallback: argsText=', argsText, 'after=', after.slice(0,200));
    }
    results.push({ filePath: abs, lineNumber, functionName: name, language: 'csharp', expiry: expiryDate, reason: reason || '', migration, ticket });
    idx = startIdx + 1;
  }
  return results;
}

export function parseFile(filePath: string): BuriedItem[] {
  // Try tree-sitter-based extraction first (best-effort). If tree-sitter is
  // not available or fails, fall back to the heuristic textual parser.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Parser = require('tree-sitter');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const CSharp = require('tree-sitter-c-sharp');

    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const parser = new Parser();
    parser.setLanguage(CSharp);
    const tree = parser.parse(src);
    const results: BuriedItem[] = [];

    const visit = (node: any) => {
      if (!node) return;
      if (node.type === 'attribute') {
        const nameNode = node.childForFieldName && node.childForFieldName('name');
        const name = nameNode ? src.slice(nameNode.startIndex, nameNode.endIndex) : '';
        if (/DeadCode/i.test(name) || /DeadCodeAttribute/i.test(name)) {
          // find containing declaration
          let decl: any = node.parent;
          while (decl && !/method_declaration|constructor_declaration|class_declaration|property_declaration|field_declaration/.test(decl.type)) {
            decl = decl.parent;
          }

          let targetName = 'unknown';
          let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
          if (decl) {
            const id = decl.childForFieldName && decl.childForFieldName('name');
            if (id) targetName = src.slice(id.startIndex, id.endIndex);
            if (decl.startPosition) lineNumber = decl.startPosition.row + 1;
          }

          const argsNode = node.childForFieldName && node.childForFieldName('argument_list');
          const argText = argsNode ? src.slice(argsNode.startIndex, argsNode.endIndex) : src.slice(node.startIndex, node.endIndex);
          const { expiry, reason, migration, ticket } = extractArgs(argText);
          const expiryDate = expiry ? new Date(expiry) : new Date(NaN);

          results.push({ filePath: abs, lineNumber, functionName: targetName, language: 'csharp', expiry: expiryDate, reason: reason || '', migration, ticket });
        }
      }

      if (node.namedChildren && node.namedChildren.length) {
        for (const c of node.namedChildren) visit(c);
      }
    };

    visit(tree.rootNode);

    // If tree-sitter didn't find any names, fall back to textual heuristic
    if (!results.length) return fallback(filePath);

    // Post-process unknown names
    for (const r of results) {
      if (r.functionName === 'unknown') {
        try {
          const lines = src.split('\n');
          const startIdx = Math.max(0, (r.lineNumber || 1) - 1);
          const window = lines.slice(startIdx, startIdx + 8).join('\n');
          const m = window.match(/([A-Za-z0-9_]+)\s*\(/);
          if (m) r.functionName = m[1];
        } catch (err) {
          // ignore
        }
      }
    }

    return results;
  } catch (err) {
    // tree-sitter not available or parse error — fallback to regex-based parser
    return fallback(filePath);
  }
}

export default { parseFile };
