
import React, { useState, useMemo, useEffect } from 'react';
import { GceResource, LabelOperation, OperationType, SavedPipeline } from '../types';
import { 
  Tag, Eraser, ArrowRight, X, 
  RefreshCw, Plus, Trash2,
  Check, Layers, Info,
  Replace, Eye, Scissors, Wand2, Split,
  Merge, MessageSquare, Play,
  GitBranch, Variable, Bookmark, FileText,
  AlertTriangle, ScanSearch
} from 'lucide-react';
import { Button, Input, ToggleSwitch, Badge, Select, Modal } from './DesignSystem';
import { motion, AnimatePresence } from 'framer-motion';

const MotionDiv = motion.div as any;

// --- Interfaces ---

interface LabelingStudioProps {
  isOpen: boolean;
  onClose: () => void;
  selectedResources: GceResource[];
  onApply: (updates: Map<string, Record<string, string>>, reason?: string) => void;
  savedPipelines?: SavedPipeline[];
  onSavePipeline?: (pipeline: SavedPipeline) => void;
}

// --- Constants ---

const DYNAMIC_TOKENS = [
    { label: 'Resource Name', token: '{{name}}', desc: 'e.g. prod-web-01' },
    { label: 'Zone', token: '{{zone}}', desc: 'e.g. us-central1-a' },
    { label: 'Region', token: '{{region}}', desc: 'e.g. us-central1' },
    { label: 'Resource Type', token: '{{type}}', desc: 'e.g. INSTANCE' },
    { label: 'Machine Type', token: '{{machineType}}', desc: 'e.g. n1-standard-1' },
    { label: 'Creation Date', token: '{{created}}', desc: 'YYYY-MM-DD' },
    { label: 'Provisioning', token: '{{provisioningModel}}', desc: 'spot / standard' },
    { label: 'GKE Mode', token: '{{gkeMode}}', desc: 'autopilot / standard' },
    { label: 'Storage Class', token: '{{storageClass}}', desc: 'standard / coldline' },
    { label: 'Run Ingress', token: '{{ingress}}', desc: 'all / internal' },
];

const OP_INSTRUCTIONS: Record<OperationType, string> = {
  ADD: "Set a static value or use dynamic tokens (e.g. {{name}}) to populate labels.",
  REMOVE: "Delete a specific label key if it exists on the resource.",
  REPLACE: "Search and replace text substrings within existing label values.",
  EXTRACT_REGEX: "Extract values using Regex capture groups. Example: ^(prod)-(.*)$ maps Group 1 to 'env'.",
  PATTERN: "Split the resource name by a delimiter (e.g. '-') and map specific segments to label keys by index.",
  CASE_TRANSFORM: "Standardize label values to a specific casing (lowercase or uppercase).",
  NORMALIZE_VALUES: "Map inconsistent value variations (synonyms) to a single standard value.",
  CONDITIONAL_SET: "Apply labels only when the resource matches specific criteria (Name, Type, Zone).",
};

const DEFAULT_OPERATIONS: Record<OperationType, LabelOperation> = {
  ADD: { id: '', type: 'ADD', config: { key: '', value: '' }, enabled: true },
  REMOVE: { id: '', type: 'REMOVE', config: { key: '' }, enabled: true },
  REPLACE: { id: '', type: 'REPLACE', config: { find: '', replace: '' }, enabled: true },
  EXTRACT_REGEX: { id: '', type: 'EXTRACT_REGEX', config: { regex: '^([a-z]+)-', groups: [{ index: 1, targetKey: 'env' }] }, enabled: true },
  PATTERN: { id: '', type: 'PATTERN', config: { delimiter: '-', groups: [{ index: 0, targetKey: 'env' }] }, enabled: true },
  CASE_TRANSFORM: { id: '', type: 'CASE_TRANSFORM', config: { casing: 'lowercase' }, enabled: true },
  NORMALIZE_VALUES: { id: '', type: 'NORMALIZE_VALUES', config: { targetKey: '', valueMap: {} }, enabled: true },
  CONDITIONAL_SET: { id: '', type: 'CONDITIONAL_SET', config: { sourceField: 'name', operator: 'contains', matchValue: 'prod', key: 'env', value: 'production' }, enabled: true },
};

const OP_DESCRIPTIONS: Record<OperationType, { label: string, icon: any }> = {
    ADD: { label: "Set Label", icon: Tag },
    REMOVE: { label: "Remove Label", icon: Eraser },
    REPLACE: { label: "Text Replace", icon: Replace },
    PATTERN: { label: "Split Name", icon: Split },
    EXTRACT_REGEX: { label: "Regex Extract", icon: Scissors },
    CASE_TRANSFORM: { label: "Case Format", icon: RefreshCw },
    NORMALIZE_VALUES: { label: "Normalize", icon: Merge },
    CONDITIONAL_SET: { label: "Conditional", icon: GitBranch },
};

