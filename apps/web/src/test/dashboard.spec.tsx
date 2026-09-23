import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/brain/XgouBrain', () => ({ XgouBrain: () => <div>XGOU BRAIN</div> }));
vi.mock('@/components/charts/NavChart', () => ({ NavChart: () => <div>NAV CHART</div> }));
import DashboardPage from '@/app/(app)/dashboard/page';

describe('dashboard', () => {
  it('renders demo portfolio, all fund domains and safety labeling', async () => {
    render(await DashboardPage());
    expect(screen.getByText('Command overview')).toBeInTheDocument();
    expect(screen.getByText('BULL FUND')).toBeInTheDocument();
    expect(screen.getByText('SPOT STRATEGY')).toBeInTheDocument();
    expect(screen.getByText('FUTURES TREND')).toBeInTheDocument();
    expect(screen.getAllByText(/DEMO/).length).toBeGreaterThan(0);
  });
});
