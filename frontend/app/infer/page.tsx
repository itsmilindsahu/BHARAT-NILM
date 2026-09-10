"use client"

import { useEffect, useRef, useState } from "react"
import {
  AreaChart, Area, BarChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer
} from "recharts"

// ─── Palette ─────────────────────────────────────────────
const C = {
  bg: "#04090f", surface: "rgba(255,255,255,0.03)",
  border: "rgba(0,229,255,0.1)", accent: "#00e5ff",
  green: "#39ff14", amber: "#ffb300", red: "#ff5252",
  purple: "#b388ff", text: "#c8dbe8", muted: "rgba(200,219,232,0.4)",
}

const APPLIANCE_COLORS: Record<string, string> = {
  ac: "#00e5ff", fridge: "#b388ff", geyser: "#ffb300",
  tv: "#e040fb", washing_machine: "#39ff14", default: "#00e5ff",
}

const REGIME_COLOR: Record<string, string> = {
  standby: C.green, normal: C.amber, peak: C.red,
}

// ─── Shared UI ────────────────────────────────────────────
function Card({ children, style = {} }: any) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "22px 26px", ...style }}>
      {children}
    </div>
  )
}

function Label({ children }: any) {
  return <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 6 }}>{children}</div>
}

function Value({ children, color = C.accent, size = 28 }: any) {
  return <div style={{ fontFamily: "'Orbitron',monospace", fontSize: size, fontWeight: 700, color, lineHeight: 1 }}>{children}</div>
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      padding: "3px 12px", borderRadius: 100, fontSize: 10, fontWeight: 700,
      letterSpacing: "0.1em", background: color + "18",
      border: `1px solid ${color}40`, color,
    }}>{label}</span>
  )
}

// ─── Probability bar ──────────────────────────────────────
function ProbBar({ label, prob, color }: { label: string; prob: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.text, textTransform: "capitalize" as const }}>{label.replace("_", " ")}</span>
        <span style={{ fontSize: 11, fontFamily: "'Orbitron',monospace", color }}>{(prob * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
        <div style={{
          height: "100%", borderRadius: 3, width: `${prob * 100}%`,
          background: `linear-gradient(90deg,${color}88,${color})`,
          transition: "width 0.5s ease",
          boxShadow: prob > 0.5 ? `0 0 8px ${color}66` : "none",
        }} />
      </div>
    </div>
  )
}

// ─── Anomaly gauge ────────────────────────────────────────
function AnomalyGauge({ score }: { score: number }) {
  const color = score > 0.7 ? C.red : score > 0.4 ? C.amber : C.green
  const r = 44, cx = 54, cy = 54
  const start = Math.PI * 0.8, end = Math.PI * 2.2
  const arc   = end - start
  const angle = start + score * arc
  const ax = (a: number) => cx + r * Math.cos(a)
  const ay = (a: number) => cy + r * Math.sin(a)
  const large = arc > Math.PI ? 1 : 0
  const largeV = score * arc > Math.PI ? 1 : 0
  const track = `M ${ax(start)} ${ay(start)} A ${r} ${r} 0 ${large} 1 ${ax(end)} ${ay(end)}`
  const val   = score > 0.01 ? `M ${ax(start)} ${ay(start)} A ${r} ${r} 0 ${largeV} 1 ${ax(angle)} ${ay(angle)}` : ""
  return (
    <div style={{ textAlign: "center" as const }}>
      <svg width={108} height={88} viewBox="0 0 108 88">
        <path d={track} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={7} strokeLinecap="round" />
        {val && <path d={val} fill="none" stroke={color} strokeWidth={7} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />}
        <text x={cx} y={cy + 6} textAnchor="middle" fill={color}
          style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700 }}>
          {(score * 100).toFixed(0)}%
        </text>
      </svg>
      <div style={{ fontSize: 10, color: C.muted, marginTop: -6 }}>Anomaly Score</div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────