// --- Helper Functions ---

const resolveTokens = (template: string, resource: GceResource): string => {
    let result = template;
    const date = new Date(resource.creationTimestamp).toISOString().split('T')[0];
    
    // Extract Region from Zone (e.g. us-central1-a -> us-central1)
    let region = resource.zone;
    if (resource.zone !== 'global' && resource.zone.includes('-')) {
        const parts = resource.zone.split('-');
        // Heuristic: if last part is single char, strip it (us-central1-a -> us-central1)
        // Note: some regions are just 'us-central1' if not zonal resources? usually zone has the letter.
        if (parts.length > 2) {
             region = parts.slice(0, -1).join('-');
        }
    }

    const replacements: Record<string, string> = {
        '{{name}}': resource.name,
        '{{zone}}': resource.zone,
        '{{region}}': region,
        '{{type}}': resource.type.toLowerCase(),
        '{{machineType}}': resource.machineType || 'unknown',
        '{{created}}': date,
        '{{provisioningModel}}': resource.provisioningModel?.toLowerCase() || 'standard',
        '{{gkeMode}}': resource.clusterDetails ? (resource.clusterDetails.isAutopilot ? 'autopilot' : 'standard') : 'na',
        '{{storageClass}}': resource.storageClass?.toLowerCase() || 'na',
        '{{ingress}}': resource.ingress || 'na'
    };

    Object.entries(replacements).forEach(([token, value]) => {
        result = result.replace(new RegExp(token, 'g'), value);
    });
    
    return result;
};

const applyOperations = (labels: Record<string, string>, resource: GceResource, ops: LabelOperation[]) => {
  let currentLabels = { ...labels };

  ops.filter(o => o.enabled).forEach(op => {
    try {
        switch (op.type) {
        case 'ADD':
            if (op.config.key && op.config.value) {
                const resolvedValue = resolveTokens(op.config.value, resource);
                currentLabels[op.config.key] = resolvedValue;
            }
            break;
        case 'REMOVE':
            if (op.config.key && currentLabels[op.config.key] !== undefined) {
                delete currentLabels[op.config.key];
            }
            break;
        case 'REPLACE':
            if (op.config.find && op.config.replace !== undefined) {
                Object.keys(currentLabels).forEach(k => {
                    const val = currentLabels[k];
                    if (val && val.includes(op.config.find!)) {
                        currentLabels[k] = val.split(op.config.find!).join(op.config.replace!);
                    }
                });
            }
            break;
        case 'CASE_TRANSFORM':
            const newLabels: Record<string, string> = {};
            Object.entries(currentLabels).forEach(([k, v]) => {
                const newK = k.toLowerCase(); 
                const newV = op.config.casing === 'lowercase' ? v.toLowerCase() : v.toUpperCase();
                newLabels[newK] = newV;
            });
            currentLabels = newLabels;
            break;
        case 'NORMALIZE_VALUES':
            const targetKey = op.config.targetKey;
            const map = op.config.valueMap || {};
            if (targetKey && currentLabels[targetKey]) {
                const currentVal = currentLabels[targetKey];
                if (map[currentVal]) {
                    currentLabels[targetKey] = map[currentVal];
                }
            }
            break;
        case 'PATTERN':
            if (op.config.delimiter && op.config.groups) {
                const parts = resource.name.split(op.config.delimiter);
                op.config.groups.forEach(g => {
                    if (parts[g.index] !== undefined) {
                        currentLabels[g.targetKey] = parts[g.index];
                    }
                });
            }
            break;
        case 'EXTRACT_REGEX':
            if (op.config.regex && op.config.groups) {
                try {
                    const re = new RegExp(op.config.regex);
                    const match = resource.name.match(re);
                    if (match) {
                        op.config.groups.forEach(g => {
                            const val = match[g.index];
                            if (typeof val === 'string') {
                                currentLabels[g.targetKey] = val;
                            }
                        });
                    }
                } catch(e) {}
            }
            break;
        case 'CONDITIONAL_SET':
            const field = op.config.sourceField || 'name';
            let valToCheck = '';
            
            if (field === 'name') valToCheck = resource.name;
            else if (field === 'type') valToCheck = resource.type;
            else if (field === 'zone') valToCheck = resource.zone;
            else if (field.startsWith('label:')) {
                const labelKey = field.replace('label:', '');
                valToCheck = currentLabels[labelKey] || '';
            }

            let isMatch = false;
            const target = op.config.matchValue || '';
            const opType = op.config.operator || 'contains';

            if (opType === 'equals') isMatch = valToCheck === target;
            else if (opType === 'contains') isMatch = valToCheck.includes(target);
            else if (opType === 'starts_with') isMatch = valToCheck.startsWith(target);
            else if (opType === 'ends_with') isMatch = valToCheck.endsWith(target);
            else if (opType === 'matches_regex') isMatch = new RegExp(target).test(valToCheck);

            if (isMatch && op.config.key && op.config.value) {
                const resolvedVal = resolveTokens(op.config.value, resource);
                currentLabels[op.config.key] = resolvedVal;
            }
            break;
        }
    } catch(e) {
        // Fail silently
    }
  });

  return currentLabels;
};

