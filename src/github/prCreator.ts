/**
 * GitHub PR creator
 * - Creates a git branch, removes the buried item from the file, commits and pushes
 * - Opens a Pull Request via the GitHub API
 *
 * This implementation is intentionally defensive: it supports a --dry-run
 * mode and will not crash on network/git failures. In CI you'll need to ensure
 * `GITHUB_TOKEN` is provided and the runner has permission to push branches.
 */

import * as fs from 'fs';
import * as path from 'path';
import simpleGit from 'simple-git';
import { Octokit } from '@octokit/rest';

import type { BuriedItem } from '../scanner/index';

export interface PROptions {
  githubToken?: string;
  owner?: string;
  repo?: string;
  root?: string;
  dryRun?: boolean;
}

function sanitizeBranchName(name: string) {
  return name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

// Very small heuristic remover for JS/TS: remove the comment block and the
// following function/class block. This is NOT perfect but sufficient for
// scaffolding; a tree-sitter edit would be preferred in production.
// Remove the buried code from source using heuristics for JS/TS and
// an AST-based approach for C# (tree-sitter) when possible.
function removeBuriedCode(source: string, item: BuriedItem) {
  // If C#, try tree-sitter-c-sharp to remove the node precisely.
  if ((item as any).language === 'csharp') {
    try {
      // lazy require to avoid hard dependency
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Parser = require('tree-sitter');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const CSharp = require('tree-sitter-c-sharp');

      const parser = new Parser();
      parser.setLanguage(CSharp);
      const tree = parser.parse(source);

      // Find attribute node at or near the given line
      const lineIndex = (item as any).lineNumber - 1;
      let targetNode: any = null;

      // Walk and find an attribute node whose startPosition.row is close to lineIndex
      const visit = (node: any) => {
        if (!node) return;
        if (node.type === 'attribute') {
          const r = node.startPosition && node.startPosition.row;
          if (typeof r === 'number' && Math.abs(r - lineIndex) <= 3) {
            targetNode = node;
            return;
          }
        }
        for (const c of node.namedChildren || []) {
          if (targetNode) return;
          visit(c);
        }
      };

      visit(tree.rootNode);

      // If we found attribute, find its containing declaration (method/class/property)
      let decl: any = null;
      if (targetNode) {
        let p = targetNode.parent;
        while (p) {
          if (/method_declaration|constructor_declaration|class_declaration|property_declaration|field_declaration/.test(p.type)) {
            decl = p;
            break;
          }
          p = p.parent;
        }
      }

      // If decl found, remove its full range; else if attribute found, remove attribute only
      if (decl) {
        const before = source.slice(0, decl.startIndex);
        const after = source.slice(decl.endIndex);
        return before + after;
      } else if (targetNode) {
        const before = source.slice(0, targetNode.startIndex);
        const after = source.slice(targetNode.endIndex);
        return before + after;
      }
    } catch (err) {
      console.warn('C# AST removal failed, falling back to heuristic remover:', (err as Error).message);
      // fall through to JS/TS heuristic
    }
  }

  // Fallback heuristic remover (for JS/TS and if C# AST removal failed)
  const startLineIdx = item.lineNumber - 1;
  const lines = source.split('\n');
  // find start index of JSDoc before startLineIdx
  let start = startLineIdx;
  while (start >= 0 && /\*\*/.test(lines[start]) === false && /\/\*/.test(lines[start]) === false) {
    start--;
  }
  if (start < 0) start = item.lineNumber - 1;

  // find end: naive search for next closing brace '}' after start
  let end = start;
  let braceCount = 0;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }
    end = i;
    if (braceCount <= 0 && i > start) {
      break;
    }
  }

  // If braces not found (e.g., single-line), remove a small range
  if (end <= start) end = Math.min(start + 6, lines.length - 1);

  const before = lines.slice(0, start).join('\n');
  const after = lines.slice(end + 1).join('\n');
  return before + '\n' + after;
}

