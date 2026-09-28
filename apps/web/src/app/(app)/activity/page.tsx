'use client';
import { ActivityFeed } from '@/components/activity/ActivityFeed';
import { PageHeader } from '@/components/layout/PageHeader';
import { getAppMode } from '@/lib/app-mode';
import { useXgouResource } from '@/hooks/useXgouResource';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/DataState';
export default function ActivityPage() {
  const query = useXgouResource('getActivities');
  if (query.loading) return <LoadingState/>;
  if (query.error) return <ErrorState error={query.error} retry={query.refresh}/>;
  if (!query.data) return <LoadingState/>;
  return <><PageHeader eyebrow="SYSTEM ACTIVITY · TESTNET + PAPER" title="Neural Activity Stream" description="Deposit、Allocation、XP、Agent 与 Paper Reward 事件流。"/>{query.data.length === 0 ? <EmptyState message="No activity yet."/> : <ActivityFeed initial={query.data} liveDemo={getAppMode() === 'demo'}/>}</>;
}
