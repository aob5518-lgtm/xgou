import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import JoinPage from '@/app/(app)/join/page';
import SettingsPage from '@/app/(app)/settings/page';
import AgentPage from '@/app/(app)/agent/page';
import { appRoutes } from '@/components/layout/AppShell';

describe('product routes', () => {
  it('declares every required application route', () => {
    expect(appRoutes.map((route) => route.href)).toEqual([
      '/dashboard', '/bull-fund', '/agent', '/rewards', '/xp', '/activity', '/join', '/settings',
    ]);
  });

  it('renders Join and Settings routes without backend data', () => {
    const { unmount } = render(<JoinPage />);
    expect(screen.getByText('Join XGOU')).toBeInTheDocument();
    expect(screen.getByLabelText('Participation Amount')).toHaveValue('10000');
    unmount();
    render(<SettingsPage />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('ENABLED · LOCKED')).toBeInTheDocument();
  });

  it('renders Futures Trend as an explicit paper strategy with no real fund movement', async () => {
    render(await AgentPage());
    expect(screen.getByText('FUTURES TREND V1 · PAPER')).toBeInTheDocument();
    expect(screen.getAllByText('NO REAL FUNDS MOVE').length).toBeGreaterThan(0);
    expect(screen.getByText('FUTURES POSITIONS · PAPER')).toBeInTheDocument();
    expect(screen.getByText('BTC/USDC-PERP')).toBeInTheDocument();
  });
});
