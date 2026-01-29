
import React from 'react';
import { CheckCircle2, AlertCircle, ChevronRight, Info, AlertTriangle, Shield, Check, Activity, DollarSign, Ban } from 'lucide-react';

export const MarkdownView = ({ content }: { content: string }) => {
  if (!content) return null;
  
  // Robust Split: Split by double newline OR by newline followed by a header (#)
  // This prevents headers from being merged into previous paragraphs if the LLM forgets a double blank line.
  const blocks = content.split(/\n\n+|\n(?=#)/g);
  
  // Strict typography settings requested: 11px, non-bold standard text
  const standardTextClass = "text-[11px] text-slate-700 dark:text-slate-300 font-normal leading-relaxed tracking-wide";

  const renderTable = (tableText: string, keyPrefix: string) => {
      const rows = tableText.split('\n').filter(r => r.trim());
      if (rows.length < 3) return <pre key={keyPrefix} className="text-[10px] overflow-x-auto p-2 bg-slate-50 rounded">{tableText}</pre>;

      const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim().replace(/\*\*/g, ''));
      const dataRows = rows.slice(2); // Skip separator row

      return (
          <div key={keyPrefix} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 my-4 bg-white dark:bg-slate-900/40 shadow-sm">
              <div className="overflow-x-auto">
                  <table className="w-full text-left whitespace-nowrap">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                          <tr>
                              {headers.map((h, hi) => (
                                  <th key={hi} className="px-4 py-2.5 text-[10px] uppercase font-semibold text-slate-500 tracking-wider first:pl-6 last:pr-6">{h}</th>
                              ))}
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                          {dataRows.map((row, ri) => (
                              <tr key={ri} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                  {row.split('|').filter(c => c.trim()).map((c, ci) => {
                                      const cellText = c.trim().replace(/\*\*/g, '');
                                      let cellContent: React.ReactNode = cellText;
                                      
                                      // Status Badges (Text Only colors for cleaner look at 11px)
                                      if (['High', 'Critical', 'Fail', 'F'].some(k => cellText.includes(k))) {
                                          cellContent = <span className="text-red-600 dark:text-red-400 font-medium">{cellText}</span>;
                                      } else if (['Medium', 'Warn', 'C'].some(k => cellText.includes(k))) {
                                          cellContent = <span className="text-amber-600 dark:text-amber-400 font-medium">{cellText}</span>;
                                      } else if (['Low', 'Pass', 'Good', 'A', 'B'].some(k => cellText.includes(k))) {
                                          cellContent = <span className="text-emerald-600 dark:text-emerald-400 font-medium">{cellText}</span>;
                                      }

                                      return (
                                          <td key={ci} className="px-4 py-2 text-[11px] text-slate-600 dark:text-slate-300 font-normal first:pl-6 last:pr-6 border-r border-transparent last:border-0">
                                              {cellContent}
                                          </td>
                                      );
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-5 font-sans">
      {blocks.map((block, i) => {
        let trimmed = block.trim();
        
        // --- 1. Table Handling (Robust) ---
        // Check if the block contains a table pattern even if mixed with text
        if (trimmed.includes('|') && trimmed.includes('---')) {
            // Find start of table
            const lines = trimmed.split('\n');
            const tableStartIndex = lines.findIndex(l => l.trim().startsWith('|'));
            
            if (tableStartIndex > -1) {
                const preText = lines.slice(0, tableStartIndex).join('\n').trim();
                const tableText = lines.slice(tableStartIndex).join('\n').trim();
                
                return (
                    <React.Fragment key={i}>
                        {preText && (
                            <p className={standardTextClass}>
                                {preText}
                            </p>
                        )}
                        {renderTable(tableText, `${i}-tbl`)}
                    </React.Fragment>
                );
            }
        }

        // --- 2. Header Parsing ---
        if (trimmed.startsWith('#')) {
            const level = trimmed.match(/^#+/)?.[0].length || 1;
            const text = trimmed.replace(/^#+\s*/, '').replace(/\*\*/g, '');
            
            // H1
            if (level === 1) {
                return (
                    <div key={i} className="mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                            {text}
                        </h1>
                    </div>
                );
            }
            
            // H2
            if (level === 2) {
                let Icon = Info;
                let colorClass = "text-indigo-600 dark:text-indigo-400";
                
                if (text.includes('Risk') || text.includes('Exposure')) { Icon = AlertTriangle; colorClass = "text-red-600 dark:text-red-400"; }
                else if (text.includes('Summary') || text.includes('Executive') || text.includes('Status')) { Icon = Activity; colorClass = "text-slate-700 dark:text-slate-200"; }
                else if (text.includes('Remediation') || text.includes('Action') || text.includes('Root Cause')) { Icon = CheckCircle2; colorClass = "text-emerald-600 dark:text-emerald-400"; }
                else if (text.includes('Cost') || text.includes('Financial')) { Icon = DollarSign; colorClass = "text-amber-600 dark:text-amber-400"; }

                return (
                    <div key={i} className="flex items-center gap-2 mt-8 mb-3">
                        <Icon className={`w-4 h-4 ${colorClass}`} />
                        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight uppercase">
                            {text}
                        </h2>
                    </div>
                );
            }
            
            return <h3 key={i} className="text-xs font-bold text-slate-700 dark:text-slate-300 mt-4 mb-2">{text}</h3>;
        }

        // --- 3. List Item Parsing ---
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
             const lines = trimmed.split('\n');
             return (
                 <ul key={i} className="space-y-2 my-3">
                     {lines.map((line, j) => {
                         const cleanLine = line.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '');
                         const parts = cleanLine.split(/\*\*(.*?)\*\*/g);
                         
                         let Icon = ChevronRight;
                         let iconColor = "text-slate-300";
                         
                         if (cleanLine.includes('Violation') || cleanLine.includes('Risk') || cleanLine.includes('❌')) {
                             Icon = Ban;
                             iconColor = "text-red-400";
                         } else if (cleanLine.includes('Action') || cleanLine.includes('Fix') || cleanLine.includes('💡') || cleanLine.includes('✅')) {
                             Icon = Check;
                             iconColor = "text-emerald-400";
                         }

                         return (
                            <li key={j} className="flex items-start gap-2.5 pl-1">
                                <div className={`mt-[3px] shrink-0 ${iconColor}`}>
                                    <Icon className="w-3 h-3" />
                                </div>
                                <div className={standardTextClass}>
                                    {parts.map((part, k) => k % 2 === 1 ? <span key={k} className="font-semibold text-slate-900 dark:text-slate-100">{part}</span> : part)}
                                </div>
                            </li>
                         )
                     })}
                 </ul>
             )
        }

        // --- 4. Standard Paragraph ---
        if (trimmed === '') return null;
        
        const parts = trimmed.split(/\*\*(.*?)\*\*/g);
        return (
            <p key={i} className={standardTextClass}>
                {parts.map((part, j) => j % 2 === 1 ? <span key={j} className="font-semibold text-slate-900 dark:text-slate-100">{part}</span> : part)}
            </p>
        );
      })}
    </div>
  );
};
