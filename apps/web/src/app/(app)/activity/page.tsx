import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { PageHeader } from '@/components/layout/PageHeader';
import { getXgouDataProvider } from '@/services/xgou-data-provider';
export default async function ActivityPage() { const activities = await getXgouDataProvider().getActivities(); return <><PageHeader eyebrow="AGENT TELEMETRY" title="Activity" description="A restrained simulation of research, strategy, risk, and treasury events. No live orders are sent." /><ActivityFeed initial={activities} /></>; }
