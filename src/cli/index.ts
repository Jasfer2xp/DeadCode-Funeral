#!/usr/bin/env node
/**
 * CLI entrypoint
 * Commands:
 *  - scan
 *  - report
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as scanner from '../scanner/index';

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

    const expired = items.filter((i: any) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() < now.getTime());
    const expiringSoon = items.filter((i: any) => !isNaN(i.expiry.getTime()) && i.expiry.getTime() >= now.getTime() && i.expiry.getTime() - now.getTime() <= sevenDays);
    const upcoming = items.filter((i: any) => isNaN(i.expiry.getTime()) || i.expiry.getTime() - now.getTime() > sevenDays);

    console.log(`\nFound ${items.length} buried items:\n`);

    if (expired.length) {
      console.log('  EXPIRED:');
      for (const it of expired) {
        console.log(`  ${chalk.red('⚰️')}  ${chalk.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expired: ${it.expiry.toISOString().slice(0,10)}`);
      }
      console.log();
    }

    if (expiringSoon.length) {
      console.log('  EXPIRING SOON (7 days):');
      for (const it of expiringSoon) {
        console.log(`  ${chalk.yellow('⚠️')}  ${chalk.bold(it.functionName)}      ${it.filePath}   line ${it.lineNumber}   expires: ${it.expiry.toISOString().slice(0,10)}`);
      }
      console.log();
    }

    if (upcoming.length) {
      console.log('  UPCOMING:');
      for (const it of upcoming) {
        const expires = isNaN(it.expiry.getTime()) ? 'unknown' : it.expiry.toISOString().slice(0,10);
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

program.parse(process.argv);
