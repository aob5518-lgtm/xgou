import { PageHeader } from '@/components/layout/PageHeader';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
export default function SettingsPage() { return <><PageHeader eyebrow="PREVIEW PREFERENCES" title="Settings" description="仅包含界面偏好设置，不请求网络切换或任何资金权限。" /><SettingsPanel /></>; }
