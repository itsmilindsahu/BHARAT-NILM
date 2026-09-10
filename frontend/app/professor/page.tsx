"use client"

import { useEffect, useState } from "react"
import {
  CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area,
  LineChart, Line, Legend, ScatterChart, Scatter, ZAxis
} from "recharts"
import { ResponsiveSankey } from '@nivo/sankey'
import { ResponsiveHeatMap } from '@nivo/heatmap'

interface MLInsight {
  dominant_appliance: string
  rf_confidence: number
  anomaly_score: number
  hmm_state: string
  lstm_forecast_w: number
  gb_forecast_w: number
  next_hour_usage_kwh: number
}

interface Metrics {
  accuracy: number
  precision: number
  recall: number
  classes: string[]
  confusion: number[][]
}

interface Dashboard {
  appliances: Record<string, number>
  total_load: number
  monthly_bill_current: number
  monthly_bill_predicted: number
  trend_memory: number[]
  ml: MLInsight
}

const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(0,229,255,0.12)",
  accent: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  purple: "#b388ff",
  red: "#ff5252",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.4)",
}

const APP_COLORS = [C.accent, C.green, C.amber, C.purple, C.red]

// Helper to format percentages — handles both 0–1 and 0–100 ranges with 2 decimals
function formatPct(v: number) {
  if (v > 1) return `${v.toFixed(2)}%`
  return `${(v * 100).toFixed(2)}%`
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 100,
      fontSize: 10, fontWeight: 600, letterSpacing: "0.1em",
      textTransform: "uppercase" as const,
      background: color + "18", border: `1px solid ${color}35`, color,
    }}>{label}</span>
  )
}

function KpiCard({ label, value, sub, color = C.accent }: any) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${color}25`,
      borderRadius: 14, padding: "22px 24px",
      display: "flex", flexDirection: "column" as const, gap: 6,
      position: "relative" as const, overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
      }} />
      <span style={{ fontSize: 11, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{label}</span>
      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>}
    </div>
  )
}
function MetricsGrid({ metrics }: { metrics: Metrics }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginBottom: 24 }}>
      <KpiCard label="Accuracy" value={formatPct(metrics.accuracy)} color={C.accent} />
      <KpiCard label="Precision" value={formatPct(metrics.precision)} color={C.green} />
    </div>
  )
}
function SectionCard({ title, badge, children }: any) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: "28px 32px", marginBottom: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: "#fff", letterSpacing: "0.08em", margin: 0 }}>{title}</h2>
        {badge && <Badge label={badge} color={C.accent} />}
      </div>
      {children}
    </div>
  )
}

function ConfusionMatrix({ matrix, labels }: { matrix: number[][]; labels: string[] }) {
  const max = Math.max(...matrix.flat())
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 4, paddingLeft: 72 }}>
        {labels.map(l => (
          <div key={l} style={{ width: 64, textAlign: "center" as const, fontSize: 10, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{l}</div>
        ))}
      </div>
      {matrix.map((row, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
          <div style={{ width: 68, fontSize: 10, color: C.muted, textAlign: "right" as const, paddingRight: 8, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{labels[i]}</div>
          {row.map((val, j) => {
            const intensity = val / max
            const isCorrect = i === j
            return (
              <div key={j} style={{
                width: 64, height: 48,
                background: isCorrect
                  ? `rgba(0,229,255,${0.1 + intensity * 0.5})`
                  : `rgba(255,82,82,${intensity * 0.35})`,
                border: isCorrect ? `1px solid rgba(0,229,255,0.4)` : `1px solid rgba(255,82,82,0.2)`,
                borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700,
                color: isCorrect ? C.accent : "#ff5252",
              }}>{val}</div>
            )
          })}
        </div>
      ))}
      <div style={{ fontSize: 11, color: C.muted, marginTop: 12 }}>
        <span style={{ color: C.accent }}>■</span> Correct &nbsp;
        <span style={{ color: "#ff5252" }}>■</span> Misclassified
      </div>
    </div>
  )
}

function Eq({ children }: { children: string }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "10px 16px", margin: "10px 0",
      fontFamily: "monospace", fontSize: 13, color: C.accent,
      letterSpacing: "0.03em",
    }}>{children}</div>
  )
}

// ML Insight panel
function MLInsightPanel({ ml }: { ml: MLInsight }) {
  const anomalyColor = ml.anomaly_score > 70 ? C.red : ml.anomaly_score > 40 ? C.amber : C.green
  const confidenceColor = ml.rf_confidence > 80 ? C.green : ml.rf_confidence > 60 ? C.amber : C.red

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24,
    }}>
      {/* Dominant Appliance */}
      <div style={{
        background: C.surface, border: `1px solid ${C.accent}25`,
        borderRadius: 14, padding: "20px 22px",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${C.accent},transparent)` }} />
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>RF Dominant Appliance</div>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: C.accent, textTransform: "uppercase" as const }}>{ml.dominant_appliance}</div>
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
            <div style={{ height: "100%", borderRadius: 2, width: `${ml.rf_confidence}%`, background: confidenceColor, transition: "width 0.5s" }} />
          </div>
          <span style={{ fontSize: 11, color: confidenceColor, fontFamily: "'Orbitron',monospace" }}>{ml.rf_confidence}%</span>
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>Classification confidence</div>
      </div>

      {/* Anomaly Score */}
      <div style={{
        background: C.surface, border: `1px solid ${anomalyColor}25`,
        borderRadius: 14, padding: "20px 22px",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${anomalyColor},transparent)` }} />
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Anomaly Score</div>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: anomalyColor }}>{ml.anomaly_score}%</div>
        <div style={{ marginTop: 8 }}>
          <Badge label={ml.anomaly_score > 70 ? "SPIKE DETECTED" : ml.anomaly_score > 40 ? "ELEVATED" : "NORMAL"} color={anomalyColor} />
        </div>
        <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>LogReg anomaly probability</div>
      </div>

      {/* HMM + LSTM */}
      <div style={{
        background: C.surface, border: `1px solid ${C.purple}25`,
        borderRadius: 14, padding: "20px 22px",
        position: "relative" as const, overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${C.purple},transparent)` }} />
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>HMM State</div>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.purple }}>{ml.hmm_state}</div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>LSTM Forecast</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.amber }}>
            {ml.lstm_forecast_w > 0 ? `${ml.lstm_forecast_w.toFixed(0)}W` : "—"}
          </div>
          <div style={{ fontSize: 10, color: C.muted }}>Next interval prediction</div>
        </div>
      </div>
    </div>
  )
}

