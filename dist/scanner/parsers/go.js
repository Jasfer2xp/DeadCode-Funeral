import * as fs from 'fs';
import * as path from 'path';
import { customRequire } from '../requireHelper.js';
function extractFields(block) {
    const pick = (key) => {
        const pattern = `${key}\\s*[:=]\\s*["']([^"']+)["']`;
        const re = new RegExp(pattern, 'i');
        const m = block.match(re);
        return m ? m[1] : undefined;
    };
    const expiry = pick('expiry');
    const reason = pick('reason');
    const migration = pick('migration');
    const ticket = pick('ticket');
    return { expiry, reason, migration, ticket };
}
function fallback(filePath) {
    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const results = [];
    // Match Go block comment /* ... @funeral ... */ or single line comment // ... @funeral ...
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('@funeral')) {
            // Find comment block — extend backwards AND forwards through consecutive // lines
            let block = line;
            let startIdx = i;
            let endIdx = i;
            if (line.trim().startsWith('//')) {
                // Extend backwards
                while (startIdx > 0 && lines[startIdx - 1].trim().startsWith('//')) {
                    startIdx--;
                }
                // Extend forwards
                while (endIdx + 1 < lines.length && lines[endIdx + 1].trim().startsWith('//')) {
                    endIdx++;
                }
                block = lines.slice(startIdx, endIdx + 1).join('\n');
            }
            const { expiry, reason, migration, ticket } = extractFields(block);
            // Look ahead for the following declaration (start from end of comment block)
            let name = 'unknown';
            for (let j = endIdx + 1; j < Math.min(lines.length, endIdx + 10); j++) {
                const nextLine = lines[j].trim();
                if (nextLine.startsWith('//') || nextLine === '')
                    continue;
                // Matches func FunctionName(
                const funcMatch = nextLine.match(/^func\s+([A-Za-z0-9_]+)\s*\(/);
                // Matches func (r *Recv) FunctionName(
                const methodMatch = nextLine.match(/^func\s*\([^)]+\)\s*([A-Za-z0-9_]+)\s*\(/);
                // Matches type TypeName struct
                const structMatch = nextLine.match(/^type\s+([A-Za-z0-9_]+)\s+(?:struct|interface)/);
                if (funcMatch)
                    name = funcMatch[1];
                else if (methodMatch)
                    name = methodMatch[1];
                else if (structMatch)
                    name = structMatch[1];
                break;
            }
            let expiryDate = new Date(NaN);
            if (expiry) {
                const d = new Date(expiry);
                if (!isNaN(d.getTime()))
                    expiryDate = d;
            }
            results.push({
                filePath: abs,
                lineNumber: startIdx + 1,
                functionName: name,
                language: 'go',
                expiry: expiryDate,
                reason: reason || '',
                migration,
                ticket
            });
        }
    }
    return results;
}
export function parseFile(filePath) {
    try {
        const Parser = customRequire('tree-sitter');
        const Go = customRequire('tree-sitter-go');
        const abs = path.resolve(filePath);
        const src = fs.readFileSync(abs, 'utf8');
        const parser = new Parser();
        parser.setLanguage(Go);
        const tree = parser.parse(src);
        const results = [];
        const visit = (node) => {
            if (!node)
                return;
            if (node.type === 'comment') {
                const text = src.slice(node.startIndex, node.endIndex);
                if (/@funeral\b/i.test(text)) {
                    const { expiry, reason, migration, ticket } = extractFields(text);
                    let follow = node.nextSibling;
                    let parent = node.parent;
                    while (!follow && parent) {
                        follow = parent.nextSibling;
                        parent = parent.parent;
                    }
                    let name = 'unknown';
                    let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
                    if (follow) {
                        const t = follow.type;
                        if ((t === 'function_declaration' || t === 'method_declaration' || t === 'type_declaration') && follow.childForFieldName) {
                            const idNode = follow.childForFieldName('name');
                            if (idNode) {
                                name = src.slice(idNode.startIndex, idNode.endIndex);
                            }
                        }
                    }
                    let expiryDate = new Date(NaN);
                    if (expiry) {
                        const d = new Date(expiry);
                        if (!isNaN(d.getTime()))
                            expiryDate = d;
                    }
                    results.push({
                        filePath: abs,
                        lineNumber,
                        functionName: name,
                        language: 'go',
                        expiry: expiryDate,
                        reason: reason || '',
                        migration,
                        ticket
                    });
                }
            }
            if (node.children && node.children.length) {
                for (const c of node.children)
                    visit(c);
            }
        };
        visit(tree.rootNode);
        if (!results.length)
            return fallback(filePath);
        return results;
    }
    catch (err) {
        return fallback(filePath);
    }
}
export default { parseFile };
