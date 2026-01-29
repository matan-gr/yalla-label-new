
import React, { useMemo } from 'react';
import { Modal, Button, Badge } from './DesignSystem';
import { 
    FileText, CheckCircle2, ShieldAlert, Download, AlertTriangle, 
    ArrowRight, TrendingUp, DollarSign, Activity, Layers, Database,
    Server, AlertOctagon
} from 'lucide-react';
import { GovernanceReport } from '../types';
import { HealthGauge } from './Visualizations';

interface ComplianceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: string; // JSON string
}

const ScoreCard = ({ title, grade, value, assessment, colorClass }: any) => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col justify-between h-full">
        <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">{title}</h4>
            <div className="flex items-end gap-2 mb-1">
                <span className={`text-3xl font-black ${colorClass}`}>{grade}</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{value}</span>
            </div>
        </div>
        <p className="text-xs text-slate-500 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2 leading-relaxed">
            {assessment}
        </p>
    </div>
);

export const ComplianceReportModal: React.FC<ComplianceReportModalProps> = ({ isOpen, onClose, report }) => {
  
  const parsedReport = useMemo<GovernanceReport | null>(() => {
      try {
          return JSON.parse(report);
      } catch (e) {
          return null;
      }
  }, [report]);

  if (!parsedReport) return null;

  const { summary, metrics, financial_analysis, governance_issues, operational_risks, remediation_plan } = parsedReport;

  const downloadReport = () => {
      const blob = new Blob([JSON.stringify(parsedReport, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `governance_audit_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const getGradeColor = (grade: string) => {
      if (['A', 'A+', 'A-'].includes(grade)) return 'text-emerald-500';
      if (['B', 'B+', 'B-'].includes(grade)) return 'text-blue-500';
      if (['C', 'C+', 'C-'].includes(grade)) return 'text-amber-500';
      return 'text-red-500';
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Governance Audit Report"
      size="4xl"
      noPadding
    >
      <div className="bg-slate-50 dark:bg-slate-950 min-h-[600px] flex flex-col">
        
        {/* 1. Header & Summary */}
        <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-8 flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                        <FileText className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Executive Summary</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                    {summary.overview}
                </p>
            </div>
            <div className="flex items-center gap-6 bg-slate-50 dark:bg-slate-950/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Overall Grade</div>
                    <div className={`text-5xl font-black ${getGradeColor(summary.grade)}`}>{summary.grade}</div>
                </div>
                <div className="h-12 w-px bg-slate-200 dark:border-slate-800"></div>
                <div className="scale-75 origin-left -ml-2">
                    <HealthGauge percentage={summary.score} />
                </div>
            </div>
        </div>

        <div className="p-8 space-y-10">
            
            {/* 2. Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <ScoreCard 
                    title="Financial Clarity" 
                    grade={metrics.financial_clarity.grade} 
                    value={metrics.financial_clarity.value} 
                    assessment={metrics.financial_clarity.assessment}
                    colorClass={getGradeColor(metrics.financial_clarity.grade)}
                />
                <ScoreCard 
                    title="Compliance Posture" 
                    grade={metrics.compliance_posture.grade} 
                    value={metrics.compliance_posture.value} 
                    assessment={metrics.compliance_posture.assessment}
                    colorClass={getGradeColor(metrics.compliance_posture.grade)}
                />
                <ScoreCard 
                    title="Operational Risk" 
                    grade={metrics.operational_risk.grade} 
                    value={metrics.operational_risk.value} 
                    assessment={metrics.operational_risk.assessment}
                    colorClass={getGradeColor(metrics.operational_risk.grade)}
                />
            </div>

            {/* 3. Deep Dive Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Left: Financials & Risks */}
                <div className="space-y-8">
                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                            <DollarSign className="w-4 h-4 text-emerald-500" /> Financial Waste Analysis
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
                            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                                <span className="text-xs font-medium text-slate-500">Unallocated Spend Risk</span>
                                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{financial_analysis.unallocated_spend}</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                                <span className="text-xs font-medium text-slate-500">Zombie Asset Waste</span>
                                <span className="text-sm font-bold text-red-500">{financial_analysis.zombie_waste}</span>
                            </div>
                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                                <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block mb-1">Optimization Opportunity</span>
                                <p className="text-xs text-emerald-800 dark:text-emerald-300">{financial_analysis.opportunity}</p>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                            <ShieldAlert className="w-4 h-4 text-red-500" /> Operational Risks
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex gap-4">
                                <div className="flex-1 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg">
                                    <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-1">{operational_risks.production_exposure.count}</div>
                                    <div className="text-[10px] font-bold uppercase text-red-400">Prod Exposed</div>
                                    <p className="text-[10px] text-red-700 dark:text-red-300 mt-1 leading-tight">{operational_risks.production_exposure.description}</p>
                                </div>
                                <div className="flex-1 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg">
                                    <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mb-1">{operational_risks.database_risks.count}</div>
                                    <div className="text-[10px] font-bold uppercase text-amber-400">DB Risks</div>
                                    <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 leading-tight">{operational_risks.database_risks.description}</p>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 dark:bg-slate-950/50">
                                <h5 className="text-[10px] font-bold uppercase text-slate-400 mb-3">Active Policy Violations</h5>
                                <div className="space-y-2">
                                    {operational_risks.policy_violations.map((v, i) => (
                                        <div key={i} className="flex justify-between items-center text-xs">
                                            <span className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                                <AlertTriangle className="w-3 h-3 text-red-400" /> {v.rule}
                                            </span>
                                            <Badge variant="error" className="text-[9px]">{v.count}</Badge>
                                        </div>
                                    ))}
                                    {operational_risks.policy_violations.length === 0 && (
                                        <div className="text-xs text-emerald-600 flex items-center gap-2">
                                            <CheckCircle2 className="w-3 h-3" /> No active violations detected.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Right: Governance & Remediation */}
                <div className="space-y-8">
                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                            <Layers className="w-4 h-4 text-blue-500" /> Metadata Hygiene
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-6">
                            {/* Casing Issues */}
                            <div>
                                <h5 className="text-[10px] font-bold uppercase text-slate-400 mb-2">Casing Inconsistencies</h5>
                                {governance_issues.casing_issues.length === 0 ? (
                                    <span className="text-xs text-emerald-600 italic">No issues detected.</span>
                                ) : (
                                    <div className="space-y-2">
                                        {governance_issues.casing_issues.map((issue, i) => (
                                            <div key={i} className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                                                <span className="font-mono text-slate-600 dark:text-slate-400 font-bold">{issue.key}</span>
                                                <div className="flex gap-1">
                                                    {issue.variants.map(v => <span key={v} className="bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[10px]">{v}</span>)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Fragmentation */}
                            <div>
                                <h5 className="text-[10px] font-bold uppercase text-slate-400 mb-2">Value Fragmentation</h5>
                                {governance_issues.fragmentation.length === 0 ? (
                                    <span className="text-xs text-emerald-600 italic">No fragmentation detected.</span>
                                ) : (
                                    <div className="space-y-2">
                                        {governance_issues.fragmentation.map((issue, i) => (
                                            <div key={i} className="text-xs bg-slate-50 dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700">
                                                <div className="flex justify-between mb-1">
                                                    <span className="font-mono text-slate-600 dark:text-slate-400 font-bold">{issue.key}</span>
                                                    <span className="text-[10px] text-blue-500 font-medium">{issue.recommendation}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {issue.values.map(v => <span key={v} className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-100 text-[10px]">{v}</span>)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                            <Activity className="w-4 h-4 text-violet-500" /> Remediation Plan
                        </h3>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 font-bold text-slate-500 uppercase">Priority</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 uppercase">Action</th>
                                        <th className="px-4 py-3 font-bold text-slate-500 uppercase text-right">Est. Impact</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {remediation_plan.map((plan, i) => (
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="px-4 py-3 align-top">
                                                {plan.priority.includes('P0') ? (
                                                    <Badge variant="error" className="font-bold">P0</Badge>
                                                ) : plan.priority.includes('P1') ? (
                                                    <Badge variant="warning" className="font-bold">P1</Badge>
                                                ) : (
                                                    <Badge variant="info" className="font-bold">P2</Badge>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300 align-top">
                                                <div className="font-medium">{plan.action}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">Effort: {plan.effort}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400 align-top font-medium">
                                                {plan.impact}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-6 flex justify-between items-center mt-auto">
            <div className="text-xs text-slate-400 italic">
                Generated by Gemini 2.5 Pro • Analysis based on active inventory snapshot.
            </div>
            <div className="flex gap-3">
                <Button variant="outline" onClick={downloadReport} leftIcon={<Download className="w-4 h-4"/>}>
                    Download JSON
                </Button>
                <Button variant="primary" onClick={onClose} leftIcon={<CheckCircle2 className="w-4 h-4"/>}>
                    Close Report
                </Button>
            </div>
        </div>
      </div>
    </Modal>
  );
};
