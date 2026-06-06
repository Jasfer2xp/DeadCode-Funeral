"use strict";
/**
 * GRAVEYARD.md logger
 * - Appends a deletion record to GRAVEYARD.md in project root
 * - Ensures append-only behavior
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendRecord = appendRecord;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function appendRecord(item, prNumber, root = '.') {
    const gravePath = path.resolve(root, 'GRAVEYARD.md');
    const date = new Date().toISOString().slice(0, 10);
    const author = item.author ? `@${item.author.replace(/^@/, '')}` : 'unknown';
    const migration = item.migration || item.ticket || 'n/a';
    const entry = `\n## ${date} — ${item.functionName}\n- **File:** ${item.filePath} (line ${item.lineNumber})\n- **Language:** ${item.language}\n- **Reason:** ${item.reason || 'n/a'}\n- **Migration:** ${migration}\n- **Author:** ${author}\n- **PR:** ${prNumber ? `#${prNumber}` : 'n/a'}\n`;
    try {
        fs.appendFileSync(gravePath, entry, { encoding: 'utf8' });
        console.log(`Appended GRAVEYARD entry for ${item.functionName}`);
    }
    catch (err) {
        console.warn('Failed to append to GRAVEYARD.md:', err.message);
    }
}
exports.default = { appendRecord };
