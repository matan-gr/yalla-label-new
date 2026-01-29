
import React, { useState, useMemo, useCallback } from 'react';
import { GceResource } from '../types';
import { 
  Server, HardDrive, Zap, Clock, Check, X, Pencil, Save, 
  Trash2, Plus, Copy, History, 
  CheckSquare, Square, ChevronDown, 
  Cpu, Tag, Globe, Network, Database,
  Image as ImageIcon, Cloud, PlayCircle, StopCircle, Box,
  Ship, ShieldAlert, ExternalLink, Activity, Info, Camera, Lock,
  GitCommit, ShieldCheck, MapPin, Calendar, Link, Fingerprint, User, Layers
} from 'lucide-react';
import { Button, Input, Badge, Spinner } from './DesignSystem';
import { validateKey, validateValue } from '../utils/validation';
import { RegionIcon } from './RegionIcon';
import { ServiceIcon } from './ServiceIcons';
import { motion, AnimatePresence } from 'framer-motion';
import { GRID_TEMPLATE } from './ResourceTable';

const MotionDiv = motion.div as any;

interface ResourceRowProps {
  resource: GceResource;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, labels: Record<string, string>) => void;
  onApply: (id: string, labels: Record<string, string>) => void;
  onRevert: (id: string) => void;
  onViewHistory: (r: GceResource) => void;
  projectId?: string;
}

// --- Helpers ---

const getConsoleUrl = (resource: GceResource, projectId?: string) => {
    if (!projectId) return '#';
    const p = `?project=${projectId}`;
    switch(resource.type) {
        case 'INSTANCE':
            return `https://console.cloud.google.com/compute/instancesDetail/zones/${resource.zone}/instances/${resource.name}${p}`;
        case 'DISK':
            return `https://console.cloud.google.com/compute/disksDetail/zones/${resource.zone}/disks/${resource.name}${p}`;
        case 'SNAPSHOT':
            return `https://console.cloud.google.com/compute/snapshotsDetail/projects/${projectId}/global/snapshots/${resource.name}${p}`;
        case 'IMAGE':
            return `https://console.cloud.google.com/compute/imagesDetail/projects/${projectId}/global/images/${resource.name}${p}`;
        case 'CLOUD_RUN':
            return `https://console.cloud.google.com/run/detail/${resource.zone}/${resource.name}/metrics${p}`;
        case 'CLOUD_SQL':
            return `https://console.cloud.google.com/sql/instances/${resource.name}/overview${p}`;
        case 'BUCKET':
            return `https://console.cloud.google.com/storage/browser/${resource.name}${p}`;
        case 'GKE_CLUSTER':
            return `https://console.cloud.google.com/kubernetes/clusters/details/${resource.zone}/${resource.name}/details${p}`;
        default:
            return '#';
    }
};

const formatMachineType = (type: string | undefined, resourceType: string) => {
  if (!type) return 'Standard Config';
  
  if (resourceType === 'CLOUD_SQL') {
      return type.replace('db-', '').replace('custom-', 'Custom ').toUpperCase();
  }

  // Simple heuristic for GCE machine types
  if (type.includes('micro')) return 'Shared vCPU • 0.6GB';
  if (type.includes('small')) return 'Shared vCPU • 1.7GB';
  if (type.includes('medium')) return '1 vCPU • 3.75GB';
  if (type.includes('standard-1')) return '1 vCPU • 3.75GB';
  if (type.includes('standard-2')) return '2 vCPU • 7.5GB';
  if (type.includes('standard-4')) return '4 vCPU • 15GB';
  if (type.includes('standard-8')) return '8 vCPU • 32GB';
  
  // Disk Types
  if (type.includes('pd-standard')) return 'Standard Persistent Disk';
  if (type.includes('pd-ssd')) return 'SSD Persistent Disk';
  if (type.includes('pd-balanced')) return 'Balanced Persistent Disk';
  if (type.includes('pd-extreme')) return 'Extreme Persistent Disk';
  if (type.includes('hyperdisk')) return 'Hyperdisk';
  
  return type.split('/').pop();
};

