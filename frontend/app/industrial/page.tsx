"use client"

import { useEffect, useRef, useState } from "react"
import { SimulationBanner } from "../components/SimulationBanner"
import { LiveChangesTicker, HeroKpiSparklineRow, AIRecommendationsPanel, useTelemetryTickerTracker } from "../components/ui"
import { useMemo } from "react"
import { API_URL } from "../lib/api"

// ─── Palette ──────────────────────────────────────────────
const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(255,159,0,0.16)",
  accent: "#ff9f00",
  blue: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  red: "#ff5252",
  purple: "#b388ff",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.55)",
}

// ─── Savings model (client-side estimate, clearly labeled) ─
const DIESEL_PRICE_PER_L = 96      // ₹ per litre, indicative
const DIESEL_L_PER_KWH = 0.32      // litres of diesel to generate 1 kWh on genset
const CO2_KG_PER_L = 2.68          // kg CO2 per litre diesel burned

const SESSION_LITERS_KEY = "nilm_renewable_microgrid_diesel_liters_saved"
function readSessionNumber(key: string) {
  if (typeof window === "undefined") return 0
  const raw = window.sessionStorage.getItem(key)
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}
function writeSessionNumber(key: string, value: number) {
  if (typeof window === "undefined") return
  try { window.sessionStorage.setItem(key, String(value)) } catch { }
}

// ─── Hooks: smooth number + running accumulator ────────────
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

