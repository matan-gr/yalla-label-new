
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GceResource, GcpCredentials, LabelHistoryEntry, TaxonomyRule, GovernancePolicy, SavedView, AppSettings, SavedPipeline } from '../types';
import { fetchAllResources, updateResourceLabels as updateResourceLabelsApi, fetchResource } from '../services/gcpService';
import { analyzeResourceBatch, generateComplianceReport, generateDashboardBrief } from '../services/geminiService';
import { persistenceService } from '../services/persistenceService';
import { evaluateInventory, DEFAULT_TAXONOMY, getPolicies, restoreGovernanceContext } from '../services/policyService';

const DEFAULT_SETTINGS: AppSettings = {
    defaultRegion: 'global',
    autoAnalyze: false,
    costCenterFormat: 'cc-XXXX',
    departmentList: []
};

// Internal rate limiting helper for atomic batch processing
const createSlidingWindow = (concurrency: number) => {
  const queue: (() => void)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const run = queue.shift();
      if (run) run();
    }
  };

  const run = async <T>(fn: () => Promise<T>): Promise<T> => {
    const waitForSlot = async () => {
      if (activeCount < concurrency) {
        activeCount++;
        return;
      }
      await new Promise<void>(resolve => queue.push(resolve));
      activeCount++;
    };

    await waitForSlot();

    try {
      return await fn();
    } finally {
      next();
    }
  };

  return run;
};

