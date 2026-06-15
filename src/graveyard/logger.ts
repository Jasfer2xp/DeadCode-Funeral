/**
 * GRAVEYARD.md logger
 * - Appends a deletion record to GRAVEYARD.md in project root
 * - Ensures append-only behavior
 */

import * as fs from 'fs';
import * as path from 'path';
import type { BuriedItem } from '../scanner/index.js';

export function appendRecord(item: BuriedItem, prNumber?: number, root: string = '.') {
  const gravePath = path.resolve(root, 'GRAVEYARD.md');
  const date = new Date().toISOString().slice(0,10);
  const author = item.author ? `@${item.author.replace(/^@/, '')}` : 'unknown';
  const migration = item.migration || item.ticket || 'n/a';

  const entry = `\n## ${date} — ${item.functionName}\n- **File:** ${item.filePath} (line ${item.lineNumber})\n- **Language:** ${item.language}\n- **Reason:** ${item.reason || 'n/a'}\n- **Migration:** ${migration}\n- **Author:** ${author}\n- **PR:** ${prNumber ? `#${prNumber}` : 'n/a'}\n`;

  try {
    fs.appendFileSync(gravePath, entry, { encoding: 'utf8' });
    console.log(`Appended GRAVEYARD entry for ${item.functionName}`);
  } catch (err) {
    console.warn('Failed to append to GRAVEYARD.md:', (err as Error).message);
  }
}

export default { appendRecord };
