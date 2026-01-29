
import React from 'react';
import { GceResource, FilterConfig } from '../types';
import { Button, Badge, GlassCard } from './DesignSystem';
import { 
  Shield, CheckCircle2, AlertOctagon, Terminal, ArrowRight,
  Layers, Tag, BarChart3, MapPin, AlertCircle, Sparkles, GitCommit, Search, RefreshCw, Wand2
} from 'lucide-react';
import { DonutChart, AnimatedCounter, HealthGauge, BarChart } from './Visualizations';
import { useDashboardAnalytics } from '../hooks/useDashboardAnalytics';
import { RegionIcon } from './RegionIcon';
import { motion } from 'framer-motion';

const MotionDiv = motion.div as any;

interface DashboardProps {
  resources: GceResource[];
  stats: { total: number; labeled: number; unlabeled: number };
  onNavigate: (tab: string) => void;
  onExplore?: (filter: Partial<FilterConfig>) => void;
  onRunAudit?: () => void; // New prop for triggering audit
  aiInsight?: string | null;
  isGeneratingInsight?: boolean;
}

const InsightCard = ({ title, icon: Icon, children, onClick, colorClass = "text-indigo-500", bgClass = "bg-indigo-50 dark:bg-indigo-900/20" }: any) => (
    <div 
        onClick={onClick}
        className="group relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-800 transition-all cursor-pointer"
    >
        <div className="flex justify-between items-start mb-3">
            <div className={`p-2.5 rounded-xl ${bgClass} ${colorClass} group-hover:scale-110 transition-transform`}>
                <Icon className="w-5 h-5" />
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="w-4 h-4 text-slate-400" />
            </div>
        </div>
        <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">{title}</h4>
        {children}
    </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ 
    resources, 
    stats, 
    onNavigate,
    onExplore,
    onRunAudit
}) => {
  const analysis = useDashboardAnalytics(resources, stats);

  // Animation Variants
  const containerVars: any = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVars: any = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } }
  };

  const casingIssuesCount = analysis.patterns.casingIssues.length;
  const fragmentationCount = analysis.patterns.valueFragmentation.length;
  const hygieneIssues = casingIssuesCount + fragmentationCount;

  return (
    <MotionDiv 
      variants={containerVars}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-12"
    >
      {/* 1. Hero / Command Center */}
      <MotionDiv variants={itemVars} className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
         {/* Abstract Background - Adaptive */}
         <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-100/50 dark:bg-indigo-600/20 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
         <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-100/50 dark:bg-blue-500/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none"></div>
         
         <div className="relative z-10 p-8 md:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
            <div className="space-y-6 max-w-2xl">
                <div className="flex items-center gap-2">
                    <Badge variant="purple" className="bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 border-indigo-200 dark:border-indigo-400/30 backdrop-blur-md px-3 py-1">
                        <Sparkles className="w-3 h-3 mr-1.5" /> AI Governance Engine
                    </Badge>
                    <span className="text-xs font-mono text-slate-500 dark:text-indigo-300/70">v5.0 Active</span>
                </div>
                <div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-3 text-slate-900 dark:text-white">
                       {analysis.complianceRate}% Compliance
                    </h1>
                    <p className="text-slate-600 dark:text-indigo-200/80 text-sm md:text-base leading-relaxed max-w-lg">
                       Your cloud environment is <strong className="text-slate-900 dark:text-white">{analysis.complianceRate >= 90 ? 'healthy' : analysis.complianceRate >= 70 ? 'stable' : 'at risk'}</strong>. 
                       <br className="hidden md:block"/>
                       Monitoring <span className="font-mono font-bold">{stats.total}</span> assets across <span className="font-mono font-bold">{analysis.topZones.length}</span> regions.
                    </p>
                </div>
                
                {/* REFACTORED BUTTONS FOR HIGH CONTRAST */}
                <div className="flex flex-wrap gap-3 pt-2">
                    <Button 
                        variant="primary" 
                        size="lg"
                        className="shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/30"
                        onClick={onRunAudit}
                        leftIcon={<Wand2 className="w-5 h-5" />}
                    >
                        Run AI Audit
                    </Button>
                    <Button 
                        variant="outline" 
                        size="lg"
                        className="bg-white/80 dark:bg-white/5 border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-white backdrop-blur-sm"
                        onClick={() => onNavigate('inventory')}
                        rightIcon={<ArrowRight className="w-5 h-5" />}
                    >
                        View Inventory
                    </Button>
                </div>
            </div>

            {/* Right Side Stats - Adaptive */}
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto min-w-[280px]">
                <div className="bg-slate-50/80 dark:bg-white/5 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-indigo-300 uppercase tracking-wider mb-1">Active Violations</div>
                    <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white"><AnimatedCounter value={analysis.violationCount} /></div>
                </div>
                <div className="bg-slate-50/80 dark:bg-white/5 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider mb-1">Drifted Assets</div>
                    <div className="text-3xl font-mono font-bold text-slate-900 dark:text-white"><AnimatedCounter value={analysis.driftCount} /></div>
                </div>
                <div className="col-span-2 bg-indigo-50/50 dark:bg-indigo-600/20 backdrop-blur-sm border border-indigo-100 dark:border-indigo-500/30 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-200 uppercase tracking-wider mb-1">Unlabeled</div>
                        <div className="text-2xl font-mono font-bold text-indigo-900 dark:text-white"><AnimatedCounter value={analysis.unlabeledCount} /></div>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-white dark:bg-indigo-500/30 flex items-center justify-center border border-indigo-100 dark:border-transparent">
                        <Tag className="w-5 h-5 text-indigo-600 dark:text-indigo-200" />
                    </div>
                </div>
            </div>
         </div>
      </MotionDiv>

      {/* 2. AI Insight Grid */}
      <MotionDiv variants={itemVars}>
          <div className="flex items-center gap-2 mb-4 px-1">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-500">Live Insights</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Drift Insight */}
              <InsightCard 
                  title="Config Drift" 
                  icon={GitCommit} 
                  colorClass="text-amber-500" 
                  bgClass="bg-amber-50 dark:bg-amber-900/20"
                  onClick={() => onExplore?.({ search: 'drifted' })} // Assuming search handles this or implement specific filter
              >
                  {analysis.driftCount > 0 ? (
                      <div>
                          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-1">{analysis.driftCount} Assets</div>
                          <p className="text-xs text-slate-500 leading-snug">Modified outside of governance policies.</p>
                      </div>
                  ) : (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mt-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-bold">In Sync</span>
                      </div>
                  )}
              </InsightCard>

              {/* Metadata Hygiene */}
              <InsightCard 
                  title="Metadata Hygiene" 
                  icon={Search} 
                  colorClass="text-blue-500" 
                  bgClass="bg-blue-50 dark:bg-blue-900/20"
                  onClick={() => onRunAudit?.()}
              >
                  {hygieneIssues > 0 ? (
                      <div>
                          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mb-1">{hygieneIssues} Issues</div>
                          <p className="text-xs text-slate-500 leading-snug">
                              {casingIssuesCount > 0 ? `${casingIssuesCount} casing errors` : ''} 
                              {casingIssuesCount > 0 && fragmentationCount > 0 ? ', ' : ''}
                              {fragmentationCount > 0 ? `${fragmentationCount} fragmented values` : ''}
                          </p>
                      </div>
                  ) : (
                      <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mt-2">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-sm font-bold">Clean</span>
                      </div>
                  )}
              </InsightCard>

              {/* Security Risk */}
              <InsightCard 
                  title="Security Risks" 
                  icon={AlertCircle} 
                  colorClass="text-red-500" 
                  bgClass="bg-red-50 dark:bg-red-900/20"
                  onClick={() => onExplore?.({ hasPublicIp: true })}
              >
                  {/* Heuristic: Simple public IP check for demo */}
                  <div>
                      <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-1">
                          {resources.filter(r => r.ips?.some(ip => !!ip.external)).length} Exposed
                      </div>
                      <p className="text-xs text-slate-500 leading-snug">Assets accessible via public internet.</p>
                  </div>
              </InsightCard>

              {/* Optimization */}
              <InsightCard 
                  title="Optimization" 
                  icon={RefreshCw} 
                  colorClass="text-emerald-500" 
                  bgClass="bg-emerald-50 dark:bg-emerald-900/20"
                  onClick={() => onExplore?.({ statuses: ['STOPPED'] })}
              >
                  <div>
                      <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                          {resources.filter(r => r.status === 'STOPPED').length} Idle
                      </div>
                      <p className="text-xs text-slate-500 leading-snug">Stopped resources incurring storage costs.</p>
                  </div>
              </InsightCard>
          </div>
      </MotionDiv>

      {/* 3. Deep Dive Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         
         {/* Label Usage Distribution */}
         <MotionDiv variants={itemVars} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
               <Tag className="w-5 h-5 text-indigo-500" /> Top Labels
            </h3>
            <div className="flex items-center gap-8">
               <div className="shrink-0">
                  <DonutChart data={analysis.labelDistribution.map((l, i) => ({
                      label: l.label,
                      value: l.value,
                      color: ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e'][i % 5]
                  }))} />
               </div>
               <div className="flex-1 w-full">
                  <BarChart data={analysis.labelDistribution} max={stats.total} barColor="bg-indigo-500" />
               </div>
            </div>
         </MotionDiv>

         {/* Resource Type Breakdown */}
         <MotionDiv variants={itemVars} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
               <BarChart3 className="w-5 h-5 text-emerald-500" /> Resource Types
            </h3>
            <BarChart 
                data={[
                    { label: 'VM Instances', value: analysis.vmCount },
                    { label: 'Disks', value: analysis.diskCount },
                    { label: 'Buckets', value: analysis.bucketCount },
                    { label: 'Cloud SQL', value: analysis.sqlCount },
                    { label: 'GKE Clusters', value: analysis.gkeCount },
                    { label: 'Cloud Run', value: analysis.cloudRunCount },
                ].filter(d => d.value > 0).sort((a,b) => b.value - a.value)} 
                max={stats.total} 
                barColor="bg-emerald-500" 
            />
         </MotionDiv>

         {/* Unlabeled Breakdown */}
         <MotionDiv variants={itemVars} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm cursor-pointer hover:border-amber-200 dark:hover:border-amber-900/50 transition-colors" onClick={() => onExplore?.({ showUnlabeledOnly: true })}>
            <div className="flex justify-between items-start mb-6">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                   <AlertCircle className="w-5 h-5 text-amber-500" /> Unlabeled Risks
                </h3>
                <div className="px-2 py-1 bg-amber-50 dark:bg-amber-900/20 rounded text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                    Action Required
                </div>
            </div>
            
            <BarChart 
                data={analysis.unlabeledBreakdown} 
                max={analysis.unlabeledCount} 
                barColor="bg-amber-500" 
            />
            
            {analysis.unlabeledBreakdown.length === 0 && (
                <div className="text-center py-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg mt-2">
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-3 h-3" /> 100% Coverage
                    </span>
                </div>
            )}
         </MotionDiv>

         {/* Geographic Distribution */}
         <MotionDiv variants={itemVars} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
               <MapPin className="w-5 h-5 text-blue-500" /> Global Footprint
            </h3>
            <div className="space-y-4">
                {analysis.topZones.length === 0 && <div className="text-slate-400 text-xs italic text-center py-8">No regional data available</div>}
                
                {analysis.topZones.map(([zone, count]) => (
                    <div 
                        key={zone} 
                        className="flex items-center justify-between group cursor-pointer"
                        onClick={() => onExplore?.({ zones: [zone] })}
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                                <RegionIcon zone={zone} className="w-5 h-3.5 rounded-[2px]" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-500 transition-colors">{zone}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 flex-1 justify-end">
                            <div className="h-1.5 w-16 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-blue-500" 
                                    initial={{ width: 0 }}
                                    whileInView={{ width: `${(count / analysis.maxZone) * 100}%` }}
                                    transition={{ duration: 1, ease: "circOut" }}
                                />
                            </div>
                            <span className="text-xs font-mono font-medium text-slate-500 w-6 text-right">{count}</span>
                        </div>
                    </div>
                ))}
            </div>
         </MotionDiv>
      </div>
    </MotionDiv>
  );
};
