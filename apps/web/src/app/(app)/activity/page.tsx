import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { PageHeader } from '@/components/layout/PageHeader';
import { getXgouDataProvider } from '@/services/xgou-data-provider';
export default async function ActivityPage() { const activities = await getXgouDataProvider().getActivities(); return <><PageHeader eyebrow="AGENT TELEMETRY · PAPER" title="Neural Activity Stream" description="研究、信号、风控与 Paper Execution 事件流；真实下单与链上资金操作均已禁用。" /><ActivityFeed initial={activities} /></>; }
