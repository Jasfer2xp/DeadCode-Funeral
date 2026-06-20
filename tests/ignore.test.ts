import { scan } from '../src/scanner/index';
import * as fs from 'fs';
import * as path from 'path';

describe('Configurable Ignores', () => {
  const testDir = path.resolve('./tmp_ignore_test');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // clean directory
    const files = fs.readdirSync(testDir);
    for (const f of files) {
      fs.rmSync(path.join(testDir, f), { recursive: true, force: true });
    }

    // Write a test file that contains a funeral
    const content = `/** @funeral { expiry: "2020-01-01", reason: "test" } */\nexport function oldOne() {}`;
    fs.writeFileSync(path.join(testDir, 'source.ts'), content);

    // Write another one in a legacy folder
    fs.mkdirSync(path.join(testDir, 'legacy'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'legacy', 'old_source.ts'), content);
  });

  test('scans all files by default', () => {
    const items = scan({ root: testDir });
    // Should find source.ts and legacy/old_source.ts
    const fileNames = items.map(it => path.basename(it.filePath));
    expect(fileNames).toContain('source.ts');
    expect(fileNames).toContain('old_source.ts');
  });

  test('ignores files specified in options.ignore', () => {
    const items = scan({ root: testDir, ignore: ['**/legacy/**'] });
    const fileNames = items.map(it => path.basename(it.filePath));
    expect(fileNames).toContain('source.ts');
    expect(fileNames).not.toContain('old_source.ts');
  });

  test('ignores files specified in .funeralignore', () => {
    fs.writeFileSync(path.join(testDir, '.funeralignore'), '# ignore legacy\n**/legacy/**\n');
    const items = scan({ root: testDir });
    const fileNames = items.map(it => path.basename(it.filePath));
    expect(fileNames).toContain('source.ts');
    expect(fileNames).not.toContain('old_source.ts');
  });

  test('ignores files specified in deadcode-funeral.json', () => {
    fs.writeFileSync(path.join(testDir, 'deadcode-funeral.json'), JSON.stringify({ ignore: ['**/legacy/**'] }));
    const items = scan({ root: testDir });
    const fileNames = items.map(it => path.basename(it.filePath));
    expect(fileNames).toContain('source.ts');
    expect(fileNames).not.toContain('old_source.ts');
  });
});
