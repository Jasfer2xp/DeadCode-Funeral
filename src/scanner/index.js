"use strict";
/**
 * Main scanner
 * - Walks the project directory
 * - Invokes language-specific parsers
 * - Returns a consolidated list of BuriedItem
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
exports.scan = scan;
const path = __importStar(require("path"));
const glob = __importStar(require("glob"));
const child_process_1 = require("child_process");
const tsParser = __importStar(require("./parsers/typescript"));
const pyParser = __importStar(require("./parsers/python"));
const csParser = __importStar(require("./parsers/csharp"));
const IGNORES = ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'];
/**
 * Scan a folder for buried items
 */
function scan(options = { root: '.' }) {
    const root = path.resolve(options.root || '.');
    // Find candidate files
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs'];
    const files = patterns
        .map((p) => glob.sync(p, { cwd: root, absolute: true, ignore: IGNORES }))
        .flat();
    const results = [];
    for (const file of files) {
        try {
            if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx')) {
                const parsed = tsParser.parseFile(file);
                results.push(...parsed);
            }
            else if (file.endsWith('.py')) {
                const parsed = pyParser.parseFile(file);
                results.push(...parsed);
            }
            else if (file.endsWith('.cs')) {
                const parsed = csParser.parseFile(file);
                results.push(...parsed);
            }
        }
        catch (err) {
            // Do not fail the whole scan on a single parse error
            console.warn(`Warning: failed to parse ${file}: ${err.message}`);
        }
    }
    // Populate author using `git blame` where possible. This is best-effort and
    // will not throw if git is not available.
    const getAuthorForLine = (filePath, lineNumber) => {
        try {
            const rel = path.relative(root, filePath).replace(/\\/g, '/');
            // Use porcelain format for predictable parsing
            const out = (0, child_process_1.execSync)(`git -C "${root}" blame --line-porcelain -L ${lineNumber},${lineNumber} -- "${rel}"`, { encoding: 'utf8' });
            const lines = out.split('\n');
            const authorLine = lines.find(l => l.startsWith('author '));
            const authorMailLine = lines.find(l => l.startsWith('author-mail '));
            if (authorLine) {
                const name = authorLine.replace(/^author\s+/, '').trim();
                return name;
            }
            if (authorMailLine) {
                return authorMailLine.replace(/^author-mail\s+/, '').trim();
            }
        }
        catch (err) {
            // ignore git errors
        }
        return undefined;
    };
    for (const it of results) {
        try {
            if (!it.author) {
                const a = getAuthorForLine(it.filePath, it.lineNumber);
                if (a)
                    it.author = a;
            }
        }
        catch (err) {
            // ignore per-item failures
        }
    }
    return results;
}
exports.default = { scan };
