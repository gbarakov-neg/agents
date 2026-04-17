import { useState, useEffect } from 'react';
import { Insight } from '../types';

interface Metrics {
  metrics: {
    agentsTotal: number;
    agentsComplete: number;
    agentsFailed: number;
    agentsWorking: number;
    filesChanged: number;
    instructionsTotal: number;
    instructionsDone: number;
  };
}

function MetricCard({ label, value, color }: {
  label: string; value: string | number; color?: string;
}) {
  return (
    <div className="bg-gray-700/40 rounded-lg p-4 border border-gray-600">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color || 'text-white'}`}>{value}</div>
    </div>
  );
}

export default function MetricsPanel({ teamId }: { teamId: string }) {
  const [data, setData] = useState<Metrics | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`http://localhost:3001/api/metrics/${teamId}`).then(r => r.json()),
      fetch(`http://localhost:3001/api/insights/${teamId}`).then(r => r.json())
    ]).then(([metricsData, insightsData]) => {
      setData(metricsData);
      setInsights(insightsData.insights || []);
    }).catch(() => {});
  }, [teamId]);

  if (!data) return null;

  const m = data.metrics;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="Agents Total" value={m.agentsTotal} />
        <MetricCard label="Working" value={m.agentsWorking} color={m.agentsWorking > 0 ? 'text-blue-400' : undefined} />
        <MetricCard label="Complete" value={m.agentsComplete} color={m.agentsComplete > 0 ? 'text-green-400' : undefined} />
        <MetricCard label="Failed" value={m.agentsFailed} color={m.agentsFailed > 0 ? 'text-red-400' : undefined} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Files Changed" value={m.filesChanged} color={m.filesChanged > 0 ? 'text-green-400' : undefined} />
        <MetricCard label="Instructions Sent" value={m.instructionsTotal} />
        <MetricCard label="Instructions Done" value={m.instructionsDone} color={m.instructionsDone > 0 ? 'text-green-400' : undefined} />
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-bold mb-4">Insights</h3>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className={`p-3 rounded-lg border ${
                insight.severity === 'high' ? 'bg-red-900/20 border-red-800' :
                insight.severity === 'medium' ? 'bg-yellow-900/20 border-yellow-800' :
                'bg-blue-900/20 border-blue-800'
              }`}>
                <div className="flex items-start gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    insight.severity === 'high' ? 'bg-red-600' :
                    insight.severity === 'medium' ? 'bg-yellow-600' :
                    'bg-blue-600'
                  }`}>
                    {insight.severity.toUpperCase()}
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{insight.message}</div>
                    <div className="text-xs text-gray-400 mt-1">Action: {insight.action}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
