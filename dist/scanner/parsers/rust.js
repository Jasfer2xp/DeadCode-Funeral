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
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isFuneralComment = line.includes('@funeral');
        const isFuneralAttr = /#\s*\[\s*(?:dead_code_funeral|funeral)\b/.test(line);
        if (isFuneralComment || isFuneralAttr) {
            let block = line;
            let startIdx = i;
            let endIdx = i;
            if (isFuneralComment && line.trim().startsWith('//')) {
                // Extend backwards
                while (startIdx > 0 && lines[startIdx - 1].trim().startsWith('//')) {
                    startIdx--;
                }
                // Extend forwards through the rest of the comment block
                while (endIdx + 1 < lines.length && lines[endIdx + 1].trim().startsWith('//')) {
                    endIdx++;
                }
                block = lines.slice(startIdx, endIdx + 1).join('\n');
            }
            const { expiry, reason, migration, ticket } = extractFields(block);
            let name = 'unknown';
            for (let j = endIdx + 1; j < Math.min(lines.length, endIdx + 10); j++) {
                const nextLine = lines[j].trim();
                if (nextLine.startsWith('//') || nextLine.startsWith('#') || nextLine === '')
                    continue;
                // Matches fn function_name
                const fnMatch = nextLine.match(/^(?:pub\s+)?(?:const\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)\b/);
                // Matches struct StructName
                const structMatch = nextLine.match(/^(?:pub\s+)?struct\s+([A-Za-z0-9_]+)\b/);
                // Matches impl StructName
                const implMatch = nextLine.match(/^impl\b.*\b([A-Za-z0-9_]+)\s*\{/);
                if (fnMatch)
                    name = fnMatch[1];
                else if (structMatch)
                    name = structMatch[1];
                else if (implMatch)
                    name = implMatch[1];
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
                language: 'rust',
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
        const Rust = customRequire('tree-sitter-rust');
        const abs = path.resolve(filePath);
        const src = fs.readFileSync(abs, 'utf8');
        const parser = new Parser();
        parser.setLanguage(Rust);
        const tree = parser.parse(src);
        const results = [];
        const visit = (node) => {
            if (!node)
                return;
            const isComment = node.type === 'comment';
            const isAttr = node.type === 'attribute_item';
            if (isComment || isAttr) {
                const text = src.slice(node.startIndex, node.endIndex);
                if (/@funeral\b/i.test(text) || /dead_code_funeral|funeral/i.test(text)) {
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
                        if ((t === 'function_item' || t === 'struct_item' || t === 'impl_item') && follow.childForFieldName) {
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
                        language: 'rust',
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
