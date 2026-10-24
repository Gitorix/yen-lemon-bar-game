// Download only an explicitly pinned upstream release; verify before extraction.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm, copyFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const version = '8.30.1';
const platforms = {
  'darwin-arm64': ['darwin_arm64', 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'],
  'darwin-x64': ['darwin_x64', 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709'],
  'linux-x64': ['linux_x64', '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'],
  'linux-arm64': ['linux_arm64', 'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'],
};
const platform = platforms[`${process.platform}-${process.arch}`];
if (!platform) throw new Error('Install Gitleaks 8.30.1 manually on this platform.');
const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
const destination = resolve(gitDir, 'security-tools', 'gitleaks');
const staging = await mkdtemp(join(tmpdir(), 'lemon-gitleaks-'));
try {
  const response = await fetch(`https://github.com/gitleaks/gitleaks/releases/download/v${version}/gitleaks_${version}_${platform[0]}.tar.gz`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Scanner download failed: ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== platform[1]) throw new Error('Scanner checksum mismatch.');
  const archivePath = join(staging, 'scanner.tar.gz');
  await writeFile(archivePath, archive);
  execFileSync('tar', ['-xzf', archivePath, '-C', staging, 'gitleaks']);
  await readFile(join(staging, 'gitleaks')); // Ensure extraction produced a readable binary.
  await mkdir(resolve(gitDir, 'security-tools'), { recursive: true });
  await copyFile(join(staging, 'gitleaks'), destination);
  await chmod(destination, 0o755);
  console.log(`Verified Gitleaks ${version} installed in the local Git directory.`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