export const useResourceManager = (
  addLog: (msg: string, level?: string) => void,
  addNotification: (msg: string, type?: 'success'|'error'|'info'|'warning') => void
) => {
  const [resources, setResources] = useState<GceResource[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState({ progress: 0, message: 'Ready' });
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [report, setReport] = useState<string>('');
  
  // Dashboard AI Insight State (Global Persistence)
  const [dashboardInsight, setDashboardInsight] = useState<string | null>(null);
  const [isGeneratingDashboardInsight, setIsGeneratingDashboardInsight] = useState(false);
  
  // Persistent State
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedPipelines, setSavedPipelines] = useState<SavedPipeline[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [taxonomy, setTaxonomy] = useState<TaxonomyRule[]>(DEFAULT_TAXONOMY);
  const [activePolicies, setActivePolicies] = useState<GovernancePolicy[]>(getPolicies(DEFAULT_TAXONOMY));

  const [batchProgress, setBatchProgress] = useState<{ processed: number, total: number, status: 'updating' | 'rolling-back' } | null>(null);
  
  const currentCredentials = useRef<GcpCredentials | null>(null);
  const pendingResources = useRef<GceResource[]>([]);

  const governedResources = useMemo(() => {
    return evaluateInventory(resources, taxonomy, activePolicies);
  }, [resources, taxonomy, activePolicies]);

  const stats = useMemo(() => {
    const total = governedResources.length;
    const labeled = governedResources.filter(r => Object.keys(r.labels).length > 0).length;
    return { total, labeled, unlabeled: total - labeled };
  }, [governedResources]);

  // --- Listen for Remote Syncs ---
  useEffect(() => {
      const handleSync = async () => {
          if (currentCredentials.current) {
              const projectId = currentCredentials.current.projectId;
              const govData = await persistenceService.getGovernance(projectId);
              if (govData) {
                  setTaxonomy(govData.taxonomy);
                  setActivePolicies(restoreGovernanceContext(govData.policies, govData.taxonomy));
                  setSavedViews(govData.savedViews || []);
                  setSavedPipelines(govData.savedPipelines || []);
                  setAppSettings({ ...DEFAULT_SETTINGS, ...govData.settings });
                  addNotification("Configuration updated from remote source.", "info");
              }
          }
      };
      
      window.addEventListener('governance-updated', handleSync);
      return () => window.removeEventListener('governance-updated', handleSync);
  }, [addNotification]);

  // --- Helper to save state ---
  const persistState = useCallback(async (
      override?: { 
          taxonomy?: TaxonomyRule[], 
          policies?: GovernancePolicy[],
          savedViews?: SavedView[],
          savedPipelines?: SavedPipeline[],
          settings?: AppSettings 
      }
  ) => {
      if (currentCredentials.current) {
          // Works for both LIVE and DEMO modes (via persistenceService logic)
          await persistenceService.saveGovernance(currentCredentials.current.projectId, {
              taxonomy: override?.taxonomy || taxonomy,
              policies: override?.policies || activePolicies,
              savedViews: override?.savedViews || savedViews,
              savedPipelines: override?.savedPipelines || savedPipelines,
              settings: override?.settings || appSettings
          });
          
          if (currentCredentials.current.accessToken !== 'demo-mode') {
              // Force immediate flush for config changes in Live mode
              await persistenceService.forceSync(currentCredentials.current.projectId);
          }
      }
  }, [taxonomy, activePolicies, savedViews, savedPipelines, appSettings]);

  const loadDemoData = useCallback(async () => {
    setIsConnecting(true);
    const projectId = 'demo-mode';
    currentCredentials.current = { projectId, accessToken: 'demo-mode' };
    
    // Initialize persistence (Local IndexedDB for Demo)
    await persistenceService.init(projectId, 'demo-mode');

    // Attempt to load persisted demo state first to keep changes
    setLoadingStatus({ progress: 10, message: 'Authenticating Demo User...' });
    
    // Load Governance
    const govData = await persistenceService.getGovernance(projectId);
    if (govData) {
        setTaxonomy(govData.taxonomy);
        setActivePolicies(restoreGovernanceContext(govData.policies, govData.taxonomy));
        setSavedViews(govData.savedViews || []);
        setSavedPipelines(govData.savedPipelines || []);
        setAppSettings({ ...DEFAULT_SETTINGS, ...govData.settings });
    } else {
        setSavedViews([{ id: 'demo-view', name: 'Critical Prod Issues', createdAt: Date.now(), config: { search: 'prod', statuses: [], types: [], zones: [], machineTypes: [], hasPublicIp: null, dateStart: '', dateEnd: '', labelLogic: 'AND', labels: [], showUnlabeledOnly: false, showViolationsOnly: true } }]);
    }

    setLoadingStatus({ progress: 40, message: 'Hydrating Environment...' });
    
    // Dynamic Import for Mock Service
    const { generateMockResources, generateMockTimeline } = await import('../services/mockService');

    // Load or Generate Resources
    const storedResources = localStorage.getItem('demo_resources_v5');
    let demoResources: GceResource[] = [];

    if (storedResources) {
        try {
            demoResources = JSON.parse(storedResources);
            // Hydrate history
            const historyMap = await persistenceService.getProjectHistory(projectId);
            demoResources.forEach(r => {
                r.history = historyMap[r.id] || [];
            });
        } catch(e) { console.error("Failed to load stored demo resources", e); }
    }

    if (demoResources.length === 0) {
        setLoadingStatus({ progress: 60, message: 'Generating Mock Infrastructure...' });
        await new Promise(r => setTimeout(r, 400));
        demoResources = generateMockResources(50);
        // Generate initial timeline
        const timeline = generateMockTimeline(demoResources);
        // Save timeline to persistence (Demo mode uses localStorage fallback inside persistenceService if wired, but we manually set it here for simplicity)
        localStorage.setItem(`demo_timeline_${projectId}`, JSON.stringify(timeline));
    }

    setResources(demoResources);
    
    setLoadingStatus({ progress: 100, message: 'Demo Environment Ready' });
    setIsConnecting(false);
    return true;
  }, []);

  const connectProject = useCallback(async (credentials: GcpCredentials) => {
    if (credentials.accessToken === 'demo-mode') {
        return loadDemoData();
    }

    setIsConnecting(true);
    setLoadingStatus({ progress: 5, message: 'Authenticating...' });
    setResources([]); 
    pendingResources.current = []; 
    currentCredentials.current = credentials;
    
    try {
      setLoadingStatus({ progress: 15, message: 'Initializing Security Context...' });
      await persistenceService.init(credentials.projectId, credentials.accessToken);
      
      // Load Shared History & Timeline for Drift Detection
      const historyMap = await persistenceService.getProjectHistory(credentials.projectId);
      const timeline = await persistenceService.getTimeline(credentials.projectId);
      
      // Get the last snapshot (sorted by time desc)
      const lastSnapshot = timeline.length > 0 ? timeline[0] : null;
      const snapshotMap = lastSnapshot ? new Map(lastSnapshot.resources.map(r => [r.id, r.labelHash])) : new Map();

      setLoadingStatus({ progress: 18, message: 'Loading Governance & Config...' });
      const govData = await persistenceService.getGovernance(credentials.projectId);
      
      if (govData) {
          // Restore State
          setTaxonomy(govData.taxonomy);
          setActivePolicies(restoreGovernanceContext(govData.policies, govData.taxonomy));
          setSavedViews(govData.savedViews || []);
          setSavedPipelines(govData.savedPipelines || []);
          setAppSettings({ ...DEFAULT_SETTINGS, ...govData.settings });
          addLog(`Loaded configuration from secure storage.`, 'INFO');
      } else {
          setTaxonomy(DEFAULT_TAXONOMY);
          setActivePolicies(getPolicies(DEFAULT_TAXONOMY));
          setSavedViews([]);
          setSavedPipelines([]);
          setAppSettings(DEFAULT_SETTINGS);
      }

      setLoadingStatus({ progress: 20, message: 'Starting Resource Discovery...' });
      
      await fetchAllResources(
        credentials.projectId, 
        credentials.accessToken,
        (newChunk, source) => {
           const hydratedChunk = newChunk.map(r => {
               // Drift Calculation
               let driftStatus: 'SYNCED' | 'DRIFTED' | 'UNKNOWN' = 'UNKNOWN';
               if (lastSnapshot) {
                   const storedHash = snapshotMap.get(r.id);
                   // Calculate current hash
                   const currentHash = JSON.stringify(r.labels);
                   if (!storedHash) {
                       driftStatus = 'DRIFTED'; // New resource not in snapshot
                   } else {
                       driftStatus = storedHash !== currentHash ? 'DRIFTED' : 'SYNCED';
                   }
               }

               return {
                   ...r,
                   history: historyMap[r.id] || [],
                   driftStatus
               };
           });
           
           pendingResources.current = [...pendingResources.current, ...hydratedChunk];
           setLoadingStatus(prev => ({
               progress: Math.min(95, prev.progress + 5),
               message: `Discovered ${pendingResources.current.length} resources (${source})...`
           }));
        }
      );
      
      const finalResources = pendingResources.current;
      setResources(finalResources);
      setLoadingStatus({ progress: 100, message: 'Inventory Synced.' });
      
      // AUTO-SAVE SNAPSHOT FOR TIME MACHINE & DRIFT BASELINE
      if (credentials.accessToken !== 'demo-mode') {
          persistenceService.saveInventorySnapshot(credentials.projectId, finalResources)
            .catch(e => console.error("Snapshot save failed (non-critical)", e));
      }

      addLog('Discovery complete.', 'SUCCESS');
      addNotification(`Connected. Managed ${finalResources.length} resources.`, 'success');
      return true;

    } catch (error: any) {
      const rawMsg = error.message || 'Unknown error';
      if (rawMsg.includes('401')) {
         addNotification('Session Expired. Please re-authenticate.', 'error');
      } else {
         addNotification(`Connection Error: ${rawMsg}`, 'error');
      }
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, [addLog, addNotification, loadDemoData]);

  useEffect(() => {
    if (!isConnecting) return;
    const interval = setInterval(() => {
        if (pendingResources.current.length > resources.length) {
            setResources([...pendingResources.current]);
        }
    }, 500); 
    return () => clearInterval(interval);
  }, [isConnecting, resources.length]);

  const refreshResources = useCallback(async () => {
    if (!currentCredentials.current) return;
    return connectProject(currentCredentials.current);
  }, [connectProject]);

  const updateGovernance = useCallback(async (newTaxonomy: TaxonomyRule[], newPolicies: GovernancePolicy[]) => {
      setTaxonomy(newTaxonomy);
      setActivePolicies(newPolicies);
      await persistState({ taxonomy: newTaxonomy, policies: newPolicies });
  }, [persistState]);

  const updateSavedViews = useCallback(async (newViews: SavedView[]) => {
      setSavedViews(newViews);
      await persistState({ savedViews: newViews });
  }, [persistState]);

  const updateSavedPipelines = useCallback(async (newPipelines: SavedPipeline[]) => {
      setSavedPipelines(newPipelines);
      await persistState({ savedPipelines: newPipelines });
  }, [persistState]);

  const updateSettings = useCallback(async (newSettings: AppSettings) => {
      setAppSettings(newSettings);
      await persistState({ settings: newSettings });
  }, [persistState]);

  const analyzeResources = useCallback(async () => {
    setIsAnalysing(true);
    addNotification('AI Auditor initiated. Scanning inventory...', 'info');
    
    // Ensure we are auditing the FULLY evaluated state including violations
    const currentInventory = evaluateInventory(resources, taxonomy, activePolicies);

    try {
      if (currentCredentials.current?.projectId === 'demo-mode') {
          // Dynamic Import for Mock Analysis
          const { mockAnalyzeResources, mockGenerateComplianceReport } = await import('../services/mockService');
          
          await new Promise(r => setTimeout(r, 2000));
          const unlabeled = resources.filter(r => Object.keys(r.labels).length < 3).slice(0, 50);
          const results = mockAnalyzeResources(unlabeled);
          setResources(prev => prev.map(res => {
              const match = results.find(r => r.resourceId === res.id);
              if (match) return { ...res, proposedLabels: match.suggestedLabels };
              return res;
          }));
          addNotification(`AI Analysis complete. ${results.length} optimizations found.`, 'success');
          
          // Generate detailed mock report
          const reportText = mockGenerateComplianceReport(currentInventory);
          setReport(reportText);
          setIsAnalysing(false);
          return;
      }

      if ((window as any).aistudio) {
         try {
             const hasKey = await (window as any).aistudio.hasSelectedApiKey();
             if(!hasKey) await (window as any).aistudio.openSelectKey();
         } catch(e) {}
      }

      // IMPROVED SELECTION LOGIC for Auto-Labeling Proposals
      const candidates = resources.filter(r => {
          if (r.proposedLabels) return false; 
          const keys = Object.keys(r.labels);
          if (keys.length === 0) return true; 
          return !keys.some(k => ['environment', 'owner', 'cost-center'].includes(k));
      }).slice(0, 20);
      
      if (candidates.length > 0) {
        const results = await analyzeResourceBatch(candidates);
        setResources(prev => prev.map(res => {
            const match = results.find(r => r.resourceId === res.id);
            if (match) return { ...res, proposedLabels: match.suggestedLabels };
            return res;
        }));
        addNotification(`Analysis complete. Generated suggestions for ${results.length} resources.`, 'success');
      } else {
        addNotification('Governance looks good! No obvious candidates for auto-labeling.', 'info');
      }

      // Generate the Detailed Executive Report based on FULL Inventory
      const reportText = await generateComplianceReport(currentInventory); 
      setReport(reportText);
      
    } catch (error: any) {
      console.error("AI Error:", error);
      addNotification(`AI Analysis failed: ${error.message || 'Unknown error'}`, 'error');
    } finally {
      setIsAnalysing(false);
    }
  }, [resources, addNotification, stats, taxonomy, activePolicies]);

  // --- Background Dashboard Insight Generation ---
  const generateDashboardInsight = useCallback(async (metrics: any) => {
    setIsGeneratingDashboardInsight(true);
    try {
        if ((window as any).aistudio) {
             const hasKey = await (window as any).aistudio.hasSelectedApiKey();
             if(!hasKey) await (window as any).aistudio.openSelectKey();
        }
        const result = await generateDashboardBrief(metrics);
        setDashboardInsight(result);
    } catch (e) {
        console.error("Dashboard Insight Generation Failed", e);
        addNotification("Failed to generate AI insight. Check permissions.", 'error');
    } finally {
        setIsGeneratingDashboardInsight(false);
    }
  }, [addNotification]);

  const clearDashboardInsight = useCallback(() => setDashboardInsight(null), []);

  const updateResourceLabels = useCallback(async (
    credentials: GcpCredentials, 
    resourceId: string, 
    newLabels: Record<string, string>,
    isProposal = false
  ) => {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return;

    setResources(prev => prev.map(r => r.id === resourceId ? { ...r, isUpdating: true } : r));

    try {
      if (credentials.accessToken !== 'demo-mode') {
        await updateResourceLabelsApi(credentials.projectId, credentials.accessToken, resource, newLabels);
      } else {
        await new Promise(r => setTimeout(r, 600));
      }

      const historyEntry: LabelHistoryEntry = {
        timestamp: new Date(),
        actor: 'User',
        changeType: isProposal ? 'APPLY_PROPOSAL' : 'UPDATE',
        previousLabels: resource.labels,
        newLabels: newLabels
      };

      const updatedHistory = [historyEntry, ...(resource.history || [])];

      setResources(prev => {
        const next = prev.map(r => {
            if (r.id === resourceId) {
            return {
                ...r,
                labels: newLabels,
                proposedLabels: undefined,
                history: updatedHistory,
                isUpdating: false,
                // Fix driftStatus type error
                driftStatus: 'SYNCED' as const
            };
            }
            return r;
        });
        
        // Save demo resources to local storage if in demo mode
        if (credentials.accessToken === 'demo-mode') {
            localStorage.setItem('demo_resources_v5', JSON.stringify(next));
        }
        
        return next;
      });

      // Persist history (IDB for demo, IDB+GCS for Live)
      await persistenceService.saveHistory(credentials.projectId, resourceId, updatedHistory);

      addNotification(`Updated ${resource.name}`, 'success');
    } catch (error: any) {
      setResources(prev => prev.map(r => r.id === resourceId ? { ...r, isUpdating: false } : r));
      addNotification(`Update failed: ${error.message}`, 'error');
    }
  }, [resources, addNotification]);

  /**
   * Optimized Bulk Update with Sliding Window Concurrency
   */
  const bulkUpdateLabels = useCallback(async (
    credentials: GcpCredentials,
    updates: Map<string, Record<string, string>>,
    changeReason?: string
  ) => {
     const idsToUpdate = Array.from(updates.keys());
     const count = idsToUpdate.length;
     
     // Deep copy original states to ensure we have a stable revert baseline
     const originalStates = new Map<string, Record<string, string>>();
     resources.forEach(r => {
         if (updates.has(r.id)) {
             originalStates.set(r.id, JSON.parse(JSON.stringify(r.labels))); 
         }
     });

     setResources(prev => prev.map(r => updates.has(r.id) ? { ...r, isUpdating: true } : r));
     setBatchProgress({ processed: 0, total: count, status: 'updating' });

     const successfulUpdates: string[] = [];
     let errorOccurred: Error | null = null;
     let processedCount = 0;

     const limit = createSlidingWindow(8); 

     const promises = idsToUpdate.map(id => {
         return limit(async () => {
             if (errorOccurred) return { id, status: 'skipped' };

             const res = resources.find(r => r.id === id);
             const labels = updates.get(id);
             if (!res || !labels) return { id, status: 'skipped' };

             try {
                 if (credentials.accessToken !== 'demo-mode') {
                     await updateResourceLabelsApi(credentials.projectId, credentials.accessToken, res, labels);
                 } else {
                     await new Promise(r => setTimeout(r, 50)); 
                 }
                 
                 successfulUpdates.push(id);
                 processedCount++;
                 
                 if (processedCount % 5 === 0 || processedCount === count) {
                    setBatchProgress({ processed: processedCount, total: count, status: 'updating' });
                 }
                 
                 return { id, status: 'fulfilled' };
             } catch (e: any) {
                 errorOccurred = e; 
                 console.error(`Bulk Update Error on ${id}:`, e);
                 return { id, status: 'rejected', reason: e };
             }
         });
     });

     await Promise.all(promises);

     if (errorOccurred) {
         addNotification(`Transaction failed. Rolling back ${successfulUpdates.length} changes...`, 'warning');
         setBatchProgress({ processed: 0, total: successfulUpdates.length, status: 'rolling-back' }); 

         const rollbackLimit = createSlidingWindow(3);
         let rollbackCount = 0;
         const stuckResources: string[] = [];

         const rollbackPromises = successfulUpdates.map(id => {
             return rollbackLimit(async () => {
                 const res = resources.find(r => r.id === id);
                 const originalLabels = originalStates.get(id);
                 
                 if (res && originalLabels) {
                     try {
                         if (credentials.accessToken !== 'demo-mode') {
                             const freshResource = await fetchResource(credentials.projectId, credentials.accessToken, res);
                             if (freshResource) {
                                 await updateResourceLabelsApi(credentials.projectId, credentials.accessToken, freshResource, originalLabels);
                             }
                         }
                         rollbackCount++;
                         if (rollbackCount % 2 === 0 || rollbackCount === successfulUpdates.length) {
                            setBatchProgress({ processed: rollbackCount, total: successfulUpdates.length, status: 'rolling-back' });
                         }
                     } catch (rollbackError) {
                         console.error(`Critical: Failed to rollback resource ${id}`, rollbackError);
                         // Rollback failed. Resource is now in a "drifted" state (server has new labels, our original intention was old labels).
                         stuckResources.push(id);
                     }
                 }
             });
         });

         await Promise.all(rollbackPromises);

         setResources(prev => prev.map(r => {
             if (updates.has(r.id)) {
                 // If rollback failed for this item, we must update local state to reflect the "Stuck" (New) labels
                 // so the user sees reality, even though the batch failed.
                 if (stuckResources.includes(r.id)) {
                     const stuckLabels = updates.get(r.id)!;
                     return { 
                         ...r, 
                         labels: stuckLabels,
                         isUpdating: false, 
                         driftStatus: 'DRIFTED' as const // Mark as drifted/inconsistent
                     };
                 }
                 // Otherwise, it was successfully rolled back (or skipped), so keep original state
                 return { ...r, isUpdating: false };
             }
             return r;
         }));
         
         if (stuckResources.length > 0) {
             addNotification(`Transaction aborted. ${stuckResources.length} resources could not be rolled back and are now drifted.`, 'error');
         } else {
             addNotification(`Transaction aborted. ${rollbackCount}/${successfulUpdates.length} changes reverted successfully.`, 'warning');
         }

     } else {
         const updatesToPersist = new Map<string, LabelHistoryEntry[]>();

         setResources(prev => {
             const next = prev.map(r => {
                if (updates.has(r.id)) {
                    const newLabels = updates.get(r.id)!;
                    const historyEntry: LabelHistoryEntry = {
                        timestamp: new Date(),
                        actor: 'User (Batch)',
                        changeType: 'BATCH_UPDATE',
                        reason: changeReason || 'Bulk Operation',
                        previousLabels: originalStates.get(r.id) || {},
                        newLabels: newLabels
                    };
                    const newHistory = [historyEntry, ...(r.history || [])];
                    updatesToPersist.set(r.id, newHistory);

                    return { 
                        ...r, 
                        labels: newLabels, 
                        isUpdating: false, 
                        proposedLabels: undefined, 
                        history: newHistory,
                        driftStatus: 'SYNCED' as const
                    };
                }
                return r;
            });
            
            if (credentials.accessToken === 'demo-mode') {
                localStorage.setItem('demo_resources_v5', JSON.stringify(next));
            }
            return next;
         });
         
         // Persist history
         if (credentials.accessToken === 'demo-mode') {
             await persistenceService.bulkSaveHistory(credentials.projectId, updatesToPersist);
         } else {
             await persistenceService.bulkSaveHistory(credentials.projectId, updatesToPersist);
             await persistenceService.forceSync(credentials.projectId); 
         }

         addNotification(`Transaction successful. Updated ${count} resources.`, 'success');
     }

     setTimeout(() => setBatchProgress(null), 1000);

  }, [resources, addNotification]);

  const revertResource = useCallback((id: string) => {
    setResources(prev => prev.map(r => r.id === id ? { ...r, proposedLabels: undefined } : r));
  }, []);
  const clearReport = () => setReport('');

  return {
    resources: governedResources,
    stats,
    isConnecting,
    loadingStatus, 
    isAnalysing,
    report,
    savedViews,
    savedPipelines, 
    appSettings,
    dashboardInsight,
    isGeneratingDashboardInsight,
    generateDashboardInsight,
    clearDashboardInsight,
    connectProject,
    refreshResources,
    loadDemoData,
    analyzeResources,
    updateResourceLabels,
    bulkUpdateLabels,
    revertResource,
    clearReport,
    batchProgress,
    updateGovernance,
    updateSavedViews,
    updateSavedPipelines, 
    updateSettings
  };
};
