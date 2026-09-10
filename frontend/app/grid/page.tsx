"use client"

import { useEffect, useState } from "react"
import {
  BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis,
  Tooltip, ResponsiveContainer, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine,
  LineChart, Line, AreaChart, Area
} from "recharts"

const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(224,64,251,0.12)",
  accent: "#e040fb",
  blue: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  red: "#ff5252",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.4)",
}

function riskColor(r: string) {
  if (r === "HIGH") return C.red
  if (r === "MODERATE") return C.amber
  return C.green
}

function SectionCard({ children, style = {} }: any) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 28px", ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, color = "#fff" }: any) {
  return (
    <h2 style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 20 }}>
      {children}
    </h2>
  )
}

function RiskBadge({ level }: { level: string }) {
  const color = riskColor(level)
  return (
    <span style={{ padding: "3px 12px", borderRadius: 100, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", background: color + "18", border: `1px solid ${color}40`, color }}>
      {level}
    </span>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 100, fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const, background: color + "18", border: `1px solid ${color}35`, color }}>
      {label}
    </span>
  )
}

// Enhanced feeder row with anomaly score
function FeederRow({ feeder, isSurge }: { feeder: any; isSurge: boolean }) {
  const color = riskColor(feeder.risk)
  const loadPct = Math.min(feeder.load_percent, 100)
  const anomalyColor = feeder.anomaly_score > 70 ? C.red : feeder.anomaly_score > 40 ? C.amber : C.green
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 1fr 52px 70px 80px 80px 80px",
      alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 10, marginBottom: 6,
      background: isSurge ? "rgba(224,64,251,0.07)" : "rgba(0,0,0,0.2)",
      border: `1px solid ${isSurge ? C.accent + "40" : "rgba(255,255,255,0.04)"}`,
      transition: "all 0.3s",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isSurge && <span style={{ fontSize: 10, color: C.accent }}>★</span>}
        <span style={{ fontSize: 12, fontWeight: 600, color: isSurge ? C.accent : C.text, fontFamily: "'Orbitron',monospace" }}>
          {feeder.name}
        </span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, position: "relative" as const }}>
        <div style={{
          height: "100%", borderRadius: 3, width: `${loadPct}%`,
          background: `linear-gradient(90deg,${color}88,${color})`,
          boxShadow: loadPct > 80 ? `0 0 8px ${color}66` : "none",
          transition: "width 0.5s ease",
        }} />
      </div>
      <span style={{ fontSize: 12, fontFamily: "'Orbitron',monospace", color, textAlign: "right" as const }}>{feeder.load_percent}%</span>
      <span style={{ fontSize: 11, color: C.muted, textAlign: "right" as const }}>{feeder.loss_percent?.toFixed(1)}%</span>
      <span style={{ fontSize: 11, fontFamily: "'Orbitron',monospace", color: C.blue, textAlign: "right" as const }}>
        {feeder.weather_normalised_loss?.toFixed(1) ?? "—"}%
      </span>
      <span style={{ fontSize: 11, fontFamily: "'Orbitron',monospace", color: anomalyColor, textAlign: "right" as const }}>
        {feeder.anomaly_score?.toFixed(0) ?? "—"}%
      </span>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <RiskBadge level={feeder.risk} />
      </div>
    </div>
  )
}

