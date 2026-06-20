/**
 * TypeScript / JavaScript annotation parser using tree-sitter when available.
 *
 * This implementation will try to use tree-sitter and the official
 * tree-sitter-typescript grammar to find comment nodes containing
 * `@funeral` and then locate the following function / class node to
 * extract the identifier and location. If tree-sitter is not available
 * it falls back to the original regex-based heuristic.
 */
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
// Fallback simple parser (previous heuristic) kept for environments without tree-sitter
function fallbackParse(filePath) {
    const abs = path.resolve(filePath);
    const src = fs.readFileSync(abs, 'utf8');
    const results = [];
    const jsdocRe = /\/\*\*[\s\S]*?\*\//g;
    let m;
    while ((m = jsdocRe.exec(src))) {
        const block = m[0];
        if (/\@funeral\b/i.test(block)) {
            const { expiry, reason, migration, ticket } = extractFields(block);
            const startIndex = m.index;
            const lineNumber = src.slice(0, startIndex).split('\n').length;
            const after = src.slice(m.index + m[0].length);
            const fnDecl = after.match(/function\s+([A-Za-z0-9_\$]+)\s*\(/) || after.match(/class\s+([A-Za-z0-9_\$]+)/) || after.match(/(?:const|let|var)\s+([A-Za-z0-9_\$]+)\s*=/);
            const functionName = fnDecl ? fnDecl[1] : 'unknown';
            let expiryDate = new Date(NaN);
            if (expiry) {
                const d = new Date(expiry);
                if (!isNaN(d.getTime()))
                    expiryDate = d;
            }
            results.push({ filePath: abs, lineNumber, functionName, language: filePath.endsWith('.ts') ? 'typescript' : 'javascript', expiry: expiryDate, reason: reason || '', migration, ticket });
        }
    }
    return results;
}
function extractNameFromNode(node, src) {
    if (!node)
        return 'unknown';
    const t = node.type;
    if (t === 'function_declaration' || t === 'class_declaration' || t === 'method_definition') {
        const id = node.childForFieldName && node.childForFieldName('name');
        if (id)
            return src.slice(id.startIndex, id.endIndex);
    }
    if (t === 'lexical_declaration' || t === 'variable_declaration') {
        const declarator = node.namedChildren && node.namedChildren.find((c) => c.type === 'variable_declarator');
        if (declarator) {
            return extractNameFromNode(declarator, src);
        }
    }
    if (t === 'variable_declarator') {
        const id = node.childForFieldName && node.childForFieldName('name');
        if (id)
            return src.slice(id.startIndex, id.endIndex);
    }
    if (t === 'export_statement') {
        const child = node.namedChildren && node.namedChildren[0];
        if (child)
            return extractNameFromNode(child, src);
    }
    return 'unknown';
}
let hasWarnedTreeSitter = false;
export function parseFile(filePath) {
    // Try to require tree-sitter and the typescript grammar
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Parser = customRequire('tree-sitter');
        // tree-sitter-typescript exposes two grammars; prefer 'typescript'
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const TsGrammar = customRequire('tree-sitter-typescript').typescript || customRequire('tree-sitter-typescript').tsx;
        const abs = path.resolve(filePath);
        const src = fs.readFileSync(abs, 'utf8');
        const parser = new Parser();
        parser.setLanguage(TsGrammar);
        const tree = parser.parse(src);
        const cursor = tree.walk();
        const results = [];
        // Walk all comment nodes and look for @funeral
        const visit = (node) => {
            if (!node)
                return;
            if (node.type === 'comment') {
                const text = src.slice(node.startIndex, node.endIndex);
                if (/\@funeral\b/i.test(text)) {
                    const { expiry, reason, migration, ticket } = extractFields(text);
                    // find next sibling or following node to determine the function/class name
                    let follow = node.nextSibling;
                    // if not found, walk upward to parent and try nextSibling
                    let parent = node.parent;
                    while (!follow && parent) {
                        follow = parent.nextSibling;
                        parent = parent.parent;
                    }
                    let name = 'unknown';
                    let lineNumber = node.startPosition ? node.startPosition.row + 1 : 0;
                    if (follow) {
                        name = extractNameFromNode(follow, src);
                    }
                    let expiryDate = new Date(NaN);
                    if (expiry) {
                        const d = new Date(expiry);
                        if (!isNaN(d.getTime()))
                            expiryDate = d;
                    }
                    results.push({ filePath: abs, lineNumber, functionName: name, language: filePath.endsWith('.ts') ? 'typescript' : 'javascript', expiry: expiryDate, reason: reason || '', migration, ticket });
                }
            }
            // visit children (both named and anonymous to ensure we don't miss comments)
            if (node.children && node.children.length) {
                for (const c of node.children)
                    visit(c);
            }
        };
        visit(tree.rootNode);
        return results;
    }
    catch (err) {
        // If tree-sitter not available or parsing fails, fall back
        if (!hasWarnedTreeSitter) {
            console.warn('tree-sitter unavailable or failed — falling back to heuristic parser.');
            hasWarnedTreeSitter = true;
        }
        return fallbackParse(filePath);
    }
}
export default { parseFile };
