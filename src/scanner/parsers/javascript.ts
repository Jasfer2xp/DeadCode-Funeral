// Wrapper to parse JavaScript files using the TypeScript parser (tree-sitter handles JS via the same grammar)
import tsParser from './typescript';
export type { BuriedItem } from './typescript';
export function parseFile(filePath: string) {
  return tsParser.parseFile(filePath);
}

export default { parseFile };
