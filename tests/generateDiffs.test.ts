import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

test('generate_removal_diffs produces diff files for example projects', () => {
  const root = path.resolve(__dirname, 'examples');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'deadcode-diffs-'));

  try {
    // Run the CJS generator
    execSync(`node ${path.resolve('scripts', 'generate_removal_diffs.cjs')} ${root} ${out}`, { stdio: 'pipe' });

    // Expect at least one diff file created under out
    const files: string[] = [];
    const walk = (p: string) => {
      for (const f of fs.readdirSync(p)) {
        const abs = path.join(p, f);
        const st = fs.statSync(abs);
        if (st.isDirectory()) walk(abs);
        else files.push(abs);
      }
    };
    walk(out);
    expect(files.length).toBeGreaterThanOrEqual(1);

    // It's okay if a specific path differs by platform; assert that some diff exists.
    expect(files.some(f => f.endsWith('.diff'))).toBeTruthy();
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
