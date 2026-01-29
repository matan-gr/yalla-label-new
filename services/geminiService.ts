
import { GoogleGenAI, Type } from "@google/genai";
import { GceResource, AnalysisResult } from "../types";
import { safeParseJSON } from "../utils/jsonUtils";

// Helper to ensure we have an API key before making requests
const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is missing. Please select a key.");
  }
  return new GoogleGenAI({ apiKey });
};

// --- Pattern Detection Engine ---

export interface LabelPatternStats {
  casingIssues: { key: string; variants: string[] }[];
  valueFragmentation: { key: string; values: string[] }[]; // e.g. env: [prod, production]
  coverage: Record<string, number>; // % of resources having this key
}

export const detectLabelPatterns = (resources: GceResource[]): LabelPatternStats => {
  const total = resources.length;
  const keyMap: Record<string, Set<string>> = {}; // lowerKey -> Set(originalKeys)
  const valueMap: Record<string, Set<string>> = {}; // key -> Set(values)
  const keyCounts: Record<string, number> = {};

  resources.forEach(r => {
    Object.entries(r.labels).forEach(([k, v]) => {
      // Casing Check
      const lower = k.toLowerCase();
      if (!keyMap[lower]) keyMap[lower] = new Set();
      keyMap[lower].add(k);

      // Value Collection (for fragmentation check)
      if (!valueMap[k]) valueMap[k] = new Set();
      valueMap[k].add(v);

      keyCounts[k] = (keyCounts[k] || 0) + 1;
    });
  });

  // Identify Casing Issues
  const casingIssues = Object.entries(keyMap)
    .filter(([_, variants]) => variants.size > 1)
    .map(([lower, variants]) => ({ key: lower, variants: Array.from(variants) }));

  // Identify Value Fragmentation (Heuristic: Look for synonym-like patterns in high-cardinality keys)
  const interestingKeys = ['env', 'environment', 'stage', 'dept', 'department', 'cost-center', 'owner', 'team'];
  const valueFragmentation = Object.entries(valueMap)
    .filter(([k, values]) => interestingKeys.includes(k.toLowerCase()) && values.size > 1)
    .map(([k, valuesSet]) => {
      return { key: k, values: Array.from(valuesSet).slice(0, 10) }; // Limit to top 10 for analysis
    });

  const coverage: Record<string, number> = {};
  Object.entries(keyCounts).forEach(([k, count]) => {
    coverage[k] = Math.round((count / total) * 100);
  });

  return { casingIssues, valueFragmentation, coverage };
};

