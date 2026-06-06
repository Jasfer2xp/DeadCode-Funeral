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
        const pattern = `${key}\\s*[:=]?\\s*\\"([^\\"]+)\\"`;
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
function fallback(filePath) {
    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const results = [];
    const re = /\[DeadCode\s*\(([^\)]*)\)\]\s*(?:public|private|protected|internal)?\s*(?:static)?\s*(?:[\w<>\[\]]+\s+)?([A-Za-z0-9_]+)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
        const args = m[1];
        const name = m[2];
        const lineNumber = src.slice(0, m.index).split('\n').length;
        const { expiry, reason, migration, ticket } = extractArgs(args);
        const expiryDate = expiry ? new Date(expiry) : new Date(NaN);
        results.push({ filePath: abs, lineNumber, functionName: name, language: 'csharp', expiry: expiryDate, reason: reason || '', migration, ticket });
    }
    return results;
}
export function parseFile(filePath) {
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
            // attribute / attribute_list nodes may appear; look for attribute with name 'DeadCode'
            if (node.type === 'attribute') {
                const nameNode = node.childForFieldName && node.childForFieldName('name');
                const name = nameNode ? src.slice(nameNode.startIndex, nameNode.endIndex) : '';
                if (/DeadCode/i.test(name) || /DeadCodeAttribute/i.test(name)) {
                    // The attribute's parent might be an attribute_list; find the declaration nearby
                    let decl = node.parent;
                    while (decl && !/method_declaration|class_declaration|constructor_declaration|property_declaration|field_declaration/.test(decl.type)) {
                        decl = decl.parent;
                    }
                    // fallback: try next named sibling if decl wasn't found
                    if (!decl) {
                        let sibling = node.nextNamedSibling;
                        while (sibling && !/method_declaration|class_declaration/.test(sibling.type))
                            sibling = sibling.nextNamedSibling;
                        decl = sibling;
                    }
                    let targetName = 'unknown';
                    let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
                    if (decl) {
                        // attempt to extract identifier
                        const id = decl.childForFieldName && decl.childForFieldName('name');
                        if (id)
                            targetName = src.slice(id.startIndex, id.endIndex);
                        if (decl.startPosition)
                            lineNumber = decl.startPosition.row + 1;
                    }
                    // extract argument text inside parentheses
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
        return results;
    }
    catch (err) {
        // tree-sitter not available or parse error — fallback to regex-based parser
        console.warn('tree-sitter-c-sharp unavailable or failed — falling back to heuristic parser.');
        return fallback(filePath);
    }
}
export default { parseFile };
