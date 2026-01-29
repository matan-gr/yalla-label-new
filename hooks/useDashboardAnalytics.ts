
import { useMemo } from 'react';
import { GceResource } from '../types';
import { detectLabelPatterns } from '../services/geminiService';

export const useDashboardAnalytics = (resources: GceResource[], stats: { total: number; labeled: number; unlabeled: number }) => {
  return useMemo(() => {
    const complianceRate = stats.total > 0 ? Math.round((stats.labeled / stats.total) * 100) : 100;
    
    // Resource Counts
    const vmCount = resources.filter(r => r.type === 'INSTANCE').length;
    const diskCount = resources.filter(r => r.type === 'DISK').length;
    const bucketCount = resources.filter(r => r.type === 'BUCKET').length;
    const imageCount = resources.filter(r => r.type === 'IMAGE').length;
    const snapshotCount = resources.filter(r => r.type === 'SNAPSHOT').length;
    const cloudRunCount = resources.filter(r => r.type === 'CLOUD_RUN').length;
    const sqlCount = resources.filter(r => r.type === 'CLOUD_SQL').length;
    const gkeCount = resources.filter(r => r.type === 'GKE_CLUSTER').length;
    
    // Violation Counts
    const violationCount = resources.filter(r => (r.violations?.length || 0) > 0).length;

    // Drift Count (Configuration changed outside tool)
    const driftCount = resources.filter(r => r.driftStatus === 'DRIFTED').length;

    // Zone Distribution
    const zones: Record<string, number> = {};
    resources.forEach(r => zones[r.zone] = (zones[r.zone] || 0) + 1);
    const topZones = Object.entries(zones).sort((a,b) => b[1] - a[1]).slice(0, 4);
    const maxZone = Math.max(...Object.values(zones), 1);

    // Label Usage Distribution
    const labelCounts: Record<string, number> = {};
    resources.forEach(r => {
        Object.keys(r.labels).forEach(key => {
            labelCounts[key] = (labelCounts[key] || 0) + 1;
        });
    });
    const labelDistribution = Object.entries(labelCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5); // Top 5 labels
    
    const maxLabelCount = Math.max(...labelDistribution.map(l => l.value), 1);

    // Unlabeled Breakdown (New)
    const unlabeledResources = resources.filter(r => Object.keys(r.labels).length === 0);
    const unlabeledByType: Record<string, number> = {};
    unlabeledResources.forEach(r => {
        unlabeledByType[r.type] = (unlabeledByType[r.type] || 0) + 1;
    });

    const typeLabelMap: Record<string, string> = {
        'INSTANCE': 'VM Instances',
        'DISK': 'Disks',
        'BUCKET': 'Buckets',
        'SNAPSHOT': 'Snapshots',
        'IMAGE': 'Images',
        'CLOUD_SQL': 'Cloud SQL',
        'GKE_CLUSTER': 'GKE Clusters',
        'CLOUD_RUN': 'Cloud Run'
    };

    const unlabeledBreakdown = Object.entries(unlabeledByType)
        .map(([type, value]) => ({ 
            label: typeLabelMap[type] || type, 
            value 
        }))
        .sort((a, b) => b.value - a.value);

    // AI Insight Metrics (Heuristics)
    const patterns = detectLabelPatterns(resources);

    return {
        complianceRate,
        violationCount,
        driftCount,
        vmCount,
        diskCount,
        bucketCount,
        imageCount,
        snapshotCount,
        cloudRunCount,
        sqlCount,
        gkeCount,
        topZones,
        maxZone,
        labelDistribution,
        maxLabelCount,
        unlabeledBreakdown,
        unlabeledCount: unlabeledResources.length,
        patterns
    };
  }, [resources, stats]);
};
