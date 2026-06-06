// Simple action runner that shells out to the CLI. Inputs are read from
// environment variables (INPUT_<name>) per GitHub Actions behavior.
const { spawnSync } = require('child_process');

const githubToken = process.env['INPUT_GITHUB-TOKEN'];
const warnDays = process.env['INPUT_WARN-DAYS-BEFORE'] || '7';
const scanPath = process.env['INPUT_PATH'] || '.';

function runCli(command, args) {
  const node = process.execPath;
  const cli = './dist/cli/index.js';
  const allArgs = [cli, command, ...args];
  console.log('Running:', node, ...allArgs);
  const res = spawnSync(node, allArgs, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error(`Command failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

// First warn
runCli('warn', ['--path', scanPath, '--days', warnDays, '--token', githubToken]);

// Then open PRs for expired items
runCli('open-pr', ['--path', scanPath, '--token', githubToken]);
