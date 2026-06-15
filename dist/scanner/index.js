/**
 * Main scanner
 * - Walks the project directory
 * - Invokes language-specific parsers
 * - Returns a consolidated list of BuriedItem
 */
import * as path from 'path';
import * as glob from 'glob';
import { execSync } from 'child_process';
import * as tsParser from './parsers/typescript.js';
import * as pyParser from './parsers/python.js';
import * as csParser from './parsers/csharp.js';
import * as phpParser from './parsers/php.js';
const IGNORES = ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**', '**/dist/**', '**/out/**'];
/**
 * Scan a folder for buried items
 */
export function scan(options = { root: '.' }) {
    const root = path.resolve(options.root || '.');
    // Find candidate files
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs', '**/*.php'];
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
            else if (file.endsWith('.php')) {
                const parsed = phpParser.parseFile(file);
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
            const out = execSync(`git -C "${root}" blame --line-porcelain -L ${lineNumber},${lineNumber} -- "${rel}"`, { encoding: 'utf8' });
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
export default { scan };
