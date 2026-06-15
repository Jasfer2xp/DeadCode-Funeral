#!/usr/bin/env node
/**
 * CLI entrypoint
 * Commands:
 *  - scan
 *  - report
 */
import { Command } from 'commander';
import chalk from 'chalk';
import * as scanner from '../scanner/index.js';
import { checkUsage } from '../scanner/usageChecker.js';
import { createDeletionPR } from '../github/prCreator.js';
import { createWarningIssue } from '../github/issueCreator.js';
import { appendRecord } from '../graveyard/logger.js';
const program = new Command();
program.name('deadcode-funeral').description('Schedule your dead code for deletion.').version('1.0.0');
program
    .command('scan')
    .description('Scan project and list all tagged items')
    .option('--path <path>', 'Path to scan', '.')
    .option('--dry-run', 'Preview without action', false)
    .action((opts) => {
    console.log(chalk.bold('⚰️  DeadCode Funeral — Scanning project...'));
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
            console.log(`  ${chalk.red('⚰️')}  ${chalk.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expired: ${it.expiry.toISOString().slice(0, 10)}`);
        }
        console.log();
    }
    if (expiringSoon.length) {
        console.log('  EXPIRING SOON (7 days):');
        for (const it of expiringSoon) {
            console.log(`  ${chalk.yellow('⚠️')}  ${chalk.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expires: ${it.expiry.toISOString().slice(0, 10)}`);
        }
        console.log();
    }
    if (upcoming.length) {
        console.log('  UPCOMING:');
        for (const it of upcoming) {
            const expires = isNaN(it.expiry.getTime()) ? 'unknown' : it.expiry.toISOString().slice(0, 10);
            console.log(`  ${chalk.cyan('📅')}  ${chalk.bold(it.functionName)}   ${it.filePath}   line ${it.lineNumber}   expires: ${expires}`);
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
            const usage = checkUsage(opts.path, it.filePath, it.functionName);
            if (usage.isUsed) {
                console.log(`Skipping deletion for ${it.functionName} — usage found.`);
                // create warning issue instead
                await createWarningIssue(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, dryRun: opts.dryRun });
            }
            else {
                const pr = await createDeletionPR(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, root: opts.path, dryRun: opts.dryRun });
                if (pr && pr.prNumber) {
                    appendRecord(it, pr.prNumber, opts.path);
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
        await createWarningIssue(it, { githubToken: opts.token || process.env.GITHUB_TOKEN, owner: opts.owner, repo: opts.repo, dryRun: opts.dryRun });
    }
});
program.parse(process.argv);