function useAccumulatedLiters(instantLph: number) {
  const [total, setTotal] = useState<number>(() => {
    const saved = readSessionNumber(SESSION_LITERS_KEY)
    return saved > 0 ? saved : 1.8
  })
  const lastRef = useRef<number>(Date.now())
  const instantRef = useRef<number>(instantLph)
  instantRef.current = instantLph

  useEffect(() => {
    lastRef.current = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const elapsedSeconds = Math.max(0.1, (now - lastRef.current) / 1000)
      lastRef.current = now
      const rate = Math.max(0, instantRef.current)
      if (rate > 0) {
        const hours = elapsedSeconds / 3600
        const delta = rate * hours
        setTotal(prev => {
          const current = readSessionNumber(SESSION_LITERS_KEY) || prev
          const next = current + delta
          writeSessionNumber(SESSION_LITERS_KEY, next)
          return next
        })
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const resetLiters = () => {
    writeSessionNumber(SESSION_LITERS_KEY, 0)
    setTotal(0)
  }

  return [total, resetLiters] as const
}

const fmt = (n: number, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "0"

// ─── UI primitives ──────────────────────────────────────────
function Card({ title, badge, children, live = false }: { title: string; badge?: string; children: React.ReactNode; live?: boolean }) {
  return (
    <section className="be-card" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 22, marginBottom: 18, position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {live && <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: "bePulse 1.6s infinite", display: "inline-block" }} />}
          <h2 style={{ color: "#fff", fontSize: 13, letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>{title}</h2>
        </div>
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
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 6, margin: "18px 0 8px", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 6, transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
    </div>
  )
}

export default function RenewableMicrogridPage() {
  const [data, setData] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/renewable-dashboard`)
        .then(r => r.json())
        .then(d => {
          setData(d)
          setLastUpdated(new Date())
          setHistory(prev => [...prev.slice(-23), { label: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), renewable: d.renewable_utilization_pct ?? 0 }])
        })
        .catch(() => { })
    load()
    const timer = setInterval(load, 1200)
    return () => clearInterval(timer)
  }, [])

  const mix = data?.renewable_mix ?? { wind_kw: 0, solar_kw: 0, diesel_kw: data?.current_demand ?? 0 }
  const gensetCap = data?.genset_capacity_kw ?? 240
  const margin = Math.max(0, gensetCap - (mix.diesel_kw ?? 0))
  const renewableKw = (mix.wind_kw ?? 0) + (mix.solar_kw ?? 0)

  // smoothed display values
  const windDisplay = useSmoothNumber(mix.wind_kw ?? 0)
  const solarDisplay = useSmoothNumber(mix.solar_kw ?? 0)
  const dieselDisplay = useSmoothNumber(mix.diesel_kw ?? 0)
  const socDisplay = useSmoothNumber(Math.round((data?.battery_soc ?? 0) * 100))
  const utilDisplay = useSmoothNumber(data?.renewable_utilization_pct ?? 0)

  // live diesel-avoided rate & continuous session accumulation
  const dieselAvoidedLph = renewableKw * DIESEL_L_PER_KWH
  const [litersAvoided, resetLiters] = useAccumulatedLiters(dieselAvoidedLph)
  const rupeesSaved = litersAvoided * DIESEL_PRICE_PER_L
  const co2Avoided = litersAvoided * CO2_KG_PER_L

  // Real-time ticker entries based on genuine telemetry changes
  const tickerItems = useTelemetryTickerTracker({
    "Wind": { val: Number(mix.wind_kw ?? 0), unit: "kW" },
    "Solar": { val: Number(mix.solar_kw ?? 0), unit: "kW" },
    "Diesel Draw": { val: Number(mix.diesel_kw ?? 0), unit: "kW", invert: true },
    "Battery SOC": { val: Math.round((data?.battery_soc ?? 0) * 100), unit: "%" },
    "Diesel Avoided": { val: Math.round(litersAvoided * 10) / 10, unit: "L" },
  })

  // Hero KPI Sparkline Row (4-card pattern: Wind, Solar, Diesel, Battery SOC)
  const heroKpiRows = [
    { label: "Wind", value: `${fmt(windDisplay)}`, valueUnit: "kW", color: C.blue, spark: [26, 32, 30, 36, 40, 38, 42, Math.round(mix.wind_kw ?? 38)] },
    { label: "Solar", value: `${fmt(solarDisplay)}`, valueUnit: "kW", color: C.accent, spark: [12, 18, 22, 24, 20, 22, 21, Math.round(mix.solar_kw ?? 22)] },
    { label: "Diesel", value: `${fmt(dieselDisplay)}`, valueUnit: "kW", color: C.red, spark: [58, 64, 60, 52, 48, 54, 50, Math.round(mix.diesel_kw ?? 50)] },
    { label: "Battery SOC", value: `${fmt(socDisplay, 0)}`, valueUnit: "%", color: C.green, spark: [68, 70, 72, 71, 74, 73, 75, Math.round((data?.battery_soc ?? 0.74) * 100)] },
  ]

  // AI Recommendations with explicit consequences if ignored
  const aiRecommendations = useMemo(() => {
    const recs: Array<{ text: string; consequence: string; severity: "critical" | "warning" | "info" | "neutral" }> = []

    if (margin < 40 || (mix.diesel_kw ?? 0) > 160) {
      recs.push({
        text: `Diesel draw (${fmt(mix.diesel_kw)} kW) approaching dispatch threshold`,
        consequence: "automatic load-shed may trigger on Lab/Comms modules",
        severity: "warning",
      })
    } else {
      recs.push({
        text: `Genset comfortably under capacity (${fmt(margin)} kW margin)`,
        consequence: "no action needed",
        severity: "neutral",
      })
    }

    if ((mix.solar_kw ?? 0) > 8) {
      recs.push({
        text: "Hold battery charge during peak solar window",
        consequence: "diesel commitment rises ~8kW within the hour",
        severity: "info",
      })
    } else if (data?.simulation?.polar_night) {
      recs.push({
        text: "Polar night zero-solar regime active across station",
        consequence: "battery depletion rate accelerates by 2.4× during evening mess heating",
        severity: "warning",
      })
    }

    if ((mix.wind_kw ?? 0) > 20) {
      recs.push({
        text: `Wind turbine generation active at high yield (${fmt(mix.wind_kw)} kW)`,
        consequence: "dispatch delays cause unrecovered diesel burn",
        severity: "info",
      })
    }

    if (data?.simulation?.blizzard_mode) {
      recs.push({
        text: "Blizzard storm protocol: prioritize Life Support & Comms modules",
        consequence: "emergency genset overload risk escalates to CRITICAL",
        severity: "critical",
      })
    }

    return recs
  }, [margin, mix.diesel_kw, mix.solar_kw, mix.wind_kw, data?.simulation?.polar_night, data?.simulation?.blizzard_mode])

  if (!data) return <main style={{ minHeight: "100vh", background: C.bg, color: C.accent, padding: 80, textAlign: "center" }}>LOADING MICROGRID TELEMETRY...</main>

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "38px 28px 80px", color: C.text, animation: "beFadeUp 0.5s ease" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes beFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes beGlow { 50% { filter: blur(1.2px); opacity: 0.9; } }
        @keyframes beRunwayGlide { 50% { filter: blur(0.7px); opacity: 0.94; } }
        .be-card { animation: beFadeUp 0.35s ease both; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
        .be-card:hover { border-color: rgba(255,159,0,0.4); box-shadow: 0 8px 34px rgba(255,159,0,0.10); transform: translateY(-2px); }
        .be-metric { transition: border-color 0.2s ease, transform 0.18s ease; }
        .be-metric:hover { transform: translateY(-1px); }
        .be-fill-bar { transition: width 200ms ease-out; }
        .be-runway { transition: width 200ms ease-out; }
      `}</style>

      <header style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: "0.15em" }}>RENEWABLE & MICROGRID</div>
          <h1 style={{ color: "#fff", fontSize: 32, margin: "8px 0", fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontStyle: "normal", fontWeight: 700 }}>Renewable & Microgrid Manager</h1>
          <p style={{ color: C.muted, margin: 0, maxWidth: 560 }}>Renewable mix, storage state, genset margin, and dispatch decisions for an isolated station.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: "bePulse 1.6s infinite" }} />
          {lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
        </div>
      </header>

      <SimulationBanner focus="microgrid" />

      {/* 1. Live changes ticker directly below scenario banner */}
      <LiveChangesTicker items={tickerItems} />

      {/* 2. Hero KPI Sparkline Row: Wind, Solar, Diesel, Battery SOC */}
      <HeroKpiSparklineRow rows={heroKpiRows} />

      {/* 3. AI Recommendations to Station Master with consequences */}
      <AIRecommendationsPanel
        title="AI Recommendations to Station Master"
        badge="AUTO-SYNC"
        recommendations={aiRecommendations}
      />

      <Card title="Renewable impact — this session" badge="LIVE ESTIMATE" live>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Metric label="Diesel avoided" value={`${fmt(litersAvoided)} L`} color={C.green} sub={`${fmt(dieselAvoidedLph)} L/h avoided right now`} />
          <Metric label="Fuel cost saved" value={`₹${fmt(rupeesSaved, 0)}`} color={C.accent} sub={`@ ₹${DIESEL_PRICE_PER_L}/L diesel`} />
          <Metric label="CO₂ avoided" value={`${fmt(co2Avoided)} kg`} color={C.blue} sub={`${CO2_KG_PER_L} kg CO₂/L diesel`} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14 }}>
          <p style={{ color: C.muted, fontSize: 10.5, margin: 0, lineHeight: 1.6, flex: 1 }}>
            Estimated vs. a 100%-diesel baseline: assumes {DIESEL_L_PER_KWH} L of diesel to generate 1 kWh on the genset. Session total accumulates live and persists across refreshes.
          </p>
          <button onClick={resetLiters} className="be-btn" style={{ background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}66`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", minWidth: 120, fontSize: 10, letterSpacing: "0.1em" }}>Reset session</button>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <Card title="Genset capacity margin">
          <Metric label="Rated genset capacity" value={`${gensetCap} kW`} color={C.purple} />
          <Bar pct={(mix.diesel_kw / gensetCap) * 100} color={margin < 35 ? C.red : C.green} />
          <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 12 }}>
            <span>Current diesel draw: {fmt(mix.diesel_kw)} kW</span>
            <strong style={{ color: margin < 35 ? C.red : C.green }}>{fmt(margin)} kW comfortable margin</strong>
          </div>
        </Card>
        <Card title="Dispatch plan">
          <div style={{ display: "grid", gap: 10, fontSize: 12 }}>
            <div>Genset state: <strong style={{ color: data.dispatch_plan?.genset_on ? C.red : C.green }}>{data.dispatch_plan?.genset_on ? "COMMITTED" : "OFF / RENEWABLE-FIRST"}</strong></div>
            <div>Diesel output: <strong>{data.dispatch_plan?.diesel_genset_output_kw ?? mix.diesel_kw} kW</strong></div>
            <div>Battery action: <strong>{data.dispatch_plan?.battery_discharge_kw ? `Discharge ${data.dispatch_plan.battery_discharge_kw} kW` : "Hold / charge"}</strong></div>
            <div>Fuel per interval: <strong>{data.dispatch_plan?.fuel_used_liters ?? 0} L</strong></div>
          </div>
        </Card>
      </div>

      <Card title="Renewable utilization % — daily trend" live>
        <div style={{ display: "grid", gridTemplateColumns: "38px minmax(420px, 1fr)", gap: 10, alignItems: "stretch" }}>
          <div style={{ height: 150, display: "grid", gridTemplateRows: "repeat(5,1fr)", color: C.muted, fontSize: 10, alignItems: "center" }}>
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span>0%</span>
          </div>
          <div style={{ position: "relative", height: 150, display: "flex", alignItems: "flex-end", gap: 8, padding: "0 8px", borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.018)" }}>
            <span style={{ position: "absolute", left: -2, right: 0, top: "25%", borderTop: `1px solid ${C.border}` }} />
            <span style={{ position: "absolute", left: -2, right: 0, top: "50%", borderTop: `1px solid ${C.border}` }} />
            <span style={{ position: "absolute", left: -2, right: 0, top: "75%", borderTop: `1px solid ${C.border}` }} />
            {history.map((point, index) => {
              const pct = Math.max(0, Math.min(100, Number(point.renewable ?? 0)))
              const height = Math.max(8, Math.round((pct / 100) * 132))
              return (
                <div key={`${point.label}-${index}`} title={`${point.label}: ${point.renewable}% renewable utilization`} style={{ flex: 1, minWidth: 24, height: 150, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                  <div style={{ height: `${height}px`, width: 26, borderRadius: "5px 5px 2px 2px", background: `linear-gradient(180deg, ${C.green} 0%, ${C.blue} 100%)`, border: `1px solid ${C.green}66`, boxShadow: `0 0 8px ${C.green}44`, transition: "height 260ms ease, background 260ms ease" }} />
                  <span style={{ color: C.muted, fontSize: 9 }}>{point.label}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 11, marginTop: 10 }}>
          <span>Older ticks</span>
          <strong style={{ color: C.green }}>Today renewable share: {fmt(utilDisplay, 0)}%</strong>
          <span>Now</span>
        </div>
      </Card>

      <Card title="Live station load vs forecast">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Metric label="Current load" value={`${data.current_demand ?? 0} kW`} color={C.blue} />
          <Metric label="Next load forecast" value={`${data.ml?.lstm_next_kw ?? 0} kW`} color={C.purple} />
          <Metric label="Renewable shortfall hours" value={`${data.renewable_shortfall_hours ?? 0} h`} color={C.accent} />
        </div>
      </Card>

      <Card title="Power quality and phase balance">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {Object.entries(data.phases ?? {}).map(([phase, value]) => (
            <Metric key={phase} label={`Phase ${phase}`} value={`${value} A`} color={C.accent} />
          ))}
          <Metric label="Phase imbalance" value={`${data.imbalance_percent ?? 0}%`} color={(data.imbalance_percent ?? 0) > 10 ? C.red : C.green} />
        </div>
      </Card>

      <Card title="Equipment condition">
        <div style={{ color: data.predictive_maintenance?.[0]?.anomaly_warning ? C.accent : C.green, fontSize: 18, fontWeight: 700 }}>
          {data.predictive_maintenance?.[0]?.machine ?? "Genset #1 fuel injector"}
        </div>
        <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6 }}>
          {data.predictive_maintenance?.[0]?.alert ?? "Monitor fuel injection pressure and cold-start behavior."}
        </p>
      </Card>

      <Card title="AI load shedding">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <span style={{ color: C.muted, fontSize: 12 }}>
            Excess load above genset comfortable capacity: <strong style={{ color: C.accent }}>{Math.max(0, (mix.diesel_kw ?? 0) - (gensetCap - 35)).toFixed(1)} kW</strong>
          </span>
          <span style={{ color: C.green, fontSize: 12 }}>Recommended: defer non-essential lab load before increasing diesel commitment.</span>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 18 }}>
        <Card title="Power Distribution Map" badge="LIVE" live>
          <div style={{ display: "grid", gap: 10 }}>
            {([
              ["WIND", C.blue, Math.min(100, Math.max(0, (mix.wind_kw ?? 0) / Math.max(1, gensetCap) * 100))],
              ["SOLAR", C.accent, Math.min(100, Math.max(0, (mix.solar_kw ?? 0) / Math.max(1, gensetCap) * 100))],
              ["DIESEL", C.red, Math.min(100, Math.max(0, (mix.diesel_kw ?? 0) / Math.max(1, gensetCap) * 100))],
              ["BATTERY SOC", C.green, Math.min(100, Math.max(0, Math.round(socDisplay)))]
            ] as Array<[string, string, number]>).map(([label, color, pct]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, color: C.text, fontSize: 11 }}>
                <span style={{ minWidth: 90, color: C.text }}>{label}</span>
                <span style={{ height: 8, width: 96, borderRadius: 20, background: "rgba(255,255,255,0.06)", border: `1px solid ${color}45`, overflow: "hidden" }}>
                  <span className="be-fill-bar" style={{ height: "100%", width: `${Math.max(4, Math.min(100, pct))}%`, background: color, borderRadius: 20, display: "block", transition: "width 320ms ease, opacity 320ms ease" }} />
                </span>
                <span style={{ color, minWidth: 44 }}>{`${fmt(Number(pct), 0)}%`}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Fuel Efficiency" badge="LIVE" live>
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: C.text, fontSize: 12 }}>
              <span>Fuel runway after safety reserve</span>
              <span style={{ color: C.green, fontWeight: 700 }}>{Math.max(0, data?.fuel_runway_hours ?? 12).toFixed(1)} h</span>
            </div>
            <div style={{ height: 12, background: "rgba(255,255,255,0.08)", borderRadius: 50, overflow: "hidden", border: `1px solid ${C.border}` }}>
              <div className="be-runway" style={{ height: "100%", width: `${Math.min(100, Math.max(2, ((data?.fuel_runway_hours ?? 12) / 18) * 100))}%`, background: `linear-gradient(90deg, ${C.green}, ${C.accent})`, borderRadius: 50, transition: "width 350ms ease", boxShadow: `0 0 12px ${C.green}55`, animation: "beRunwayGlide 1.4s ease-in-out infinite" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 11 }}>
              <span>Safety reserve: {data?.fuel_reserve_liters ?? 150} L</span>
              <span>Diesel {data?.fuel_balance_liters ?? 610} L</span>
            </div>
          </div>
        </Card>

        <Card title="Resupply" badge="LIVE" live>
          <div style={{ display: "grid", gap: 12, fontSize: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Fuel vessel</span><strong style={{ color: C.accent }}>{data?.resupply?.vessel ?? "N-04"}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>ETA</span><strong style={{ color: C.green }}>{data?.resupply?.eta ?? "02h 40m"}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Route</span><strong style={{ color: C.blue }}>{data?.resupply?.route ?? "S1 / North Ridge"}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>Risk</span><strong style={{ color: data?.resupply?.risk === "high" ? C.red : C.green }}>{data?.resupply?.risk ?? "low"}</strong></div>
          </div>
        </Card>
      </div>
    </main>
  )
}