const getStatusColor = (status: string) => {
    const s = status.toUpperCase();
    if (['RUNNING', 'READY', 'RUNNABLE'].includes(s)) return 'text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
    if (['STOPPED', 'TERMINATED'].includes(s)) return 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    if (['PROVISIONING', 'STAGING'].includes(s)) return 'text-blue-700 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20';
    return 'text-amber-700 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
};

const getStatusIcon = (status: string) => {
    const s = status.toUpperCase();
    if (['RUNNING', 'READY', 'RUNNABLE'].includes(s)) return <PlayCircle className="w-3.5 h-3.5" />;
    if (['STOPPED', 'TERMINATED'].includes(s)) return <StopCircle className="w-3.5 h-3.5" />;
    return <Activity className="w-3.5 h-3.5" />;
};

const DetailRow = ({ label, value, icon: Icon, className = "" }: any) => (
    <div className={`flex justify-between items-start py-2 border-b border-slate-100 dark:border-slate-800/50 last:border-0 ${className}`}>
        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5 mt-0.5">
            {Icon && <Icon className="w-3 h-3" />} {label}
        </span>
        <span className="text-xs font-mono text-slate-800 dark:text-slate-200 text-right max-w-[60%] break-all">
            {value || <span className="text-slate-400 italic">N/A</span>}
        </span>
    </div>
);

