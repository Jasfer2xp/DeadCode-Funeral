import { createWarningIssue } from '../src/github/issueCreator';
import * as fs from 'fs';

const mockIssueCreate = jest.fn().mockResolvedValue({ data: { html_url: 'http://issue/1' } });

jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(() => ({ issues: { create: mockIssueCreate } }))
}));

test('createWarningIssue creates issue when owner/repo provided', async () => {
  const item: any = {
    filePath: 'a.js',
    lineNumber: 1,
    functionName: 'old',
    reason: 'r',
  };

  const res = await createWarningIssue(item, { githubToken: 't', owner: 'me', repo: 'repo' });
  expect(res).not.toBeNull();
  expect(mockIssueCreate).toHaveBeenCalled();
});