function FeederHexMap({ feeders, surgeZone }: { feeders: any[]; surgeZone: string }) {
  const positions = [
    { cx: 80, cy: 60 }, { cx: 170, cy: 60 }, { cx: 260, cy: 60 }, { cx: 350, cy: 60 }, { cx: 440, cy: 60 },
    { cx: 125, cy: 130 }, { cx: 215, cy: 130 }, { cx: 305, cy: 130 }, { cx: 395, cy: 130 }, { cx: 485, cy: 130 },
  ]
  return (
    <svg width="100%" viewBox="0 0 560 190" style={{ overflow: "visible" }}>
      {feeders.map((f: any, i: number) => {
        const pos = positions[i] || { cx: 0, cy: 0 }
        const color = riskColor(f.risk)
        const isSurge = f.name === surgeZone
        const r = 34
        const hex = Array.from({ length: 6 }, (_, k) => {
          const angle = (Math.PI / 3) * k - Math.PI / 6
          return `${pos.cx + r * Math.cos(angle)},${pos.cy + r * Math.sin(angle)}`
        }).join(" ")
        return (
          <g key={i}>
            <polygon points={hex} fill={color + "15"} stroke={isSurge ? C.accent : color + "60"} strokeWidth={isSurge ? 2 : 1}
              style={{ filter: isSurge ? `drop-shadow(0 0 10px ${C.accent}88)` : `drop-shadow(0 0 4px ${color}44)` }} />
            <clipPath id={`clip-${i}`}><polygon points={hex} /></clipPath>
            <rect x={pos.cx - r} y={pos.cy + r - (r * 2 * f.load_percent / 100)}
              width={r * 2} height={r * 2 * f.load_percent / 100}
              fill={color + "30"} clipPath={`url(#clip-${i})`} />
            <text x={pos.cx} y={pos.cy - 8} textAnchor="middle" fill={isSurge ? C.accent : color}
              style={{ fontFamily: "'Orbitron',monospace", fontSize: 9, fontWeight: 700 }}>
              {f.name.replace("Feeder-", "F")}
            </text>
            <text x={pos.cx} y={pos.cy + 6} textAnchor="middle" fill={color}
              style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700 }}>
              {f.load_percent}%
            </text>
            {f.anomaly_score > 50 && (
              <text x={pos.cx} y={pos.cy + 20} textAnchor="middle" fill={C.red}
                style={{ fontSize: 7, letterSpacing: "0.04em" }}>⚠ {f.anomaly_score?.toFixed(0)}%</text>
            )}
            {isSurge && (
              <text x={pos.cx} y={pos.cy + (f.anomaly_score > 50 ? 30 : 20)} textAnchor="middle" fill={C.accent}
                style={{ fontSize: 8, letterSpacing: "0.05em" }}>SURGE</text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ─── NEW: Weather-normalised AT&C Trend ─────────────────────────────
function AtcTrendPanel({ trend, rawAvg, normAvg, tempC, weatherFactor }: any) {
  if (!trend || trend.length === 0) return null
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <SectionTitle>🌡 Per-Feeder AT&amp;C Loss — Weather Normalised</SectionTitle>
          <p style={{ fontSize: 12, color: C.muted, marginTop: -14, lineHeight: 1.6 }}>
            Raw AT&amp;C includes AC load driven by heat. Normalised loss isolates true technical &amp; non-technical losses.
          </p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 16px", textAlign: "center" as const }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>AMBIENT TEMP</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, color: C.amber }}>{tempC}°C</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 16px", textAlign: "center" as const }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>AC FACTOR</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, color: C.amber }}>+{weatherFactor}%</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 16px", textAlign: "center" as const, border: `1px solid ${C.blue}30` }}>
            <div style={{ fontSize: 9, color: C.muted, marginBottom: 4 }}>RAW AVG</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, color: C.red }}>{rawAvg}%</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "10px 16px", textAlign: "center" as const, border: `1px solid ${C.green}30` }}>
            <div style={{ fontSize: 9, color: C.green, marginBottom: 4 }}>NORMALISED</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, color: C.green }}>{normAvg}%</div>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={trend}>
          <defs>
            <linearGradient id="rawGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.red} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.red} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="normGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.green} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.green} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(224,64,251,0.06)" />
          <XAxis dataKey="hour" stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}:00`} />
          <YAxis stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
            formatter={(v: any, n: any) => [`${v}%`, n === "raw" ? "Raw AT&C" : n === "normalised" ? "Normalised" : "Temp °C"]} />
          <Area type="monotone" dataKey="raw" stroke={C.red} fill="url(#rawGrad)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="normalised" stroke={C.green} fill="url(#normGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center" }}>
        {[["Raw AT&C Loss", C.red], ["Weather-Normalised", C.green]].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 20, height: 2, background: c }} />
            <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── NEW: Confusion Matrix F1 Drift Monitor ──────────────────────────
function F1DriftPanel({ f1Current, f1Mean, driftAlerts, f1Series }: any) {
  if (!f1Current) return null
  const classes = Object.keys(f1Current)
  const classColors: Record<string, string> = {
    ac: C.blue, fan: C.green, fridge: C.accent, geyser: C.red, washing_machine: C.amber, idle: "rgba(200,219,232,0.5)"
  }
  // Build chart data: 14 days for each class
  const seriesLength = f1Series ? Math.max(...Object.values(f1Series as Record<string, number[]>).map((a: number[]) => a.length)) : 0
  const chartData = Array.from({ length: seriesLength }, (_, i) => {
    const row: any = { day: `D-${seriesLength - i}` }
    if (f1Series) {
      classes.forEach(cls => { row[cls] = (f1Series[cls] as number[])[i] })
    }
    return row
  })

  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <SectionTitle color={driftAlerts?.length > 0 ? C.amber : "#fff"}>
            📉 Confusion Matrix Live Drift Monitor (Rolling 30-Day F1)
          </SectionTitle>
          <p style={{ fontSize: 12, color: C.muted, marginTop: -14, lineHeight: 1.6 }}>
            Seasonal appliance-mix changes can degrade per-class F1. Tracked live — triggers retraining when drop &gt;5%.
          </p>
        </div>
        {driftAlerts?.length > 0 && (
          <div style={{ background: `${C.amber}15`, border: `1px solid ${C.amber}40`, borderRadius: 10, padding: "10px 16px" }}>
            <div style={{ fontSize: 10, color: C.amber, fontWeight: 700 }}>⚠ {driftAlerts.length} CLASS{driftAlerts.length > 1 ? "ES" : ""} DRIFTING</div>
          </div>
        )}
      </div>

      {/* Drift Alerts */}
      {driftAlerts?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginBottom: 20 }}>
          {driftAlerts.map((d: any, i: number) => (
            <div key={i} style={{ background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 8, padding: "8px 14px", display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: C.amber, textTransform: "uppercase" as const }}>{d.class}</span>
              <span style={{ fontSize: 11, color: C.muted }}>30d: {d.f1_30d.toFixed(3)}</span>
              <span style={{ fontSize: 11, color: C.red }}>Now: {d.f1_now.toFixed(3)}</span>
              <span style={{ fontSize: 11, color: C.red, fontWeight: 700 }}>▼ {(d.drop * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Current F1 per class */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20 }}>
        {classes.map(cls => {
          const color = classColors[cls] || C.accent
          const isDrifting = driftAlerts?.some((d: any) => d.class === cls)
          const f1 = f1Current[cls]
          const mean = f1Mean?.[cls] ?? f1
          return (
            <div key={cls} style={{
              background: isDrifting ? `${C.amber}08` : "rgba(0,0,0,0.25)",
              border: `1px solid ${isDrifting ? C.amber + "40" : color + "25"}`,
              borderRadius: 10, padding: "14px", textAlign: "center" as const,
            }}>
              <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>
                {cls.replace("_", " ")}
              </div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: isDrifting ? C.amber : color }}>
                {f1.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>F1 Now</div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginTop: 8 }}>
                <div style={{ height: "100%", width: `${f1 * 100}%`, background: isDrifting ? C.amber : color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>30d avg: {mean.toFixed(3)}</div>
              {isDrifting && <div style={{ marginTop: 6 }}><Badge label="DRIFT" color={C.amber} /></div>}
            </div>
          )
        })}
      </div>

      {/* Rolling F1 Line Chart */}
      {seriesLength > 0 && (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <CartesianGrid stroke="rgba(224,64,251,0.06)" />
            <XAxis dataKey="day" stroke={C.muted} tick={{ fontSize: 9 }} />
            <YAxis stroke={C.muted} tick={{ fontSize: 10 }} domain={[0.5, 1.0]} tickFormatter={(v) => v.toFixed(2)} />
            <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 11 }}
              formatter={(v: any, n: any) => [v?.toFixed(3), n.toUpperCase()]} />
            {classes.map(cls => (
              <Line key={cls} type="monotone" dataKey={cls}
                stroke={classColors[cls] || C.accent} strokeWidth={1.5} dot={false}
                strokeDasharray={cls === "idle" ? "3 2" : "none"} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </SectionCard>
  )
}

// ─── NEW: NTL Suspects Panel ──────────────────────────────────────────
function NTLSuspectsPanel({ suspects }: { suspects: any[] }) {
  if (!suspects || suspects.length === 0) return null
  const clusterLabel: Record<number, { label: string; color: string }> = {
    0: { label: "Normal", color: C.green },
    1: { label: "Flat ⚠", color: C.red },
    2: { label: "High-Var", color: C.amber },
  }
  return (
    <SectionCard style={{ marginBottom: 24, border: `1px solid ${C.red}40` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <SectionTitle color={C.red}>🔍 NTL Suspects — Risk-Ranked Theft Localisation</SectionTitle>
          <p style={{ fontSize: 12, color: C.muted, marginTop: -14, lineHeight: 1.6 }}>
            5-step pipeline: Master balance → LSTM anomaly scoring → K-Means clustering → Credibility decay → Field inspector list.
          </p>
        </div>
        <div style={{ background: `${C.red}10`, border: `1px solid ${C.red}30`, borderRadius: 10, padding: "10px 16px", textAlign: "center" as const }}>
          <div style={{ fontSize: 10, color: C.red, fontWeight: 700, marginBottom: 4 }}>HIGH RISK</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, color: C.red }}>
            {suspects.filter(s => s.risk_level === "HIGH").length}
          </div>
          <div style={{ fontSize: 9, color: C.muted }}>meters flagged</div>
        </div>
      </div>

      {/* Pipeline Steps */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto" as const }}>
        {[
          { n: "1", label: "Master Meter Balance", desc: "Transformer kWh − Σ consumers = NTL quantum" },
          { n: "2", label: "LSTM Anomaly Score", desc: "Reported vs LSTM-expected consumption delta" },
          { n: "3", label: "K-Means Clustering", desc: "Profile shape: flat/low = behavioural outlier" },
          { n: "4", label: "Credibility Factor", desc: "0–1 score — drops on repeats, resets if clean" },
          { n: "5", label: "Risk-Ranked Output", desc: "Sorted theft probability for field inspectors" },
        ].map((step, i) => (
          <div key={i} style={{ flex: 1, minWidth: 140, background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.red}20` }}>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 6 }}>STEP {step.n}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#fff", marginBottom: 4 }}>{step.label}</div>
            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{step.desc}</div>
          </div>
        ))}
      </div>

      {/* Suspect Table */}
      <div style={{ overflowX: "auto" as const }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid rgba(255,82,82,0.2)` }}>
              {["Rank", "Meter ID", "Feeder", "Expected kWh", "Reported kWh", "Delta", "Profile", "Z-Score", "Credibility", "Theft Prob", "Action"].map(h => (
                <th key={h} style={{ padding: "8px 10px", textAlign: "left" as const, color: C.muted, fontWeight: 600, fontSize: 10, letterSpacing: "0.06em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suspects.map((s, i) => {
              const cl = clusterLabel[s.cluster] || { label: "?", color: C.muted }
              const probColor = s.theft_prob > 0.7 ? C.red : s.theft_prob > 0.4 ? C.amber : C.green
              const credColor = s.credibility < 0.5 ? C.red : s.credibility < 0.8 ? C.amber : C.green
              return (
                <tr key={i} style={{
                  borderBottom: `1px solid rgba(255,82,82,0.06)`,
                  background: s.risk_level === "HIGH" ? "rgba(255,82,82,0.05)" : i % 2 === 0 ? "rgba(0,0,0,0.1)" : "transparent",
                }}>
                  <td style={{ padding: "10px 10px", fontFamily: "'Orbitron',monospace", color: probColor, fontWeight: 700 }}>#{i + 1}</td>
                  <td style={{ padding: "10px 10px", fontFamily: "'Orbitron',monospace", color: "#fff", fontWeight: 600 }}>{s.meter_id}</td>
                  <td style={{ padding: "10px 10px", color: C.accent }}>{s.feeder}</td>
                  <td style={{ padding: "10px 10px", color: C.muted }}>{s.expected_kwh}</td>
                  <td style={{ padding: "10px 10px", color: C.text }}>{s.reported_kwh}</td>
                  <td style={{ padding: "10px 10px", fontFamily: "'Orbitron',monospace", color: s.delta_pct < -15 ? C.red : C.muted, fontWeight: 600 }}>
                    {s.delta_pct > 0 ? "+" : ""}{s.delta_pct}%
                  </td>
                  <td style={{ padding: "10px 10px" }}><span style={{ color: cl.color, fontWeight: 600, fontSize: 11 }}>{cl.label}</span></td>
                  <td style={{ padding: "10px 10px", fontFamily: "'Orbitron',monospace", color: s.z_score > 2 ? C.red : C.muted }}>{s.z_score.toFixed(2)}</td>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 40, height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${s.credibility * 100}%`, background: credColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, color: credColor, fontFamily: "'Orbitron',monospace" }}>{s.credibility.toFixed(2)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 50, height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${s.theft_prob * 100}%`, background: probColor, borderRadius: 3, boxShadow: `0 0 6px ${probColor}66` }} />
                      </div>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: probColor, fontWeight: 700 }}>{(s.theft_prob * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 10px" }}>
                    {s.risk_level === "HIGH"
                      ? <Badge label="INSPECT NOW" color={C.red} />
                      : s.risk_level === "MODERATE"
                        ? <Badge label="WATCH" color={C.amber} />
                        : <Badge label="Monitor" color={C.green} />}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

export default function GridDashboard() {
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<{ t: number; atc: number; avgLoad: number; avgAnomaly: number }[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const doFetch = () => {
      fetch("http://127.0.0.1:8000/grid-dashboard")
        .then(r => r.json()).then((d: any) => {
          setData(d)
          setTick(t => {
            const next = t + 1
            const feeders = d.feeders ?? []
            const avgLoad = feeders.length ? feeders.reduce((s: number, f: any) => s + f.load_percent, 0) / feeders.length : 0
            const avgAnomaly = feeders.length ? feeders.reduce((s: number, f: any) => s + (f.anomaly_score ?? 0), 0) / feeders.length : 0
            setHistory(prev => [...prev.slice(-40), {
              t: next,
              atc: d.avg_atc_loss ?? 0,
              avgLoad: Math.round(avgLoad),
              avgAnomaly: Math.round(avgAnomaly),
            }])
            return next
          })
        }).catch(() => { })
    }
    doFetch()
    const iv = setInterval(doFetch, 3000)
    return () => clearInterval(iv)
  }, [])

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg }}>
      <div style={{ fontFamily: "'Orbitron',monospace", color: C.accent, fontSize: 14, letterSpacing: "0.2em" }}>LOADING...</div>
    </div>
  )

  const feeders: any[] = data.feeders ?? []
  const radarData = feeders.slice(0, 6).map((f: any) => ({ name: f.name.replace("Feeder-", "F"), load: f.load_percent, loss: f.loss_percent }))

  const highRiskCount = feeders.filter(f => f.risk === "HIGH").length
  const avgAnomaly = feeders.length ? Math.round(feeders.reduce((s, f) => s + (f.anomaly_score ?? 0), 0) / feeders.length) : 0

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; color: ${C.text}; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.15em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>DISCOM CONTROL CENTER</div>
          <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Grid Feeder Operations</h1>
          <p style={{ fontSize: 13, color: C.muted }}>10-feeder monitoring · Weather-normalised AT&C loss · ML anomaly · NTL Theft Localisation · F1 Drift Monitoring</p>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "AT&C Loss (Raw)", value: `${data.avg_atc_loss}%`, color: data.avg_atc_loss > 10 ? C.red : C.green },
            { label: "AT&C (Normalised)", value: `${data.normalised_atc_loss}%`, color: data.normalised_atc_loss > 10 ? C.amber : C.blue },
            { label: "Surge Zone", value: data.surge_zone, color: C.accent },
            { label: "High Risk Feeders", value: `${highRiskCount} / 10`, color: highRiskCount > 2 ? C.red : C.green },
            { label: "Avg Anomaly Score", value: `${avgAnomaly}%`, color: avgAnomaly > 50 ? C.red : avgAnomaly > 30 ? C.amber : C.green },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${k.color}25`, borderRadius: 14, padding: "20px 22px", position: "relative" as const, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${k.color},transparent)` }} />
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: k.color, textTransform: "uppercase" as const }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Row 2: Surge Zone + Hex Map */}
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <SectionCard>
              <SectionTitle>Surge Zone Alert</SectionTitle>
              <div style={{ textAlign: "center" as const, padding: "16px 0 12px" }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 8 }}>ACTIVE SURGE</div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 8 }}>
                  {data.surge_zone}
                </div>
                {(() => {
                  const sf = feeders.find((f: any) => f.name === data.surge_zone)
                  return sf ? (
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Load</span>
                        <span style={{ fontSize: 12, fontFamily: "'Orbitron',monospace", color: riskColor(sf.risk) }}>{sf.load_percent}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Raw Loss</span>
                        <span style={{ fontSize: 12, color: C.muted }}>{sf.loss_percent?.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Norm. Loss</span>
                        <span style={{ fontSize: 12, fontFamily: "'Orbitron',monospace", color: C.blue }}>{sf.weather_normalised_loss?.toFixed(1)}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12, color: C.muted }}>ML Anomaly</span>
                        <span style={{ fontSize: 12, fontFamily: "'Orbitron',monospace", color: sf.anomaly_score > 50 ? C.red : C.green }}>{sf.anomaly_score?.toFixed(0)}%</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                        <span style={{ fontSize: 12, color: C.muted }}>Risk</span>
                        <RiskBadge level={sf.risk} />
                      </div>
                    </div>
                  ) : null
                })()}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 10 }}>INTERVENTIONS</div>
                {(data.intervention || []).map((msg: string, i: number) => (
                  <div key={i} style={{
                    fontSize: 12, color: C.text, lineHeight: 1.6,
                    padding: "8px 10px", marginBottom: 6,
                    background: "rgba(0,0,0,0.3)", borderRadius: 8,
                    borderLeft: `2px solid ${C.accent}`,
                  }}>{msg}</div>
                ))}
              </div>
            </SectionCard>

            {data.theft_detection && data.theft_detection.length > 0 && (
              <SectionCard style={{ background: "rgba(255,82,82,0.1)", border: `1px solid ${C.red}` }}>
                <SectionTitle><span style={{ color: C.red }}>Power Theft Flags</span></SectionTitle>
                {data.theft_detection.map((alert: string, i: number) => (
                  <div key={i} style={{
                    fontSize: 12, color: "#fff", lineHeight: 1.5,
                    padding: "10px 12px", marginBottom: 6,
                    background: "rgba(0,0,0,0.4)", borderRadius: 8,
                    borderLeft: `3px solid ${C.red}`,
                  }}>⚠️ {alert}</div>
                ))}
              </SectionCard>
            )}
          </div>

          <SectionCard>
            <SectionTitle>Feeder Network Map</SectionTitle>
            <FeederHexMap feeders={feeders} surgeZone={data.surge_zone} />
            <div style={{ display: "flex", gap: 20, marginTop: 12, justifyContent: "center", flexWrap: "wrap" as const }}>
              {[["HIGH", C.red], ["MODERATE", C.amber], ["LOW", C.green]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                  <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: C.accent }}>★</span>
                <span style={{ fontSize: 10, color: C.muted }}>Surge Zone</span>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* Row 3: Bar Chart + Radar */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginBottom: 24 }}>
          <SectionCard>
            <SectionTitle>Feeder Load Distribution</SectionTitle>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={feeders} barSize={28}>
                <CartesianGrid stroke="rgba(224,64,251,0.07)" vertical={false} />
                <XAxis dataKey="name" stroke={C.muted} tick={{ fontSize: 9 }} tickFormatter={(v) => v.replace("Feeder-", "F")} />
                <YAxis stroke={C.muted} tick={{ fontSize: 10 }} domain={[0, 110]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any, p: any) => [`${v}%`, p.payload.name]} />
                <ReferenceLine y={95} stroke={C.red} strokeDasharray="4 3" label={{ value: "Critical 95%", fill: C.red, fontSize: 9, position: "right" }} />
                <ReferenceLine y={80} stroke={C.amber} strokeDasharray="4 3" label={{ value: "Warning 80%", fill: C.amber, fontSize: 9, position: "right" }} />
                <Bar dataKey="load_percent" radius={[4, 4, 0, 0]}>
                  {feeders.map((f: any, i: number) => (
                    <Cell key={i}
                      fill={f.name === data.surge_zone ? C.accent : riskColor(f.risk)}
                      style={{ filter: f.name === data.surge_zone ? `drop-shadow(0 0 8px ${C.accent}88)` : "none" }}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard>
            <SectionTitle>Load vs Loss Radar (F1–F6)</SectionTitle>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(224,64,251,0.1)" />
                <PolarAngleAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Load %" dataKey="load" stroke={C.blue} fill={C.blue} fillOpacity={0.15} strokeWidth={2} />
                <Radar name="Loss %" dataKey="loss" stroke={C.accent} fill={C.accent} fillOpacity={0.1} strokeWidth={2} />
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 8 }}>
              {[["Load %", C.blue], ["Loss %", C.accent]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 20, height: 2, background: c }} />
                  <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        {/* Row 4: Feeder List — with weather-normalised column */}
        <SectionCard style={{ marginBottom: 24 }}>
          <SectionTitle>All Feeders — Live Status</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 52px 70px 80px 80px 80px", gap: 12, padding: "0 14px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 8 }}>
            {["Feeder", "Load", "%", "AT&C Loss", "Norm. Loss", "ML Anomaly", "Risk"].map(h => (
              <span key={h} style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" as const, textAlign: ["Risk", "%", "AT&C Loss", "Norm. Loss", "ML Anomaly"].includes(h) ? "right" as const : "left" as const }}>
                {h}
              </span>
            ))}
          </div>
          {feeders.map((f: any, i: number) => (
            <FeederRow key={i} feeder={f} isSurge={f.name === data.surge_zone} />
          ))}
        </SectionCard>

        {/* Row 5: AT&C + Anomaly Trend */}
        <SectionCard style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <SectionTitle>AT&C Loss, Load &amp; Anomaly Trend</SectionTitle>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 24, fontWeight: 700, color: data.avg_atc_loss > 10 ? C.red : C.green }}>
                {data.avg_atc_loss}%
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Current AT&C Loss</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history}>
              <CartesianGrid stroke="rgba(224,64,251,0.06)" />
              <XAxis dataKey="t" hide />
              <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                formatter={(v: any, n: any) => [
                  n === "atc" ? `${v}%` : n === "avgLoad" ? `${v}%` : `${v}%`,
                  n === "atc" ? "AT&C Loss" : n === "avgLoad" ? "Avg Load" : "Avg Anomaly"
                ]} />
              <Line type="monotone" dataKey="atc" stroke={C.accent} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="avgLoad" stroke={C.blue} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="avgAnomaly" stroke={C.red} strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12 }}>
            {[["AT&C Loss", C.accent], ["Avg Load", C.blue], ["Avg Anomaly", C.red]].map(([l, c]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 20, height: 2, background: c }} />
                <span style={{ fontSize: 10, color: C.muted }}>{l}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* ── NEW: Weather-Normalised AT&C Trend ── */}
        <AtcTrendPanel
          trend={data.atc_trend}
          rawAvg={data.avg_atc_loss}
          normAvg={data.normalised_atc_loss}
          tempC={data.ambient_temp_c}
          weatherFactor={data.ac_weather_factor_pct}
        />

        {/* ── NEW: Confusion Matrix F1 Drift Monitor ── */}
        <F1DriftPanel
          f1Current={data.f1_current}
          f1Mean={data.f1_30d_mean}
          driftAlerts={data.drift_alerts}
          f1Series={data.f1_series}
        />

        {/* ── NEW: NTL Suspects Panel ── */}
        <NTLSuspectsPanel suspects={data.ntl_suspects} />

      </div>
    </>
  )
}
