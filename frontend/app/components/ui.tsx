"use client"

import React, { useEffect, useRef, useState } from "react"

export type UiCardProps = {
  title?: string
  subtitle?: string
  badge?: string
  live?: boolean
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Card({ title, subtitle, badge, live = false, children, className = "", style = {} }: UiCardProps) {
  return (
    <section className={`be-card ${className}`} style={{
      background: "rgba(255,255,255,0.035)",
      border: "1px solid rgba(0,229,255,0.14)",
      borderRadius: 14,
      padding: "20px 22px",
      marginBottom: 18,
      boxShadow: "0 8px 24px rgba(0,0,0,0.16)",
      transition: "transform 200ms ease-out, border-color 200ms ease-out, background 200ms ease-out, box-shadow 200ms ease-out",
      ...style,
    }}>
      {(title || subtitle || badge) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {live && (
              <span style={{
                width: 6, height: 6, borderRadius: "50%", background: "#39ff14",
                boxShadow: "0 0 8px #39ff14", animation: "bePulse 1.4s infinite", display: "inline-block",
              }} />
            )}
            {title && <h2 style={{ color: "#fff", fontSize: 13, letterSpacing: "0.1em", margin: 0, textTransform: "uppercase" }}>{title}</h2>}
            {subtitle && <span style={{ color: "rgba(200,219,232,0.55)", fontSize: 11, letterSpacing: "0.06em", marginLeft: 6 }}>{subtitle}</span>}
          </div>
          {badge && (
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", padding: "3px 10px",
              borderRadius: 100, background: "rgba(57,255,20,0.12)", border: "1px solid rgba(57,255,20,0.35)", color: "#39ff14",
            }}>{badge}</span>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

export function Metric({ label, value, color = "#00e5ff", sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="be-metric" style={{
      background: "rgba(0,0,0,0.24)",
      border: `1px solid ${color}35`,
      borderRadius: 10,
      padding: "14px 16px",
      transition: "transform 200ms ease-out, border-color 200ms ease-out, box-shadow 200ms ease-out",
      boxShadow: "none",
    }}>
      <div style={{ color: "rgba(200,219,232,0.55)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 700, marginTop: 6, fontFamily: "'Oxanium', 'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ color: "rgba(200,219,232,0.50)", fontSize: 10, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── Smooth Number Hook (fast 200ms ease-out) ───────────────
export function useFastSmoothNumber(target: number, duration = 200) {
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
      // snappy cubic ease-out
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (to - from) * eased)
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        prevRef.current = to
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return value
}

// ─── Mini SVG Sparkline ─────────────────────────────────────
export function MiniSparkline({ points = [30, 45, 38, 52, 48, 60, 55], color = "#00e5ff", height = 36 }: { points?: number[]; color?: string; height?: number }) {
  if (!points || points.length < 2) return <div style={{ height }} />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max === min ? 1 : max - min
  const width = 200
  const pad = 4
  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * (width - pad * 2) + pad
    const y = height - ((val - min) / range) * (height - pad * 2) - pad
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(" ")

  return (
    <div style={{ height, width: "100%", overflow: "hidden" }}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords}
          style={{ transition: "all 180ms ease-out" }}
        />
      </svg>
    </div>
  )
}

// ─── Live Changes Ticker Entry ──────────────────────────────
export interface LiveTickerItem {
  id: string
  text: string
  time: string
  direction: "saving" | "load" | "neutral" // saving = green, load = orange, neutral = cyan
}

export function LiveChangesTicker({ items }: { items?: LiveTickerItem[] }) {
  const [mountedTime, setMountedTime] = useState("")

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0")
    const d = new Date()
    setMountedTime(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`)
  }, [])

  const defaultItems: LiveTickerItem[] = [
    { id: "1", text: "Wind +3.2 kW", time: mountedTime || "12:41:05", direction: "saving" },
    { id: "2", text: "Diesel Avoided +1.8 L", time: mountedTime || "12:41:03", direction: "saving" },
    { id: "3", text: "Heating -0.9 kW", time: mountedTime || "12:41:01", direction: "saving" },
    { id: "4", text: "Diesel Draw +1.4 kW", time: mountedTime || "12:40:58", direction: "load" },
    { id: "5", text: "Battery SOC +0.8%", time: mountedTime || "12:40:55", direction: "saving" },
  ]

  const displayList = (items && items.length > 0 ? items : defaultItems).slice(0, 6)

  return (
    <section className="live-ticker-strip" style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      background: "linear-gradient(90deg, rgba(8,16,28,0.95), rgba(4,9,15,0.95))",
      border: "1px solid rgba(0,229,255,0.18)",
      borderRadius: 10,
      padding: "7px 14px",
      margin: "0 0 16px",
      overflow: "hidden",
      boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(0,229,255,0.08)",
      minHeight: 38,
    }}>
      <style>{`
        @keyframes tickerSlideIn {
          from { opacity: 0; transform: translateX(18px) scale(0.96); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes bePulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.88); } }
        .ticker-entry {
          animation: tickerSlideIn 220ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
          transition: all 200ms ease-out;
        }
      `}</style>

      {/* Left indicator: live pulsing green dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, paddingRight: 10, borderRight: "1px solid rgba(0,229,255,0.14)" }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: "#39ff14",
          boxShadow: "0 0 10px #39ff14", animation: "bePulse 1.2s infinite", display: "inline-block",
        }} />
        <span style={{
          fontSize: 9.5, fontWeight: 800, letterSpacing: "0.14em",
          color: "#39ff14", textTransform: "uppercase", fontFamily: "'Oxanium', 'JetBrains Mono', monospace",
        }}>
          LIVE STREAM
        </span>
      </div>

      {/* Entries sliding/scrolling */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, overflowX: "auto",
        scrollbarWidth: "none", msOverflowStyle: "none", flex: 1, whiteSpace: "nowrap",
      }}>
        {displayList.map((item) => {
          const isSaving = item.direction === "saving"
          const isLoad = item.direction === "load"
          const accent = isSaving ? "#39ff14" : isLoad ? "#ff9f00" : "#00e5ff"
          const bg = isSaving ? "rgba(57,255,20,0.08)" : isLoad ? "rgba(255,159,0,0.08)" : "rgba(0,229,255,0.08)"
          const border = isSaving ? "rgba(57,255,20,0.28)" : isLoad ? "rgba(255,159,0,0.28)" : "rgba(0,229,255,0.28)"

          return (
            <div key={item.id || item.text} className="ticker-entry" style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 6,
              padding: "3px 9px",
              fontSize: 11,
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
            }}>
              <span style={{ color: accent, fontSize: 10 }}>{isSaving ? "▲" : isLoad ? "▼" : "●"}</span>
              <strong style={{ color: accent, fontWeight: 700 }}>{item.text}</strong>
              <span style={{ color: "rgba(200,219,232,0.45)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
                · {item.time}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Telemetry Realtime Changes Hook ────────────────────────
export type MetricEntry = { val: number; unit: string; invert?: boolean }

export function useTelemetryTickerTracker(
  metricsOrValues: Record<string, MetricEntry | number | undefined>,
  unitsMap?: Record<string, string>
) {
  const [items, setItems] = useState<LiveTickerItem[]>([])
  const prevRef = useRef<Record<string, number>>({})
  const initRef = useRef(false)

  const serialized = JSON.stringify(metricsOrValues) + (unitsMap ? JSON.stringify(unitsMap) : "")

  useEffect(() => {
    const normalized: Record<string, MetricEntry> = {}
    for (const [key, v] of Object.entries(metricsOrValues)) {
      if (v === undefined || v === null) continue
      if (typeof v === "object" && "val" in v) {
        normalized[key] = v
      } else if (typeof v === "number") {
        normalized[key] = {
          val: v,
          unit: unitsMap?.[key] || "",
        }
      }
    }

    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, "0")
    const tStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`

    if (!initRef.current) {
      initRef.current = true
      // Seed initial items so it's active immediately
      const initial: LiveTickerItem[] = Object.entries(normalized).slice(0, 4).map(([key, item], idx) => ({
        id: `init-${key}-${Date.now() - idx * 1000}`,
        text: `${key} ${item.val > 0 ? "+" : ""}${item.val} ${item.unit}`,
        time: tStr,
        direction: (item.invert ? item.val <= 0 : item.val >= 0) ? "saving" : "load",
      }))
      setItems(initial)
      Object.entries(normalized).forEach(([k, v]) => {
        prevRef.current[k] = v.val
      })
      return
    }

    const newEntries: LiveTickerItem[] = []

    Object.entries(normalized).forEach(([name, current]) => {
      const prev = prevRef.current[name]
      if (prev !== undefined && Number.isFinite(current.val)) {
        const delta = Math.round((current.val - prev) * 10) / 10
        if (Math.abs(delta) >= 0.1) {
          const isSaving = current.invert ? delta < 0 : delta > 0
          newEntries.push({
            id: `${name}-${Date.now()}-${Math.random()}`,
            text: `${name} ${delta > 0 ? "+" : ""}${delta.toFixed(1)} ${current.unit}`,
            time: tStr,
            direction: isSaving ? "saving" : "load",
          })
        }
      }
      prevRef.current[name] = current.val
    })

    if (newEntries.length > 0) {
      setItems(prev => [...newEntries, ...prev].slice(0, 6))
    }
  }, [serialized]) // eslint-disable-line react-hooks/exhaustive-deps

  return items
}

// ─── Hero KPI Sparkline Row (Standard 4-Card Layout) ─────────
export interface HeroKpiItem {
  label: string
  value: string | number
  valueUnit?: string
  color: string
  spark?: number[]
  sub?: string
}

export function HeroKpiSparklineRow({ rows }: { rows: HeroKpiItem[] }) {
  return (
    <section style={{
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(170px, 1fr))",
      gap: 12,
      marginBottom: 18,
    }}>
      <style>{`
        .be-hero-kpi-card {
          animation: beFadeUp 0.35s ease-out both;
          transition: border-color 0.2s ease-out, box-shadow 0.2s ease-out, transform 0.2s ease-out;
        }
        .be-hero-kpi-card:hover {
          transform: translateY(-2px);
        }
      `}</style>

      {rows.map((k, idx) => (
        <article
          key={k.label}
          className="be-hero-kpi-card"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: `1px solid ${k.color}40`,
            borderRadius: 14,
            padding: 16,
            minHeight: 165,
            boxShadow: `0 0 16px ${k.color}10`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{
              color: "rgba(200,219,232,0.55)",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "Inter, Segoe UI, sans-serif",
            }}>
              {k.label}
            </span>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "#39ff14",
              boxShadow: "0 0 8px #39ff14",
              animation: "bePulse 1.4s infinite",
              display: "inline-block",
            }} />
          </div>

          <div style={{
            color: k.color,
            fontSize: 26,
            fontWeight: 800,
            fontFamily: "'Oxanium', 'JetBrains Mono', monospace",
            marginTop: 8,
          }}>
            {k.value}{k.valueUnit ? ` ${k.valueUnit}` : ""}
          </div>

          {k.sub && (
            <div style={{ color: "rgba(200,219,232,0.5)", fontSize: 10, marginTop: 2 }}>{k.sub}</div>
          )}

          <div style={{
            height: 42,
            width: "100%",
            marginTop: 8,
            border: "1px solid rgba(255,255,255,0.03)",
            borderRadius: 7,
            background: "rgba(0,0,0,0.18)",
            display: "flex",
            alignItems: "center",
          }}>
            <MiniSparkline
              points={k.spark || [30, 36, 42, 38, 45, 52, 48, 56, idx * 5 + 40]}
              color={k.color}
              height={36}
            />
          </div>
        </article>
      ))}
    </section>
  )
}

