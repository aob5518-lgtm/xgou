import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'apps/api/src/operations', 'packages/exchange-adapters/src', 'packages/key-management/src'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).filter((file) => !/(\.spec\.ts|\/test\/|generated|dist|\.next|\.vercel|migrations)/.test(file));
const findings = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (file !== 'packages/exchange-adapters/src/binance/environment.ts' && /https:\/\/(?:api\d?\.binance\.com|fapi\.binance\.com)/.test(source)) findings.push(`${file}: Binance production host literal`);
  if (file.includes('/binance/') && file !== 'packages/exchange-adapters/src/binance/environment.ts' && /['"]\/(?:sapi|api|fapi)[^'"]*(?:withdraw|transfer)/i.test(source)) findings.push(`${file}: withdrawal or transfer endpoint`);
  if (/(?:console|logger)\.(?:log|info|warn|error)\([^\n]*(?:apiSecret|signature|signedPayload)/i.test(source)) findings.push(`${file}: signed material logging`);
  if (/NEXT_PUBLIC_[A-Z0-9_]*BINANCE_(?:API_KEY|API_SECRET)/.test(source)) findings.push(`${file}: browser-exposed Binance credential`);
}
if (findings.length) {
  console.error(`Binance sandbox scan failed:\n${findings.join('\n')}`);
  process.exit(1);
}
console.log(`Binance sandbox scan passed (${files.length} runtime files).`);
