"use strict";
/**
 * Python parser stub
 * NOTE: For the initial implementation this is a simple heuristic parser
 * that looks for @bury(...) decorators. A full implementation would use a
 * proper Python parser (tree-sitter-python) to reliably extract nodes.
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
exports.parseFile = parseFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
function parseFile(filePath) {
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
exports.default = { parseFile };
