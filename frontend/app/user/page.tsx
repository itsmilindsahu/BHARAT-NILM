"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { SimulationBanner } from "../components/SimulationBanner"
import { StationScene } from "../components/StationScene"
import { API_URL } from "../lib/api"

// ─── Palette ──────────────────────────────────────────────
const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(0,229,255,0.14)",
  accent: "#00e5ff",
  blue: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  red: "#ff5252",
  purple: "#b388ff",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.55)",
}
const CHANNELS = ["Heating", "Life Support", "Comms", "Labs", "Kitchen-Mess"]
const MODULES = ["Lab Module", "Comms Backup", "Non-Essential Heating Zone", "Garage/Vehicle Bay"]
const INITIAL_SWITCHES: Record<string, boolean> = {
  "Lab Module": true,
  "Comms Backup": true,
  "Non-Essential Heating Zone": true,
  "Garage/Vehicle Bay": false,
}

const stationHistoryData = [
  { time: "00", Heating: 12, "Life Support": 18, Comms: 14, Labs: 11, "Kitchen-Mess": 8 },
  { time: "10", Heating: 14, "Life Support": 19, Comms: 16, Labs: 12, "Kitchen-Mess": 9 },
  { time: "20", Heating: 15, "Life Support": 20, Comms: 17, Labs: 13, "Kitchen-Mess": 10 },
  { time: "30", Heating: 16, "Life Support": 21, Comms: 18, Labs: 15, "Kitchen-Mess": 12 },
  { time: "40", Heating: 17, "Life Support": 21, Comms: 19, Labs: 16, "Kitchen-Mess": 12 },
  { time: "50", Heating: 18, "Life Support": 23, Comms: 17, Labs: 16, "Kitchen-Mess": 11 },
  { time: "60", Heating: 17, "Life Support": 22, Comms: 16, Labs: 15, "Kitchen-Mess": 10 },
]

const reactiveHistory = [
  { time: "00", kVA: 18 }, { time: "10", kVA: 20 }, { time: "20", kVA: 22 }, { time: "30", kVA: 21 }, { time: "40", kVA: 24 }, { time: "50", kVA: 20 }, { time: "60", kVA: 19 },
]

