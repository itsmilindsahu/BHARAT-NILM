"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

// ─── Palette ──────────────────────────────────────────────
const C = {
  bg: "#04090f",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.4)",
}

// ─── Animated counter ─────────────────────────────────────
function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start = 0
    const step = target / 60
    const iv = setInterval(() => {
      start = Math.min(start + step, target)
      setVal(Math.round(start * 10) / 10)
      if (start >= target) clearInterval(iv)
    }, 16)
    return () => clearInterval(iv)
  }, [target])
  return <>{val}{suffix}</>
}

// ─── Dashboard cards config ───────────────────────────────
const CARDS = [
  {
    href: "/professor",
    icon: "🔬",
    title: "Research",
    subtitle: "Model Analytics",
    desc: "Confusion matrix, ROC curves, live disaggregation and NILM equations across all 5 trained models.",
    color: "#00e5ff",
    stat: "94.0%",
    statLabel: "Accuracy",
    badge: "5 MODELS",
  },
  {
    href: "/user",
    icon: "🏠",
    title: "Consumer",
    subtitle: "Smart Home",
    desc: "Real-time appliance monitoring, billing, carbon footprint and 3D energy-aware room visualisation.",
    color: "#39ff14",
    stat: "₹6.5",
    statLabel: "Tariff /kWh",
    badge: "LIVE",
  },
  {
    href: "/industrial",
    icon: "🏭",
    title: "Industrial",
    subtitle: "Demand Management",
    desc: "Transformer load, peak demand forecast, phase balance, power factor and AI peak shaving recommendations.",
    color: "#ffb300",
    stat: "600 kVA",
    statLabel: "Contracted",
    badge: "3-PHASE",
  },
  {
    href: "/grid",
    icon: "🗺️",
    title: "DISCOM",
    subtitle: "Grid Control Center",
    desc: "10-feeder hexagonal map, AT&C loss monitoring, surge zone detection and automated interventions.",
    color: "#e040fb",
    stat: "10",
    statLabel: "Feeders",
    badge: "DISCOM",
  },
  {
    href: "/infer",
    icon: "⚡",
    title: "Live Inference",
    subtitle: "Real ML Engine",
    desc: "Feed any wattage into all 5 trained models simultaneously. RF classifies, HMM detects regime, LSTM forecasts, LogReg flags anomalies.",
    color: "#ff9f00",
    stat: "5",
    statLabel: "Models Live",
    badge: "REAL ML",
    highlight: true,
  },
]

