#!/usr/bin/env node
"use strict";
/**
 * CLI entrypoint
 * Commands:
 *  - scan
 *  - report
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const chalk_1 = __importDefault(require("chalk"));
const scanner = __importStar(require("../scanner/index"));
const usageChecker_1 = require("../scanner/usageChecker");
const prCreator_1 = require("../github/prCreator");
const issueCreator_1 = require("../github/issueCreator");
const logger_1 = require("../graveyard/logger");
const program = new commander_1.Command();
program.name('deadcode-funeral').description('Schedule your dead code for deletion.').version('1.0.0');
program
    .command('scan')
    .description('Scan project and list all tagged items')
    .option('--path <path>', 'Path to scan', '.')
    .option('--dry-run', 'Preview without action', false)
    .action((opts) => {
    console.log(chalk_1.default.bold('⚰️  DeadCode Funeral — Scanning project...'));
    const items = scanner.scan({ root: opts.path, dryRun: opts.dryRun });
    if (!items.length) {
        console.log('No buried items found.');
        return;
    }
    const now = new Date();
    const sevenDays = 1000 * 60 * 60 * 24 * 7;
    const expired = items.filter((i) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() < now.getTime());
    const expiringSoon = items.filter((i) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() >= now.getTime() && i.expiry.getTime() - now.getTime() <= sevenDays);
    const upcoming = items.filter((i) => isNaN(i.expiry.getTime()) || i.expiry.getTime() - now.getTime() > sevenDays);
    console.log(`\nFound ${items.length} buried items:\n`);
    if (expired.length) {
        console.log('  EXPIRED:');
        for (const it of expired) {
            console.log(`  ${chalk_1.default.red('⚰️')}  ${chalk_1.default.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expired: ${it.expiry.toISOString().slice(0, 10)}`);
        }
        console.log();
    }
    if (expiringSoon.length) {
        console.log('  EXPIRING SOON (7 days):');
        for (const it of expiringSoon) {
            console.log(`  ${chalk_1.default.yellow('⚠️')}  ${chalk_1.default.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expires: ${it.expiry.toISOString().slice(0, 10)}`);
        }
        console.log();
    }
    if (upcoming.length) {
        console.log('  UPCOMING:');
        for (const it of upcoming) {
            const expires = isNaN(it.expiry.getTime()) ? 'unknown' : it.expiry.toISOString().slice(0, 10);
            console.log(`  ${chalk_1.default.cyan('📅')}  ${chalk_1.default.bold(it.functionName)}   ${it.filePath}   line ${it.lineNumber}   expires: ${expires}`);
        }
        console.log();
    }
    console.log("Run 'deadcode-funeral open-pr' to create deletion Pull Requests.");
});
program
    .command('report')
    .description('Full report with expiry status')
    .option('--path <path>', 'Path to scan', '.')
    .action((opts) => {
    const items = scanner.scan({ root: opts.path });
    console.log(JSON.stringify(items, null, 2));
});
program
    .command('open-pr')
    .description('Open deletion PRs for all expired items')
    .option('--path <path>', 'Path to scan', '.')
    .option('--token <token>', 'GitHub token')
    .option('--owner <owner>', 'GitHub owner/org')
    .option('--repo <repo>', 'GitHub repository name')
    .option('--dry-run', 'Preview without action', false)
    .action(async (opts) => {
    const items = scanner.scan({ root: opts.path, dryRun: opts.dryRun });
    const now = new Date();
    const expired = items.filter((i) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() < now.getTime());
    if (!expired.length) {
        console.log('No expired buried items found.');
        return;
    }
    for (const it of expired) {
        try {
            const usage = (0, usageChecker_1.checkUsage)(opts.path, it.filePath, it.functionName);
            if (usage.isUsed) {
                console.log(`Skipping deletion for ${it.functionName} — usage found.`);
                // create warning issue instead
                await (0, issueCreator_1.createWarningIssue)(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, dryRun: opts.dryRun });
            }
            else {
                const pr = await (0, prCreator_1.createDeletionPR)(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, root: opts.path, dryRun: opts.dryRun });
                if (pr && pr.prNumber) {
                    (0, logger_1.appendRecord)(it, pr.prNumber, opts.path);
                }
            }
        }
        catch (err) {
            console.warn('Error processing item', it.functionName, err.message);
        }
    }
});
program
    .command('warn')
    .description('Create warning issues for items expiring in N days')
    .option('--path <path>', 'Path to scan', '.')
    .option('--days <n>', 'Days before expiry to warn', '7')
    .option('--token <token>', 'GitHub token')
    .option('--owner <owner>', 'GitHub owner/org')
    .option('--repo <repo>', 'GitHub repository')
    .option('--dry-run', 'Preview without action', false)
    .action(async (opts) => {
    const items = scanner.scan({ root: opts.path });
    const now = new Date();
    const days = parseInt(opts.days || '7', 10);
    const ms = days * 24 * 60 * 60 * 1000;
    const toWarn = items.filter((i) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() - now.getTime() <= ms && i.expiry.getTime() > now.getTime());
    for (const it of toWarn) {
        await (0, issueCreator_1.createWarningIssue)(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, dryRun: opts.dryRun });
    }
});
program.parse(process.argv);
