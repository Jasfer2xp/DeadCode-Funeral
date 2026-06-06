import { createDeletionPR } from '../src/github/prCreator';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('simple-git', () => {
  return jest.fn(() => ({
    status: jest.fn().mockResolvedValue({ files: ['modified.js'] }),
    getRemotes: jest.fn().mockResolvedValue([]),
  }));
});

test('createDeletionPR aborts when working tree not clean', async () => {
  const tmp = path.resolve('tmp_pr_creator_file2.js');
  fs.writeFileSync(tmp, '/** @funeral { expiry: "2020-01-01", reason: "x" } */\nfunction toRemove() {}');
  const item: any = {
    filePath: tmp,
    lineNumber: 1,
    functionName: 'toRemove',
    language: 'javascript',
    expiry: new Date('2020-01-01'),
    reason: 'x',
  };
  const res = await createDeletionPR(item, { githubToken: 'token', owner: 'o', repo: 'r', root: '.' });
  fs.unlinkSync(tmp);
  expect(res).toBeNull();
});
