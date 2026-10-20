import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const packages = resolve(
  root,
  readArgument('--packages') ?? '.release/packages',
);
const version = readArgument('--version') ?? readVersion();
const push = process.argv.includes('--push');
const sourceCommit = git(['rev-parse', 'HEAD']);

for (const packageName of ['core', 'express', 'nestjs']) {
  const directory = resolve(packages, packageName);
  const tag = `${packageName}-v${version}`;
  const temporary = await mkdtemp(resolve(tmpdir(), 'rqg-index-'));
  const index = resolve(temporary, 'index');
  const environment = { ...process.env, GIT_INDEX_FILE: index };

  try {
    git(['read-tree', '--empty'], { environment });
    git(['--work-tree', directory, 'add', '--all'], { environment });
    const tree = git(['write-tree'], { environment });

    fetchRemoteTag(tag);
    const existingTree = tryGit(['rev-parse', `refs/tags/${tag}^{tree}`]);
    if (existingTree !== undefined) {
      if (existingTree !== tree) {
        throw new Error(
          `${tag} already exists with different package contents`,
        );
      }
      process.stdout.write(`${tag} already matches ${tree}\n`);
    } else {
      const commit = commitTree(tree, sourceCommit, packageName, version);
      git(['tag', tag, commit]);
      process.stdout.write(`Created ${tag} at ${commit}\n`);
    }

    if (push) {
      git(['push', 'origin', `refs/tags/${tag}:refs/tags/${tag}`], {
        stdio: 'inherit',
      });
    }
  } finally {
    await rm(temporary, { force: true, recursive: true });
  }
}

function fetchRemoteTag(tag) {
  const remote = tryGit(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]);
  if (remote === undefined || remote.length === 0) return;
  git(['fetch', 'origin', `refs/tags/${tag}:refs/tags/${tag}`]);
}

function commitTree(tree, parent, packageName, releaseVersion) {
  const result = spawnSync('git', ['commit-tree', tree, '-p', parent], {
    cwd: root,
    encoding: 'utf8',
    input: `chore(distribution): prepare ${packageName} v${releaseVersion}\n`,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || 'git commit-tree failed');
  }
  return result.stdout.trim();
}

function git(arguments_, options = {}) {
  return execFileSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: options.environment ?? process.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryGit(arguments_) {
  try {
    const value = git(arguments_);
    return value.length === 0 ? undefined : value;
  } catch {
    return undefined;
  }
}

function readVersion() {
  const version = execFileSync(
    process.execPath,
    ['-p', "require('./package.json').version"],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  if (version.length === 0) throw new TypeError('Invalid root version');
  return version;
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new TypeError(`${name} requires a value`);
  }
  return value;
}