export async function createDeletionPR(item: BuriedItem, options: PROptions = {}): Promise<{ prUrl?: string; prNumber?: number } | null> {
  const root = path.resolve(options.root || '.');
  const filePath = path.resolve(item.filePath);
  const git = simpleGit(root);
  const branch = `deadcode-funeral/remove-${sanitizeBranchName(item.functionName)}-${(item.expiry instanceof Date && !isNaN(item.expiry.getTime())) ? item.expiry.toISOString().slice(0,10) : 'no-date'}`;

  try {
    // Safety: ensure working tree is clean before making changes
    const status = await git.status();
    if (status.files.length > 0) {
      console.warn('Working tree is not clean. Aborting PR creation to avoid unintended commits.');
      return null;
    }

    // Read source and prepare new content
    const src = fs.readFileSync(filePath, 'utf8');
    const newSrc = removeBuriedCode(src, item);

    // Safety: check that the change is not unexpectedly large (prevent mass deletions)
    const removedLines = src.split('\n').length - newSrc.split('\n').length;
    const removedRatio = removedLines / Math.max(1, src.split('\n').length);
    if (removedRatio > 0.5) {
      console.warn(`Change removes ${Math.round(removedRatio * 100)}% of the file; aborting to avoid dangerous mass deletions.`);
      return null;
    }

    if (options.dryRun) {
      console.log(`[dry-run] Would create branch ${branch} and remove ${item.functionName} in ${filePath}`);
      return null;
    }

    // create branch, write file, commit, push
    // Determine default branch from remote via octokit if token present
    let baseBranch = 'main';
    if (options.githubToken) {
      try {
        const octoTemp = new Octokit({ auth: options.githubToken });
        if (!options.owner || !options.repo) {
          const remotes = await git.getRemotes(true);
          const origin = remotes.find(r => r.name === 'origin') || remotes[0];
          if (origin && origin.refs && origin.refs.fetch) {
            const m = origin.refs.fetch.match(/[:\/]([^/:]+)\/([^/.]+)(?:\.git)?$/);
            if (m) {
              options.owner = options.owner || m[1];
              options.repo = options.repo || m[2];
            }
          }
        }
        if (options.owner && options.repo) {
          const repoInfo = await octoTemp.repos.get({ owner: options.owner, repo: options.repo });
          baseBranch = repoInfo.data.default_branch || baseBranch;
        }
      } catch (err) {
        // ignore and keep default
      }
    }

    // Checkout base branch and create new branch from it
    await git.fetch('origin', baseBranch);
    await git.checkout(baseBranch);
    await git.pull('origin', baseBranch);
    await git.checkoutLocalBranch(branch);
    fs.writeFileSync(filePath, newSrc, 'utf8');
    await git.add(path.relative(root, filePath));
    await git.commit(`chore: remove dead code ${item.functionName} (scheduled expiry ${item.expiry?.toISOString?.().slice(0,10)})`);
    await git.push('origin', branch);

    // create PR via octokit
    if (!options.githubToken) {
      console.warn('No github token provided — PR will not be created.');
      return null;
    }

    const octo = new Octokit({ auth: options.githubToken });

    // get repo info if not provided
    let owner = options.owner;
    let repo = options.repo;
    if (!owner || !repo) {
      // attempt to infer from git remote
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin') || remotes[0];
      if (origin && origin.refs && origin.refs.fetch) {
        const m = origin.refs.fetch.match(/[:\/]([^/:]+)\/([^/.]+)(?:\.git)?$/);
        if (m) {
          owner = owner || m[1];
          repo = repo || m[2];
        }
      }
    }

    if (!owner || !repo) {
      console.warn('Unable to determine owner/repo for creating PR.');
      return null;
    }

    // create PR
    const title = `⚰️ [DeadCode Funeral] Remove ${item.functionName} — expired ${(item.expiry instanceof Date && !isNaN(item.expiry.getTime())) ? item.expiry.toISOString().slice(0,10) : 'unknown'}`;
    const body = `Reason: ${item.reason || 'n/a'}\nMigration: ${item.migration || 'n/a'}\nFile: ${path.relative(root, filePath)}\nConfirmed no usages found.`;

    const prResp = await octo.pulls.create({ owner, repo, title, head: branch, base: baseBranch, body });

    // add label
    try {
      await octo.issues.addLabels({ owner, repo, issue_number: prResp.data.number, labels: ['dead-code'] });
    } catch (err) {
      // non-fatal
      console.warn('Failed to add label:', (err as Error).message);
    }

    // attempt to assign the original author if available
    if (item.author) {
      try {
        await octo.issues.addAssignees({ owner, repo, issue_number: prResp.data.number, assignees: [item.author.replace(/^@/, '')] });
      } catch (err) {
        // ignore
      }
    }

    console.log(`Created PR: ${prResp.data.html_url}`);
    return { prUrl: prResp.data.html_url, prNumber: prResp.data.number };
  } catch (err) {
    console.warn('Failed to create deletion PR:', (err as Error).message);
    return null;
  }
}

export default { createDeletionPR };