export const analyzeResourceBatch = async (
  resources: GceResource[]
): Promise<AnalysisResult[]> => {
  const ai = getClient();
  const model = "gemini-3-flash-preview";

  const resourceSummaries = resources.map(r => ({
    id: r.id,
    name: r.name,
    zone: r.zone,
    currentLabels: r.labels,
    type: r.type,
    machineType: r.machineType
  }));

  const systemInstruction = `
    You are a Principal Cloud Architect specializing in FinOps and Governance.
    Analyze the provided GCP resources (JSON) deeply. 
    Your goal is to infer the logical purpose of each resource to apply standardized governance labels.
    
    Guidelines:
    1. **Deconstruct Names**: "prod-web-01" implies Environment=Production, App=Web. "dev-db-analytics" implies Environment=Development, App=Database, Workload=Analytics.
    2. **Infer Department**: 
       - 'web', 'app', 'api' -> Engineering
       - 'db', 'redis', 'store' -> Data
       - 'finance', 'ledger', 'payroll' -> Finance
    3. **Cost Center**: Assign a cost center code (e.g., CC-100X) consistent with the inferred department.
    4. **Criticality**: If the name contains "prod" or "main", it is High Criticality. If "dev", "test", or "tmp", it is Low.
    
    Output strictly a JSON array matching the schema. The 'reasoning' field should be a short, sharp professional justification for the chosen labels.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: JSON.stringify(resourceSummaries),
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              resourceId: { type: Type.STRING },
              suggestedLabels: {
                type: Type.OBJECT,
                properties: {
                  environment: { type: Type.STRING },
                  application: { type: Type.STRING },
                  department: { type: Type.STRING },
                  "cost-center": { type: Type.STRING },
                  "criticality": { type: Type.STRING },
                },
              },
              reasoning: { type: Type.STRING },
            },
            required: ["resourceId", "suggestedLabels", "reasoning"],
          },
        },
      },
    });

    return safeParseJSON<AnalysisResult[]>(response.text) || [];
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const generateComplianceReport = async (
  resources: GceResource[]
): Promise<string> => {
  const ai = getClient();
  
  // 1. Calculate Holistic Metrics
  const totalCount = resources.length;
  if (totalCount === 0) return JSON.stringify({ summary: { grade: "N/A", score: 0, overview: "No resources found." } });

  const labeledCount = resources.filter(r => Object.keys(r.labels).length > 0).length;
  const complianceScore = Math.round((labeledCount / totalCount) * 100);

  // 2. Run Pattern Detection
  const patterns = detectLabelPatterns(resources);

  // 3. Identify High Risk Segments
  const prodResources = resources.filter(r => 
    r.name.toLowerCase().includes('prod') || 
    r.labels['environment'] === 'production' || 
    r.labels['env'] === 'prod'
  );
  
  const untaggedProd = prodResources.filter(r => Object.keys(r.labels).length === 0);
  const untaggedDatabases = resources.filter(r => 
    (r.type === 'CLOUD_SQL' || r.name.toLowerCase().includes('db') || r.name.toLowerCase().includes('sql')) && 
    Object.keys(r.labels).length === 0
  );

  // 4. Policy Violations Summary
  const violationCounts: Record<string, number> = {};
  resources.forEach(r => {
      r.violations?.forEach(v => {
          violationCounts[v.message] = (violationCounts[v.message] || 0) + 1;
      });
  });
  const topViolations = Object.entries(violationCounts)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([msg, count]) => ({ rule: msg, count, severity: "HIGH" }));

  // 5. Cost Estimation (Refined Heuristics)
  const estimateMonthlyCost = (r: GceResource): number => {
      let base = 0;
      switch (r.type) {
          case 'INSTANCE':
              if (r.machineType?.includes('micro')) base = 10;
              else if (r.machineType?.includes('small')) base = 25;
              else if (r.machineType?.includes('medium')) base = 50;
              else if (r.machineType?.includes('standard-1')) base = 40;
              else if (r.machineType?.includes('standard-2')) base = 80;
              else if (r.machineType?.includes('standard-4')) base = 160;
              else if (r.machineType?.includes('standard-8')) base = 320;
              else if (r.machineType?.includes('highmem')) base = 200;
              else if (r.machineType?.includes('highcpu')) base = 180;
              else base = 60; // fallback
              if (r.status === 'STOPPED' || r.status === 'TERMINATED') base *= 0.15; // Storage only roughly
              break;
          case 'CLOUD_SQL':
              base = 150; // Base instance + storage
              break;
          case 'GKE_CLUSTER':
              base = 75; // Control plane management fee
              break;
          case 'DISK':
              // Standard vs SSD check ideally, but defaulting to SSD pricing for risk estimation ($0.17/gb)
              base = (parseInt(r.sizeGb || '0', 10) || 10) * 0.1; 
              break;
          case 'CLOUD_RUN':
              base = 20; // Assumed active traffic base
              break;
          case 'SNAPSHOT':
              base = (parseInt(r.sizeGb || '0', 10) || 1) * 0.026;
              break;
          default:
              base = 10;
      }
      return base;
  };

  const totalEstCost = resources.reduce((acc, r) => acc + estimateMonthlyCost(r), 0);
  const unallocatedCost = resources
      .filter(r => Object.keys(r.labels).length === 0 || !r.labels['cost-center'])
      .reduce((acc, r) => acc + estimateMonthlyCost(r), 0);

  const zombieResources = resources.filter(r => r.status === 'STOPPED' || r.status === 'TERMINATED');
  
  // Find top waste resource
  const topWasteResource = zombieResources.sort((a,b) => estimateMonthlyCost(b) - estimateMonthlyCost(a))[0];

  // 6. Type Breakdown
  const typeBreakdown: Record<string, { total: number, compliant: number }> = {};
  resources.forEach(r => {
      if (!typeBreakdown[r.type]) typeBreakdown[r.type] = { total: 0, compliant: 0 };
      typeBreakdown[r.type].total++;
      if (Object.keys(r.labels).length > 0) typeBreakdown[r.type].compliant++;
  });

  // 7. Construct Context for LLM
  const contextData = {
    financials: {
        monthly_run_rate_est: `$${Math.round(totalEstCost)}`,
        unallocated_spend_risk: `$${Math.round(unallocatedCost)}`,
        percent_unallocated: totalEstCost > 0 ? Math.round((unallocatedCost / totalEstCost) * 100) : 0,
        waste_opportunity: topWasteResource ? {
            resource_name: topWasteResource.name,
            type: topWasteResource.type,
            estimated_monthly_waste: `$${Math.round(estimateMonthlyCost(topWasteResource))}`
        } : null
    },
    operational: {
        total_assets: totalCount,
        compliance_score: `${complianceScore}%`,
        zombie_assets_count: zombieResources.length,
        breakdown_by_type: Object.entries(typeBreakdown).map(([t, s]) => ({ type: t, total: s.total, compliant_pct: Math.round(s.compliant/s.total*100) }))
    },
    governance_smells: {
      casing_inconsistencies: patterns.casingIssues, // e.g. [{key:'env', variants:['Env','env']}]
      potential_strategy_drift: patterns.valueFragmentation, // e.g. [{key:'env', values:['prod','production']}]
    },
    risk_segments: {
      production_assets_total: prodResources.length,
      production_assets_unlabeled: untaggedProd.length,
      production_examples: untaggedProd.slice(0, 3).map(r => r.name),
      databases_unlabeled: untaggedDatabases.length,
      database_examples: untaggedDatabases.slice(0, 3).map(r => r.name),
    },
    active_policy_violations: topViolations,
  };

  const systemInstruction = `
    You are a Principal Cloud Economist & Governance Auditor.
    Analyze the provided JSON telemetry and generate a structured JSON Governance Audit Report.
    
    The report should highlight critical risks, financial waste, and inconsistent metadata strategies.
    
    Structure your response strictly according to the defined JSON schema.
    - Grades should be A+, A, B, C, D, or F.
    - Impact should be 'High', 'Medium', or 'Low'.
    - Keep descriptions professional, concise, and actionable.
  `;

  try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: JSON.stringify(contextData),
        config: { 
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    summary: {
                        type: Type.OBJECT,
                        properties: {
                            grade: { type: Type.STRING },
                            score: { type: Type.NUMBER },
                            overview: { type: Type.STRING }
                        }
                    },
                    metrics: {
                        type: Type.OBJECT,
                        properties: {
                            financial_clarity: { type: Type.OBJECT, properties: { grade: { type: Type.STRING }, value: { type: Type.STRING }, assessment: { type: Type.STRING } } },
                            compliance_posture: { type: Type.OBJECT, properties: { grade: { type: Type.STRING }, value: { type: Type.STRING }, assessment: { type: Type.STRING } } },
                            operational_risk: { type: Type.OBJECT, properties: { grade: { type: Type.STRING }, value: { type: Type.STRING }, assessment: { type: Type.STRING } } }
                        }
                    },
                    financial_analysis: {
                        type: Type.OBJECT,
                        properties: {
                            unallocated_spend: { type: Type.STRING },
                            zombie_waste: { type: Type.STRING },
                            opportunity: { type: Type.STRING }
                        }
                    },
                    governance_issues: {
                        type: Type.OBJECT,
                        properties: {
                            casing_issues: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, variants: { type: Type.ARRAY, items: { type: Type.STRING } }, impact: { type: Type.STRING } } } },
                            fragmentation: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { key: { type: Type.STRING }, values: { type: Type.ARRAY, items: { type: Type.STRING } }, recommendation: { type: Type.STRING } } } }
                        }
                    },
                    operational_risks: {
                        type: Type.OBJECT,
                        properties: {
                            production_exposure: { type: Type.OBJECT, properties: { count: { type: Type.NUMBER }, description: { type: Type.STRING } } },
                            database_risks: { type: Type.OBJECT, properties: { count: { type: Type.NUMBER }, description: { type: Type.STRING } } },
                            policy_violations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { rule: { type: Type.STRING }, count: { type: Type.NUMBER }, severity: { type: Type.STRING } } } }
                        }
                    },
                    remediation_plan: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                priority: { type: Type.STRING },
                                action: { type: Type.STRING },
                                impact: { type: Type.STRING },
                                effort: { type: Type.STRING }
                            }
                        }
                    }
                }
            }
        }
      });
      return response.text || "{}";
  } catch (e) {
      console.error("Report Gen Error", e);
      return JSON.stringify({ summary: { grade: "F", score: 0, overview: "Audit failed due to AI service error." } });
  }
};

export const generateDashboardBrief = async (
  metrics: any
): Promise<string> => {
  const ai = getClient();
  
  const systemInstruction = `
    You are a Cloud Operations Analyst.
    Analyze infrastructure metrics and provide a 2-sentence executive summary focusing on cost optimization and security.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: JSON.stringify(metrics),
      config: { systemInstruction }
    });
    return response.text || "Insight generation unavailable.";
  } catch (e) {
    console.error("Dashboard Brief Gen Failed", e);
    return "AI Insights unavailable.";
  }
};