const MODELS = [
  { name: "Random Forest", abbr: "RF", role: "Appliance Classification", color: C.accent, detail: "150 estimators, max_depth=12. Uses aggregate load, delta, hour-of-day, rolling mean and std features to classify which appliance is dominant. Outputs class probabilities used for confidence scoring." },
  { name: "Gradient Boosting", abbr: "GB", role: "Load Forecasting", color: C.green, detail: "200 estimators XGBoost, learning_rate=0.05. Predicts next-step aggregate consumption from current load and rolling context. Evaluated via MAE and R² on held-out test set." },
  { name: "Hidden Markov Model", abbr: "HMM", role: "Regime Detection", color: C.amber, detail: "3 hidden states (standby / normal / peak) with Gaussian emission. Captures temporal consumption regimes. State means reflect low, mid, and high load patterns." },
  { name: "Logistic Regression", abbr: "LR", role: "Anomaly Detection", color: C.purple, detail: "L2 regularized with StandardScaler pipeline. Outputs P(anomaly) from load, delta, and rolling_std features. Class-weighted to handle imbalanced anomaly rate (~2%)." },
  { name: "LSTM Network", abbr: "LSTM", role: "Sequence Forecasting", color: "#ff6090", detail: "2-layer LSTM, 64 hidden units, dropout=0.2. Trained on MinMax-normalized sequences of length 24. Scaler saved alongside model for proper denormalization at inference." },
]

