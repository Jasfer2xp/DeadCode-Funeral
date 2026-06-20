/**
 * Main scanner
 * - Walks the project directory
 * - Invokes language-specific parsers
 * - Returns a consolidated list of BuriedItem
 */
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import { execFileSync } from 'child_process';
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
    const activeIgnores = [...IGNORES];
    // 1. Read .funeralignore
    const ignoreFile = path.join(root, '.funeralignore');
    if (fs.existsSync(ignoreFile)) {
        try {
            const content = fs.readFileSync(ignoreFile, 'utf8');
            const lines = content.split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0 && !line.startsWith('#'));
            activeIgnores.push(...lines);
        }
        catch (err) {
            // ignore read errors
        }
    }
    // 2. Read deadcode-funeral.json
    const configFile = path.join(root, 'deadcode-funeral.json');
    if (fs.existsSync(configFile)) {
        try {
            const content = fs.readFileSync(configFile, 'utf8');
            const json = JSON.parse(content);
            if (json && Array.isArray(json.ignore)) {
                activeIgnores.push(...json.ignore);
            }
        }
        catch (err) {
            // ignore config errors
        }
    }
    // 3. Add custom ignores from options
    if (options.ignore && Array.isArray(options.ignore)) {
        activeIgnores.push(...options.ignore);
    }
    // Find candidate files
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs', '**/*.php'];
    const files = patterns
        .map((p) => glob.sync(p, { cwd: root, absolute: true, ignore: activeIgnores }))
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
        if (isNaN(lineNumber) || lineNumber <= 0)
            return undefined;
        try {
            const rel = path.relative(root, filePath).replace(/\\/g, '/');
            // Use execFileSync to avoid command injection via filenames and save shell spawning overhead
            const out = execFileSync('git', ['-C', root, 'blame', '--line-porcelain', '-L', `${lineNumber},${lineNumber}`, '--', rel], { encoding: 'utf8' });
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