export default function InferencePage() {
  const [result, setResult]   = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [input, setInput]     = useState("1250")
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState("")
  const [streaming, setStreaming] = useState(false)
  const [baseLoad, setBaseLoad]   = useState("1200")
  const esRef = useRef<EventSource | null>(null)

  // ── Single inference ──
  const runInfer = async () => {
    const agg = parseFloat(input)
    if (isNaN(agg) || agg < 0) { setError("Enter a valid wattage"); return }
    setLoading(true); setError("")
    try {
      const r = await fetch(`http://127.0.0.1:8000/infer?aggregate=${agg}`)
      if (!r.ok) throw new Error(await r.text())
      const d = await r.json()
      setResult(d)
      setHistory(prev => [{ ...d, i: prev.length }, ...prev].slice(0, 40))
    } catch (e: any) {
      setError(e.message || "Inference failed")
    } finally { setLoading(false) }
  }

  // ── SSE stream ──
  const toggleStream = () => {
    if (streaming) {
      esRef.current?.close(); esRef.current = null; setStreaming(false); return
    }
    const es = new EventSource(`http://127.0.0.1:8000/infer/stream?base_load=${baseLoad}&interval=2`)
    es.onmessage = e => {
      const d = JSON.parse(e.data)
      setResult(d)
      setHistory(prev => [{ ...d, i: prev.length }, ...prev].slice(0, 40))
    }
    es.onerror = () => { es.close(); setStreaming(false) }
    esRef.current = es; setStreaming(true)
  }

  useEffect(() => () => esRef.current?.close(), [])

  const chartData = [...history].reverse().map((h, i) => ({
    i, load: h.aggregate, forecast: h.lstm_forecast ?? null, gb: h.gb_next_watt,
  }))

  const probData = result?.rf_all_proba
    ? Object.entries(result.rf_all_proba).map(([name, prob]) => ({ name, prob })).sort((a: any, b: any) => b.prob - a.prob)
    : []

  const appColor = result ? (APPLIANCE_COLORS[result.rf_label] ?? C.accent) : C.accent
  const regColor = result ? (REGIME_COLOR[result.hmm_regime] ?? C.amber) : C.amber

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; color: ${C.text}; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.2); border-radius: 3px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        .anim { animation: fadeUp 0.4s ease both; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `linear-gradient(rgba(0,229,255,0.025) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.025) 1px,transparent 1px)`,
        backgroundSize: "48px 48px" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "0 32px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "24px 0 32px", borderBottom: `1px solid ${C.border}`, marginBottom: 32 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <a href="/" style={{ fontSize: 11, color: C.muted, textDecoration: "none", letterSpacing: "0.06em" }}>← HOME</a>
              <span style={{ color: C.border }}>›</span>
              <span style={{ fontSize: 11, color: C.accent, letterSpacing: "0.06em" }}>LIVE INFERENCE</span>
            </div>
            <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "0.05em" }}>
              Real-Time ML Inference
            </h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
              5 trained models — RF · GB · LogReg · HMM · LSTM — running on live smart meter data
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: streaming ? C.green : C.muted,
              animation: streaming ? "pulse 1.5s infinite" : "none" }} />
            <span style={{ fontSize: 10, color: streaming ? C.green : C.muted, letterSpacing: "0.1em" }}>
              {streaming ? "STREAMING" : "IDLE"}
            </span>
          </div>
        </div>

        {/* ── Input panel ── */}
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>

            {/* Manual inference */}
            <div>
              <Label>Single Reading — Manual Input</Label>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
                Enter an aggregate wattage and run all 5 models instantly.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="number" value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && runInfer()}
                  placeholder="e.g. 1250"
                  style={{
                    flex: 1, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`,
                    color: "#fff", fontSize: 14, fontFamily: "'Orbitron',monospace",
                    outline: "none",
                  }}
                />
                <button onClick={runInfer} disabled={loading} style={{
                  padding: "10px 22px", borderRadius: 10, cursor: "pointer",
                  background: loading ? "rgba(0,229,255,0.1)" : "rgba(0,229,255,0.15)",
                  color: C.accent, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  border: `1px solid ${C.accent}30`, transition: "all 0.2s",
                }}>{loading ? "RUNNING…" : "RUN INFER"}</button>
              </div>
              {/* Quick presets */}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" as const }}>
                {[["Standby","120"],["Fridge","260"],["Fan","90"],["TV","200"],["AC","1250"],["Geyser","1550"],["All on","3200"]].map(([l,v]) => (
                  <button key={l} onClick={() => setInput(v)} style={{
                    padding: "4px 10px", borderRadius: 6, border: `1px solid rgba(0,229,255,0.15)`,
                    background: "transparent", color: C.muted, fontSize: 10, cursor: "pointer",
                    transition: "color 0.2s",
                  }}>{l} {v}W</button>
                ))}
              </div>
              {error && <p style={{ color: C.red, fontSize: 11, marginTop: 8 }}>⚠ {error}</p>}
            </div>

            {/* SSE streaming */}
            <div style={{ borderLeft: `1px solid ${C.border}`, paddingLeft: 32 }}>
              <Label>Live Stream — Simulated Smart Meter</Label>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.6 }}>
                Backend generates realistic readings every 2s and runs all models continuously via SSE.
              </p>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number" value={baseLoad} onChange={e => setBaseLoad(e.target.value)}
                  placeholder="Base load (W)"
                  style={{
                    width: 130, padding: "10px 14px", borderRadius: 10,
                    background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`,
                    color: "#fff", fontSize: 13, fontFamily: "'Orbitron',monospace", outline: "none",
                  }}
                />
                <button onClick={toggleStream} style={{
                  padding: "10px 22px", borderRadius: 10, cursor: "pointer",
                  background: streaming ? "rgba(255,82,82,0.12)" : "rgba(57,255,20,0.12)",
                  color: streaming ? C.red : C.green, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
                  border: `1px solid ${streaming ? C.red : C.green}30`, transition: "all 0.2s",
                }}>{streaming ? "⏹ STOP" : "▶ START STREAM"}</button>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Results ── */}
        {result && (
          <>
            {/* Row 1: Key outputs */}
            <div className="anim" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 16, marginBottom: 24 }}>
              {[
                { label: "Aggregate",    value: `${result.aggregate}W`,            color: C.accent  },
                { label: "Delta",        value: `${result.delta > 0 ? "+" : ""}${result.delta}W`, color: result.delta > 200 ? C.red : result.delta < -200 ? C.amber : C.green },
                { label: "GB Forecast",  value: `${result.gb_next_watt?.toFixed(0)}W`, color: C.purple },
                { label: "LSTM Forecast",value: result.lstm_ready ? `${result.lstm_forecast?.toFixed(0)}W` : "Warming…", color: result.lstm_ready ? C.amber : C.muted },
                { label: "HMM Regime",   value: result.hmm_regime?.toUpperCase(),  color: regColor  },
              ].map((k, i) => (
                <Card key={i} style={{ border: `1px solid ${k.color}25`, position: "relative" as const, overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
                    background: `linear-gradient(90deg,transparent,${k.color},transparent)` }} />
                  <Label>{k.label}</Label>
                  <Value color={k.color} size={22}>{k.value}</Value>
                </Card>
              ))}
            </div>

            {/* Row 2: RF result + Anomaly + Proba bars */}
            <div className="anim" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 20, marginBottom: 24 }}>

              {/* RF appliance */}
              <Card>
                <Label>RF — Appliance Classification</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 60, height: 60, borderRadius: 14, flexShrink: 0,
                    background: appColor + "15", border: `1px solid ${appColor}30`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26,
                  }}>
                    {({"ac":"❄","fridge":"🧊","geyser":"🔥","tv":"📺","washing_machine":"🫧"} as Record<string,string>)[result.rf_label] ?? "⚡"}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700,
                      color: appColor, textTransform: "capitalize" as const, marginBottom: 4 }}>
                      {result.rf_label.replace("_", " ")}
                    </div>
                    <Badge label={`${(result.rf_confidence * 100).toFixed(1)}% confident`} color={appColor} />
                  </div>
                </div>
                {/* All class probabilities */}
                {probData.map((p: any) => (
                  <ProbBar key={p.name} label={p.name} prob={p.prob}
                    color={APPLIANCE_COLORS[p.name] ?? C.accent} />
                ))}
              </Card>

              {/* Anomaly */}
              <Card>
                <Label>LogReg — Anomaly Detection</Label>
                <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 16, paddingTop: 8 }}>
                  <AnomalyGauge score={result.anomaly_score} />
                  <div style={{ textAlign: "center" as const }}>
                    <Badge
                      label={result.is_anomaly ? "⚠ ANOMALY DETECTED" : "✓ NORMAL"}
                      color={result.is_anomaly ? C.red : C.green}
                    />
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
                      {result.is_anomaly
                        ? "Sudden spike/drop detected. Possible appliance switch or fault."
                        : "Reading within normal distribution range."}
                    </p>
                  </div>
                </div>
              </Card>

              {/* HMM + LSTM */}
              <Card>
                <Label>HMM — Energy Regime</Label>
                <div style={{ marginBottom: 20 }}>
                  <div style={{
                    padding: "14px 16px", borderRadius: 10, marginTop: 8,
                    background: regColor + "10", border: `1px solid ${regColor}30`,
                    display: "flex", alignItems: "center", gap: 14,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: regColor,
                      boxShadow: `0 0 8px ${regColor}` }} />
                    <div>
                      <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: regColor }}>
                        {result.hmm_regime?.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>State {result.hmm_state}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, marginTop: 10, lineHeight: 1.6 }}>
                    {(({ standby: "Low activity — appliances mostly idle.", normal: "Moderate load — typical usage pattern.", peak: "High load — multiple heavy appliances active." } as Record<string,string>)[result.hmm_regime]) ?? ""}
                  </p>
                </div>

                <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 16 }}>
                  <Label>LSTM — Load Forecast</Label>
                  {result.lstm_ready ? (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Value color={C.amber} size={22}>{result.lstm_forecast?.toFixed(0)}W</Value>
                      <span style={{ fontSize: 11, color: C.muted }}>next reading</span>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                      Collecting {24 - history.length} more readings to fill sequence buffer…
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* Row 3: Charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20, marginBottom: 24 }}>
              <Card>
                <Label style={{ marginBottom: 16 }}>Live Load + Forecasts</Label>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="loadG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gbG" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.purple} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.purple} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(0,229,255,0.06)" />
                    <XAxis dataKey="i" hide />
                    <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any, n: string | undefined) => [`${parseFloat(v).toFixed(0)}W`, n === "load" ? "Actual" : n === "gb" ? "GB Forecast" : "LSTM Forecast"]} />
                    <Area type="monotone" dataKey="load" stroke={C.accent}   fill="url(#loadG)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="gb"   stroke={C.purple}   fill="url(#gbG)"  strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                    {history.some(h => h.lstm_ready) && (
                      <Area type="monotone" dataKey="forecast" stroke={C.amber} fill="none" strokeWidth={1.5} strokeDasharray="3 2" dot={false} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <Label style={{ marginBottom: 16 }}>Appliance Probability Distribution</Label>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={probData} layout="vertical" barSize={14}>
                    <CartesianGrid stroke="rgba(0,229,255,0.06)" horizontal={false} />
                    <XAxis type="number" domain={[0, 1]} stroke={C.muted} tick={{ fontSize: 9 }}
                      tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                    <YAxis type="category" dataKey="name" stroke={C.muted} tick={{ fontSize: 10 }}
                      tickFormatter={v => v.replace("_", " ")} width={80} />
                    <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                      formatter={(v: any) => [`${(parseFloat(v) * 100).toFixed(1)}%`, "Probability"]} />
                    <Bar dataKey="prob" radius={[0, 4, 4, 0]}>
                      {probData.map((p: any, i: number) => (
                        <Cell key={i} fill={APPLIANCE_COLORS[p.name] ?? C.accent} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>

            {/* Row 4: Recent history */}
            <Card>
              <Label style={{ marginBottom: 14 }}>Inference History</Label>
              <div style={{ overflowX: "auto" as const }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      {["Time","Aggregate","Delta","RF Label","Confidence","Anomaly","HMM","GB Next","LSTM"].map(h => (
                        <th key={h} style={{ padding: "6px 12px", textAlign: "left" as const, color: C.muted,
                          fontWeight: 600, letterSpacing: "0.08em", fontSize: 9, textTransform: "uppercase" as const }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 15).map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                        <td style={{ padding: "7px 12px", color: C.muted, fontFamily: "monospace" }}>
                          {new Date(row.timestamp).toLocaleTimeString()}
                        </td>
                        <td style={{ padding: "7px 12px", fontFamily: "'Orbitron',monospace", color: C.accent }}>{row.aggregate}W</td>
                        <td style={{ padding: "7px 12px", color: row.delta > 200 ? C.red : row.delta < -200 ? C.amber : C.muted }}>
                          {row.delta > 0 ? "+" : ""}{row.delta}W
                        </td>
                        <td style={{ padding: "7px 12px", color: APPLIANCE_COLORS[row.rf_label] ?? C.accent, textTransform: "capitalize" as const }}>
                          {row.rf_label?.replace("_", " ")}
                        </td>
                        <td style={{ padding: "7px 12px", color: C.text }}>{(row.rf_confidence * 100).toFixed(1)}%</td>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{ color: row.is_anomaly ? C.red : C.green, fontWeight: 700 }}>
                            {row.is_anomaly ? "⚠ YES" : "✓ NO"}
                          </span>
                        </td>
                        <td style={{ padding: "7px 12px", color: REGIME_COLOR[row.hmm_regime] ?? C.muted,
                          textTransform: "capitalize" as const }}>{row.hmm_regime}</td>
                        <td style={{ padding: "7px 12px", color: C.purple, fontFamily: "'Orbitron',monospace" }}>
                          {row.gb_next_watt?.toFixed(0)}W
                        </td>
                        <td style={{ padding: "7px 12px", color: C.amber, fontFamily: "'Orbitron',monospace" }}>
                          {row.lstm_ready ? `${row.lstm_forecast?.toFixed(0)}W` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Empty state */}
        {!result && (
          <div style={{ textAlign: "center" as const, padding: "80px 0", opacity: 0.4 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: C.text, letterSpacing: "0.1em" }}>
              ENTER A WATTAGE OR START STREAMING TO SEE INFERENCE RESULTS
            </div>
          </div>
        )}

      </div>
    </>
  )
}