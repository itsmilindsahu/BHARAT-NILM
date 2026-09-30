"use client"

import { useEffect, useRef, useState } from "react"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { SimulationBanner } from "../components/SimulationBanner"
import { LiveChangesTicker, HeroKpiSparklineRow, useTelemetryTickerTracker } from "../components/ui"
import { API_URL } from "../lib/api"

// ─── Palette ──────────────────────────────────────────────
const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.04)",
  border: "rgba(179,136,255,0.17)",
  accent: "#b388ff",
  blue: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  red: "#ff5252",
  purple: "#b388ff",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.55)",
}

// ─── Savings model (client-side estimate, clearly labeled) ─
const DIESEL_PRICE_PER_L = 96        // ₹ per litre, indicative
const DIESEL_L_PER_KWH = 0.32        // litres of diesel per kWh, genset baseline
const CO2_KG_PER_L = 2.68            // kg CO2 per litre diesel burned
const TANKER_CAPACITY_L = 5000       // litres per resupply run, for "trips avoided"
const SESSION_FUEL_SAVED_KEY = "nilm_fuel_logistics_liters_saved"

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

function useAccumulatedLiters(instantLph: number) {
  const [total, setTotal] = useState<number>(() => {
    const saved = readSessionNumber(SESSION_FUEL_SAVED_KEY)
    return saved > 0 ? saved : 2.2
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
          const current = readSessionNumber(SESSION_FUEL_SAVED_KEY) || prev
          const next = current + delta
          writeSessionNumber(SESSION_FUEL_SAVED_KEY, next)
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

export default function FuelLogisticsPage() {
  const [data, setData] = useState<any>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const load = () =>
      fetch(`${API_URL}/fuel-dashboard`)
        .then(r => r.json())
        .then(d => { setData(d); setLastUpdated(new Date()) })
        .catch(() => {})
    load()
    const timer = setInterval(load, 1200)
    return () => clearInterval(timer)
  }, [])

  const exportReport = async () => {
    setExporting(true)
    try {
      const report = document.getElementById("fuel-report") ?? document.body
      const canvas = await html2canvas(report, { scale: 2, backgroundColor: "#04090f" })
      const pdf = new jsPDF("p", "mm", "a4")
      const imgData = canvas.toDataURL("image/png")
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const height = Math.min(imgHeight, pageHeight)
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, height)
      pdf.save("fuel-logistics-report.pdf")
    } finally {
      setExporting(false)
    }
  }

  const fuel = data?.fuel ?? {}
  const flags = data?.unexpected_consumption_flags ?? ["No unexpected consumption flags"]
  const modules = [
    ["Powerhouse", data?.powerhouse_supply_risk ?? "LOW", C.amber],
    ["Dorm", data?.module_supply_risk?.Dorm ?? "LOW", C.green],
    ["Lab", data?.module_supply_risk?.Lab ?? "MODERATE", C.accent],
    ["Comms", data?.module_supply_risk?.Comms ?? "LOW", C.blue],
    ["Garage", data?.module_supply_risk?.Garage ?? "LOW", C.accent],
  ] as const

  // smoothed values
  const fuelDisplay = useSmoothNumber(fuel.level_liters ?? 0, 200)
  const burnDisplay = useSmoothNumber(fuel.burn_rate_lph ?? 0, 200)

  // renewable-first savings: the delta between actual burn and what a diesel-only
  // baseline would need to cover the same station demand
  const actualLph = fuel.burn_rate_lph ?? 0
  const renewableSharePct = data?.renewable_utilization_pct ?? null
  const estimatedBaselineLph = renewableSharePct != null && renewableSharePct < 100
    ? actualLph / (1 - renewableSharePct / 100)
    : actualLph + 8.5
  const litersSavedRate = Math.max(0, estimatedBaselineLph - actualLph)
  const litersSaved = useAccumulatedLiters(litersSavedRate)
  const rupeesSaved = litersSaved * DIESEL_PRICE_PER_L
  const co2Avoided = litersSaved * CO2_KG_PER_L
  const tripsAvoided = litersSaved / TANKER_CAPACITY_L

  // Real-time telemetry changes ticker
  const tickerItems = useTelemetryTickerTracker({
    "Station Load": { val: Math.round(data?.total_load ?? 0), unit: "kW", invert: true },
    "Fuel Burn": { val: Number(fuel?.burn_rate_lph ?? 0), unit: "L/h", invert: true },
    "Fuel Reserve": { val: Number(fuel?.reserve_liters ?? 0), unit: "L" },
    "Genset Margin": { val: Number(data?.genset_margin_kw ?? 0), unit: "kW" },
    "Fuel Saved": { val: Math.round(litersSaved * 10) / 10, unit: "L" },
  })

  // Hero KPI Sparkline Row (4-card pattern: Station Load, Fuel Burn Rate, Fuel Reserve, Genset Margin)
  const heroKpiRows = [
    { label: "Station Load", value: `${fmt(data?.total_load ?? 0, 0)}`, valueUnit: "kW", color: C.blue, spark: [28, 34, 30, 38, 42, 40, Math.round(data?.total_load ?? 36)] },
    { label: "Fuel Burn Rate", value: `${fmt(burnDisplay)}`, valueUnit: "L/h", color: C.amber, spark: [36, 40, 38, 44, 42, 39, Math.round(fuel.burn_rate_lph ?? 34)] },
    { label: "Fuel Reserve", value: `${fmt(fuel?.reserve_liters ?? 0, 0)}`, valueUnit: "L", color: C.green, spark: [3000, 3000, 3000, 2998, 2995, 2990, Math.round(fuel?.reserve_liters ?? 3000)] },
    { label: "Genset Margin", value: `${fmt(data?.genset_margin_kw ?? 0, 0)}`, valueUnit: "kW", color: C.purple, spark: [110, 118, 114, 122, 126, 120, Math.round(data?.genset_margin_kw ?? 120)] },
  ]

  if (!data) return <main style={{ minHeight: "100vh", background: C.bg, color: C.accent, padding: 80, textAlign: "center" }}>LOADING FUEL TELEMETRY...</main>

  return (
    <main id="fuel-report" style={{ maxWidth: 1180, margin: "0 auto", padding: "38px 28px 80px", color: C.text, animation: "beFadeUp 0.5s ease" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes beFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bePulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .be-card { animation: beFadeUp 0.35s ease both; transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease; }
        .be-card:hover { border-color: rgba(179,136,255,0.45); box-shadow: 0 8px 34px rgba(179,136,255,0.10); transform: translateY(-2px); }
        .be-metric { transition: border-color 0.2s ease, transform 0.18s ease; }
        .be-metric:hover { transform: translateY(-1px); }
        .be-btn { transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease; }
        .be-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,229,255,0.18); }
        .be-btn:active { transform: translateY(0); }
      `}</style>

      <header style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, letterSpacing: "0.15em" }}>FUEL & LOGISTICS</div>
          <h1 style={{ color: "#fff", fontSize: 32, margin: "8px 0", fontFamily: "Inter, Segoe UI, Arial, sans-serif", fontStyle: "normal", fontWeight: 700 }}>Fuel & Logistics Officer</h1>
          <p style={{ color: C.muted, margin: 0, maxWidth: 560 }}>Fuel runway, safety reserve, resupply planning, and isolated microgrid distribution risk.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <button onClick={exportReport} disabled={exporting} className="be-btn" style={{ color: "#fff", background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.54)", borderRadius: 10, padding: "10px 14px", cursor: exporting ? "wait" : "pointer" }}>
            {exporting ? "Exporting…" : "Export Report"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 8px ${C.green}`, animation: "bePulse 1.6s infinite" }} />
            {lastUpdated ? `UPDATED ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
          </div>
        </div>
      </header>

      <SimulationBanner focus="fuel" />

      {/* 1. Live changes ticker directly below scenario banner */}
      <LiveChangesTicker items={tickerItems} />

      {/* 2. Hero KPI Sparkline Row: Station Load, Fuel Burn Rate, Fuel Reserve, Genset Margin */}
      <HeroKpiSparklineRow rows={heroKpiRows} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <Metric label="Fuel remaining" value={`${fmt(fuelDisplay, 0)} L`} color={C.blue} />
        <Metric label="Burn rate" value={`${fmt(burnDisplay)} L/h`} color={C.red} />
        <Metric label="Safety reserve" value={`${fuel.reserve_liters ?? 3000} L`} color={C.amber} />
        <Metric label="Resupply countdown" value={`${fuel.resupply_countdown_days ?? 0} days`} color={C.green} />
      </div>

      <Card title="Fuel & cost saved vs. diesel-only baseline" badge="LIVE ESTIMATE">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Metric label="Fuel saved" value={`${fmt(litersSaved)} L`} color={C.green} sub={`${fmt(litersSavedRate)} L/h avoided now`} />
          <Metric label="Cost saved" value={`₹${fmt(rupeesSaved, 0)}`} color={C.accent} sub={`@ ₹${DIESEL_PRICE_PER_L}/L diesel`} />
          <Metric label="CO₂ avoided" value={`${fmt(co2Avoided)} kg`} color={C.blue} />
          <Metric label="Resupply trips avoided" value={fmt(tripsAvoided, 2)} color={C.amber} sub={`@ ${TANKER_CAPACITY_L.toLocaleString()} L/tanker run`} />
        </div>
        <p style={{ color: C.muted, fontSize: 10.5, margin: "14px 0 0", lineHeight: 1.6 }}>
          Baseline diesel burn is inferred from current renewable utilization (renewables offsetting {renewableSharePct ?? "—"}% of demand). Session counter resets on reload — wire to a persisted <code>cumulative_diesel_saved_l</code> field on <code>/fuel-dashboard</code> for a durable total across shifts.
        </p>
      </Card>

      <Card title="Power distribution map">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, alignItems: "center" }}>
          <div style={{ border: `2px solid ${C.amber}`, borderRadius: 12, padding: 18, textAlign: "center", color: C.amber }}>
            POWERHOUSE
            <div style={{ color: C.muted, fontSize: 10, marginTop: 6 }}>Diesel + wind + solar</div>
          </div>
          {modules.slice(1).map(([name, risk, color]) => (
            <div key={name} style={{ border: `1px solid ${color}66`, borderRadius: 10, padding: 16, textAlign: "center" }}>
              <div style={{ color }}>{name}</div>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 7 }}>Supply risk</div>
              <strong style={{ color: risk === "HIGH" ? C.red : risk === "MODERATE" ? C.amber : C.green, fontSize: 11 }}>{risk}</strong>
            </div>
          ))}
        </div>
        <p style={{ color: C.muted, fontSize: 11, margin: "16px 0 0" }}>Risk reflects heating load, generation margin, battery state, and critical-load priority.</p>
      </Card>

      <Card title="Unexpected consumption flags">
        <div style={{ display: "grid", gap: 10 }}>
          {flags.map((flag: string, index: number) => (
            <div key={`${flag}-${index}`} style={{ borderLeft: `3px solid ${C.amber}`, padding: "10px 14px", background: "rgba(255,179,0,0.08)", color: C.text, fontSize: 12 }}>{flag}</div>
          ))}
        </div>
        <p style={{ color: C.muted, fontSize: 11, marginBottom: 0 }}>Investigate heater stuck-on behavior, cold-weather fuel-line gelling, sensor drift, or generator inefficiency.</p>
      </Card>

      <Card title="Fuel efficiency loss — weather normalised">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <Metric label="Observed fuel burn" value={`${fuel.burn_rate_lph ?? 0} L/h`} color={C.red} />
          <Metric label="Cold-weather expected" value={`${fuel.weather_expected_burn_lph ?? 0} L/h`} color={C.blue} />
          <Metric label="True efficiency loss" value={`${fuel.weather_normalised_efficiency_loss_pct ?? 0}%`} color={C.amber} />
        </div>
        <p style={{ color: C.muted, fontSize: 11, marginBottom: 0 }}>Separates extra fuel caused by extreme cold from genuine genset or equipment degradation.</p>
      </Card>

      <Card title="Resupply decision support">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div>
            <div style={{ color: C.muted, fontSize: 11 }}>Fuel runway after safety reserve</div>
            <div style={{ height: 14, background: "rgba(255,255,255,0.08)", borderRadius: 7, marginTop: 10, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, Math.max(2, ((fuel.level_liters - fuel.reserve_liters) / Math.max(fuel.level_liters, 1)) * 100))}%`, height: "100%", background: fuel.resupply_countdown_days < 7 ? C.red : C.green, borderRadius: 7, transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)" }} />
            </div>
          </div>
          <div>
            <div style={{ color: C.muted, fontSize: 11 }}>Recommended action</div>
            <strong style={{ color: fuel.resupply_countdown_days < 7 ? C.red : C.green, display: "block", marginTop: 10 }}>
              {fuel.resupply_countdown_days < 7 ? "Request priority resupply window" : "Maintain planned resupply schedule"}
            </strong>
          </div>
        </div>
      </Card>
    </main>
  )
}