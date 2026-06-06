/**
 * C# parser stub
 * NOTE: For the initial implementation we provide a simple stub. A full
 * implementation would use the tree-sitter-c-sharp grammar to find
 * [DeadCode(...)] attributes. This stub returns an empty list.
 */

import * as fs from 'fs';

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

export function parseFile(filePath: string): BuriedItem[] {
  // TODO: implement with tree-sitter-c-sharp
  const src = fs.readFileSync(filePath, 'utf8');
  if (src.indexOf('[DeadCode(') >= 0) {
    // Very naive extraction could be added here, but we'll leave as TODO.
  }
  return [];
}

export default { parseFile };
