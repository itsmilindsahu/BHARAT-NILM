"use client"

import { useEffect, useRef, useState } from "react"
import {
  AreaChart, Area, BarChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, LineChart, Line
} from "recharts"

const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(255,159,0,0.12)",
  accent: "#ff9f00",
  blue: "#00e5ff",
  green: "#39ff14",
  red: "#ff5252",
  purple: "#b388ff",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.4)",
}

function riskColor(r: string) {
  if (r === "HIGH" || r === "CRITICAL") return C.red
  if (r === "MODERATE") return C.accent
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

function StatRow({ label, value, color = C.text, mono = false }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid rgba(255,159,0,0.06)` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: mono ? "'Orbitron',monospace" : "inherit" }}>{value}</span>
    </div>
  )
}

function RadialGauge({ value, max, color, label, unit, warn, danger }: any) {
  const pct = Math.min(value / max, 1)
  const r = 54, cx = 68, cy = 68
  const startAngle = Math.PI * 0.75, endAngle = Math.PI * 2.25
  const arc = endAngle - startAngle
  const angle = startAngle + pct * arc
  const ax = (a: number) => cx + r * Math.cos(a)
  const ay = (a: number) => cy + r * Math.sin(a)
  const largeArc = arc > Math.PI ? 1 : 0
  const largeVal = pct * arc > Math.PI ? 1 : 0
  const trackPath = `M ${ax(startAngle)} ${ay(startAngle)} A ${r} ${r} 0 ${largeArc} 1 ${ax(endAngle)} ${ay(endAngle)}`
  const valPath = pct > 0.01 ? `M ${ax(startAngle)} ${ay(startAngle)} A ${r} ${r} 0 ${largeVal} 1 ${ax(angle)} ${ay(angle)}` : ""
  const activeColor = value >= danger ? C.red : value >= warn ? C.accent : color
  return (
    <div style={{ textAlign: "center" as const }}>
      <svg width={136} height={110} viewBox="0 0 136 110">
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={9} strokeLinecap="round" />
        {valPath && <path d={valPath} fill="none" stroke={activeColor} strokeWidth={9} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 8px ${activeColor}99)` }} />}
        {pct > 0 && <circle cx={ax(angle)} cy={ay(angle)} r={5} fill={activeColor} style={{ filter: `drop-shadow(0 0 4px ${activeColor})` }} />}
        <text x={cx} y={cy + 6} textAnchor="middle" fill={activeColor} style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700 }}>{value}</text>
        <text x={cx} y={cy + 22} textAnchor="middle" fill={C.muted} style={{ fontSize: 9 }}>{unit}</text>
      </svg>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em", marginTop: -10 }}>{label}</div>
    </div>
  )
}

function PhaseBar({ phase, value, max = 280, color }: any) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'Orbitron',monospace" }}>Phase {phase}</span>
        <span style={{ fontSize: 13, fontFamily: "'Orbitron',monospace", color }}>{value}A</span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
        <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: `linear-gradient(90deg,${color},${color}88)`, boxShadow: `0 0 8px ${color}66`, transition: "width 0.6s ease" }} />
      </div>
    </div>
  )
}

