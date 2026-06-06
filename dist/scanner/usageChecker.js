/**
 * Usage checker
 * - Searches project files for occurrences of a function name
 * - Excludes the defining file
 * - Returns whether the function is used and a list of locations
 */
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
export function checkUsage(root, definingFile, functionName) {
    const absRoot = path.resolve(root || '.');
    const patterns = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.py', '**/*.cs'];
    const IGNORES = ['**/node_modules/**', '**/.git/**', '**/bin/**', '**/obj/**'];
    const files = patterns.map((p) => glob.sync(p, { cwd: absRoot, absolute: true, ignore: IGNORES })).flat();
    const usages = [];
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
    const nameRe = new RegExp(`\\b${escapeRegExp(functionName)}\\s*\\(`, 'g');
    for (const file of files) {
        if (path.resolve(file) === path.resolve(definingFile))
            continue;
        try {
            const src = fs.readFileSync(file, 'utf8');
            let m;
            while ((m = nameRe.exec(src))) {
                const line = src.slice(0, m.index).split('\n').length;
                usages.push(`${file}:${line}`);
            }
        }
        catch (err) {
            // ignore file read errors
        }
    }
    return { isUsed: usages.length > 0, usageLocations: usages };
}
export default { checkUsage };
