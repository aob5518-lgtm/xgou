import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/api/src', 'packages/exchange-adapters/src', 'packages/key-management/src'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).filter((file) => !file.endsWith('.spec.ts'));
const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (/getPrivateKey\s*\(/.test(text)) findings.push(`${file}: raw private key API`);
  if (/(fetch|axios\.(?:post|request)).{0,160}(\/order|\/withdraw)/s.test(text)) findings.push(`${file}: exchange order/withdraw transport`);
  if (/writeContract\s*\(/.test(text) && /(mainnet|arc-mainnet)/i.test(text)) findings.push(`${file}: direct mainnet contract write`);
  if (/REAL_TRADING_ENABLED\s*=\s*['"]?true/.test(text)) findings.push(`${file}: hardcoded real trading enablement`);
}
if (findings.length) {
  console.error(`Dangerous-call scan failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Dangerous-call and mainnet-write scan passed (${files.length} source files).`);
