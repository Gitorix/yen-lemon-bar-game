import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { encoding: 'utf8' }).trim();
const scanner = process.env.GITLEAKS_BIN || resolve(gitDir, 'security-tools/gitleaks');
if (!existsSync(scanner)) throw new Error('Run node scripts/install-security-scanner.mjs first. Checks fail closed when the scanner is missing.');
const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const sensitivePath = /(^|\/)(\.env(?:\..*)?|\.aws|\.ssh|\.netrc|\.npmrc|credentials[^/]*\.json|[^/]*service-account[^/]*\.json)$|\.(pem|key|p12|pfx|keystore)$/i;
for (const path of tracked) {
  if (sensitivePath.test(path) && !path.endsWith('/.env.example') && path !== '.env.example') throw new Error(`Sensitive file is tracked: ${path}`);
}
// --redact keeps any findings out of public Actions logs. Scan every branch's
// history and the current directory, including changes not committed yet.
for (const args of [
  ['git', '--log-opts=--all --full-history', '.'],
  ['dir', '.'],
]) {
  execFileSync(scanner, [...args, '--config=.gitleaks.toml', '--redact=100', '--no-banner'], { stdio: 'inherit' });
}
console.log('Secret checks passed.');
