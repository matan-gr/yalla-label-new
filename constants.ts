
import { FileText, Server, Activity, Settings, ShieldCheck } from 'lucide-react';

export const APP_NAME = "Yalla Label";
export const APP_VERSION = "5.0.0-experiment";

export const NAVIGATION_ITEMS = [
  { id: 'dashboard', label: 'Governance Dashboard', icon: Activity },
  { id: 'inventory', label: 'Resource Inventory', icon: Server },
  { id: 'policy', label: 'Policy Center', icon: ShieldCheck },
  { id: 'logs', label: 'Audit Logs', icon: FileText },
  { id: 'settings', label: 'Configuration', icon: Settings },
];

export const LABEL_TEMPLATES = [
  { label: 'Env: Production', key: 'environment', value: 'production' },
  { label: 'Env: Staging', key: 'environment', value: 'staging' },
  { label: 'Env: Development', key: 'environment', value: 'development' },
  { label: 'Dept: Engineering', key: 'department', value: 'engineering' },
  { label: 'Dept: Finance', key: 'department', value: 'finance' },
  { label: 'App: Web Server', key: 'application', value: 'web-server' },
  { label: 'App: Database', key: 'application', value: 'database' },
  { label: 'Cost: Default Center', key: 'cost-center', value: 'cc-general' },
  { label: 'Comp: PCI-DSS', key: 'compliance', value: 'pci-dss' },
  { label: 'Comp: HIPAA', key: 'compliance', value: 'hipaa' },
];

export const QUOTA_DESCRIPTIONS: Record<string, string> = {
  'CPUS': 'Total number of virtual CPUs for VM instances.',
  'CPUS_ALL_REGIONS': 'Total number of virtual CPUs across all regions.',
  'DISKS_TOTAL_GB': 'Total storage capacity (GB) for persistent disks.',
  'SNAPSHOTS': 'Total number of persistent disk snapshots.',
  'STATIC_ADDRESSES': 'Number of reserved static external IP addresses.',
  'IN_USE_ADDRESSES': 'Number of external IP addresses currently in use.',
  'INSTANCES': 'Total number of VM instances.',
  'NVIDIA_T4_GPUS': 'Number of NVIDIA T4 GPUs.',
  'NVIDIA_V100_GPUS': 'Number of NVIDIA V100 GPUs.',
  'SSD_TOTAL_GB': 'Total storage capacity (GB) for SSD persistent disks.',
};
