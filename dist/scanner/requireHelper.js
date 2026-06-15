import { createRequire } from 'module';
import * as path from 'path';
import * as fs from 'fs';
function findProjectRoot(startDir) {
    let dir = startDir;
    while (true) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            break;
        }
        dir = parent;
    }
    return startDir;
}
const root = findProjectRoot(process.cwd());
export const customRequire = createRequire(path.join(root, 'package.json'));
