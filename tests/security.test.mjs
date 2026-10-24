import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const root = process.cwd();
const scanner = process.env.GITLEAKS_BIN || resolve(execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).trim(), 'security-tools/gitleaks');

test('scanner rejects a synthetic credential without exposing it', () => {
  const sample = ['art', 'v2', 'x', 'a'.repeat(40)].join('_');
  const result = spawnSync(scanner, ['stdin', '--config=.gitleaks.toml', '--redact=100', '--no-banner'], { input: sample, encoding: 'utf8' });
  assert.equal(result.status, 1, 'scanner must detect the synthetic secret');
  assert.ok(!(result.stdout + result.stderr).includes(sample), 'scanner must redact its output');
});

test('publish build adds integrity and rejects accidental public files/symlinks', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'lemon-build-test-'));
  try {
    await mkdir(join(fixture, 'scripts'));
    await mkdir(join(fixture, 'assets'));
    for (const file of ['app.js', 'index.html', 'styles.css', 'scripts/build.mjs',
      'assets/glass-user-transparent.png', 'assets/glass-water-clean.png',
      'assets/lemon-photoreal-smooth.png', 'assets/yen-coin-real.png',
      'assets/woman-hand-crush-lemon.png', 'assets/woman-hand-crush-2-lemons.png']) {
      await copyFile(join(root, file), join(fixture, file));
    }
    execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture });
    const built = await readFile(join(fixture, 'dist/index.html'), 'utf8');
    assert.equal((built.match(/integrity="sha384-/g) || []).length, 2);
    await writeFile(join(fixture, 'dist/.env'), 'SYNTHETIC_TEST_ONLY=not-a-key');
    let result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture });
    assert.notEqual(result.status, 0, 'unexpected artifact must block publication');
    await rm(join(fixture, 'dist/.env'));
    await rm(join(fixture, 'assets/yen-coin-real.png'));
    await symlink(join(root, 'assets/yen-coin-real.png'), join(fixture, 'assets/yen-coin-real.png'));
    result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: fixture });
    assert.notEqual(result.status, 0, 'symlink must block publication');
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