export const generateLabelingRule = async (
  userIntent: string,
  sampleNames: string[]
): Promise<{ regex?: string, delimiter?: string, groups?: { index: number, targetKey: string }[] }> => {
  const ai = getClient();
  const model = 'gemini-3-pro-preview'; 

  const systemInstruction = `
    You are a DevOps Regex & Parsing Expert.
    Your goal is to create a configuration object that extracts label values from resource names based on a user's intent.
    Return strictly valid JSON matching the schema.
  `;

  const prompt = `
    User Intent: "${userIntent}"
    Sample Resource Names: ${JSON.stringify(sampleNames.slice(0, 5))}
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mode: { type: Type.STRING, enum: ['REGEX', 'PATTERN'] },
            regex: { type: Type.STRING },
            delimiter: { type: Type.STRING },
            groups: { 
              type: Type.ARRAY, 
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  targetKey: { type: Type.STRING }
                },
                required: ['index', 'targetKey']
              }
            }
          },
          required: ['mode', 'groups']
        }
      }
    });

    const result = safeParseJSON<any>(response.text);
    if (!result) throw new Error("Failed to parse AI response");

    if (result.mode === 'PATTERN') {
        return { delimiter: result.delimiter || '-', groups: result.groups };
    } else {
        return { regex: result.regex, groups: result.groups };
    }

  } catch (e) {
    console.error("AI Rule Gen Failed", e);
    throw e;
  }
};
