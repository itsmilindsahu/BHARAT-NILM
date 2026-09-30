"use client"

import { useNotifications } from "./NotificationContext"

type SimulationFocus = "ops" | "microgrid" | "fuel" | "research" | "playground"

const FOCUS_COPY: Record<SimulationFocus, { title: string; normal: string; blizzard: string; night: string }> = {
  ops: {
    title: "Station scenario",
    normal: "Normal operations: monitor critical loads and routine station demand.",
    blizzard: "Blizzard response: heating, life support, and communications take priority; extreme-event alerts are active.",
    night: "Polar night operations: lighting and heating demand are elevated because daylight is unavailable.",
  },
  microgrid: {
    title: "Microgrid scenario",
    normal: "Normal operations: balance solar, wind, battery storage, and diesel dispatch.",
    blizzard: "Blizzard response: solar is derated, wind conditions are volatile, and emergency diesel reserve is protected.",
    night: "Polar night operations: solar generation is zero; wind, battery, and diesel carry the station.",
  },
  fuel: {
    title: "Fuel scenario",
    normal: "Normal operations: preserve reserve and schedule the next resupply window.",
    blizzard: "Blizzard response: access risk rises and the optimizer reserves fuel for life-support continuity.",
    night: "Polar night operations: no solar contribution increases burn pressure and shortens fuel runway.",
  },
  research: {
    title: "Model scenario",
    normal: "Baseline: evaluate forecasts, operating regimes, and fault detection under routine weather.",
    blizzard: "Stress test: emergency classification, anomaly sensitivity, and dispatch behavior are being exercised.",
    night: "Seasonal test: zero daylight tests renewable forecasting and diesel-dependence behavior.",
  },
  playground: {
    title: "Live simulation",
    normal: "Baseline weather and load simulation.",
    blizzard: "Blizzard mode: extreme weather, higher critical demand, and emergency dispatch.",
    night: "Polar night: zero daylight and zero solar generation.",
  },
}

export function SimulationBanner({ focus }: { focus: SimulationFocus }) {
  const { blizzardMode, polarNight, setBlizzardMode, setPolarNight } = useNotifications()
  const copy = FOCUS_COPY[focus]
  const active = blizzardMode || polarNight
  const description = blizzardMode ? copy.blizzard : polarNight ? copy.night : copy.normal
  const accent = blizzardMode ? "#ff5252" : polarNight ? "#b388ff" : "#39ff14"
  const glow = blizzardMode ? "linear-gradient(135deg, rgba(255,82,82,0.12), rgba(8,13,24,0.9))" : polarNight ? "linear-gradient(135deg, rgba(179,136,255,0.13), rgba(8,13,24,0.9))" : "linear-gradient(135deg, rgba(57,255,20,0.08), rgba(8,13,24,0.92))"

  return (
    <section className="nilm-3d-panel nilm-scanline" style={{
      display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 18,
      alignItems: "center", marginBottom: 24, padding: "16px 18px",
      borderRadius: 14, border: `1px solid ${accent}70`,
      background: glow, boxShadow: active ? `0 0 26px ${accent}38, inset 0 0 30px ${accent}12` : `0 0 18px ${accent}12`,
      fontFamily: '"Inter", "Segoe UI", Arial, Helvetica, sans-serif',
      transform: "perspective(1200px) rotateX(2deg)",
      position: "relative",
      overflow: "hidden",
    }}>
      <span aria-hidden="true" style={{ position: "absolute", left: -80, top: -40, width: 180, height: 180, borderRadius: "50%", border: `1px solid ${accent}50`, filter: "blur(0.5px)", boxShadow: `0 0 22px ${accent}44 inset`, transform: "rotate(12deg)" }} />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: accent, boxShadow: `0 0 8px ${accent}`, animation: active ? "bePulse 1.2s infinite" : "none" }} />
          <strong style={{ color: accent, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: '"Inter", "Segoe UI", Arial, Helvetica, sans-serif' }}>{copy.title}</strong>
          <span style={{ color: "rgba(200,219,232,0.5)", fontSize: 10 }}>{active ? "SIMULATION ACTIVE" : "BASELINE"}</span>
        </div>
        <p style={{ color: "#c8dbe8", fontSize: 12, lineHeight: 1.5 }}>{description}</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button onClick={() => setBlizzardMode(!blizzardMode)} style={{
          border: `1px solid ${blizzardMode ? "#ff5252" : "rgba(200,219,232,0.2)"}`,
          background: blizzardMode ? "#ff525220" : "transparent", color: blizzardMode ? "#ff5252" : "#c8dbe8",
          borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 10, fontWeight: 700,
          fontFamily: '"Inter", "Segoe UI", Arial, Helvetica, sans-serif',
          boxShadow: blizzardMode ? "0 0 10px rgba(255,82,82,0.4)" : "none",
        }}>{blizzardMode ? "BLIZZARD ON" : "BLIZZARD"}</button>
        <button onClick={() => setPolarNight(!polarNight)} style={{
          border: `1px solid ${polarNight ? "#b388ff" : "rgba(200,219,232,0.2)"}`,
          background: polarNight ? "#b388ff20" : "transparent", color: polarNight ? "#b388ff" : "#c8dbe8",
          borderRadius: 7, padding: "7px 10px", cursor: "pointer", fontSize: 10, fontWeight: 700,
          fontFamily: '"Inter", "Segoe UI", Arial, Helvetica, sans-serif',
          boxShadow: polarNight ? "0 0 10px rgba(179,136,255,0.4)" : "none",
        }}>{polarNight ? "POLAR NIGHT ON" : "POLAR NIGHT"}</button>
      </div>
    </section>
  )
}
