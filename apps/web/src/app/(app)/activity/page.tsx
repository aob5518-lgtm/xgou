import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { PageHeader } from '@/components/layout/PageHeader';
import { getXgouDataProvider } from '@/services/xgou-data-provider';
export default async function ActivityPage() { const activities = await getXgouDataProvider().getActivities(); return <><PageHeader eyebrow="AGENT TELEMETRY" title="Neural Activity Stream" description="研究、策略、风控与资金系统的演示事件流；不会发送真实订单。" /><ActivityFeed initial={activities} /></>; }
