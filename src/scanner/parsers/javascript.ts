// Lightweight wrapper that reuses the TypeScript parser for JS files.
import * as tsParser from './typescript';
export { BuriedItem } from './typescript';
export function parseFile(filePath: string) {
  return tsParser.parseFile(filePath);
}

export default { parseFile };
