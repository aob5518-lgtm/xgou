import { JoinFlow } from '@/components/join/JoinFlow';
import { PageHeader } from '@/components/layout/PageHeader';
import { getAppMode } from '@/lib/app-mode';
export default function JoinPage() { const demo = getAppMode() === 'demo'; return <><PageHeader eyebrow={demo ? 'PARTICIPATION PREVIEW' : 'ARC TESTNET PARTICIPATION'} title="Join XGOU" description={demo ? '使用 Decimal 精确预览 50 / 30 / 20 资金分配，本演示不会移动任何资金。' : '连接钱包、SIWE 登录、授权 USDC 并通过 Arc Testnet DepositRouter 完成真实 Testnet 参与。请保留少量 USDC 用于 Gas。'} /><JoinFlow /></>; }