export const ResourceRow = React.memo(({ 
  resource, 
  isSelected, 
  onToggleSelect, 
  onUpdate, 
  onApply, 
  onRevert, 
  onViewHistory,
  projectId
}: ResourceRowProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'GOVERNANCE' | 'JSON'>('DETAILS');
  const [editForm, setEditForm] = useState<{key: string, value: string}[]>([]);
  const [copiedId, setCopiedId] = useState(false);

  // --- Derived Metrics ---
  const violations = resource.violations || [];
  const hasViolations = violations.length > 0;
  const isDrifted = resource.driftStatus === 'DRIFTED';
  
  const labelCount = Object.keys(resource.labels).length;
  const consoleUrl = useMemo(() => getConsoleUrl(resource, projectId), [resource, projectId]);
  
  // Prioritize key labels for the collapsed view: ONLY Top 2
  const { visibleLabels, hiddenCount } = useMemo(() => {
      const entries = Object.entries(resource.labels);
      const priorityKeys = ['environment', 'env', 'owner', 'team', 'cost-center', 'app', 'service'];
      
      const sorted = entries.sort((a, b) => {
          const idxA = priorityKeys.indexOf(a[0]);
          const idxB = priorityKeys.indexOf(b[0]);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a[0].localeCompare(b[0]);
      });

      return {
          visibleLabels: sorted.slice(0, 2),
          hiddenCount: Math.max(0, entries.length - 2)
      };
  }, [resource.labels]);

  const timeAgo = useMemo(() => {
    const date = new Date(resource.creationTimestamp);
    const now = new Date();
    const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days/30)}mo ago`;
  }, [resource.creationTimestamp]);

  const createdDateFormatted = useMemo(() => {
      if(!resource.creationTimestamp) return 'Unknown';
      return new Date(resource.creationTimestamp).toLocaleString('en-US', { 
          year: 'numeric', month: 'short', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
      });
  }, [resource.creationTimestamp]);

  // --- Handlers ---

  const copyId = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(resource.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [resource.id]);

  const handleEditOpen = (e: React.MouseEvent) => {
      e.stopPropagation();
      setEditForm(Object.entries(resource.labels).map(([key, value]) => ({ key, value })));
      setIsEditing(true);
      setIsExpanded(true);
      setActiveTab('GOVERNANCE');
  };

  const handleSave = () => {
      const newLabels: Record<string, string> = {};
      editForm.forEach(({key, value}) => {
          if(key.trim()) newLabels[key.trim()] = value.trim();
      });
      onUpdate(resource.id, newLabels);
      setIsEditing(false);
  };

  // --- Renderers ---

  return (
    <MotionDiv 
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className={`
        group relative mb-3 bg-white dark:bg-slate-900 border rounded-xl overflow-hidden transition-all duration-200
        ${isExpanded ? 'shadow-xl ring-1 ring-indigo-500/20 border-indigo-200 dark:border-indigo-800' : 'shadow-sm border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md'}
        ${resource.isUpdating ? 'opacity-60 pointer-events-none' : ''}
        ${isDrifted && !isExpanded ? 'border-amber-400 dark:border-amber-600 border-l-4' : ''}
      `}
    >
      {/* Loading Overlay */}
      {resource.isUpdating && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700">
                  <Spinner className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Updating...</span>
              </div>
          </div>
      )}

      {/* Main Row Content */}
      <div 
        className={`${GRID_TEMPLATE} px-4 py-3 cursor-pointer`}
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        {/* 1. Select */}
        <div className="flex justify-center" onClick={e => e.stopPropagation()}>
            <button 
                onClick={() => onToggleSelect(resource.id)}
                className={`p-2 rounded-lg transition-colors ${isSelected ? 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30' : 'text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400'}`}
            >
                {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}
            </button>
        </div>

        {/* 2. Identity */}
        <div className="flex items-center gap-4 min-w-0">
            <div className="relative shrink-0">
                <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50 group-hover:border-indigo-100 dark:group-hover:border-indigo-900/30 transition-colors">
                    <ServiceIcon type={resource.type} className="w-8 h-8" />
                </div>
                {hasViolations && (
                    <div className="absolute -top-1 -right-1">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white dark:border-slate-900"></span>
                        </span>
                    </div>
                )}
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white truncate text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                        {resource.name}
                    </span>
                    {isDrifted && (
                        <Badge variant="warning" className="text-[9px] flex items-center gap-1">
                            <GitCommit className="w-3 h-3" /> Drift
                        </Badge>
                    )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 group/id">
                    <code className="text-[10px] text-slate-500 dark:text-slate-400 font-mono max-w-[120px] truncate">{resource.id}</code>
                    <button 
                        onClick={copyId} 
                        className="opacity-0 group-hover/id:opacity-100 text-slate-400 hover:text-indigo-500 transition-opacity"
                    >
                        {copiedId ? <Check className="w-3 h-3 text-emerald-500"/> : <Copy className="w-3 h-3"/>}
                    </button>
                </div>
            </div>
        </div>

        {/* 3. Type / Zone */}
        <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                <ServiceIcon type={resource.type} className="w-4 h-4 shrink-0" />
                <span className="truncate">{resource.type.replace(/_/g, ' ')}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <RegionIcon zone={resource.zone} className="w-3.5 h-2.5 rounded-[1px] shadow-sm" />
                <span className="font-mono">{resource.zone}</span>
            </div>
        </div>

        {/* 4. Configuration */}
        <div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {formatMachineType(resource.machineType || resource.storageClass, resource.type)}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex gap-2">
                {resource.sizeGb && <span>{resource.sizeGb} GB</span>}
                {resource.provisioningModel === 'SPOT' && <span className="text-amber-600 font-bold">SPOT</span>}
                {resource.publicAccess && <span className="text-red-500 flex items-center gap-0.5"><Globe className="w-2.5 h-2.5"/> Public</span>}
                {resource.type === 'DISK' && resource.resourcePolicies && resource.resourcePolicies.length > 0 && (
                    <span className="text-emerald-600 font-bold flex items-center gap-0.5"><Camera className="w-2.5 h-2.5"/> Auto-Snap</span>
                )}
            </div>
        </div>

        {/* 5. Status */}
        <div>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${getStatusColor(resource.status)}`}>
                {getStatusIcon(resource.status)}
                {resource.status}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 pl-2 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {timeAgo}
            </div>
        </div>

        {/* 6. Labels / Governance */}
        <div className="flex flex-col items-start gap-1.5">
            {hasViolations ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md border border-red-100 dark:border-red-900/30">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{violations.length} Issues</span>
                </div>
            ) : (
                visibleLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {visibleLabels.map(([k, v]) => (
                            <span key={k} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-w-[90px] truncate">
                                {v}
                            </span>
                        ))}
                        {hiddenCount > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                                +{hiddenCount}
                            </span>
                        )}
                    </div>
                ) : (
                    <span className="text-[10px] text-slate-400 italic">No labels</span>
                )
            )}
        </div>

        {/* 7. Actions */}
        <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
            {resource.proposedLabels ? (
                <div className="flex gap-1">
                    <Button size="xs" variant="success" onClick={() => onApply(resource.id, resource.proposedLabels!)} className="px-2" title="Apply AI Suggestion"><Check className="w-3.5 h-3.5"/></Button>
                    <Button size="xs" variant="danger" onClick={() => onRevert(resource.id)} className="px-2" title="Reject"><X className="w-3.5 h-3.5"/></Button>
                </div>
            ) : (
                <>
                    <button onClick={handleEditOpen} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => onViewHistory(resource)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                        <History className="w-4 h-4" />
                    </button>
                </>
            )}
            <div className="ml-1 pl-1 border-l border-slate-200 dark:border-slate-700 flex items-center">
               <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
        </div>
      </div>

      {/* EXPANDED PANEL */}
      <AnimatePresence>
        {isExpanded && (
            <MotionDiv 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 overflow-hidden"
            >
                {/* Tabs */}
                <div className="flex items-center px-6 border-b border-slate-200 dark:border-slate-800 gap-6">
                    {['DETAILS', 'GOVERNANCE', 'JSON'].map((tab) => (
                        <button
                            key={tab}
                            onClick={(e) => { e.stopPropagation(); setActiveTab(tab as any); }}
                            className={`
                                py-3 text-xs font-bold tracking-wide border-b-2 transition-colors
                                ${activeTab === tab 
                                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}
                            `}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6 cursor-default" onClick={e => e.stopPropagation()}>
                    
                    {/* --- DETAILS TAB --- */}
                    {activeTab === 'DETAILS' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            
                            {/* Block 1: Identity & Meta */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Info className="w-3.5 h-3.5" /> Identity
                                </h4>
                                <div className="space-y-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 h-full shadow-sm">
                                    <DetailRow label="Name" value={resource.name} icon={Tag} />
                                    <DetailRow label="Resource ID" value={resource.id} icon={Fingerprint} />
                                    <DetailRow label="Zone" value={resource.zone} icon={MapPin} />
                                    <DetailRow label="Created" value={createdDateFormatted} icon={Calendar} />
                                    {resource.description && <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800/50 text-xs text-slate-500 italic">{resource.description}</div>}
                                </div>
                            </div>

                            {/* Block 2: Type Specific Configuration */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Cpu className="w-3.5 h-3.5" /> Configuration
                                </h4>
                                <div className="space-y-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 h-full shadow-sm">
                                    
                                    {/* VM Instance Details */}
                                    {resource.type === 'INSTANCE' && (
                                        <>
                                            <DetailRow label="Machine Type" value={resource.machineType} icon={Cpu} />
                                            <DetailRow label="CPU Platform" value={resource.cpuPlatform} icon={Zap} />
                                            <DetailRow label="Provisioning" value={resource.provisioningModel} />
                                            {resource.serviceAccount && (
                                                <DetailRow label="Service Account" value={resource.serviceAccount.split('@')[0]} icon={User} />
                                            )}
                                            {resource.disks && (
                                                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Attached Disks</span>
                                                    {resource.disks.map((d, i) => (
                                                        <div key={i} className="text-xs flex justify-between text-slate-600 dark:text-slate-300">
                                                            <span>{d.deviceName} {d.boot && <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1 rounded">BOOT</span>}</span>
                                                            <span className="font-mono">{d.sizeGb} GB ({d.type})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Cloud SQL Details */}
                                    {resource.type === 'CLOUD_SQL' && (
                                        <>
                                            <DetailRow label="Engine Version" value={resource.databaseVersion} icon={Database} />
                                            <DetailRow label="Tier" value={resource.machineType} icon={Server} />
                                            <DetailRow label="Storage" value={`${resource.sizeGb} GB`} icon={HardDrive} />
                                        </>
                                    )}

                                    {/* Cloud Run Details */}
                                    {resource.type === 'CLOUD_RUN' && (
                                        <>
                                            <DetailRow label="URL" value={resource.url} icon={Link} />
                                            <DetailRow label="Ingress" value={resource.ingress} icon={Network} />
                                            <div className="flex gap-2 mt-2">
                                                {resource.memory && <Badge variant="neutral">{resource.memory} Mem</Badge>}
                                                {resource.cpu && <Badge variant="neutral">{resource.cpu} CPU</Badge>}
                                            </div>
                                        </>
                                    )}

                                    {/* GKE Details */}
                                    {resource.type === 'GKE_CLUSTER' && resource.clusterDetails && (
                                        <>
                                            <DetailRow label="Master Version" value={resource.clusterDetails.version} icon={Ship} />
                                            <DetailRow label="Total Nodes" value={resource.clusterDetails.nodeCount} icon={Server} />
                                            <DetailRow label="Mode" value={resource.clusterDetails.isAutopilot ? 'Autopilot' : 'Standard'} icon={Zap} />
                                            <DetailRow label="Endpoint" value={resource.clusterDetails.endpoint} icon={Globe} />
                                            
                                            {resource.clusterDetails.nodePools && resource.clusterDetails.nodePools.length > 0 && (
                                                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-2 flex items-center gap-1">
                                                        <Layers className="w-3 h-3" /> Node Pools
                                                    </span>
                                                    <div className="space-y-2">
                                                        {resource.clusterDetails.nodePools.map((pool, idx) => (
                                                            <div key={idx} className="bg-slate-50 dark:bg-slate-800/30 p-2 rounded border border-slate-100 dark:border-slate-800/50">
                                                                <div className="flex justify-between items-center mb-1">
                                                                    <span className="font-semibold text-xs text-slate-700 dark:text-slate-300 truncate">{pool.name}</span>
                                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                                        pool.status === 'RUNNING' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-slate-100 text-slate-500'
                                                                    }`}>
                                                                        {pool.status}
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between items-center text-[10px] text-slate-500">
                                                                    <div className="flex gap-2">
                                                                        <span>{pool.nodeCount} Nodes</span>
                                                                        <span>•</span>
                                                                        <span>{pool.machineType}</span>
                                                                    </div>
                                                                    <span className="font-mono opacity-80">{pool.version}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Bucket Details */}
                                    {resource.type === 'BUCKET' && (
                                        <>
                                            <DetailRow label="Storage Class" value={resource.storageClass} icon={Box} />
                                            <DetailRow label="Location Type" value={resource.locationType} icon={MapPin} />
                                            <DetailRow label="Public Access" value={resource.publicAccess ? 'Enabled' : 'Blocked'} icon={resource.publicAccess ? Globe : Lock} className={resource.publicAccess ? 'text-red-500' : ''} />
                                        </>
                                    )}

                                    {/* Disk Details */}
                                    {resource.type === 'DISK' && (
                                        <>
                                            <DetailRow label="Size" value={`${resource.sizeGb} GB`} icon={HardDrive} />
                                            <DetailRow label="Type" value={resource.machineType} icon={Server} />
                                            {resource.resourcePolicies?.length > 0 && (
                                                <DetailRow label="Snapshot Policy" value={resource.resourcePolicies.join(', ')} icon={Camera} />
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Block 3: Networking & Security */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                                    <Network className="w-3.5 h-3.5" /> Networking
                                </h4>
                                <div className="space-y-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 h-full shadow-sm">
                                    {resource.ips?.map((ip, i) => (
                                        <div key={i} className="mb-3 last:mb-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Badge variant="neutral" className="text-[9px]">NIC {i}</Badge>
                                                <span className="text-[10px] text-slate-500 font-mono truncate">{ip.network}</span>
                                            </div>
                                            <DetailRow label="Internal IP" value={ip.internal} />
                                            {ip.external && (
                                                <DetailRow label="External IP" value={ip.external} icon={Globe} className="text-indigo-600 dark:text-indigo-400" />
                                            )}
                                            {ip.subnetwork && (
                                                <DetailRow label="Subnet" value={ip.subnetwork.split('/').pop()} />
                                            )}
                                        </div>
                                    ))}
                                    
                                    {(!resource.ips || resource.ips.length === 0) && (
                                        <div className="text-center py-6 text-slate-400 italic text-xs">
                                            No explicit network interfaces detected.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'GOVERNANCE' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Editor Side */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Tag className="w-3.5 h-3.5" /> Active Labels
                                    </h4>
                                    {isEditing && (
                                        <Button size="xs" variant="ghost" onClick={() => setEditForm(p => [...p, {key:'', value:''}])} leftIcon={<Plus className="w-3 h-3"/>}>Add Field</Button>
                                    )}
                                </div>

                                {isEditing ? (
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {editForm.map((item, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <Input 
                                                    value={item.key} 
                                                    onChange={e => { const n = [...editForm]; n[idx].key = e.target.value; setEditForm(n); }} 
                                                    placeholder="Key" 
                                                    className="h-8 text-xs font-mono"
                                                    error={validateKey(item.key) || undefined}
                                                />
                                                <Input 
                                                    value={item.value} 
                                                    onChange={e => { const n = [...editForm]; n[idx].value = e.target.value; setEditForm(n); }} 
                                                    placeholder="Value" 
                                                    className="h-8 text-xs font-mono"
                                                    error={validateValue(item.value) || undefined}
                                                />
                                                <button onClick={() => setEditForm(p => p.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                        ))}
                                        <div className="pt-2 flex justify-end gap-2">
                                            <Button size="xs" variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                                            <Button size="xs" variant="primary" onClick={handleSave} leftIcon={<Save className="w-3 h-3"/>}>Save Changes</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(resource.labels).map(([k, v]) => (
                                                <span key={k} className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                    <span className="font-semibold mr-1 text-slate-500">
                                                        {k}:
                                                    </span> 
                                                    {v}
                                                </span>
                                            ))}
                                            {labelCount === 0 && <span className="text-slate-400 italic text-sm">No labels assigned.</span>}
                                        </div>
                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                                            <Button size="sm" variant="secondary" onClick={handleEditOpen} leftIcon={<Pencil className="w-3 h-3"/>} className="w-full">
                                                Edit Labels
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Compliance & Quick Actions */}
                            <div className="space-y-6">
                                {isDrifted && (
                                    <div className="p-4 rounded-xl border bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/30">
                                        <div className="flex items-start gap-3">
                                            <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                                                <GitCommit className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-sm text-amber-900 dark:text-amber-200">
                                                    Configuration Drift Detected
                                                </h4>
                                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                                                    Live configuration differs from the last recorded history snapshot. This usually means a change was made outside this tool (e.g. CLI, Console).
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className={`p-4 rounded-xl border ${hasViolations ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg ${hasViolations ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                            {hasViolations ? <ShieldAlert className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                                        </div>
                                        <div>
                                            <h4 className={`font-bold text-sm ${hasViolations ? 'text-red-900 dark:text-red-200' : 'text-emerald-900 dark:text-emerald-200'}`}>
                                                {hasViolations ? 'Policy Violations Detected' : 'Resource Compliant'}
                                            </h4>
                                            {hasViolations ? (
                                                <ul className="mt-2 space-y-1">
                                                    {violations.map((v, i) => (
                                                        <li key={i} className="text-xs text-red-700 dark:text-red-300 flex items-start gap-1.5">
                                                            <span className="mt-1 w-1 h-1 rounded-full bg-red-500 shrink-0"></span>
                                                            {v.message}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : (
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                                                    All governance checks passed. Labels align with organizational taxonomy.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'JSON' && (
                        <div className="relative">
                            <pre className="text-[10px] font-mono bg-slate-900 text-slate-300 p-4 rounded-xl overflow-auto max-h-[300px] custom-scrollbar">
                                {JSON.stringify(resource, null, 2)}
                            </pre>
                            <Button 
                                size="xs" 
                                variant="secondary" 
                                className="absolute top-2 right-2 bg-white/10 text-white hover:bg-white/20 border-none backdrop-blur-md"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(JSON.stringify(resource, null, 2));
                                }}
                            >
                                Copy JSON
                            </Button>
                        </div>
                    )}
                </div>
            </MotionDiv>
        )}
      </AnimatePresence>
    </MotionDiv>
  );
});
