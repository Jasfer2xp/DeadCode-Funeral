/**
 * GitHub PR creator
 * - Creates a git branch, removes the buried item from the file, commits and pushes
 * - Opens a Pull Request via the GitHub API
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import simpleGit from 'simple-git';
import { Octokit } from '@octokit/rest';

import type { BuriedItem } from '../scanner/index.js';

export interface PROptions {
  githubToken?: string;
  owner?: string;
  repo?: string;
  root?: string;
  dryRun?: boolean;
}

const MAX_REMOVED_LINES = 250;
const MAX_REMOVED_RATIO = 0.5;

function sanitizeBranchName(name: string) {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function normalizeBlankLines(source: string) {
  return source.replace(/\n{3,}/g, '\n\n');
}

function removeLines(lines: string[], startLine: number, endLine: number) {
  return normalizeBlankLines([
    ...lines.slice(0, Math.max(0, startLine)),
    ...lines.slice(Math.min(lines.length, endLine + 1)),
  ].join('\n'));
}

function findNearbyLine(lines: string[], startLine: number, predicate: (line: string) => boolean, radius = 8) {
  const start = Math.max(0, startLine - radius);
  const end = Math.min(lines.length, startLine + radius + 1);

  for (let i = start; i < end; i++) {
    if (predicate(lines[i])) return i;
  }

  return -1;
}

function findFollowingDeclaration(lines: string[], startLine: number, declarationRe: RegExp, maxLookahead = 20) {
  for (let i = startLine + 1; i < Math.min(lines.length, startLine + maxLookahead + 1); i++) {
    if (declarationRe.test(lines[i])) return i;
  }

  return -1;
}

function findMatchingDeclarationEnd(lines: string[], startLine: number) {
  let braceCount = 0;
  let sawOpen = false;

  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        braceCount++;
        sawOpen = true;
      } else if (ch === '}') {
        braceCount--;
      }
    }

    if (sawOpen && braceCount <= 0) return i;
    if (!sawOpen && /;\s*$/.test(lines[i])) return i;
  }

  return startLine;
}

function removeCSharpBuriedCode(source: string, item: BuriedItem) {
  const lines = source.split('\n');
  const reportedLine = Math.max(0, ((item as any).lineNumber || 1) - 1);
  const attrLine = findNearbyLine(
    lines,
    reportedLine,
    line => /\[[^\]]*(?:DeadCode|DeadCodeAttribute)[^\]]*\]/i.test(line),
  );

  if (attrLine === -1) return source;

  const declarationRe = /\b(?:public|private|protected|internal|static|virtual|override|sealed|async|readonly|partial|class|struct|interface|enum)\b|[A-Za-z_][A-Za-z0-9_<>?,\s\[\]]+\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/;
  const declLine = findFollowingDeclaration(lines, attrLine, declarationRe);
  if (declLine === -1) return removeLines(lines, attrLine, attrLine);

  return removeLines(lines, attrLine, findMatchingDeclarationEnd(lines, declLine));
}

function removePhpBuriedCode(source: string, item: BuriedItem) {
  const lines = source.split('\n');
  const reportedLine = Math.max(0, ((item as any).lineNumber || 1) - 1);
  const markerLine = findNearbyLine(
    lines,
    reportedLine,
    line => /@funeral\b|#\s*\[\s*DeadCode\b/i.test(line),
  );

  if (markerLine === -1) return source;

  const declarationRe = /\b(?:public|protected|private|static|final|abstract)\b.*\bfunction\b|\bfunction\b|\bclass\b/;
  const declLine = declarationRe.test(lines[markerLine])
    ? markerLine
    : findFollowingDeclaration(lines, markerLine, declarationRe);

  if (declLine === -1) return removeLines(lines, markerLine, markerLine);
  return removeLines(lines, markerLine, findMatchingDeclarationEnd(lines, declLine));
}

function removeJsTsBuriedCode(source: string, item: BuriedItem) {
  const lines = source.split('\n');
  const reportedLine = Math.max(0, ((item as any).lineNumber || 1) - 1);
  let markerLine = findNearbyLine(lines, reportedLine, line => /@funeral\b/i.test(line));

  if (markerLine === -1) markerLine = reportedLine;

  while (markerLine > 0 && !/\/\*\*?/.test(lines[markerLine]) && !/@funeral\b/i.test(lines[markerLine])) {
    markerLine--;
  }

  const declarationRe = /\b(?:export\s+default\s+function|export\s+function|export\s+default|export\s+const|export\s+class|function|class)\b|\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=/;
  const declLine = declarationRe.test(lines[markerLine])
    ? markerLine
    : findFollowingDeclaration(lines, markerLine, declarationRe);

  if (declLine === -1) return removeLines(lines, markerLine, Math.min(markerLine + 1, lines.length - 1));
  return removeLines(lines, Math.min(markerLine, declLine), findMatchingDeclarationEnd(lines, declLine));
}

function getIndentationLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function removePythonBuriedCode(source: string, item: BuriedItem) {
  const lines = source.split('\n');
  const reportedLine = Math.max(0, ((item as any).lineNumber || 1) - 1);
  const decoratorLine = findNearbyLine(
    lines,
    reportedLine,
    line => /@bury\b/i.test(line),
  );

  if (decoratorLine === -1) return source;

  // Find the following class or def declaration line (allow some decorators between them)
  const declLine = findFollowingDeclaration(lines, decoratorLine, /^\s*(?:class|def)\b/, 15);
  if (declLine === -1) {
    // Best effort: just remove the decorator line
    return removeLines(lines, decoratorLine, decoratorLine);
  }

  const declIndentation = getIndentationLevel(lines[declLine]);

  // Find the end of the block: the first non-empty, non-comment line following the declaration 
  // that has an indentation level less than or equal to declIndentation.
  let endLine = declLine;
  for (let i = declLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }
    const currentIndentation = getIndentationLevel(lines[i]);
    if (currentIndentation <= declIndentation) {
      endLine = i - 1;
      break;
    }
    endLine = i;
  }

  return removeLines(lines, decoratorLine, endLine);
}

// Remove the buried declaration identified by scanner metadata. This remains
// conservative: if the marker/declaration cannot be found, the source is left unchanged.
export function removeBuriedCode(source: string, item: BuriedItem) {
  switch ((item as any).language) {
    case 'csharp':
      return removeCSharpBuriedCode(source, item);
    case 'php':
      return removePhpBuriedCode(source, item);
    case 'python':
      return removePythonBuriedCode(source, item);
    case 'typescript':
    case 'javascript':
      return removeJsTsBuriedCode(source, item);
    default:
      return removeJsTsBuriedCode(source, item);
  }
}

function inferRepoFromRemote(remote?: string) {
  if (!remote) return {};
  const match = remote.match(/[:/]([^/:]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) return {};
  return { owner: match[1], repo: match[2] };
}

async function inferOwnerRepo(git: ReturnType<typeof simpleGit>, options: PROptions) {
  let owner = options.owner;
  let repo = options.repo;

  if (!owner || !repo) {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin') || remotes[0];
    const inferred = inferRepoFromRemote(origin?.refs?.fetch);
    owner = owner || inferred.owner;
    repo = repo || inferred.repo;
  }

  return { owner, repo };
}

export async function createDeletionPR(item: BuriedItem, options: PROptions = {}): Promise<{ prUrl?: string; prNumber?: number } | null> {
  const root = path.resolve(options.root || '.');
  const filePath = path.resolve(item.filePath);
  const git = simpleGit(root);
  const expiryLabel = item.expiry instanceof Date && !isNaN(item.expiry.getTime())
    ? item.expiry.toISOString().slice(0, 10)
    : 'no-date';
  const branch = `deadcode-funeral/remove-${sanitizeBranchName(item.functionName)}-${expiryLabel}`;

  try {
    const status = await git.status();
    if (status.files.length > 0) {
      console.warn('Working tree is not clean. Aborting PR creation to avoid unintended commits.');
      return null;
    }

    const src = fs.readFileSync(filePath, 'utf8');
    const newSrc = removeBuriedCode(src, item);
    if (src === newSrc) {
      console.warn(`No removable code found for ${item.functionName}; aborting PR creation.`);
      return null;
    }

    const totalLines = src.split('\n').length;
    const removedLines = totalLines - newSrc.split('\n').length;
    const removedRatio = removedLines / Math.max(1, totalLines);
    if (removedLines > MAX_REMOVED_LINES) {
      console.warn(`Change removes ${removedLines} lines which exceeds the allowed maximum of ${MAX_REMOVED_LINES}; aborting.`);
      return null;
    }
    if (removedRatio > MAX_REMOVED_RATIO) {
      console.warn(`Change removes ${Math.round(removedRatio * 100)}% of the file; aborting to avoid dangerous mass deletions.`);
      return null;
    }

    if (options.dryRun) {
      console.log(`[dry-run] Would create branch ${branch} and remove ${item.functionName} in ${filePath}`);
      return null;
    }

    let baseBranch = 'main';
    const inferred = await inferOwnerRepo(git, options);
    options.owner = options.owner || inferred.owner;
    options.repo = options.repo || inferred.repo;

    if (options.githubToken && options.owner && options.repo) {
      try {
        const octoTemp = new Octokit({ auth: options.githubToken });
        const repoInfo = await octoTemp.repos.get({ owner: options.owner, repo: options.repo });
        baseBranch = repoInfo.data.default_branch || baseBranch;
      } catch (err) {
        // Keep the conventional default branch if the lookup fails.
      }
    }

    await git.fetch('origin', baseBranch);
    await git.checkout(baseBranch);
    await git.pull('origin', baseBranch);
    await git.checkoutLocalBranch(branch);
    fs.writeFileSync(filePath, newSrc, 'utf8');

    try {
      const prettierBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
      if (fs.existsSync(prettierBin)) {
        execFileSync(prettierBin, ['--write', filePath], { stdio: 'ignore' });
      } else {
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prettier', '--write', filePath], { stdio: 'ignore' });
      }
    } catch (err) {
      // Formatter is optional.
    }

    try {
      const eslintBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
      if (fs.existsSync(eslintBin)) {
        execFileSync(eslintBin, ['--fix', filePath], { stdio: 'ignore' });
      } else {
        execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['eslint', '--fix', filePath], { stdio: 'ignore' });
      }
    } catch (err) {
      // Linter is optional.
    }

    await git.add(path.relative(root, filePath));
    await git.commit(`chore: remove dead code ${item.functionName} (scheduled expiry ${expiryLabel})`);
    await git.push('origin', branch);

    if (!options.githubToken) {
      console.warn('No github token provided - PR will not be created.');
      return null;
    }

    const { owner, repo } = await inferOwnerRepo(git, options);
    if (!owner || !repo) {
      console.warn('Unable to determine owner/repo for creating PR.');
      return null;
    }

    const octo = new Octokit({ auth: options.githubToken });
    const title = `[DeadCode Funeral] Remove ${item.functionName} - expired ${expiryLabel}`;
    const body = `Reason: ${item.reason || 'n/a'}\nMigration: ${item.migration || 'n/a'}\nFile: ${path.relative(root, filePath)}\nConfirmed no usages found.`;
    const prResp = await octo.pulls.create({ owner, repo, title, head: branch, base: baseBranch, body });

    try {
      await octo.issues.addLabels({ owner, repo, issue_number: prResp.data.number, labels: ['dead-code'] });
    } catch (err) {
      console.warn('Failed to add label:', (err as Error).message);
    }

    if (item.author) {
      try {
        await octo.issues.addAssignees({ owner, repo, issue_number: prResp.data.number, assignees: [item.author.replace(/^@/, '')] });
      } catch (err) {
        // Best-effort only.
      }
    }

    console.log(`Created PR: ${prResp.data.html_url}`);
    return { prUrl: prResp.data.html_url, prNumber: prResp.data.number };
  } catch (err) {
    console.warn('Failed to create deletion PR:', (err as Error).message);
    return null;
  }
}

export default { createDeletionPR, removeBuriedCode };
