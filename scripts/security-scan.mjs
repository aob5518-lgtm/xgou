import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n').filter((file) => /^(apps|packages|scripts|\.env\.example)/.test(file) && !/(generated|dist|migrations|\.lock)/.test(file));
const findings = [];
const rules = [
  ['raw private key assignment', /(?:PRIVATE_KEY|privateKey)\s*[=:]\s*["']?(?:0x)?[a-fA-F0-9]{64}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['hardcoded bearer token', /Bearer\s+[A-Za-z0-9._~+/=-]{24,}/],
  ['hardcoded exchange secret', /(?:EXCHANGE|BINANCE|OKX|BYBIT)_(?:API_)?SECRET\s*=\s*[^\s$<{][^\s]{7,}/i],
  ['mnemonic-like phrase', /(?:mnemonic|seedPhrase)\s*[=:]\s*["'][a-z]+(?:\s+[a-z]+){11,23}["']/i],
];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const [name, rule] of rules) if (rule.test(text)) findings.push(`${file}: ${name}`);
  if (/NEXT_PUBLIC_[A-Z0-9_]*(?:SECRET|PRIVATE_KEY|API_KEY|ADMIN_TOKEN)/.test(text)) findings.push(`${file}: frontend secret variable`);
}
if (findings.length) {
  console.error(`Secret scan failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files).`);