// ─── Savings model (client-side estimate, clearly labeled) ─
const GRID_TARIFF_PER_KWH = 22 // ₹ per kWh equivalent cost of running that load on genset power
const CO2_KG_PER_KWH = 0.85    // kg CO2 per kWh of diesel-genset electricity
const SESSION_KWH_KEY = "nilm_station_ops_energy_saved_kwh"
function readSessionNumber(key: string) {
  if (typeof window === "undefined") return 0
  const raw = window.sessionStorage.getItem(key)
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
function writeSessionNumber(key: string, value: number) {
  if (typeof window === "undefined") return
  try { window.sessionStorage.setItem(key, String(value)) } catch {}
}

type StationData = {
  station_loads?: Record<string, number>
  total_load?: number
  ml?: any
  simulation?: { blizzard_mode: boolean; polar_night: boolean }
  smart_alarms?: string[]
  occupancy?: any
  [key: string]: any
}

import { LiveChangesTicker, useTelemetryTickerTracker } from "../components/ui"

// ─── Hooks ──────────────────────────────────────────────────
function useSmoothNumber(target: number, duration = 200) {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  useEffect(() => {
    const from = prevRef.current
    const to = Number.isFinite(target) ? target : 0
    if (from === to) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (to - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function useAccumulatedKwh(instantKw: number) {
  const [total, setTotal] = useState<number>(() => {
    const saved = readSessionNumber(SESSION_KWH_KEY)
    return saved > 0 ? saved : 1.2
  })
  const lastRef = useRef<number>(Date.now())
  const instantRef = useRef<number>(instantKw)
  instantRef.current = instantKw

  useEffect(() => {
    lastRef.current = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const seconds = Math.max(0.1, (now - lastRef.current) / 1000)
      lastRef.current = now
      const rate = Math.max(0, instantRef.current)
      if (rate > 0) {
        const hours = seconds / 3600
        const delta = rate * hours
        setTotal(prev => {
          const current = readSessionNumber(SESSION_KWH_KEY) || prev
          const next = current + delta
          writeSessionNumber(SESSION_KWH_KEY, next)
          return next
        })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return total
}

const fmt = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "0"

function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const smooth = useSmoothNumber(value, 200)
  return <span>{fmt(smooth, decimals)}</span>
}

function Sparkline({ points, color = C.accent }: { points: number[]; color?: string }) {
  const data = points.map((value, idx) => ({ value, idx }))
  return (
    <div style={{ height: 34, width: "100%", marginTop: 8 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} animationDuration={180} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── UI primitives ──────────────────────────────────────────
function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="be-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <h2 style={{ color: "#fff", fontSize: 13, letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>{title}</h2>
        {badge && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 10px", borderRadius: 100, background: `${C.green}15`, border: `1px solid ${C.green}35`, color: C.green }}>{badge}</span>}
      </div>
      {children}
    </section>
  )
}
function Metric({ label, value, color = C.accent, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="be-metric" style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${color}35`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, marginTop: 6, fontFamily: "'Oxanium', 'Inter', 'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 10, marginTop: 4, fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>{sub}</div>}
    </div>
  )
}

function AnimatedKpiMetric({ label, value, color = C.accent, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="be-metric" style={{ background: "rgba(0,0,0,0.22)", border: `1px solid ${color}35`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
      <span style={{ position: "absolute", left: 0, top: 0, height: 2, width: "55%", background: color, boxShadow: `0 0 14px ${color}`, opacity: 0.9 }} />
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, marginTop: 6, fontFamily: "'Oxanium', 'Inter', 'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: C.muted, fontSize: 10, marginTop: 4, fontFamily: "Inter, Segoe UI, Arial, sans-serif" }}>{sub}</div>}
    </div>
  )
}

function LiveImpactStrip({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  return (
    <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 12, marginBottom: 18 }}>
      {items.map((item, idx) => (
        <div key={item.label} className="be-metric" style={{ background: "rgba(255,255,255,0.035)", border: `1px solid ${item.color}30`, borderRadius: 14, padding: "16px 16px", minHeight: 86, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, height: 2, width: `${56 + idx * 12}%`, background: item.color, boxShadow: `0 0 14px ${item.color}` }} />
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>{item.label}</div>
          <div style={{ color: item.color, fontSize: 23, fontWeight: 800, marginTop: 10, fontFamily: "'JetBrains Mono',monospace" }}>{item.value}</div>
        </div>
      ))}
    </section>
  )
}

export default function StationOpsPage() {
  const [data, setData] = useState<StationData | null>(null)
  const [switches, setSwitches] = useState<Record<string, boolean>>(INITIAL_SWITCHES)
  const [upgrade, setUpgrade] = useState<any>(null)
  const [upgradeType, setUpgradeType] = useState("module_insulation")
  const [running, setRunning] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/station-dashboard`)
        .then(r => r.json())
        .then(d => { setData(d); setLastUpdated(new Date()) })
        .catch(() => {})
    load()
    const timer = setInterval(load, 1200)
    return () => clearInterval(timer)
  }, [])

  const toggleModule = (module: string) => {
    const enabled = !switches[module]
    setSwitches(prev => ({ ...prev, [module]: enabled }))
    fetch(`${API_URL}/toggle-device`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: module, status: enabled }) }).catch(() => {})
  }
  const runUpgrade = () => {
    setRunning(true)
    fetch(`${API_URL}/simulate-upgrade?module=Lab%20Module&upgrade_type=${upgradeType}`)
      .then(r => r.json())
      .then(setUpgrade)
      .catch(() => {})
      .finally(() => setRunning(false))
  }

  const loads = data?.station_loads ?? Object.fromEntries(CHANNELS.map(channel => [channel, 0]))
  const total = data?.total_load ?? Object.values(loads).reduce((sum, value) => sum + Number(value), 0)
  const crewRegime = data?.occupancy?.state ?? "Full Winter-Over Crew"
  const faultAlert = data?.smart_alarms?.[0] ?? "No equipment fault flags"

  const totalDisplay = useSmoothNumber(Math.round(total), 200)

  // Real-time telemetry changes ticker
  const tickerItems = useTelemetryTickerTracker({
    "Station Load": { val: Math.round(total), unit: "kW", invert: true },
    "Heating": { val: Number(loads["Heating"] ?? 0), unit: "kW", invert: true },
    "Life Support": { val: Number(loads["Life Support"] ?? 0), unit: "kW", invert: true },
    "Comms": { val: Number(loads["Comms"] ?? 0), unit: "kW", invert: true },
    "Labs": { val: Number(loads["Labs"] ?? 0), unit: "kW", invert: true },
    "Fault Score": { val: Math.round(data?.ml?.anomaly_score ?? 0), unit: "%", invert: true },
  })

  // shed-eligible modules currently toggled off = "reclaimable" standby load
  const shedActiveKw = MODULES.reduce((sum, m) => sum + (switches[m] ? 6 : 0), 0) // 6 kW nominal per shed module, adjust to real telemetry
  const shedSavedKwh = useAccumulatedKwh(shedActiveKw)
  const shedSavedRupees = shedSavedKwh * GRID_TARIFF_PER_KWH
  const shedSavedCo2 = shedSavedKwh * CO2_KG_PER_KWH
  const vampireNow = 8 + 3 * 3 + (data?.simulation?.polar_night ? 7 : 0) // matches the 18–24 band metric below, as an "always-on now" figure
  const projectedMonthlyRupees = vampireNow * 24 * 30 * GRID_TARIFF_PER_KWH * 0.35 // 35% assumed recoverable share of standby load

  if (!data) return <main style={{ minHeight: "100vh", background: C.bg, color: C.accent, padding: 80, textAlign: "center" }}>LOADING STATION TELEMETRY...</main>

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "38px 28px 80px", color: C.text, animation: "beFadeUp 0.5s ease" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes beFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes slideGlow { from { opacity: 0.72; filter: blur(0); } 50% { opacity: 1; filter: blur(0.5px); } to { opacity: 0.85; filter: blur(0); } }
        .be-card { animation: beFadeUp 0.35s ease both; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
        .be-card:hover { border-color: rgba(0,229,255,0.4); box-shadow: 0 8px 34px rgba(0,229,255,0.10); transform: translateY(-2px); }
        .be-metric { transition: border-color 0.2s ease, transform 0.18s ease, box-shadow 0.2s ease; }
        .be-metric:hover { transform: translateY(-1px); box-shadow: 0 0 12px rgba(0,229,255,0.08); }
        .be-switch { transition: background 0.18s ease, border-color 0.18s ease, transform 0.15s ease; }
        .be-switch:hover { transform: translateY(-1px); }
        .be-btn { transition: background 0.18s ease, transform 0.15s ease; }
        .be-btn:hover { transform: translateY(-1px); }
      `}</style>

      <header style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: "0.15em" }}>STATION OPS</div>
          <h1 style={{ color: "#fff", fontSize: 32, margin: "8px 0", fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontStyle: "normal", fontWeight: 700 }}>Polar Station Operations</h1>
          <p style={{ color: C.muted, margin: 0, maxWidth: 560 }}>Critical-load prioritization, crew regime, equipment status, and module control.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: "bePulse 1.6s infinite" }} />
          {lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </div>
      </header>

      <SimulationBanner focus="ops" />

      <LiveChangesTicker items={tickerItems} />

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>
        {[
          { label: "Total Station Load", value: total, valueUnit: "kW", color: C.accent, number: totalDisplay, spark: [40,52,46,54,62,58,60,70] },
          { label: "Crew Regime", value: crewRegime, valueUnit: "", color: C.purple, number: 0, spark: [30,38,37,44,46,42,45,50] },
          { label: "Operating Regime", value: data.ml?.rf_regime ?? "unknown", valueUnit: "", color: C.green, number: 0, spark: [50,45,54,48,53,51,56,50] },
          { label: "Fault Score", value: `${Math.round(data.ml?.anomaly_score ?? 0)}%`, valueUnit: "%", color: data.ml?.is_anomaly ? C.red : C.green, number: data.ml?.anomaly_score ?? 0, spark: [42,44,48,40,45,50,47,43] },
        ].map((k, idx) => (
          <article key={k.label} className="be-card" style={{ background: C.surface, border: `1px solid ${k.color}40`, borderRadius: 14, padding: 16, minHeight: 170, boxShadow: `0 0 12px ${k.color}10`, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.label}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: "bePulse 1.6s infinite" }} />
            </div>
            <div style={{ color: k.color, fontSize: 26, fontWeight: 800, fontFamily: "'Oxanium', 'JetBrains Mono', monospace", marginTop: 12 }}>
              {k.label === "Total Station Load" ? <AnimatedNumber value={Math.round(totalDisplay)} decimals={0} /> : k.label === "Crew Regime" ? crewRegime : k.label === "Operating Regime" ? (data.ml?.rf_regime ?? "unknown") : <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><AnimatedNumber value={Math.round(data.ml?.anomaly_score ?? 0)} decimals={0} />%</span>}{k.label !== "Crew Regime" && k.label !== "Operating Regime" && k.label !== "Fault Score" ? ` ${k.valueUnit}` : ""}
            </div>
            {k.label === "Fault Score" && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span style={{ width: 34, height: 34, borderRadius: "50%", display: "inline-block", background: `conic-gradient(${C.green} ${Math.min(100, Math.round(data.ml?.anomaly_score ?? 0))}%, rgba(255,255,255,.05) 0)`, border: `1px solid ${C.border}`, boxShadow: `0 0 12px ${C.green}30` }} />
              </div>
            )}
            <div style={{ height: 44, width: "100%", marginTop: 8, border: "1px solid rgba(255,255,255,0.03)", borderRadius: 7 }}>
              <Sparkline points={k.spark} color={k.color} />
            </div>
          </article>
        ))}
      </section>

      <Card title="Station load disaggregation — live" badge="LIVE">
        <div style={{ height: 180, marginBottom: 16 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stationHistoryData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="1 1" stroke="rgba(200,219,232,0.08)" />
              <XAxis dataKey="time" stroke={C.muted} fontSize={10} />
              <YAxis stroke={C.muted} fontSize={10} />
              <Tooltip />
              <Area type="monotone" dataKey="Heating" stroke={C.amber} fill={C.amber} fillOpacity={0.18} strokeWidth={2} animationDuration={420} />
              <Area type="monotone" dataKey="Life Support" stroke={C.red} fill={C.red} fillOpacity={0.12} strokeWidth={2} animationDuration={420} />
              <Area type="monotone" dataKey="Comms" stroke={C.accent} fill={C.accent} fillOpacity={0.12} strokeWidth={2} animationDuration={420} />
              <Area type="monotone" dataKey="Labs" stroke={C.purple} fill={C.purple} fillOpacity={0.12} strokeWidth={2} animationDuration={420} />
              <Area type="monotone" dataKey="Kitchen-Mess" stroke={C.green} fill={C.green} fillOpacity={0.12} strokeWidth={2} animationDuration={420} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          {CHANNELS.map((channel, index) => {
            const value = Number(loads[channel] ?? loads[channel.toLowerCase().replace("-mess", "")] ?? 0)
            const colors = [C.amber, C.red, C.accent, C.purple, C.green]
            const channelMax = Math.max(...CHANNELS.map(ch => Number(loads[ch] ?? 0)), 1)
            const pct = Math.min(100, Math.max(4, (value / Math.max(channelMax, 1)) * 100))
            return (
              <div key={channel}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 12, marginBottom: 6, color: C.text }}>
                  <span style={{ flex: 1, color: colors[index], fontWeight: 700 }}>{channel}</span>
                  <strong style={{ width: 78, color: colors[index], fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}><AnimatedNumber value={value} decimals={1} /> kW</strong>
                </div>
                <div style={{ height: 11, background: "rgba(255,255,255,0.065)", borderRadius: 7, overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="be-channel-bar" style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${colors[index]}, ${C.accent})`, borderRadius: 7, transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card title="Load-shedding impact — this session" badge="LIVE ESTIMATE">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <AnimatedKpiMetric label="Load shed now" value={`${shedActiveKw} kW`} color={C.amber} sub={`${Object.values(switches).filter(Boolean).length} module(s) shed`} />
          <AnimatedKpiMetric label="Energy saved" value={`${fmt(shedSavedKwh)} kWh`} color={C.green} />
          <AnimatedKpiMetric label="Cost saved" value={`₹${fmt(shedSavedRupees, 0)}`} color={C.accent} sub={`@ ₹${GRID_TARIFF_PER_KWH}/kWh genset-equivalent`} />
          <AnimatedKpiMetric label="Projected monthly recoverable" value={`₹${fmt(projectedMonthlyRupees, 0)}`} color={C.blue} sub="from standby/vampire load alone" />
        </div>
        <p style={{ color: C.muted, fontSize: 10.5, margin: "14px 0 0", lineHeight: 1.6 }}>
          Live figures track modules you shed below; the monthly projection assumes ~35% of current standby load is realistically recoverable through scheduling. CO₂ avoided this session: <strong style={{ color: C.green }}>{fmt(shedSavedCo2)} kg</strong>.
        </p>
      </Card>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(440px, 1.8fr) minmax(420px, 1.4fr)", gap: 18, alignItems: "stretch" }}>
        <article style={{ width: "100%" }}>
          <Card title="AI smart recommendations + module load-shedding switches">
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div style={{ display: "grid", gap: 8 }}>
                {[{text: "Defer non-essential lab load during the current diesel-only window.", severity: "info"}, {text: "Heating demand rising with ambient temperature drop; check insulation zone 3.", severity: "warning"}, {text: "Keep life-support and comms backup above the emergency dispatch threshold.", severity: "info"}, {text: faultAlert, severity: "warning"}].map((r, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, background: idx === 0 ? "rgba(255,179,0,0.08)" : "rgba(255,255,255,0.025)", border: `1px solid ${idx === 0 ? C.amber : C.border}`, borderRadius: 10, padding: "9px 11px" }}>
                    <span style={{ width: 24, height: 24, borderRadius: "50%", background: r.severity === "warning" ? `${C.red}22` : `${C.accent}22`, color: r.severity === "warning" ? C.red : C.accent, border: `1px solid ${r.severity === "warning" ? C.red : C.accent}66`, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>{r.severity === "warning" ? "!" : "i"}</span>
                    <span style={{ color: C.text, fontSize: 11, lineHeight: 1.45 }}>{r.text}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(180px, 1fr))", gap: 12 }}>
                {MODULES.map(module => {
                  const isOn = Boolean(switches[module])
                  return (
                    <button key={module} onClick={() => toggleModule(module)} className="be-switch" style={{ textAlign: "left", padding: "16px 18px", borderRadius: 12, border: `1px solid ${isOn ? C.amber : C.border}`, background: isOn ? "rgba(255,179,0,0.12)" : "rgba(0,0,0,0.22)", color: isOn ? C.amber : C.text, cursor: "pointer", boxShadow: isOn ? `0 0 0 1px ${C.amber}33 inset, 0 0 15px ${C.amber}12` : "none", minHeight: 84, display: "flex", flexDirection: "column", justifyContent: "center", transition: "all 260ms ease" }}>
                      <strong style={{ fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontSize: 14, fontWeight: 700 }}>{module}</strong>
                      <div style={{ fontSize: 10, marginTop: 7, color: isOn ? C.amber : C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{isOn ? "LOAD SHED REQUESTED · ~6 kW reclaimed" : "AVAILABLE FOR SHEDDING"}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(170px, 1fr))", gap: 12, marginTop: 18 }}>
        <Card title="Station Load Health & Intelligence">
          <div style={{ display: "grid", gap: 10 }}>
            {CHANNELS.map((channel, index) => {
              const emphasized = index === 0 && data.simulation?.blizzard_mode
              return (
                <div key={channel} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140, color: C.text }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: emphasized ? C.amber : C.green, boxShadow: `0 0 5px ${emphasized ? C.amber : C.green}`, display: "inline-block" }} />
                    <span>{channel}</span>
                  </span>
                  <span style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, flex: 1 }}>
                    <span className="be-status-pill" style={{ background: emphasized ? `${C.amber}22` : `${C.green}22`, border: `1px solid ${emphasized ? C.amber : C.green}66`, color: emphasized ? C.amber : C.green, padding: "2px 10px", borderRadius: 20, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>{emphasized ? "Insulation review" : "Nominal"}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card title="Reactive & Apparent Power">
          <div style={{ display: "grid", gap: 10 }}>
            {CHANNELS.map((channel, index) => {
              const value = Number(loads[channel] ?? 0)
              const trend = index % 2 === 0 ? "↑" : "↓"
              const dataSpark = [Math.max(0.7, value * .82), value * 1.03, value * 1.06, value * 1.01, value * .96]
              return (
                <div key={channel} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 10 }}>
                  <span style={{ color: C.text }}>{channel}</span>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, color: C.accent, flex: 1 }}>
                    <span style={{ color: index % 2 === 0 ? C.green : C.muted, fontSize: 11, fontWeight: 700, minWidth: 14 }}>{trend}</span>
                    <span>{(value * 1.08).toFixed(1)} kVA · PF {index < 2 ? "0.88" : "0.96"}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card title="Standby / Vampire Load">
          <div style={{ height: 110, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[{time:"00", value:8},{time:"06", value:10},{time:"12", value:12},{time:"18", value:15},{time:"24", value:11}]} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <Line type="monotone" dataKey="value" stroke={C.purple} strokeWidth={2} dot={{r:3,fill:C.purple}} animationDuration={440} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Duty Cycle">
          <div style={{ display: "grid", gap: 11 }}>
            {CHANNELS.map((channel, index) => {
              const pct = index === 1 ? 100 : 54 + index * 8
              const width = Math.max(12, Math.min(100, pct))
              return (
                <div key={channel} style={{ display: "flex", alignItems: "center", fontSize: 12, gap: 12 }}>
                  <span style={{ minWidth: 110, color: C.text }}>{channel}</span>
                  <span style={{ display: "flex", alignItems: "center", flex: 1, gap: 8, justifyContent: "flex-end" }}>
                    <span style={{ height: 4, width: 84, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden", display: "inline-block", border: `1px solid ${C.border}` }}>
                      <span style={{ display: "block", height: "100%", width: `${width}%`, background: index === 0 ? C.amber : index === 1 ? C.red : index === 2 ? C.accent : index === 3 ? C.purple : C.green, borderRadius: 4 }} />
                    </span>
                    <strong style={{ color: C.green, minWidth: 44, textAlign: "right" }}><AnimatedNumber value={pct} decimals={0} />%</strong>
                  </span>
                </div>
              )
            })}
          </div>
        </Card>
        <Card title="Crew Regime">
          <div style={{ color: C.purple, fontSize: 24, fontWeight: 700, marginBottom: 10, fontFamily: "'Instrument Serif',serif", fontStyle: "italic" }}>{crewRegime}</div>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: 0 }}>The hidden Markov model tracks station operating patterns. Load planning follows crew presence and mission season.</p>
          <div style={{ marginTop: 16, color: C.text, fontSize: 12 }}>Weather regime: <strong>{data.ml?.hmm_regime ?? "calm"}</strong></div>
        </Card>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
        <Card title="What-if simulator — station efficiency upgrades">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={upgradeType} onChange={event => setUpgradeType(event.target.value)} style={{ background: "#0a1929", color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10 }}>
              <option value="module_insulation">Module insulation upgrade</option>
              <option value="heater_efficiency">Heater efficiency upgrade</option>
            </select>
            <button onClick={runUpgrade} disabled={running} className="be-btn" style={{ background: `${C.accent}18`, color: C.accent, border: `1px solid ${C.accent}55`, borderRadius: 8, padding: "10px 16px", cursor: running ? "wait" : "pointer" }}>
              {running ? "RUNNING…" : "RUN SCENARIO"}
            </button>
            {upgrade && <span style={{ color: C.green, fontSize: 12 }}>Projected reduction: {upgrade.reduction_pct}% · {upgrade.target_w} W target load</span>}
          </div>
        </Card>

        <Card title="Station module scene">
          <StationScene />
        </Card>
      </section>
    </main>
  )
}