export default function ResearchDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [trendHistory, setTrendHistory] = useState<{ i: number; load: number; gb: number; lstm: number }[]>([])
  const [sankeyData, setSankeyData] = useState<{ nodes: any[], links: any[] } | null>(null)
  const [carpetData, setCarpetData] = useState<any[] | null>(null)
  const [viData, setViData] = useState<any[] | null>(null)
  const [activeModel, setActiveModel] = useState(0)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const doFetch = () => {
      fetch("http://127.0.0.1:8000/dashboard")
        .then(r => r.json()).then((d: Dashboard) => {
          setDashboard(d)
          setTick(t => {
            const next = t + 1
            setTrendHistory(prev => [...prev.slice(-40), {
              i: next,
              load: d.total_load,
              gb:   d.ml?.gb_forecast_w   ?? 0,
              lstm: d.ml?.lstm_forecast_w ?? 0,
            }])
            return next
          })
        }).catch(() => { })
    }

    const doFetchMetrics = () => {
      fetch("http://127.0.0.1:8000/model-metrics")
        .then(r => r.json())
        .then((m: Metrics) => {
          // Store metrics as-is (backend should return 0-1 or 0-100, we display exactly)
          setMetrics(m)
        }).catch(() => { })
    }

    const fetchStaticVis = () => {
      fetch("http://127.0.0.1:8000/sankey")
        .then(r => r.json()).then(setSankeyData).catch(() => { })
      fetch("http://127.0.0.1:8000/carpet-plot")
        .then(r => r.json()).then(setCarpetData).catch(() => { })
      fetch("http://127.0.0.1:8000/vi-trajectory")
        .then(r => r.json()).then(setViData).catch(() => { })
    }

    doFetch()
    doFetchMetrics()
    fetchStaticVis()

    // Real-time updates
    const iv = setInterval(doFetch, 2000)
    const ivMetrics = setInterval(doFetchMetrics, 3000)

    return () => {
      clearInterval(iv)
      clearInterval(ivMetrics)
    }
  }, [])

  const applianceData = dashboard
    ? Object.entries(dashboard.appliances).map(([name, value]) => ({ name, value }))
    : []

  const radarData = metrics ? [
    { metric: "Accuracy",  value: parseFloat(formatPct(metrics.accuracy)) },
    { metric: "Precision", value: parseFloat(formatPct(metrics.precision)) },
    { metric: "Recall",    value: parseFloat(formatPct(metrics.recall)) },
  ] : []

  const CLASS_COLORS = [C.accent, C.green, C.amber, C.purple, C.red]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; color: ${C.text}; }
        .model-tab {
          padding: 6px 16px; border-radius: 8px; border: 1px solid;
          font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700;
          cursor: pointer; transition: all 0.2s; letter-spacing: 0.08em;
        }
        .model-tab:hover { opacity: 0.9; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.5s ease forwards; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: C.muted, letterSpacing: "0.15em" }}>RESEARCH DASHBOARD</span>
            <Badge label="LIVE" color={C.green} />
          </div>
          <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 28, fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", marginBottom: 8 }}>
            NILM Model Analytics
          </h1>
          <p style={{ fontSize: 14, color: C.muted, maxWidth: 520 }}>Real-time ML inference · 5 models · Live appliance disaggregation</p>
        </div>

        {/* KPI Row — EXACT F1 SCORES WITH 2 DECIMALS */}
        {metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            <KpiCard label="Accuracy"  value={formatPct(metrics.accuracy)}  color={C.accent} />
            <KpiCard label="Precision" value={formatPct(metrics.precision)} color={C.green} />
            <KpiCard label="Recall"    value={formatPct(metrics.recall)}    color={C.amber} />
          </div>
        )}

        {/* Live ML Insights */}
        {dashboard?.ml && (
          <SectionCard title="LIVE ML INFERENCE OUTPUT" badge="Real-time">
            <MLInsightPanel ml={dashboard.ml} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 12 }}>LSTM Forecast vs GB Forecast</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendHistory.filter(d => d.lstm > 0)}>
                    <CartesianGrid stroke="rgba(0,229,255,0.06)" />
                    <XAxis dataKey="i" hide />
                    <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, n: any) => [`${Math.round(v)}W`, n === "lstm" ? "LSTM Forecast" : "GB Forecast"]} />
                    <Line type="monotone" dataKey="lstm" stroke={C.purple} strokeWidth={2} dot={false} name="lstm" />
                    <Line type="monotone" dataKey="gb"   stroke={C.amber}  strokeWidth={2} dot={false} strokeDasharray="4 2" name="gb" />
                    <Legend formatter={(v) => v === "lstm" ? "LSTM Forecast" : "GB Forecast"} wrapperStyle={{ fontSize: 11, color: C.muted }} />
                  </LineChart>
                  {trendHistory.filter(d => d.lstm > 0).length === 0 && (
                    <div style={{ textAlign: "center" as const, fontSize: 11, color: C.muted, marginTop: 6 }}>
                      ⏳ LSTM warming up — needs 24 readings (~72s)
                    </div>
                  )}
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 12 }}>Next Hour Forecast</div>
                <div style={{
                  background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: "20px 24px",
                  border: `1px solid ${C.amber}20`, marginBottom: 12,
                }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>GB PREDICTED NEXT INTERVAL</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 32, fontWeight: 700, color: C.amber }}>
                    {dashboard.ml.next_hour_usage_kwh.toFixed(3)} kWh
                  </div>
                </div>
                <div style={{
                  background: "rgba(0,0,0,0.3)", borderRadius: 12, padding: "20px 24px",
                  border: `1px solid ${C.purple}20`,
                }}>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>HMM CONSUMPTION REGIME</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: C.purple }}>
                    {dashboard.ml.hmm_state}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Metrics + Confusion */}
        {metrics && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <SectionCard title="PERFORMANCE RADAR">
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="rgba(0,229,255,0.1)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: C.muted, fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="value" stroke={C.accent} fill={C.accent} fillOpacity={0.15} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </SectionCard>
            <SectionCard title="CONFUSION MATRIX" badge={`${metrics.classes?.length ?? 0} classes`}>
              <ConfusionMatrix matrix={metrics.confusion} labels={metrics.classes ?? []} />
            </SectionCard>
          </div>
        )}

        {/* Live Disaggregation */}
        {dashboard && (
          <SectionCard title="LIVE APPLIANCE DISAGGREGATION">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              <div>
                {applianceData.map((a, i) => {
                  const pct = (a.value / (dashboard.total_load || 1)) * 100
                  const isActive = dashboard.ml?.dominant_appliance?.toLowerCase() === a.name.toLowerCase()
                  return (
                    <div key={i} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, color: C.text }}>{a.name}</span>
                          {isActive && <Badge label="RF Active" color={C.accent} />}
                        </div>
                        <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: APP_COLORS[i % 5] }}>{a.value}W</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                        <div style={{
                          height: "100%", borderRadius: 3, width: `${pct}%`,
                          background: `linear-gradient(90deg,${APP_COLORS[i % 5]},${APP_COLORS[i % 5]}66)`,
                          transition: "width 0.5s ease",
                          boxShadow: isActive ? `0 0 8px ${APP_COLORS[i % 5]}88` : "none",
                        }} />
                      </div>
                      <span style={{ fontSize: 10, color: C.muted }}>{pct.toFixed(1)}% of total</span>
                    </div>
                  )
                })}
                <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: C.muted }}>Total Load</span>
                  <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, color: C.accent }}>{dashboard.total_load}W</span>
                </div>
              </div>
              <div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendHistory}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(0,229,255,0.06)" />
                    <XAxis dataKey="i" hide />
                    <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}W`, "Load"]} />
                    <Area type="monotone" dataKey="load" stroke={C.accent} fill="url(#trendGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11, color: C.muted, textAlign: "center" as const, marginTop: 6 }}>Aggregate load — Real-time</p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* SANKEY */}
        {sankeyData && sankeyData.nodes.length > 0 && (
          <SectionCard title="REAL-TIME ENERGY FLOW (SANKEY)">
            <div style={{ height: 400, background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16 }}>
              <ResponsiveSankey
                data={sankeyData}
                margin={{ top: 20, right: 140, bottom: 20, left: 140 }}
                align="justify"
                colors={(node: any) => node.nodeColor}
                nodeOpacity={0.8}
                nodeThickness={14}
                nodeInnerPadding={3}
                nodeSpacing={24}
                nodeBorderWidth={0}
                nodeBorderColor={{ from: 'color', modifiers: [['darker', 0.8]] }}
                linkOpacity={0.5}
                linkHoverOthersOpacity={0.1}
                enableLinkGradient={true}
                linkBlendMode="lighten"
                labelPosition="outside"
                labelOrientation="horizontal"
                labelPadding={16}
                labelTextColor="#c8dbe8"
                theme={{
                  tooltip: { container: { background: "#0a1929", color: "#fff", fontSize: 12, borderRadius: 8 } }
                }}
              />
            </div>
          </SectionCard>
        )}

        {/* CARPET PLOT */}
        {carpetData && carpetData.length > 0 && (
          <SectionCard title="24x7 CONSUMPTION HEATMAP (CARPET PLOT)" badge="Real-time">
            <div style={{ height: 320, background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16 }}>
              <ResponsiveHeatMap
                data={carpetData}
                margin={{ top: 40, right: 40, bottom: 40, left: 60 }}
                valueFormat=">-.0f"
                axisTop={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                  legend: 'Hour of Day',
                  legendOffset: -30
                }}
                axisLeft={{
                  tickSize: 5,
                  tickPadding: 5,
                  tickRotation: 0,
                }}
                colors={{
                  type: 'sequential',
                  scheme: 'cividis',
                  minValue: 0,
                  maxValue: 3000
                }}
                emptyColor="#000000"
                borderColor="rgba(255,255,255,0.05)"
                theme={{
                  axis: { ticks: { text: { fill: C.muted, fontSize: 11 } }, legend: { text: { fill: C.muted, fontSize: 11 } } },
                  tooltip: { container: { background: "#0a1929", color: "#fff", fontSize: 12, borderRadius: 8 } }
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: C.muted, marginTop: 12, textAlign: 'center' as const }}>
              Vampire loads (ghost power) appear as faint background at night. Peak consumption highlighted.
            </p>
          </SectionCard>
        )}

        {/* V-I TRAJECTORY */}
        {viData && viData.length > 0 && (
          <SectionCard title="V-I TRAJECTORY (LISSAJOUS SIGNATURES)">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' as const, marginBottom: 8 }}>Resistive (e.g. Heater)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="v" name="Voltage" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <YAxis type="number" dataKey="Resistive" name="Current" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0a1929' }} />
                    <Scatter name="Resistive" data={viData} fill={C.amber} line shape="circle" lineJointType="monotoneX" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' as const, marginBottom: 8 }}>Inductive (e.g. Fridge/Motor)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="v" name="Voltage" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <YAxis type="number" dataKey="Inductive" name="Current" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0a1929' }} />
                    <Scatter name="Inductive" data={viData} fill={C.accent} line shape="circle" lineJointType="monotoneX" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, color: C.muted, textAlign: 'center' as const, marginBottom: 8 }}>Non-Linear (e.g. PC/Electronics)</div>
                <ResponsiveContainer width="100%" height={200}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis type="number" dataKey="v" name="Voltage" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <YAxis type="number" dataKey="NonLinear" name="Current" domain={[-1.2, 1.2]} stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0a1929' }} />
                    <Scatter name="NonLinear" data={viData} fill={C.purple} line shape="circle" lineJointType="monotoneX" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

            </div>
          </SectionCard>
        )}

        {/* NILM Equations */}
        <SectionCard title="CORE NILM FORMULATION">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>
            <div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, marginBottom: 12 }}>Signal decomposition:</p>
              <Eq>{"P_total(t) = Σᵢ Pᵢ(t) + ε(t)"}</Eq>
              <Eq>{"E = ∫ P(t) dt  /  1000  [kWh]"}</Eq>
              <Eq>{"Bill = Σ (E_slab × Tariff_slab)"}</Eq>
            </div>
            <div>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, marginBottom: 12 }}>Anomaly & power metrics:</p>
              <Eq>{"Z = (x − μ) / σ"}</Eq>
              <Eq>{"Anomaly if |Z| > θ"}</Eq>
              <Eq>{"PF = kW / kVA"}</Eq>
            </div>
          </div>
        </SectionCard>

        {/* Model Architecture */}
        <SectionCard title="MODEL ARCHITECTURE">
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" as const }}>
            {MODELS.map((m, i) => (
              <button key={i} className="model-tab" onClick={() => setActiveModel(i)}
                style={{
                  background: activeModel === i ? m.color + "18" : "transparent",
                  borderColor: activeModel === i ? m.color + "50" : "rgba(255,255,255,0.06)",
                  color: activeModel === i ? m.color : C.muted,
                }}>{m.abbr}</button>
            ))}
          </div>
          <div style={{
            background: "rgba(0,0,0,0.3)", border: `1px solid ${MODELS[activeModel].color}25`,
            borderRadius: 12, padding: "24px 28px",
            borderLeft: `3px solid ${MODELS[activeModel].color}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12 }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: MODELS[activeModel].color }}>{MODELS[activeModel].abbr}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{MODELS[activeModel].name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{MODELS[activeModel].role}</div>
              </div>
            </div>
            <p style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>{MODELS[activeModel].detail}</p>
          </div>
        </SectionCard>

        {/* Bill Cards */}
        {dashboard && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <KpiCard label="Current Month Bill" value={`₹${dashboard.monthly_bill_current.toFixed(0)}`} sub="Based on current load" color={C.green} />
            <KpiCard label="Predicted End-Month" value={`₹${dashboard.monthly_bill_predicted.toFixed(0)}`} sub="LSTM-guided projection" color={C.amber} />
          </div>
        )}

      </div>
    </>
  )
}