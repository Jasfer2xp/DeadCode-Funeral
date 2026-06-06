/**
 * Python parser stub
 * NOTE: For the initial implementation this is a simple heuristic parser
 * that looks for @bury(...) decorators. A full implementation would use a
 * proper Python parser (tree-sitter-python) to reliably extract nodes.
 */
import * as fs from 'fs';
import * as path from 'path';
export function parseFile(filePath) {
    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const results = [];
    const re = /@bury\s*\(([^\)]*)\)\s*\ndef\s+([A-Za-z0-9_]+)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const args = m[1];
        const name = m[2];
        const lineNumber = src.slice(0, m.index).split('\n').length;
        const expiryMatch = args.match(/expiry\s*=\s*["']([^"']+)["']/);
        const reasonMatch = args.match(/reason\s*=\s*["']([^"']+)["']/);
        const ticketMatch = args.match(/ticket\s*=\s*["']([^"']+)["']/);
        const expiry = expiryMatch ? new Date(expiryMatch[1]) : new Date(NaN);
        results.push({
            filePath: abs,
            lineNumber,
            functionName: name,
            language: 'python',
            expiry,
            reason: reasonMatch ? reasonMatch[1] : '',
            ticket: ticketMatch ? ticketMatch[1] : undefined,
        });
    }
    return results;
}
export default { parseFile };
