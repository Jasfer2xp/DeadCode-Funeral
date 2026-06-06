"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFile = parseFile;
// Wrapper to parse JavaScript files using the TypeScript parser (tree-sitter handles JS via the same grammar)
const typescript_1 = __importDefault(require("./typescript"));
function parseFile(filePath) {
    return typescript_1.default.parseFile(filePath);
}
exports.default = { parseFile };
