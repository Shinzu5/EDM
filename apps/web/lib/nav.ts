/**
 * Role-filtered navigation model shared by the sidebar, breadcrumb and page
 * guards. Each entry carries the ability (action, subject) checked via can().
 */
import {
  Activity,
  BarChart3,
  BookOpen,
  Database,
  FileText,
  GitBranch,
  HeartPulse,
  History,
  LayoutDashboard,
  Merge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Action, Subject } from '@/lib/ability';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  action: Action;
  subject: Subject;
};

export type NavSection = { title: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { href: '/', label: 'KPI Overview', icon: LayoutDashboard, action: 'read', subject: 'dashboard' },
    ],
  },
  {
    title: 'Clinical & Revenue',
    items: [
      { href: '/patients', label: 'Patients', icon: Users, action: 'read', subject: 'patients' },
      { href: '/labs', label: 'Laboratory', icon: Stethoscope, action: 'read', subject: 'labs' },
      { href: '/billing', label: 'Billing', icon: Wallet, action: 'read', subject: 'billing' },
      { href: '/insurance', label: 'Insurance', icon: ShieldCheck, action: 'read', subject: 'insurance' },
    ],
  },
  {
    title: 'Insight',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, action: 'read', subject: 'analytics' },
      { href: '/outcomes', label: 'Outcomes', icon: Sparkles, action: 'read', subject: 'kpi' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { href: '/governance/catalog', label: 'Catalog', icon: Database, action: 'read', subject: 'governance' },
      { href: '/governance/glossary', label: 'Glossary', icon: BookOpen, action: 'read', subject: 'governance' },
      { href: '/governance/lineage', label: 'Lineage', icon: GitBranch, action: 'read', subject: 'governance' },
      { href: '/governance/quality', label: 'Data Quality', icon: Activity, action: 'read', subject: 'governance' },
      { href: '/governance/freshness', label: 'Freshness SLA', icon: RefreshCw, action: 'read', subject: 'governance' },
      { href: '/governance/mdm', label: 'MDM Merge Review', icon: Merge, action: 'read', subject: 'mdm' },
      { href: '/governance/audit', label: 'Audit Trail', icon: History, action: 'read', subject: 'audit' },
    ],
  },
  {
    title: 'Portal & Admin',
    items: [
      { href: '/portal', label: 'My Records', icon: FileText, action: 'read', subject: 'portal' },
      { href: '/admin/users', label: 'User Admin', icon: UserCog, action: 'read', subject: 'admin' },
    ],
  },
];

export const BREADCRUMB_LABELS: Record<string, string> = {
  '': 'Overview',
  patients: 'Patients',
  labs: 'Laboratory',
  billing: 'Billing',
  insurance: 'Insurance',
  analytics: 'Analytics',
  outcomes: 'Outcomes',
  governance: 'Governance',
  catalog: 'Catalog',
  glossary: 'Glossary',
  lineage: 'Lineage',
  quality: 'Data Quality',
  freshness: 'Freshness SLA',
  mdm: 'MDM Merge Review',
  audit: 'Audit Trail',
  portal: 'My Records',
  admin: 'User Admin',
  users: 'Users',
};