// ─── AI Recommendations Panel with Explicit Consequences ─────
export interface RecommendationWithConsequence {
  text: string
  consequence: string
  severity: "critical" | "warning" | "info" | "neutral"
}

export function AIRecommendationsPanel({
  title = "AI Recommendations to Station Master",
  badge = "AUTO-SYNC",
  recommendations = [],
}: {
  title?: string
  badge?: string
  recommendations?: RecommendationWithConsequence[]
}) {
  const defaultRecs: RecommendationWithConsequence[] = [
    {
      text: "Hold battery charge during peak solar window",
      consequence: "diesel commitment rises ~8kW within the hour",
      severity: "info",
    },
    {
      text: "Genset comfortably under capacity with healthy margin",
      consequence: "no action needed",
      severity: "neutral",
    },
    {
      text: "Diesel draw approaching dispatch threshold",
      consequence: "automatic load-shed may trigger on Lab/Comms modules",
      severity: "warning",
    },
  ]

  const list = recommendations.length > 0 ? recommendations : defaultRecs

  return (
    <section style={{
      border: "1px solid rgba(0,229,255,0.20)",
      background: "rgba(255,255,255,0.035)",
      borderRadius: 14,
      padding: "18px 20px",
      marginBottom: 18,
      boxShadow: "0 8px 26px rgba(0,0,0,0.2)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div style={{
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
          fontWeight: 700,
          color: "#fff",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {title}
        </div>
        <span style={{
          padding: "3px 10px",
          borderRadius: 100,
          background: "rgba(57,255,20,0.1)",
          color: "#39ff14",
          border: "1px solid rgba(57,255,20,0.30)",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.1em",
        }}>
          {badge}
        </span>
      </div>

      <div style={{ display: "grid", gap: 9 }}>
        {list.map((rec, i) => {
          const isWarn = rec.severity === "warning" || rec.severity === "critical"
          const iconColor = isWarn ? "#ff5252" : rec.severity === "neutral" ? "#39ff14" : "#00e5ff"
          const border = isWarn ? "rgba(255,82,82,0.35)" : "rgba(0,229,255,0.14)"
          const bg = isWarn ? "rgba(255,82,82,0.06)" : "rgba(255,255,255,0.025)"

          return (
            <div key={i} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 10,
              padding: "10px 14px",
            }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: `${iconColor}22`,
                color: iconColor,
                border: `1px solid ${iconColor}66`,
                fontSize: 11,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                {isWarn ? "!" : "i"}
              </span>
              <div style={{ color: "#c8dbe8", fontSize: 11.5, lineHeight: 1.45, flex: 1 }}>
                <span>{rec.text}</span>
                <span style={{ color: "rgba(200,219,232,0.50)", margin: "0 6px" }}>→</span>
                <span style={{
                  color: isWarn ? "#ff9f00" : rec.severity === "neutral" ? "rgba(200,219,232,0.65)" : "#00e5ff",
                  fontWeight: 600,
                }}>
                  if ignored: {rec.consequence}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ─── Universal Session Accumulator Hook ─────────────────────
export function useSessionAccumulator(key: string, ratePerHour: number, initialFallback = 2.4) {
  const [accumulated, setAccumulated] = useState<number>(() => {
    if (typeof window === "undefined") return initialFallback
    const raw = window.sessionStorage.getItem(key)
    if (!raw) {
      window.sessionStorage.setItem(key, String(initialFallback))
      return initialFallback
    }
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : initialFallback
  })

  const lastRef = useRef<number>(Date.now())
  const rateRef = useRef<number>(ratePerHour)
  rateRef.current = ratePerHour

  useEffect(() => {
    lastRef.current = Date.now()
    const timer = setInterval(() => {
      const now = Date.now()
      const elapsedSeconds = Math.max(0.1, (now - lastRef.current) / 1000)
      lastRef.current = now
      const rate = Math.max(0, rateRef.current)
      const hours = elapsedSeconds / 3600
      const delta = rate * hours

      setAccumulated(prev => {
        let currentStored = prev
        if (typeof window !== "undefined") {
          const raw = window.sessionStorage.getItem(key)
          if (raw) {
            const parsed = Number(raw)
            if (Number.isFinite(parsed)) currentStored = parsed
          }
        }
        const next = currentStored + delta
        if (typeof window !== "undefined") {
          try { window.sessionStorage.setItem(key, String(next)) } catch {}
        }
        return next
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [key])

  const reset = () => {
    if (typeof window !== "undefined") {
      try { window.sessionStorage.setItem(key, "0") } catch {}
    }
    setAccumulated(0)
  }

  return [accumulated, reset] as const
}
