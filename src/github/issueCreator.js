"use strict";
/**
 * GitHub Issue creator for warnings
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWarningIssue = createWarningIssue;
const rest_1 = require("@octokit/rest");
const simple_git_1 = __importDefault(require("simple-git"));
async function createWarningIssue(item, options = {}) {
    if (options.dryRun) {
        console.log(`[dry-run] Would open warning issue for ${item.functionName} in ${item.filePath}`);
        return null;
    }
    if (!options.githubToken) {
        console.warn('No github token provided — skipping warning issue creation.');
        return null;
    }
    const octo = new rest_1.Octokit({ auth: options.githubToken });
    let owner = options.owner;
    let repo = options.repo;
    const root = options.root || '.';
    if (!owner || !repo) {
        try {
            const git = (0, simple_git_1.default)(root);
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
        catch (err) {
            // ignore and proceed to validation below
        }
    }
    if (!owner || !repo) {
        console.warn('Unable to determine owner/repo; aborting issue creation.');
        return null;
    }
    const title = `⚠️ DeadCode Funeral Warning: ${item.functionName} expires in 7 days`;
    const body = `File: ${item.filePath}\nLine: ${item.lineNumber}\nReason: ${item.reason || 'n/a'}\nMigration: ${item.migration || 'n/a'}\n${item.author ? `@${item.author}` : ''}`;
    try {
        const res = await octo.issues.create({ owner, repo, title, body });
        console.log(`Created warning issue: ${res.data.html_url}`);
        return { url: res.data.html_url };
    }
    catch (err) {
        console.warn('Failed to create issue:', err.message);
        return null;
    }
}
exports.default = { createWarningIssue };