const TokenBadge: React.FC<{ token: { label: string; token: string; desc?: string }; onClick: () => void }> = ({ token, onClick }) => (
    <button 
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 rounded text-[10px] font-mono hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors cursor-pointer group"
        title={token.desc || "Click to insert"}
    >
        <Variable className="w-3 h-3 text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
        {token.token}
    </button>
);

export const LabelingStudio: React.FC<LabelingStudioProps> = ({ 
  isOpen, onClose, selectedResources, onApply, savedPipelines = [], onSavePipeline 
}) => {
  const [pipeline, setPipeline] = useState<LabelOperation[]>([]);
  const [viewMode, setViewMode] = useState<'BUILD' | 'REVIEW' | 'ANALYSIS'>('BUILD');
  const [changeReason, setChangeReason] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
        setChangeReason('');
    } else {
        setViewMode('BUILD');
        setPipeline([]);
    }
  }, [isOpen]);

  const addOperation = (type: OperationType, overrideConfig?: any) => {
    const newOp = { 
      ...DEFAULT_OPERATIONS[type], 
      id: Math.random().toString(36).substr(2, 9),
      config: overrideConfig || JSON.parse(JSON.stringify(DEFAULT_OPERATIONS[type].config))
    };
    setPipeline(prev => [...prev, newOp]);
  };

  const updateConfig = (id: string, field: string, value: any) => {
    setPipeline(prev => prev.map(p => p.id === id ? { ...p, config: { ...p.config, [field]: value } } : p));
  };

  const removeOperation = (id: string) => {
    setPipeline(prev => prev.filter(p => p.id !== id));
  };

  // --- Analysis Engine ---
  const analysisResults = useMemo(() => {
      const results: { type: 'CASING' | 'FRAGMENTATION' | 'KEY_SIMILARITY', title: string, desc: string, items: string[], severity: 'HIGH' | 'MEDIUM', quickFix?: () => void }[] = [];
      
      const keyMap: Record<string, Set<string>> = {};
      selectedResources.forEach(r => {
          Object.entries(r.labels).forEach(([k, v]) => {
              if(!keyMap[k]) keyMap[k] = new Set();
              keyMap[k].add(v);
          });
      });

      Object.entries(keyMap).forEach(([key, valuesSet]) => {
          const values = Array.from(valuesSet);
          
          const lowerMap = new Map<string, Set<string>>();
          values.forEach(v => {
              const lower = v.toLowerCase();
              if(!lowerMap.has(lower)) lowerMap.set(lower, new Set());
              lowerMap.get(lower)!.add(v);
          });

          lowerMap.forEach((variations, lower) => {
              if (variations.size > 1) {
                  const varsArray = Array.from(variations);
                  results.push({
                      type: 'CASING',
                      title: `Inconsistent Casing: "${key}"`,
                      desc: `Value "${lower}" appears in multiple casing variations.`,
                      items: varsArray,
                      severity: 'MEDIUM',
                      quickFix: () => addOperation('CASE_TRANSFORM', { casing: 'lowercase' })
                  });
              }
          });

          const synonyms = [
              ['prod', 'production'],
              ['dev', 'development'],
              ['stg', 'stage', 'staging'],
              ['qa', 'test', 'testing']
          ];

          synonyms.forEach(group => {
              const found = group.filter(syn => values.includes(syn));
              if (found.length > 1) {
                  const target = group.sort((a,b) => b.length - a.length)[0]; 
                  const valueMap: Record<string, string> = {};
                  found.filter(f => f !== target).forEach(f => valueMap[f] = target);

                  results.push({
                      type: 'FRAGMENTATION',
                      title: `Ambiguous Values: "${key}"`,
                      desc: `Found synonyms: ${found.join(', ')}`,
                      items: found,
                      severity: 'HIGH',
                      quickFix: () => addOperation('NORMALIZE_VALUES', { targetKey: key, valueMap })
                  });
              }
          });
      });

      return results;
  }, [selectedResources]);

  // --- Preview Calculation ---
  const previewData = useMemo(() => {
    const changes = new Map<string, { original: Record<string, string>, final: Record<string, string>, diff: any[] }>();
    
    selectedResources.forEach(res => {
      const final = applyOperations(res.labels, res, pipeline);
      
      const diff: any[] = [];
      const allKeys = new Set([...Object.keys(res.labels), ...Object.keys(final)]);
      
      allKeys.forEach(k => {
        const oldV = res.labels[k];
        const newV = final[k];
        if (oldV !== newV) {
          diff.push({ 
            key: k, 
            oldVal: oldV, 
            newVal: newV, 
            type: !oldV ? 'ADD' : !newV ? 'REMOVE' : 'MODIFY' 
          });
        }
      });

      if (diff.length > 0) {
        changes.set(res.id, { original: res.labels, final, diff });
      }
    });

    return changes;
  }, [selectedResources, pipeline]);

  const stats = useMemo(() => {
    let adds = 0, mods = 0, dels = 0;
    previewData.forEach(data => {
      data.diff.forEach(d => {
        if (d.type === 'ADD') adds++;
        if (d.type === 'MODIFY') mods++;
        if (d.type === 'REMOVE') dels++;
      });
    });
    return { adds, mods, dels, affectedCount: previewData.size };
  }, [previewData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <MotionDiv 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" 
        onClick={onClose} 
      />

      <MotionDiv 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-7xl h-[90vh] bg-slate-50 dark:bg-slate-950 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg shadow-indigo-500/20">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">Transformation Pipeline</h2>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                 <Badge variant="neutral">{selectedResources.length} Resources</Badge>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
              <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-lg flex border border-slate-200 dark:border-slate-800">
                  <button 
                    onClick={() => setViewMode('BUILD')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${viewMode === 'BUILD' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Editor
                  </button>
                  <button 
                    onClick={() => setViewMode('ANALYSIS')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-2 ${viewMode === 'ANALYSIS' ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      Analyze
                      {analysisResults.length > 0 && <span className="bg-indigo-100 text-indigo-700 px-1.5 rounded-full text-[9px]">{analysisResults.length}</span>}
                  </button>
              </div>

              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>
              
              <div className="flex items-center gap-2">
                 <Select 
                    value="" 
                    onChange={(e) => {
                        const saved = savedPipelines.find(p => p.id === e.target.value);
                        if (saved) setPipeline(JSON.parse(JSON.stringify(saved.operations)));
                    }}
                    className="h-8 text-xs w-40"
                 >
                    <option value="" disabled>Load Recipe...</option>
                    {savedPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                 </Select>
                 {pipeline.length > 0 && onSavePipeline && (
                    <Button size="sm" variant="ghost" onClick={() => setSaveModalOpen(true)} title="Save Recipe"><Bookmark className="w-4 h-4 text-indigo-500"/></Button>
                 )}
              </div>
              
              <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
              </button>
          </div>
        </div>

        {/* --- ANALYSIS MODE --- */}
        {viewMode === 'ANALYSIS' && (
            <div className="flex-1 bg-slate-50 dark:bg-slate-950/50 p-8 overflow-y-auto">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full">
                            <ScanSearch className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Dataset Analysis</h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Detected {analysisResults.length} potential inconsistencies in the selected resources.
                            </p>
                        </div>
                    </div>

                    {analysisResults.length === 0 && (
                        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                            <Check className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                            <h4 className="text-lg font-bold text-slate-800 dark:text-white">Clean Dataset</h4>
                            <p className="text-slate-500">No casing issues or ambiguous synonyms detected.</p>
                            <Button variant="ghost" className="mt-4" onClick={() => setViewMode('BUILD')}>Back to Editor</Button>
                        </div>
                    )}

                    <div className="grid gap-4">
                        {analysisResults.map((issue, idx) => (
                            <MotionDiv 
                                key={idx} 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors flex items-start justify-between gap-4"
                            >
                                <div className="flex gap-4">
                                    <div className={`mt-1 p-2 rounded-lg shrink-0 ${issue.severity === 'HIGH' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}`}>
                                        <AlertTriangle className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                                            {issue.title}
                                            <Badge variant={issue.severity === 'HIGH' ? 'error' : 'warning'} className="text-[9px]">{issue.severity}</Badge>
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1 mb-3">{issue.desc}</p>
                                        <div className="flex flex-wrap gap-2">
                                            {issue.items.map(val => (
                                                <span key={val} className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[10px] font-mono border border-slate-200 dark:border-slate-700">
                                                    {val}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <Button 
                                    size="sm" 
                                    variant="secondary" 
                                    className="shrink-0"
                                    onClick={() => {
                                        issue.quickFix?.();
                                        setViewMode('BUILD');
                                    }}
                                    leftIcon={<Wand2 className="w-3 h-3 text-indigo-500" />}
                                >
                                    Auto-Fix
                                </Button>
                            </MotionDiv>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {/* --- BUILDER INTERFACE --- */}
        {viewMode === 'BUILD' && (
            <div className="flex-1 flex overflow-hidden">
                <div className="w-full md:w-1/2 lg:w-[500px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50/30 dark:bg-slate-950/20">
                        {pipeline.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl m-4">
                                <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                                    <Layers className="w-6 h-6 text-slate-300" />
                                </div>
                                <p className="text-sm font-medium">Pipeline is empty</p>
                                <p className="text-xs mt-1 text-center max-w-[200px]">Add operations below to transform your metadata.</p>
                                {analysisResults.length > 0 && (
                                    <Button size="xs" variant="secondary" onClick={() => setViewMode('ANALYSIS')} className="mt-4" leftIcon={<ScanSearch className="w-3 h-3"/>}>
                                        Scan for Issues
                                    </Button>
                                )}
                            </div>
                        )}

                        <AnimatePresence>
                        {pipeline.map((op, idx) => {
                            const Meta = OP_DESCRIPTIONS[op.type];
                            return (
                                <MotionDiv 
                                    key={op.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                                    className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden"
                                >
                                    <div className="flex items-center gap-3 p-3 bg-slate-50/80 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <span className="text-[10px] font-mono text-slate-400 w-4">{idx + 1}</span>
                                        <div className="p-1.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-slate-500">
                                            <Meta.icon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex-1">{Meta.label}</span>
                                        <ToggleSwitch checked={op.enabled} onChange={(v) => {
                                            setPipeline(prev => prev.map(p => p.id === op.id ? { ...p, enabled: v } : p));
                                        }} />
                                        <button onClick={() => removeOperation(op.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-3.5 h-3.5"/></button>
                                    </div>

                                    {op.enabled && (
                                        <div className="p-4 space-y-3">
                                            {/* Dynamic Instruction Banner */}
                                            <div className="flex items-start gap-2 bg-indigo-50/50 dark:bg-indigo-900/10 p-2.5 rounded-lg text-xs text-indigo-700 dark:text-indigo-300 mb-3 border border-indigo-100 dark:border-indigo-900/30">
                                                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                <span className="leading-snug">{OP_INSTRUCTIONS[op.type]}</span>
                                            </div>

                                            {(op.type === 'ADD' || op.type === 'CONDITIONAL_SET') && (
                                                <div className="space-y-3">
                                                    {op.type === 'CONDITIONAL_SET' && (
                                                        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-800 mb-2">
                                                            <div className="flex gap-2 mb-2">
                                                                <Select value={op.config.sourceField} onChange={e => updateConfig(op.id, 'sourceField', e.target.value)} className="text-xs h-7">
                                                                    <option value="name">If Name</option>
                                                                    <option value="type">If Type</option>
                                                                    <option value="zone">If Zone</option>
                                                                </Select>
                                                                <Select value={op.config.operator} onChange={e => updateConfig(op.id, 'operator', e.target.value)} className="text-xs h-7">
                                                                    <option value="contains">Contains</option>
                                                                    <option value="equals">Equals</option>
                                                                    <option value="starts_with">Starts With</option>
                                                                    <option value="matches_regex">Regex Match</option>
                                                                </Select>
                                                            </div>
                                                            <Input value={op.config.matchValue} onChange={e => updateConfig(op.id, 'matchValue', e.target.value)} placeholder="Value to match..." className="text-xs h-7" />
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="col-span-2">
                                                            <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Set Key</label>
                                                            <Input value={op.config.key} onChange={e => updateConfig(op.id, 'key', e.target.value)} placeholder="e.g. environment" className="text-xs font-mono h-8" />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <div className="flex justify-between mb-1">
                                                                <label className="text-[10px] uppercase font-bold text-slate-400 block">Set Value</label>
                                                                <span className="text-[9px] text-indigo-500">Supports variables</span>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <Input 
                                                                    value={op.config.value} 
                                                                    onChange={e => updateConfig(op.id, 'value', e.target.value)} 
                                                                    placeholder="static-value or {{name}}" 
                                                                    className="text-xs font-mono h-8 flex-1" 
                                                                />
                                                            </div>
                                                            <div className="flex flex-wrap gap-2 mt-2">
                                                                {DYNAMIC_TOKENS.map(t => (
                                                                    <TokenBadge 
                                                                        key={t.token} 
                                                                        token={t} 
                                                                        onClick={() => updateConfig(op.id, 'value', (op.config.value || '') + t.token)} 
                                                                    />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {op.type === 'NORMALIZE_VALUES' && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Target Key</label>
                                                        <Input value={op.config.targetKey} onChange={e => updateConfig(op.id, 'targetKey', e.target.value)} className="text-xs h-8" />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 block">Value Mapping</label>
                                                        {Object.entries((op.config.valueMap || {}) as Record<string, string>).map(([from, to]) => (
                                                            <div key={from} className="flex gap-2 items-center text-xs">
                                                                <span className="bg-red-50 text-red-600 px-2 py-1 rounded border border-red-100">{from}</span>
                                                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded border border-emerald-100">{String(to)}</span>
                                                                <button 
                                                                    onClick={() => {
                                                                        const newMap = { ...op.config.valueMap };
                                                                        delete newMap[from];
                                                                        updateConfig(op.id, 'valueMap', newMap);
                                                                    }}
                                                                    className="ml-auto text-slate-400 hover:text-red-500"
                                                                ><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                        {/* Simple Adder UI */}
                                                        <div className="flex gap-2 pt-2">
                                                            <Input id={`from-${op.id}`} placeholder="Old Value" className="text-xs h-7" />
                                                            <Input id={`to-${op.id}`} placeholder="New Value" className="text-xs h-7" />
                                                            <button 
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    const fromInputId = `from-${op.id}`;
                                                                    const toInputId = `to-${op.id}`;
                                                                    const fromEl = document.getElementById(fromInputId) as HTMLInputElement | null;
                                                                    const toEl = document.getElementById(toInputId) as HTMLInputElement | null;
                                                                    
                                                                    if (fromEl && toEl && fromEl.value && toEl.value) {
                                                                        const currentMap = (op.config.valueMap || {}) as Record<string, string>;
                                                                        updateConfig(op.id, 'valueMap', { 
                                                                            ...currentMap, 
                                                                            [fromEl.value]: toEl.value 
                                                                        });
                                                                        fromEl.value = ''; 
                                                                        toEl.value = '';
                                                                    }
                                                                }}
                                                                className="p-1 bg-indigo-50 text-indigo-600 rounded border border-indigo-100"
                                                            ><Plus className="w-4 h-4"/></button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {op.type === 'REPLACE' && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <Input placeholder="Find..." value={op.config.find} onChange={e => updateConfig(op.id, 'find', e.target.value)} className="text-xs h-8" />
                                                    <Input placeholder="Replace with..." value={op.config.replace} onChange={e => updateConfig(op.id, 'replace', e.target.value)} className="text-xs h-8" />
                                                </div>
                                            )}

                                            {op.type === 'REMOVE' && (
                                                <Input placeholder="Label Key to Remove" value={op.config.key} onChange={e => updateConfig(op.id, 'key', e.target.value)} className="text-xs h-8 text-red-500" />
                                            )}

                                            {op.type === 'PATTERN' && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Delimiter</label>
                                                        <Input value={op.config.delimiter} onChange={e => updateConfig(op.id, 'delimiter', e.target.value)} className="text-xs h-8 font-mono w-24 text-center" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Position Mapping</label>
                                                        {op.config.groups?.map((g: any, i: number) => (
                                                            <div key={i} className="flex gap-2 items-center mb-2">
                                                                <span className="text-xs text-slate-500 w-12">Index</span>
                                                                <Input type="number" value={g.index} onChange={e => {
                                                                    const newGroups = [...op.config.groups];
                                                                    newGroups[i].index = parseInt(e.target.value);
                                                                    updateConfig(op.id, 'groups', newGroups);
                                                                }} className="text-xs h-7 w-16" />
                                                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                <Input value={g.targetKey} onChange={e => {
                                                                    const newGroups = [...op.config.groups];
                                                                    newGroups[i].targetKey = e.target.value;
                                                                    updateConfig(op.id, 'groups', newGroups);
                                                                }} placeholder="Target Key" className="text-xs h-7 flex-1" />
                                                                <button onClick={() => updateConfig(op.id, 'groups', op.config.groups.filter((_: any, idx: number) => idx !== i))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                        <Button size="xs" variant="ghost" onClick={() => updateConfig(op.id, 'groups', [...(op.config.groups || []), { index: 0, targetKey: '' }])} leftIcon={<Plus className="w-3 h-3"/>}>Add Mapping</Button>
                                                    </div>
                                                </div>
                                            )}

                                            {op.type === 'EXTRACT_REGEX' && (
                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Regex Pattern</label>
                                                        <Input value={op.config.regex} onChange={e => updateConfig(op.id, 'regex', e.target.value)} className="text-xs h-8 font-mono" placeholder="e.g. ^(prod)-(.*)$" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Capture Group Mapping</label>
                                                        {op.config.groups?.map((g: any, i: number) => (
                                                            <div key={i} className="flex gap-2 items-center mb-2">
                                                                <span className="text-xs text-slate-500 w-12">Group</span>
                                                                <Input type="number" value={g.index} onChange={e => {
                                                                    const newGroups = [...op.config.groups];
                                                                    newGroups[i].index = parseInt(e.target.value);
                                                                    updateConfig(op.id, 'groups', newGroups);
                                                                }} className="text-xs h-7 w-16" />
                                                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                                                <Input value={g.targetKey} onChange={e => {
                                                                    const newGroups = [...op.config.groups];
                                                                    newGroups[i].targetKey = e.target.value;
                                                                    updateConfig(op.id, 'groups', newGroups);
                                                                }} placeholder="Target Key" className="text-xs h-7 flex-1" />
                                                                <button onClick={() => updateConfig(op.id, 'groups', op.config.groups.filter((_: any, idx: number) => idx !== i))} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                                                            </div>
                                                        ))}
                                                        <Button size="xs" variant="ghost" onClick={() => updateConfig(op.id, 'groups', [...(op.config.groups || []), { index: 1, targetKey: '' }])} leftIcon={<Plus className="w-3 h-3"/>}>Add Mapping</Button>
                                                    </div>
                                                </div>
                                            )}

                                            {op.type === 'CASE_TRANSFORM' && (
                                                <div className="flex gap-2">
                                                    <button onClick={() => updateConfig(op.id, 'casing', 'lowercase')} className={`flex-1 py-1.5 text-xs rounded border ${op.config.casing === 'lowercase' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200'}`}>lowercase</button>
                                                    <button onClick={() => updateConfig(op.id, 'casing', 'uppercase')} className={`flex-1 py-1.5 text-xs rounded border ${op.config.casing === 'uppercase' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200'}`}>UPPERCASE</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </MotionDiv>
                            );
                        })}
                        </AnimatePresence>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => addOperation('ADD')} leftIcon={<Tag className="w-3 h-3"/>} className="justify-start">Add / Set</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('CONDITIONAL_SET')} leftIcon={<GitBranch className="w-3 h-3"/>} className="justify-start">Conditional</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('PATTERN')} leftIcon={<Split className="w-3 h-3"/>} className="justify-start">Split Name</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('EXTRACT_REGEX')} leftIcon={<Scissors className="w-3 h-3"/>} className="justify-start">Regex Extract</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('REPLACE')} leftIcon={<Replace className="w-3 h-3"/>} className="justify-start">Find & Replace</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('CASE_TRANSFORM')} leftIcon={<RefreshCw className="w-3 h-3"/>} className="justify-start">Case Format</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('REMOVE')} leftIcon={<Eraser className="w-3 h-3"/>} className="justify-start text-red-500">Remove Key</Button>
                        <Button size="sm" variant="secondary" onClick={() => addOperation('NORMALIZE_VALUES')} leftIcon={<Merge className="w-3 h-3"/>} className="justify-start">Map Values</Button>
                    </div>
                </div>

                {/* RIGHT: Live Preview */}
                <div className="flex-1 flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="h-12 px-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                        <div className="flex items-center gap-2">
                            <Eye className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Impact Preview</span>
                        </div>
                        <div className="flex gap-4 text-xs font-mono">
                            <span className="text-emerald-600">+{stats.adds}</span>
                            <span className="text-amber-600">~{stats.mods}</span>
                            <span className="text-red-600">-{stats.dels}</span>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                        <div className="space-y-4">
                            {previewData.size === 0 && (
                                <div className="text-center py-20 text-slate-400">
                                    <div className="flex justify-center mb-2"><FileText className="w-8 h-8 opacity-20" /></div>
                                    <p className="text-sm">No changes detected.</p>
                                </div>
                            )}

                            {Array.from(previewData.entries()).map(([id, data]) => {
                                const resource = selectedResources.find(r => r.id === id);
                                if (!resource) return null;
                                const hasChanges = data.diff.length > 0;
                                if (!hasChanges) return null;

                                return (
                                    <MotionDiv layoutId={id} key={id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                                        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <Badge variant="neutral" className="text-[9px] shrink-0">{resource.type}</Badge>
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{resource.name}</span>
                                                <span className="text-[10px] text-slate-400 font-mono">{resource.zone}</span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-white dark:bg-slate-900">
                                            <div className="space-y-1">
                                                {data.diff.map((d, i) => (
                                                    <div key={i} className={`flex items-center gap-3 text-xs p-1.5 rounded ${d.type === 'ADD' ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : d.type === 'REMOVE' ? 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'}`}>
                                                        {d.type === 'ADD' && <Plus className="w-3 h-3 shrink-0" />}
                                                        {d.type === 'REMOVE' && <Trash2 className="w-3 h-3 shrink-0" />}
                                                        {d.type === 'MODIFY' && <RefreshCw className="w-3 h-3 shrink-0" />}
                                                        <div className="font-mono font-bold min-w-[80px]">{d.key}</div>
                                                        <div className="flex items-center gap-2 flex-1 overflow-hidden">
                                                            {d.type === 'MODIFY' && <span className="line-through opacity-50 truncate">{d.oldVal}</span>}
                                                            {d.type === 'MODIFY' && <ArrowRight className="w-3 h-3 opacity-50 shrink-0" />}
                                                            <span className="font-bold truncate">{d.newVal}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </MotionDiv>
                                )
                            })}
                        </div>
                    </div>

                    <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
                        <Button variant="ghost" onClick={onClose}>Cancel</Button>
                        <Button 
                            variant="primary" 
                            onClick={() => setViewMode('REVIEW')} 
                            disabled={stats.affectedCount === 0}
                            rightIcon={<ArrowRight className="w-4 h-4"/>}
                        >
                            Review & Apply
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {/* --- REVIEW MODE --- */}
        {viewMode === 'REVIEW' && (
            <div className="flex-1 bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-300">
                <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <Check className="w-8 h-8" />
                    </div>
                    
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 text-center">Ready to Apply?</h2>
                    <p className="text-slate-500 dark:text-slate-400 mb-8 text-center text-sm">
                        This operation will modify <strong>{stats.affectedCount} resources</strong>. 
                        <br/>A snapshot will be captured in the Audit History.
                    </p>

                    <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-5 border border-slate-100 dark:border-slate-800 mb-8">
                        <label className="text-[10px] uppercase font-bold text-slate-500 mb-2 block flex items-center gap-2">
                            <MessageSquare className="w-3 h-3" /> Change Reason (Mandatory)
                        </label>
                        <Input 
                            value={changeReason}
                            onChange={e => setChangeReason(e.target.value)}
                            placeholder="e.g. Q3 Cost Center normalization ticket #123"
                            className="bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 focus:ring-2 ring-emerald-500/20"
                            autoFocus
                        />
                    </div>

                    <div className="flex items-center justify-center gap-4">
                        <Button variant="ghost" size="lg" onClick={() => setViewMode('BUILD')}>Back to Editor</Button>
                        <Button 
                            variant="primary" 
                            size="lg" 
                            className={`px-8 shadow-xl transition-all duration-300 ${!changeReason ? 'opacity-50 cursor-not-allowed bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-50 shadow-emerald-500/30'}`}
                            onClick={() => {
                                const updates = new Map<string, Record<string, string>>();
                                previewData.forEach((val, key) => updates.set(key, val.final));
                                onApply(updates, changeReason);
                                onClose();
                            }}
                            disabled={!changeReason}
                            rightIcon={<Play className="w-4 h-4 fill-current" />}
                        >
                            Confirm & Apply
                        </Button>
                    </div>
                </div>
            </div>
        )}

        {/* Save Pipeline Modal */}
        <Modal 
            isOpen={saveModalOpen} 
            onClose={() => setSaveModalOpen(false)} 
            title="Save Labeling Recipe"
            size="sm"
        >
            <div className="p-4 space-y-4">
                <p className="text-xs text-slate-500">Save this pipeline configuration to reuse later or share with your team.</p>
                <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Recipe Name</label>
                    <Input 
                        value={newPipelineName} 
                        onChange={e => setNewPipelineName(e.target.value)} 
                        placeholder="e.g. Standard Env Tagging" 
                        autoFocus
                    />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="ghost" onClick={() => setSaveModalOpen(false)}>Cancel</Button>
                    <Button size="sm" variant="primary" onClick={() => {
                        if (onSavePipeline && newPipelineName) {
                            onSavePipeline({
                                id: Math.random().toString(36).substr(2, 9),
                                name: newPipelineName,
                                operations: pipeline,
                                createdAt: Date.now()
                            });
                            setSaveModalOpen(false);
                            setNewPipelineName('');
                        }
                    }} disabled={!newPipelineName}>Save Recipe</Button>
                </div>
            </div>
        </Modal>

      </MotionDiv>
    </div>
  );
};
