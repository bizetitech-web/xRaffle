import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const execute = process.argv.includes('--execute');

const requiredPaths = [
  'README.md',
  'CHANGELOG.md',
  'docs/user-management-template/QUICKSTART.md',
  'client/package.json',
  'server/package.json',
  'server/.env.example',
];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`);
  }
}

function printStatus() {
  console.log('Clean-machine rehearsal checks:');
  for (const rel of requiredPaths) {
    const ok = exists(rel);
    console.log(`- ${ok ? 'OK' : 'MISSING'} ${rel}`);
  }

  const majorNode = Number(process.versions.node.split('.')[0]);
  console.log(`- Node version: ${process.versions.node}`);
  if (majorNode < 18) {
    throw new Error('Node 18+ is required.');
  }
}

printStatus();

if (!execute) {
  console.log('Dry run complete. Pass --execute to run install/build/test rehearsal commands.');
  process.exit(0);
}

run('npm', ['install']);
run('npm', ['run', 'check:links']);
run('npm', ['--prefix', 'client', 'run', 'build']);
run('npm', ['--prefix', 'server', 'run', 'test:integration']);
run('npm', ['--prefix', 'server', 'run', 'verify:db']);

console.log('Clean-machine rehearsal execution completed.');
