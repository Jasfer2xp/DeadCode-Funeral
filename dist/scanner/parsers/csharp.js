/**
 * C# parser using tree-sitter-c-sharp when available, with a safe fallback.
 *
 * This scans for attribute nodes named `DeadCode` (or `DeadCodeAttribute`) and
 * extracts named arguments like expiry, reason, migration, ticket.
 */
import * as fs from 'fs';
import * as path from 'path';
function extractArgs(text) {
    const pick = (key) => {
        const pattern = `${key}\\s*[:=]?\\s*["']([^"']+)["']`;
        const re = new RegExp(pattern, 'i');
        const m = text.match(re);
        return m ? m[1] : undefined;
    };
    return {
        expiry: pick('expiry'),
        reason: pick('reason'),
        migration: pick('migration'),
        ticket: pick('ticket'),
    };
}
function inferDeclarationName(text) {
    const methodMatch = text.match(/\b(?:public|private|protected|internal|static|virtual|override|sealed|async|readonly|partial|\s)+[\w<>\[\],?\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (methodMatch)
        return methodMatch[1];
    const typeMatch = text.match(/\b(?:class|struct|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (typeMatch)
        return typeMatch[1];
    return undefined;
}
function fallback(filePath) {
    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const results = [];
    // Heuristic: find C# attribute lists that contain DeadCode or DeadCodeAttribute.
    const re = /\[([^\]]*(?:DeadCode|DeadCodeAttribute)[^\]]*)\]/gi;
    let m;
    while ((m = re.exec(src))) {
        const argsText = m[1] || '';
        const startIdx = m.index;
        const after = src.slice(m.index + m[0].length, m.index + m[0].length + 400);
        const name = inferDeclarationName(after) || 'unknown';
        const lineNumber = src.slice(0, startIdx).split('\n').length;
        const { expiry, reason, migration, ticket } = extractArgs(argsText || '');
        const expiryDate = expiry ? new Date(expiry) : new Date(NaN);
        results.push({ filePath: abs, lineNumber, functionName: name, language: 'csharp', expiry: expiryDate, reason: reason || '', migration, ticket });
    }
    return results;
}
export function parseFile(filePath) {
    // Try tree-sitter-based extraction first (best-effort). If tree-sitter is
    // not available or fails, fall back to the heuristic textual parser.
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Parser = require('tree-sitter');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const CSharp = require('tree-sitter-c-sharp');
        const abs = path.resolve(filePath);
        const src = fs.readFileSync(abs, 'utf8');
        const parser = new Parser();
        parser.setLanguage(CSharp);
        const tree = parser.parse(src);
        const results = [];
        const visit = (node) => {
            if (!node)
                return;
            if (node.type === 'attribute') {
                const nameNode = node.childForFieldName && node.childForFieldName('name');
                const name = nameNode ? src.slice(nameNode.startIndex, nameNode.endIndex) : '';
                if (/DeadCode/i.test(name) || /DeadCodeAttribute/i.test(name)) {
                    // find containing declaration
                    let decl = node.parent;
                    while (decl && !/method_declaration|constructor_declaration|class_declaration|property_declaration|field_declaration/.test(decl.type)) {
                        decl = decl.parent;
                    }
                    let targetName = 'unknown';
                    let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
                    if (decl) {
                        const id = decl.childForFieldName && decl.childForFieldName('name');
                        if (id)
                            targetName = src.slice(id.startIndex, id.endIndex);
                        if (decl.startPosition)
                            lineNumber = decl.startPosition.row + 1;
                    }
                    const argsNode = node.childForFieldName && node.childForFieldName('argument_list');
                    const argText = argsNode ? src.slice(argsNode.startIndex, argsNode.endIndex) : src.slice(node.startIndex, node.endIndex);
                    const { expiry, reason, migration, ticket } = extractArgs(argText);
                    const expiryDate = expiry ? new Date(expiry) : new Date(NaN);
                    results.push({ filePath: abs, lineNumber, functionName: targetName, language: 'csharp', expiry: expiryDate, reason: reason || '', migration, ticket });
                }
            }
            if (node.namedChildren && node.namedChildren.length) {
                for (const c of node.namedChildren)
                    visit(c);
            }
        };
        visit(tree.rootNode);
        // If tree-sitter didn't find any names, fall back to textual heuristic
        if (!results.length)
            return fallback(filePath);
        // Post-process unknown or attribute names.
        for (const r of results) {
            if (r.functionName === 'unknown' || /^(DeadCode|DeadCodeAttribute)$/i.test(r.functionName)) {
                try {
                    const lines = src.split('\n');
                    const startIdx = Math.max(0, (r.lineNumber || 1) - 1);
                    const window = lines.slice(startIdx, startIdx + 8).join('\n');
                    const name = inferDeclarationName(window);
                    if (name)
                        r.functionName = name;
                }
                catch (err) {
                    // ignore
                }
            }
        }
        return results;
    }
    catch (err) {
        // tree-sitter not available or parse error — fallback to regex-based parser
        return fallback(filePath);
    }
}
export default { parseFile };