// ─── Card ─────────────────────────────────────────────────
function DashCard({ card, index }: { card: typeof CARDS[0]; index: number }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link href={card.href} style={{ textDecoration: "none" }}>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered
            ? `rgba(${card.color === "#00e5ff" ? "0,229,255" : card.color === "#39ff14" ? "57,255,20" : card.color === "#ffb300" ? "255,179,0" : card.color === "#e040fb" ? "224,64,251" : "255,159,0"},0.05)`
            : "rgba(10,10,10,0.6)",
          backdropFilter: "blur(12px)",
          border: `1px solid ${hovered ? card.color + "40" : "rgba(255,255,255,0.06)"}`,
          borderRadius: 32,
          padding: "32px 32px 28px",
          cursor: "pointer",
          transition: "all 0.3s ease",
          boxShadow: hovered ? `0 8px 40px ${card.color}18` : "none",
          position: "relative" as const,
          overflow: "hidden",
          animation: `fadeUp 0.5s ease ${index * 0.08}s both`,
        }}
      >
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg,transparent,${card.color},transparent)`,
          opacity: hovered ? 1 : 0.3,
          transition: "opacity 0.3s",
        }} />

        {/* Highlight glow for infer card */}
        {card.highlight && (
          <div style={{
            position: "absolute", top: -40, right: -40,
            width: 120, height: 120, borderRadius: "50%",
            background: `radial-gradient(circle,${card.color}15,transparent 70%)`,
          }} />
        )}

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, fontSize: 20,
              background: card.color + "15", border: `1px solid ${card.color}25`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "transform 0.2s",
              transform: hovered ? "scale(1.1)" : "scale(1)",
            }}>{card.icon}</div>
            <div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontStyle: "italic", fontSize: 24, fontWeight: 400, letterSpacing: "0.02em", color: "#fff" }}>
                {card.title}
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{card.subtitle}</div>
            </div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
            padding: "3px 10px", borderRadius: 100,
            background: card.color + "15", border: `1px solid ${card.color}30`, color: card.color,
          }}>{card.badge}</span>
        </div>

        {/* Description */}
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20, minHeight: 56 }}>
          {card.desc}
        </p>

        {/* Stat + CTA */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, color: card.color }}>
              {card.stat}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: "0.08em" }}>{card.statLabel}</div>
          </div>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            color: card.color, fontSize: 12, fontWeight: 600,
            opacity: hovered ? 1 : 0.5, transition: "opacity 0.2s",
          }}>
            Open →
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function HomePage() {
  const orbRef1 = useRef<HTMLDivElement>(null!)
  const orbRef2 = useRef<HTMLDivElement>(null!)
  const orbRef3 = useRef<HTMLDivElement>(null!)

  useEffect(() => {
    let t = 0
    const iv = setInterval(() => {
      t += 0.008
      if (orbRef1.current) {
        orbRef1.current.style.transform = `translate(${Math.sin(t) * 30}px, ${Math.cos(t * 0.7) * 20}px)`
      }
      if (orbRef2.current) {
        orbRef2.current.style.transform = `translate(${Math.cos(t * 0.8) * 25}px, ${Math.sin(t * 1.1) * 20}px)`
      }
      if (orbRef3.current) {
        orbRef3.current.style.transform = `translate(${Math.sin(t * 1.2) * 20}px, ${Math.cos(t * 0.9) * 15}px)`
      }
    }, 16)
    return () => clearInterval(iv)
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000000; font-family: 'JetBrains Mono', monospace; color: ${C.text}; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slowSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* Grid bg */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "radial-gradient(circle at 10% 20%, rgba(0, 246, 255, 0.08), transparent 45%)" }} />

      {/* Floating orbs */}
      <div ref={orbRef1} style={{ position: "fixed", top: "15%", left: "8%", width: 360, height: 360,
        borderRadius: "50%", background: "radial-gradient(circle,rgba(0,229,255,0.07),transparent 70%)",
        pointerEvents: "none", zIndex: 0, transition: "transform 0.1s linear" }} />
      <div ref={orbRef2} style={{ position: "fixed", top: "40%", right: "5%", width: 500, height: 500,
        borderRadius: "50%", background: "radial-gradient(circle,rgba(57,255,20,0.05),transparent 70%)",
        pointerEvents: "none", zIndex: 0, transition: "transform 0.1s linear" }} />
      <div ref={orbRef3} style={{ position: "fixed", bottom: "10%", left: "20%", width: 400, height: 400,
        borderRadius: "50%", background: "radial-gradient(circle,rgba(255,159,0,0.06),transparent 70%)",
        pointerEvents: "none", zIndex: 0, transition: "transform 0.1s linear" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1160, margin: "0 auto", padding: "0 32px 100px" }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: "center", paddingTop: 72, paddingBottom: 64, animation: "fadeUp 0.6s ease" }}>
          {/* Status pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 28,
            padding: "6px 18px", borderRadius: 100,
            background: "rgba(57,255,20,0.07)", border: "1px solid rgba(57,255,20,0.2)" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#39ff14",
              boxShadow: "0 0 8px #39ff14", animation: "pulse 1.5s infinite" }} />
            <span style={{ fontSize: 10, color: "#39ff14", fontWeight: 700, letterSpacing: "0.15em" }}>
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>

          <h1 style={{ fontFamily: "'Instrument Serif',serif", fontSize: "clamp(48px,8vw,96px)", fontStyle: "italic",
            fontWeight: 400, color: "#fff", lineHeight: 1.0, letterSpacing: "-0.02em", marginBottom: 24 }}>
            Bharat Energy AI
          </h1>
          <p style={{ fontSize: "clamp(14px,1.5vw,17px)", color: C.muted, maxWidth: 580,
            margin: "0 auto 48px", lineHeight: 1.7 }}>
            Non-Intrusive Load Monitoring powered by 5 ML models. Real-time appliance disaggregation,
            demand forecasting, anomaly detection and grid intelligence.
          </p>

          {/* Stat counters */}
          <div style={{ display: "flex", justifyContent: "center", gap: 48, flexWrap: "wrap" as const }}>
            {[
              { target: 94, suffix: "%", label: "Model Accuracy" },
              { target: 5,  suffix: "",  label: "Trained Models" },
              { target: 5,  suffix: "",  label: "Dashboards" },
              { target: 10, suffix: "",  label: "Grid Feeders" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center" as const }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 40, fontWeight: 700, color: "#00f6ff" }}>
                  <Counter target={s.target} suffix={s.suffix} />
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, letterSpacing: "0.08em" }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Cards grid: 3 top + 2 bottom centred ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20, marginBottom: 20 }}>
          {CARDS.slice(0, 3).map((card, i) => (
            <DashCard key={card.href} card={card} index={i} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 800, margin: "0 auto" }}>
          {CARDS.slice(3).map((card, i) => (
            <DashCard key={card.href} card={card} index={i + 3} />
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ textAlign: "center", marginTop: 72, opacity: 0.3 }}>
          <p style={{ fontSize: 11, letterSpacing: "0.1em" }}>
            BHARAT ENERGY AI · NILM PLATFORM · BUILT WITH NEXT.JS + FASTAPI
          </p>
        </div>

      </div>
    </>
  )
}