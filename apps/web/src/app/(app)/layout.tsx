import { AppShell } from '@/components/layout/AppShell';

export default function ProductLayout({ children }: { readonly children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