function DemandMeter({ current, peak, contracted, capacity }: any) {
  const contractedPct = (contracted / capacity) * 100
  const currentPct = (current / capacity) * 100
  return (
    <div>
      <div style={{ position: "relative", height: 12, background: "rgba(255,255,255,0.06)", borderRadius: 6, marginBottom: 14 }}>
        <div style={{ position: "absolute", left: `${contractedPct}%`, top: -6, bottom: -6, width: 2, background: C.accent, borderRadius: 1 }} />
        <div style={{
          height: "100%", borderRadius: 6, width: `${currentPct}%`,
          background: currentPct > contractedPct ? `linear-gradient(90deg,${C.green},${C.red})` : `linear-gradient(90deg,${C.green},${C.accent})`,
          transition: "width 0.6s ease",
          boxShadow: `0 0 10px ${currentPct > contractedPct ? C.red : C.green}55`,
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
        <span>0</span>
        <span style={{ color: C.accent }}>Contracted: {contracted} kVA</span>
        <span>{capacity} kVA</span>
      </div>
    </div>
  )
}

// ─── THDi Panel ─────────────────────────────────────────────────────
function THDiPanel({ thdi }: { thdi: any }) {
  if (!thdi) return null
  const phaseColors: Record<string, string> = { R: C.red, Y: C.accent, B: C.blue }
  const phases = Object.entries(thdi).filter(([k]) => k.length === 1) as [string, any][]
  return (
    <SectionCard style={{ marginBottom: 24, border: thdi.penalty_risk ? `1px solid ${C.red}50` : `1px solid ${C.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <SectionTitle color={thdi.penalty_risk ? C.red : "#fff"}>🌊 Harmonic Distortion Index (THDi) per Phase</SectionTitle>
          <p style={{ fontSize: 12, color: C.muted, marginTop: -14, lineHeight: 1.6 }}>
            CEA/CBIP limit: {thdi.limit_pct}% THDi. Breaching triggers industrial penalty billing.
          </p>
        </div>
        <div style={{ textAlign: "right" as const }}>
          {thdi.penalty_risk ? (
            <div style={{ background: `${C.red}15`, border: `1px solid ${C.red}50`, borderRadius: 10, padding: "10px 16px" }}>
              <div style={{ fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: "0.08em" }}>⚠ PENALTY RISK</div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.red, marginTop: 4 }}>₹{thdi.est_penalty_rs.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: C.muted }}>estimated fine</div>
            </div>
          ) : (
            <div style={{ background: `${C.green}10`, border: `1px solid ${C.green}30`, borderRadius: 10, padding: "10px 16px" }}>
              <div style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>✓ WITHIN LIMIT</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {phases.map(([phase, d]: any) => {
          const color = phaseColors[phase]
          const pct = Math.min((d.thdi / 15) * 100, 100) // scale 0-15%
          const limitPct = (thdi.limit_pct / 15) * 100
          return (
            <div key={phase} style={{
              background: d.breach ? `${C.red}08` : "rgba(0,0,0,0.25)",
              border: `1px solid ${d.breach ? C.red + "40" : color + "25"}`,
              borderRadius: 12, padding: "18px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color }}>Phase {phase}</span>
                <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: d.breach ? C.red : C.green }}>
                  {d.thdi.toFixed(1)}%
                </span>
              </div>
              {/* THDi bar with limit marker */}
              <div style={{ position: "relative" as const, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, marginBottom: 8 }}>
                <div style={{
                  height: "100%", borderRadius: 5,
                  width: `${pct}%`,
                  background: d.breach ? `linear-gradient(90deg,${color},${C.red})` : `linear-gradient(90deg,${color}88,${color})`,
                  boxShadow: d.breach ? `0 0 10px ${C.red}66` : "none",
                  transition: "width 0.6s",
                }} />
                {/* Limit line */}
                <div style={{ position: "absolute" as const, top: -4, bottom: -4, left: `${limitPct}%`, width: 2, background: C.accent, borderRadius: 1 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: C.muted }}>
                <span>0%</span>
                <span style={{ color: C.accent }}>Limit {thdi.limit_pct}%</span>
                <span>15%</span>
              </div>
              {d.breach && (
                <div style={{ marginTop: 8 }}>
                  <RiskBadge level="HIGH" />
                  <span style={{ fontSize: 10, color: C.muted, marginLeft: 8 }}>Harmonic injection detected</span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ─── Demand Heatmap ──────────────────────────────────────────────────
function DemandHeatmap({ rows, contracted }: { rows: any[]; contracted: number }) {
  if (!rows || rows.length === 0) return null
  // Show last 14 days, 24 hours
  const displayRows = rows.slice(0, 14)
  const hours = Array.from({ length: 24 }, (_, i) => i)
  const allVals = displayRows.flatMap(r => hours.map(h => r[`h${String(h).padStart(2, "0")}`] || 0))
  const minV = Math.min(...allVals)
  const maxV = Math.max(...allVals)
  const getColor = (v: number) => {
    const norm = maxV > minV ? (v - minV) / (maxV - minV) : 0
    if (v >= contracted) return `rgba(255,82,82,${0.3 + norm * 0.7})`
    if (norm > 0.75) return `rgba(255,159,0,${0.5 + norm * 0.5})`
    if (norm > 0.4) return `rgba(255,238,88,${0.3 + norm * 0.4})`
    return `rgba(57,255,20,${0.15 + norm * 0.3})`
  }
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>📅 Demand Charge Calendar Heatmap</SectionTitle>
      <p style={{ fontSize: 12, color: C.muted, marginTop: -14, marginBottom: 20, lineHeight: 1.6 }}>
        Which hours/days triggered peak demand charges. Red cells = penalty zone ({contracted}+ kVA).
      </p>
      {/* Hour axis */}
      <div style={{ display: "flex", gap: 2, marginBottom: 4, marginLeft: 48 }}>
        {hours.filter(h => h % 3 === 0).map(h => (
          <div key={h} style={{ flex: 1, fontSize: 8, color: C.muted, textAlign: "center" as const }}>{h}:00</div>
        ))}
      </div>
      {/* Grid */}
      <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
        {displayRows.map((row: any, ri: number) => (
          <div key={ri} style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <div style={{ width: 44, fontSize: 9, color: C.muted, textAlign: "right" as const, paddingRight: 6, flexShrink: 0 }}>{row.day}</div>
            {hours.map(h => {
              const key = `h${String(h).padStart(2, "0")}`
              const v = row[key] || 0
              const isPeak = v >= contracted
              return (
                <div key={h} title={`${row.day} ${h}:00 — ${v} kVA`} style={{
                  flex: 1, height: 18, borderRadius: 3,
                  background: getColor(v),
                  border: isPeak ? `1px solid ${C.red}60` : "none",
                  cursor: "default",
                  transition: "transform 0.1s",
                }} />
              )
            })}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center", fontSize: 10, color: C.muted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(57,255,20,0.4)" }} />
          <span>Low</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(255,238,88,0.6)" }} />
          <span>Moderate</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: "rgba(255,159,0,0.8)" }} />
          <span>High</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(255,82,82,0.9)`, border: `1px solid ${C.red}` }} />
          <span>Penalty Zone (&gt;{contracted} kVA)</span>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Shift Energy Intensity ──────────────────────────────────────────
function ShiftEnergy({ shifts }: { shifts: Record<string, any> }) {
  if (!shifts) return null
  const shiftColors = [C.accent, C.purple, C.blue]
  const entries = Object.entries(shifts)
  const maxKwh = Math.max(...entries.map(([, d]) => d.kwh))
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>🏭 Shift-wise Energy Intensity (kWh / Unit Produced)</SectionTitle>
      <p style={{ fontSize: 12, color: C.muted, marginTop: -14, marginBottom: 20, lineHeight: 1.6 }}>
        Breaks down energy efficiency per production shift. Lower kWh/unit = better utilisation.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {entries.map(([name, d], i) => {
          const color = shiftColors[i] || C.accent
          const effColor = d.efficiency === "Good" ? C.green : d.efficiency === "Moderate" ? "#ffb300" : C.red
          const barW = maxKwh > 0 ? (d.kwh / maxKwh) * 100 : 0
          return (
            <div key={name} style={{
              background: "rgba(0,0,0,0.25)", border: `1px solid ${color}30`,
              borderRadius: 14, padding: "20px",
              position: "relative" as const, overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${color},transparent)` }} />
              <div style={{ fontSize: 11, color, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 12 }}>{name}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Intensity</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color }}>
                    {d.kwh_per_unit.toFixed(3)}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>kWh / unit</div>
                </div>
                <RiskBadge level={d.efficiency === "Good" ? "LOW" : d.efficiency === "Moderate" ? "MODERATE" : "HIGH"} />
              </div>
              <StatRow label="Units Produced" value={d.units.toLocaleString()} />
              <StatRow label="Total kWh" value={`${d.kwh.toFixed(0)} kWh`} color={color} mono />
              {/* Relative bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                  <div style={{
                    height: "100%", width: `${barW}%`,
                    background: `linear-gradient(90deg,${color}88,${color})`,
                    borderRadius: 3, boxShadow: `0 0 8px ${color}44`,
                    transition: "width 0.6s",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>Relative to peak shift</div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// NEW: ML insight strip for industrial
function MLIndustrialStrip({ ml }: { ml: any }) {
  if (!ml) return null
  const anomalyColor = ml.anomaly_score > 70 ? C.red : ml.anomaly_score > 40 ? C.accent : C.green
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
      {[
        { label: "Anomaly Score", value: `${ml.anomaly_score}%`, color: anomalyColor, sub: ml.anomaly_score > 70 ? "⚠ Spike detected" : "Normal operation" },
        { label: "HMM Load State", value: ml.hmm_state, color: C.purple, sub: "Consumption regime" },
        { label: "LSTM Next kW", value: ml.lstm_next_kw > 0 ? `${ml.lstm_next_kw} kW` : "—", color: C.blue, sub: "Short-term forecast" },
      ].map((item, i) => (
        <div key={i} style={{
          background: C.surface, border: `1px solid ${item.color}20`,
          borderRadius: 12, padding: "18px 20px", position: "relative" as const, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${item.color},transparent)` }} />
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>{item.label}</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 700, color: item.color, textTransform: "uppercase" as const }}>{item.value}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{item.sub}</div>
        </div>
      ))}
    </div>
  )
}

export default function IndustrialDashboard() {
  const [data, setData] = useState<any>(null)
  const [liveHistory, setLiveHistory] = useState<{ t: number; demand: number; lstm: number }[]>([])
  const [tick, setTick] = useState(0)
  const [spikeActive, setSpikeActive] = useState(false)
  const [spikeCountdown, setSpikeCountdown] = useState(0)
  const phaseColors = { R: C.red, Y: C.accent, B: C.blue }

  const stableShift = useRef<number | null>(null)
  const stableSavings = useRef<number | null>(null)
  const lastExcessKva = useRef<number | null>(null)

  const triggerSpike = async () => {
    await fetch("http://127.0.0.1:8000/industrial-spike", { method: "POST" })
    setSpikeActive(true)
    setSpikeCountdown(20)
    const iv = setInterval(() => {
      setSpikeCountdown(c => {
        if (c <= 1) { clearInterval(iv); setSpikeActive(false); return 0 }
        return c - 1
      })
    }, 1000)
    // Reset stable refs so savings update to reflect the spike
    stableShift.current = null
    stableSavings.current = null
    lastExcessKva.current = null
  }

  const resetPeak = async () => {
    await fetch("http://127.0.0.1:8000/industrial-reset", { method: "POST" })
    stableShift.current = null
    stableSavings.current = null
    lastExcessKva.current = null
    setSpikeActive(false)
  }

  useEffect(() => {
    const doFetch = () => {
      fetch("http://127.0.0.1:8000/industrial-dashboard")
        .then(r => r.json()).then((d: any) => {

          // ── Lock savings — only update when excess changes by > 10 kVA ──
          // This stops estimated_savings flickering while peak_demand is
          // now correctly tracked server-side (session peak, never resets down).
          const excess = d.excess_kva ?? 0
          const prevExcess = lastExcessKva.current
          const bigChange = prevExcess === null || Math.abs(excess - prevExcess) > 10

          if (bigChange) {
            stableShift.current = d.suggested_load_shift
            stableSavings.current = d.estimated_savings
            lastExcessKva.current = excess
          }

          d.suggested_load_shift = stableShift.current ?? d.suggested_load_shift
          d.estimated_savings = stableSavings.current ?? d.estimated_savings

          setData(d)
          setTick(t => {
            const next = t + 1
            setLiveHistory(prev => [...prev.slice(-40), {
              t: next,
              demand: d.current_demand,
              lstm: d.ml?.lstm_next_kw ? d.ml.lstm_next_kw * 1000 : 0,
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

  const forecastData = (data.forecast || []).map((f: any) => ({
    ...f,
    demand: typeof f.demand === "number" ? Math.round(f.demand) : f.demand,
  }))

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
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.15em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>INDUSTRIAL DASHBOARD</div>
          <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Industrial Intelligence</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Demand monitoring · Penalty control · ML-guided forecasting</p>
        </div>

        {/* ── Demo Control Bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 14,
          padding: "14px 20px", borderRadius: 14, marginBottom: 28,
          background: spikeActive ? "rgba(255,82,82,0.08)" : "rgba(255,159,0,0.05)",
          border: `1px solid ${spikeActive ? C.red + "50" : C.accent + "25"}`,
          transition: "all 0.4s",
        }}>
          <div style={{ fontSize: 18 }}>{spikeActive ? "⚡" : "🎮"}</div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: spikeActive ? C.red : C.accent,
              fontFamily: "'Orbitron',monospace", letterSpacing: "0.1em", marginBottom: 2
            }}>
              {spikeActive ? `PEAK EVENT ACTIVE — AUTO-RESET IN ${spikeCountdown}s` : "DEMO CONTROLS"}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              {spikeActive
                ? "Demand spiked to 720 kVA — penalty and AI shaving recommendations are now live"
                : "Simulate a peak demand event to demonstrate AI peak shaving to judges"}
            </div>
          </div>
          <button onClick={triggerSpike} disabled={spikeActive} style={{
            padding: "9px 20px", borderRadius: 10, cursor: spikeActive ? "not-allowed" : "pointer",
            background: spikeActive ? "rgba(255,82,82,0.1)" : "rgba(255,82,82,0.15)",
            border: `1px solid ${C.red}${spikeActive ? "30" : "60"}`,
            color: spikeActive ? C.muted : C.red,
            fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            opacity: spikeActive ? 0.5 : 1, transition: "all 0.2s",
          }}>⚡ TRIGGER SPIKE</button>
          <button onClick={resetPeak} style={{
            padding: "9px 20px", borderRadius: 10, cursor: "pointer",
            background: "rgba(57,255,20,0.07)", border: `1px solid ${C.green}30`,
            color: C.green, fontFamily: "'Orbitron',monospace",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          }}>↺ RESET PEAK</button>
        </div>

        {/* ML Strip — NEW */}
        <MLIndustrialStrip ml={data.ml} />

        {/* Predictive Maintenance Alerts — NEW */}
        {data.predictive_maintenance && data.predictive_maintenance.map((pm: any, idx: number) => {
          if (pm.alert === "Healthy") return null;
          return (
            <div key={idx} style={{
              background: "rgba(255,82,82,0.1)", border: `1px solid ${C.red}`, borderRadius: 12, padding: "16px 24px", marginBottom: 24, display: "flex", alignItems: "center", gap: 16
            }}>
              <div style={{ fontSize: 24 }}>🚨</div>
              <div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color: C.red, letterSpacing: "0.1em", marginBottom: 4 }}>
                  PREDICTIVE MAINTENANCE ALERT
                </div>
                <div style={{ fontSize: 13, color: "#fff" }}>
                  {pm.alert}
                </div>
              </div>
            </div>
          )
        })}

        {/* Row 1: KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Current Demand", value: `${data.current_demand} kVA`, color: C.accent },
            { label: "Peak Demand", value: `${data.peak_demand} kVA`, color: data.peak_demand > data.contracted_demand ? C.red : C.green },
            { label: "Penalty", value: `₹${data.penalty?.toLocaleString()}`, color: data.penalty > 0 ? C.red : C.green },
            { label: "PF Penalty", value: `₹${data.pf_penalty?.toLocaleString()}`, color: data.pf_penalty > 0 ? C.red : C.green },
          ].map((k, i) => (
            <div key={i} style={{ background: C.surface, border: `1px solid ${k.color}25`, borderRadius: 14, padding: "20px 22px", position: "relative" as const, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${k.color},transparent)` }} />
              <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 24, fontWeight: 700, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Row 2: Demand Meter + Gauges */}
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 24, marginBottom: 24 }}>
          <SectionCard>
            <SectionTitle>Demand vs Contracted</SectionTitle>
            <DemandMeter current={data.current_demand} peak={data.peak_demand} contracted={data.contracted_demand} capacity={800} />
            <div style={{ marginTop: 20 }}>
              <StatRow label="Contracted Demand" value={`${data.contracted_demand} kVA`} color={C.accent} mono />
              <StatRow label="Current Demand" value={`${data.current_demand} kVA`} color={C.accent} mono />
              <StatRow label="Excess kVA" value={`${data.excess_kva} kVA`} color={data.excess_kva > 0 ? C.red : C.green} mono />
              <StatRow label="Transformer Load" value={`${data.transformer_load_percent}%`} color={data.transformer_load_percent > 90 ? C.red : data.transformer_load_percent > 75 ? C.accent : C.green} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12 }}>
                <span style={{ fontSize: 12, color: C.muted }}>Overload Risk</span>
                <RiskBadge level={data.overload_risk} />
              </div>
            </div>
          </SectionCard>

          <SectionCard>
            <SectionTitle>System Health Gauges</SectionTitle>
            <div style={{ display: "flex", justifyContent: "space-around" }}>
              <RadialGauge value={data.transformer_load_percent} max={100} unit="%" label="Transformer" color={C.green} warn={75} danger={90} />
              <RadialGauge value={Math.round(data.power_factor * 100)} max={100} unit="PF×100" label="Power Factor" color={C.green} warn={85} danger={80} />
            </div>
            <div style={{
              marginTop: 16, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: "14px 16px",
              borderLeft: `3px solid ${riskColor(data.downtime_risk)}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, letterSpacing: "0.08em" }}>
                  DOWNTIME RISK {data.ml ? "· ML-DRIVEN" : ""}
                </div>
                <div style={{ fontSize: 12, color: C.text }}>
                  Vibration index: {data.vibration_index ?? "—"}
                  {data.ml && <span style={{ color: C.muted }}> · Anomaly: {data.ml.anomaly_score}%</span>}
                </div>
              </div>
              <RiskBadge level={data.downtime_risk} />
            </div>
          </SectionCard>
        </div>

        {/* Row 3: Live Demand + LSTM-blended Forecast */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <SectionCard>
            <SectionTitle>Live Demand vs LSTM</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={liveHistory}>
                <defs>
                  <linearGradient id="demandGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,159,0,0.07)" />
                <XAxis dataKey="t" hide />
                <YAxis stroke={C.muted} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => [`${v} kVA`, n === "demand" ? "Actual" : "LSTM"]} />
                <ReferenceLine y={data.contracted_demand} stroke={C.accent} strokeDasharray="4 3"
                  label={{ value: "Contracted", fill: C.accent, fontSize: 10, position: "right" }} />
                <Line type="monotone" dataKey="demand" stroke={C.accent} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lstm" stroke={C.blue} strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard>
            <SectionTitle>Peak Demand Forecast (LSTM-blended)</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={forecastData}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.purple} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.purple} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(179,136,255,0.07)" />
                <XAxis dataKey="interval" stroke={C.muted} tick={{ fontSize: 10 }} />
                <YAxis stroke={C.muted} tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any) => [`${v} kVA`, "Forecast"]} />
                <ReferenceLine y={data.contracted_demand} stroke={C.accent} strokeDasharray="4 3"
                  label={{ value: "Contracted", fill: C.accent, fontSize: 10, position: "right" }} />
                <Area type="monotone" dataKey="demand" stroke={C.purple} fill="url(#forecastGrad)" strokeWidth={2} dot={{ fill: C.purple, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* Row 4: Phase Balance + AI Peak Shaving */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          <SectionCard>
            <SectionTitle>3-Phase Balance</SectionTitle>
            <PhaseBar phase="R" value={data.phases?.R ?? 0} color={phaseColors.R} />
            <PhaseBar phase="Y" value={data.phases?.Y ?? 0} color={phaseColors.Y} />
            <PhaseBar phase="B" value={data.phases?.B ?? 0} color={phaseColors.B} />
            <div style={{
              marginTop: 8, padding: "12px 16px", borderRadius: 10,
              background: data.imbalance_percent > 10 ? "rgba(255,82,82,0.08)" : "rgba(57,255,20,0.06)",
              border: `1px solid ${data.imbalance_percent > 10 ? C.red + "30" : C.green + "30"}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, color: C.muted }}>Phase Imbalance</span>
              <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: data.imbalance_percent > 10 ? C.red : C.green }}>
                {data.imbalance_percent}%
              </span>
            </div>
          </SectionCard>

          <SectionCard>
            <SectionTitle>AI Peak Shaving</SectionTitle>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "16px", textAlign: "center" as const, border: `1px solid ${C.blue}25` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, letterSpacing: "0.08em" }}>SUGGESTED SHIFT</div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: data.suggested_load_shift > 0 ? C.blue : C.green }}>
                  {data.suggested_load_shift > 0 ? data.suggested_load_shift : "—"}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {data.suggested_load_shift > 0 ? "kVA to defer" : "within limit"}
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "16px", textAlign: "center" as const, border: `1px solid ${data.estimated_savings > 0 ? C.green : "rgba(255,255,255,0.08)"}25` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8, letterSpacing: "0.08em" }}>EST. SAVINGS</div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 22, fontWeight: 700, color: data.estimated_savings > 0 ? C.green : C.muted }}>
                  {data.estimated_savings > 0 ? `₹${data.estimated_savings.toLocaleString()}` : "₹0"}
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>this billing period</div>
              </div>
            </div>

            {/* Context row */}
            <div style={{
              padding: "10px 14px", borderRadius: 10, marginBottom: 20,
              background: data.excess_kva > 0 ? "rgba(255,82,82,0.07)" : "rgba(57,255,20,0.06)",
              border: `1px solid ${data.excess_kva > 0 ? C.red + "30" : C.green + "30"}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 12, color: C.muted }}>
                {data.excess_kva > 0
                  ? `Excess: ${data.excess_kva} kVA over contracted limit`
                  : "Demand within contracted limit — no penalty"}
              </span>
              <span style={{
                fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700,
                color: data.excess_kva > 0 ? C.red : C.green
              }}>
                {data.excess_kva > 0 ? `+${data.excess_kva} kVA` : "✓ OK"}
              </span>
            </div>

            <SectionTitle>Production Efficiency</SectionTitle>
            <StatRow label="Units Produced" value={data.units_produced} />
            <StatRow label="Energy Cost / Unit" value={`${data.energy_cost_per_unit} kWh/unit`} mono color={C.accent} />
            <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(0,0,0,0.25)", border: `1px solid rgba(255,255,255,0.06)`, fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              <span style={{ fontFamily: "monospace", color: C.accent }}>Efficiency = kWh / units_produced</span><br />
              Lower value = better energy utilisation per output unit.
            </div>
          </SectionCard>
        </div>

        {/* Row 5: Phase Bar Chart */}
        <SectionCard>
          <SectionTitle>Phase Current Distribution</SectionTitle>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={[
              { phase: "R", value: data.phases?.R ?? 0 },
              { phase: "Y", value: data.phases?.Y ?? 0 },
              { phase: "B", value: data.phases?.B ?? 0 },
            ]} barSize={48}>
              <CartesianGrid stroke="rgba(255,159,0,0.06)" vertical={false} />
              <XAxis dataKey="phase" stroke={C.muted} tick={{ fontSize: 12, fontWeight: 700 }} />
              <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v}A`, "Current"]} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {["R", "Y", "B"].map((p, i) => (
                  <Cell key={i} fill={Object.values(phaseColors)[i]} style={{ filter: `drop-shadow(0 0 6px ${Object.values(phaseColors)[i]}66)` }} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* ── NEW: THDi per Phase ── */}
        {data.thdi && <THDiPanel thdi={data.thdi} />}

        {/* ── NEW: Demand Charge Calendar Heatmap ── */}
        {data.demand_heatmap && (
          <DemandHeatmap rows={data.demand_heatmap} contracted={data.contracted_demand} />
        )}

        {/* ── NEW: Shift-wise Energy Intensity ── */}
        {data.shift_energy && <ShiftEnergy shifts={data.shift_energy} />}

      </div>
    </>
  )
}