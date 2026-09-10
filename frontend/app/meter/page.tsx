"use client"

import { useEffect, useRef, useState } from "react"

const C = {
  bg:     "#04090f",
  accent: "#00e5ff",
  green:  "#39ff14",
  amber:  "#ffb300",
  red:    "#ff5252",
  purple: "#b388ff",
  teal:   "#00bcd4",
  text:   "#c8dbe8",
  muted:  "rgba(200,219,232,0.4)",
}

const PRESETS = [
  { label: "Standby",  icon: "💤", watts: 80,   color: C.muted  },
  { label: "Fan",      icon: "💨", watts: 80,   color: C.green  },
  { label: "Fridge",   icon: "🧊", watts: 200,  color: C.teal   },
  { label: "TV",       icon: "📺", watts: 180,  color: C.purple },
  { label: "AC",       icon: "❄️", watts: 1200, color: C.accent },
  { label: "Geyser",   icon: "🔥", watts: 1500, color: C.amber  },
  { label: "Washing",  icon: "🫧", watts: 650,  color: C.teal   },
  { label: "SPIKE",    icon: "⚡", watts: 2800, color: C.red    },
]

export default function MeterController() {
  const [watts,     setWatts]     = useState(500)
  const [label,     setLabel]     = useState("Fan")
  const [active,    setActive]    = useState(false)
  const [connected, setConnected] = useState(false)
  const [inference, setInference] = useState<any>(null)
  const [apiBase,   setApiBase]   = useState("")
  const [ipInput,   setIpInput]   = useState("")
  const [showSetup, setShowSetup] = useState(false)
  const intervalRef = useRef<any>(null)

  // On mount: figure out API base from current hostname
  // If opened via QR at http://192.168.x.x:3000/meter,
  // the backend is at http://192.168.x.x:8000
  useEffect(() => {
    const host = window.location.hostname
    const base = `http://${host}:8000`
    setApiBase(base)
    setIpInput(host)
  }, [])

  // Push watts to backend every second while active
  useEffect(() => {
    clearInterval(intervalRef.current)
    if (!active || !apiBase) return
    const push = async () => {
      try {
        const r = await fetch(`${apiBase}/meter/push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ watts, label }),
        })
        if (r.ok) setConnected(true)
      } catch { setConnected(false) }
    }
    push()
    intervalRef.current = setInterval(push, 1000)
    return () => clearInterval(intervalRef.current)
  }, [active, watts, label, apiBase])

  // Poll inference result
  useEffect(() => {
    if (!apiBase) return
    const poll = async () => {
      try {
        const r = await fetch(`${apiBase}/meter/status`)
        const d = await r.json()
        setInference(d.inference)
        setConnected(true)
      } catch { setConnected(false) }
    }
    poll()
    const iv = setInterval(poll, 1200)
    return () => clearInterval(iv)
  }, [apiBase])

  const release = async () => {
    setActive(false)
    clearInterval(intervalRef.current)
    if (apiBase) await fetch(`${apiBase}/meter/release`, { method: "POST" }).catch(() => {})
  }

  const pickPreset = (p: typeof PRESETS[0]) => {
    setWatts(p.watts)
    setLabel(p.label)
    setActive(true)
  }

  const applyIP = () => {
    setApiBase(`http://${ipInput}:8000`)
    setShowSetup(false)
  }

  const inf = inference
  const anomalyColor = inf?.anomaly_score > 70 ? C.red : inf?.anomaly_score > 40 ? C.amber : C.green
  const confColor    = inf?.rf_confidence  > 80 ? C.green : inf?.rf_confidence > 60 ? C.amber : C.red

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=DM+Sans:wght@400;600&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          background: ${C.bg}; font-family: 'DM Sans', sans-serif; color: ${C.text};
          min-height: 100vh; -webkit-tap-highlight-color: transparent; overflow-x: hidden;
        }
        input[type=range] {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 10px; border-radius: 5px; outline: none; cursor: pointer;
          background: rgba(0,229,255,0.1);
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 34px; height: 34px; border-radius: 50%;
          background: ${C.accent}; box-shadow: 0 0 16px ${C.accent}99; cursor: pointer;
        }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes glow   { 0%,100%{box-shadow:0 0 16px ${C.accent}33} 50%{box-shadow:0 0 40px ${C.accent}77} }
        .preset:active { transform:scale(0.9) !important; }
      `}</style>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "20px 16px 48px" }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22 }}>
          <div>
            <div style={{ fontFamily:"'Orbitron',monospace", fontSize:13, fontWeight:900,
              color:"#fff", letterSpacing:"0.05em" }}>⚡ METER CONTROLLER</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>
              Changes appear live on all dashboards
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {/* Setup button */}
            <button onClick={() => setShowSetup(s => !s)} style={{
              background:"none", border:`1px solid rgba(255,255,255,0.1)`,
              borderRadius:8, padding:"5px 10px", color:C.muted,
              fontSize:10, cursor:"pointer",
            }}>⚙</button>
            {/* Connection pill */}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px",
              borderRadius:100,
              background: connected ? "rgba(57,255,20,0.08)" : "rgba(255,82,82,0.08)",
              border:`1px solid ${connected ? C.green+"30" : C.red+"30"}` }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background: connected ? C.green : C.red,
                boxShadow:`0 0 6px ${connected ? C.green : C.red}`,
                animation:"pulse 1.5s ease-in-out infinite" }} />
              <span style={{ fontSize:9, fontFamily:"'Orbitron',monospace",
                fontWeight:700, letterSpacing:"0.1em",
                color: connected ? C.green : C.red }}>
                {connected ? (active ? "LIVE" : "READY") : "NO CONN"}
              </span>
            </div>
          </div>
        </div>

        {/* IP setup panel */}
        {showSetup && (
          <div style={{ background:"rgba(0,0,0,0.5)", border:`1px solid rgba(0,229,255,0.2)`,
            borderRadius:14, padding:"16px", marginBottom:18 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:10, lineHeight:1.6 }}>
              If not connecting, enter your laptop's WiFi IP manually:
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={ipInput} onChange={e => setIpInput(e.target.value)}
                placeholder="192.168.x.x"
                style={{ flex:1, background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(0,229,255,0.2)", borderRadius:8,
                  padding:"9px 12px", color:C.accent,
                  fontFamily:"monospace", fontSize:13, outline:"none" }} />
              <button onClick={applyIP} style={{
                padding:"9px 16px", borderRadius:8, cursor:"pointer",
                background:`${C.accent}20`, border:`1px solid ${C.accent}40`,
                color:C.accent, fontFamily:"'Orbitron',monospace",
                fontSize:10, fontWeight:700,
              }}>APPLY</button>
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:8 }}>
              Current: <span style={{ color:C.accent, fontFamily:"monospace" }}>{apiBase}</span>
            </div>
          </div>
        )}

        {/* Big watt display */}
        <div style={{
          textAlign:"center" as const, padding:"28px 16px 22px",
          background: active ? "rgba(0,229,255,0.05)" : "rgba(255,255,255,0.02)",
          border:`2px solid ${active ? C.accent+"55" : "rgba(255,255,255,0.06)"}`,
          borderRadius:22, marginBottom:22,
          animation: active ? "glow 2s ease-in-out infinite" : "none",
          transition:"all 0.3s",
        }}>
          <div style={{ fontSize:10, color: active ? C.accent : C.muted,
            letterSpacing:"0.15em", fontFamily:"'Orbitron',monospace", marginBottom:6 }}>
            {active ? "BROADCASTING TO SITE" : "TAP PRESET OR SLIDE"}
          </div>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:58, fontWeight:900,
            color: active ? C.accent : C.muted, lineHeight:1,
            textShadow: active ? `0 0 40px ${C.accent}55` : "none",
            transition:"all 0.25s" }}>
            {watts.toLocaleString()}
          </div>
          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:16,
            color:C.muted, marginTop:4, letterSpacing:"0.1em" }}>WATTS</div>
          {label && active && (
            <div style={{ marginTop:12, display:"inline-block",
              padding:"4px 18px", borderRadius:100,
              background:C.accent+"12", border:`1px solid ${C.accent}30`,
              fontSize:12, color:C.accent, fontWeight:600 }}>
              {label}
            </div>
          )}
        </div>

        {/* Slider */}
        <div style={{ marginBottom:24 }}>
          <div style={{ display:"flex", justifyContent:"space-between",
            fontSize:9, color:C.muted, marginBottom:10, letterSpacing:"0.07em" }}>
            <span>0 W</span>
            <span style={{ color:C.text, fontWeight:600, fontSize:10 }}>DRAG TO SET LOAD</span>
            <span>3000 W</span>
          </div>
          <input type="range" min={0} max={3000} step={10} value={watts}
            onChange={e => { setWatts(Number(e.target.value)); setActive(true) }} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, marginTop:6 }}>
            <span style={{ color:C.green }}>● Standby</span>
            <span style={{ color:C.amber }}>● Normal</span>
            <span style={{ color:C.red }}>● Peak</span>
          </div>
        </div>

        {/* Presets grid */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.1em",
            fontWeight:700, marginBottom:10 }}>QUICK PRESETS</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {PRESETS.map(p => {
              const isActive = active && label === p.label
              return (
                <button key={p.label} className="preset" onClick={() => pickPreset(p)} style={{
                  padding:"12px 4px", borderRadius:14, cursor:"pointer",
                  background: isActive ? p.color+"18" : "rgba(255,255,255,0.025)",
                  border:`1.5px solid ${isActive ? p.color+"55" : "rgba(255,255,255,0.07)"}`,
                  display:"flex", flexDirection:"column" as const,
                  alignItems:"center", gap:4, transition:"all 0.18s",
                  boxShadow: isActive ? `0 0 18px ${p.color}25` : "none",
                }}>
                  <span style={{ fontSize:24, lineHeight:1 }}>{p.icon}</span>
                  <span style={{ fontSize:8, fontWeight:700, letterSpacing:"0.04em",
                    color: isActive ? p.color : C.muted }}>{p.label}</span>
                  <span style={{ fontSize:8, color:C.muted, fontFamily:"monospace" }}>{p.watts}W</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom watt input */}
        <div style={{ display:"flex", gap:8, marginBottom:18 }}>
          <input type="number" placeholder="Custom watts…" min={0} max={9999}
            onChange={e => {
              const v = Number(e.target.value)
              if (v >= 0) { setWatts(v); setLabel("Custom"); setActive(true) }
            }}
            style={{ flex:1, background:"rgba(0,0,0,0.45)",
              border:"1px solid rgba(0,229,255,0.18)", borderRadius:10,
              padding:"11px 14px", color:C.accent,
              fontFamily:"'Orbitron',monospace", fontSize:18, outline:"none" }} />
        </div>

        {/* Start / Stop */}
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:24 }}>
          <button onClick={() => setActive(true)} style={{
            padding:"14px", borderRadius:14, cursor:"pointer",
            background: active
              ? `linear-gradient(135deg,${C.green}25,${C.green}40)`
              : `linear-gradient(135deg,${C.green}10,${C.green}22)`,
            border:`1.5px solid ${C.green}${active ? "70" : "28"}`,
            color:C.green, fontFamily:"'Orbitron',monospace",
            fontSize:11, fontWeight:700, letterSpacing:"0.1em",
            boxShadow: active ? `0 0 20px ${C.green}33` : "none",
            transition:"all 0.25s",
          }}>
            {active ? "▶ LIVE" : "▶ START"}
          </button>
          <button onClick={release} disabled={!active} style={{
            padding:"14px", borderRadius:14,
            cursor: !active ? "not-allowed" : "pointer",
            background: !active ? "transparent" : `linear-gradient(135deg,${C.red}15,${C.red}28)`,
            border:`1.5px solid ${C.red}${!active ? "15" : "45"}`,
            color: !active ? C.muted : C.red,
            fontFamily:"'Orbitron',monospace", fontSize:11, fontWeight:700,
            letterSpacing:"0.1em", opacity: !active ? 0.4 : 1, transition:"all 0.25s",
          }}>
            ⏹ RELEASE
          </button>
        </div>

        {/* Live ML result */}
        {inf && (
          <div style={{ background:"rgba(0,0,0,0.35)",
            border:"1px solid rgba(0,229,255,0.1)", borderRadius:18,
            padding:"18px", animation:"fadeUp 0.4s ease both" }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.12em",
              fontWeight:700, marginBottom:12 }}>LIVE ML RESULT ON SITE RIGHT NOW</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                { label:"Detected",    value: inf.rf_label?.replace("_"," ").toUpperCase(), color:C.accent  },
                { label:"Confidence",  value:`${inf.rf_confidence}%`,                        color:confColor },
                { label:"Anomaly",     value:`${inf.anomaly_score}%`,                         color:anomalyColor },
                { label:"HMM Regime",  value: inf.hmm_regime?.toUpperCase(),                  color:C.purple  },
                { label:"LSTM Fcst",   value: inf.lstm_forecast ? `${inf.lstm_forecast}W`:"—", color:C.teal  },
                { label:"GB Next",     value:`${inf.gb_forecast}W`,                           color:C.amber  },
              ].map((item,i) => (
                <div key={i} style={{ background:"rgba(255,255,255,0.03)",
                  borderRadius:10, padding:"9px 12px", border:`1px solid ${item.color}15` }}>
                  <div style={{ fontSize:8, color:C.muted, letterSpacing:"0.08em", marginBottom:3 }}>
                    {item.label}
                  </div>
                  <div style={{ fontFamily:"'Orbitron',monospace", fontSize:12,
                    fontWeight:700, color:item.color }}>
                    {item.value ?? "—"}
                  </div>
                </div>
              ))}
            </div>
            {inf.is_anomaly && (
              <div style={{ marginTop:10, padding:"9px 14px", borderRadius:10,
                background:"rgba(255,82,82,0.1)", border:`1px solid ${C.red}40`,
                fontSize:11, color:C.red, fontWeight:600, textAlign:"center" as const }}>
                ⚠ ANOMALY — Check main dashboard now
              </div>
            )}
          </div>
        )}

      </div>
    </>
  )
}