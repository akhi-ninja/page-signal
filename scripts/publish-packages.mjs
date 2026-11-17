import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const names = ['core', 'sdk', 'react'];
const packages = names.map(name => ({
  directory: `packages/${name}`,
  ...JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))
}));
const version = packages[0].version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('A stable version is required.');
for (const pkg of packages) {
  if (pkg.version !== version || pkg.name !== `@pagesignal/${pkg.directory.split('/')[1]}` || pkg.private) {
    throw new Error('All three public packages must have the same release version.');
  }
  if (pkg.repository?.url !== 'git+https://github.com/akhi-ninja/page-signal.git') {
    throw new Error(`Incorrect repository for ${pkg.name}`);
  }
}
if (process.env.RELEASE_TAG && process.env.RELEASE_TAG !== `v${version}`) {
  throw new Error(`Release tag must be v${version}`);
}
if (process.argv.includes('--check')) {
  console.log(`Validated three packages at version ${version}`);
  process.exit(0);
}
if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RELEASE_TAG) {
  throw new Error('Publishing must run in the GitHub release workflow.');
}
// Check every package before publishing. Fail closed on network/auth failures.
const pending = packages.filter(pkg => {
  const result = spawnSync('npm', ['view', `${pkg.name}@${version}`, 'version', '--json',
    '--registry=https://registry.npmjs.org/', '--fetch-retries=0'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status === 0) {
    if (JSON.parse(result.stdout) !== version) throw new Error('Unexpected registry response');
    console.log(`Already published: ${pkg.name}@${version}`);
    return false;
  }
  let error;
  try { error = JSON.parse(result.stdout).error; } catch {}
  if (error?.code !== 'E404') throw new Error(result.stderr || 'Registry check failed');
  return true;
});
for (const pkg of pending) {
  execFileSync('npm', ['publish', `./${pkg.directory}`, '--access=public', '--provenance',
    '--registry=https://registry.npmjs.org/'], { stdio: 'inherit' });
}
console.log('All release versions have been submitted to npm.');
