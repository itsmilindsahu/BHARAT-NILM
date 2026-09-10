"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import {
  AreaChart, Area, PieChart, Pie, Cell,
  CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts"

const HouseScene = dynamic(() => import("../components/HouseScene"), { ssr: false })

// ─── Power Breakdown Table ────────────────────────────────────────────
function PowerBreakdownTable({ data }: { data: Record<string, any> }) {
  if (!data) return null
  const entries = Object.entries(data)
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>⚡ Reactive & Apparent Power per Appliance</SectionTitle>
      <p style={{ fontSize: 12, color: C.muted, marginTop: -14, marginBottom: 16, lineHeight: 1.6 }}>
        Low power factor (PF) = wasted reactive power — critical for accurate AC/motor classification.
      </p>
      <div style={{ overflowX: "auto" as const }}>
        <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Appliance", "Active (W)", "Apparent (kVA)", "Reactive (VAr)", "Power Factor", "PF Quality"].map(h => (
                <th key={h} style={{ padding: "8px 12px", textAlign: "left" as const, color: C.muted, fontWeight: 600, letterSpacing: "0.06em", fontSize: 10 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, d]: any, i) => {
              const pfColor = d.pf > 0.9 ? C.green : d.pf > 0.8 ? C.amber : C.red
              const pfLabel = d.pf > 0.9 ? "Excellent" : d.pf > 0.8 ? "Acceptable" : "Poor — High VAr"
              return (
                <tr key={name} style={{ borderBottom: `1px solid rgba(0,229,255,0.05)`, background: i % 2 === 0 ? "rgba(0,0,0,0.1)" : "transparent" }}>
                  <td style={{ padding: "10px 12px", color: "#fff", fontWeight: 600 }}>{name}</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'Orbitron',monospace", color: C.accent }}>{d.w}W</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'Orbitron',monospace", color: C.purple }}>{d.kva} VA</td>
                  <td style={{ padding: "10px 12px", fontFamily: "'Orbitron',monospace", color: C.amber }}>{d.var} VAr</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                        <div style={{ height: "100%", width: `${d.pf * 100}%`, background: pfColor, borderRadius: 3, transition: "width 0.6s" }} />
                      </div>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, color: pfColor }}>{d.pf.toFixed(2)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}><Badge label={pfLabel} color={pfColor} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

// ─── Vampire Load Time-of-Day Breakdown ─────────────────────────────
function VampireTOD({ data }: { data: any[] }) {
  if (!data) return null
  const DEVICE_COLORS: Record<string, string> = {
    Fridge: C.accent, Router: C.green, STB: C.purple,
    Chargers: C.amber, "TV Standby": C.red, TV: C.red, "AC Standby": "#00bcd4",
  }
  const currentHour = new Date().getHours()
  const activeBandIdx = currentHour < 6 ? 0 : currentHour < 10 ? 1 : currentHour < 18 ? 2 : 3
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>🧛 Standby / Vampire Load by Time-of-Day</SectionTitle>
      <p style={{ fontSize: 12, color: C.muted, marginTop: -14, marginBottom: 20, lineHeight: 1.6 }}>
        Which devices are silently drawing power in each time window — and how much.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {data.map((slot, idx) => (
          <div key={idx} style={{
            background: idx === activeBandIdx ? "rgba(0,229,255,0.06)" : "rgba(0,0,0,0.2)",
            border: `1px solid ${idx === activeBandIdx ? C.accent + "50" : C.border}`,
            borderRadius: 12, padding: "16px",
            boxShadow: idx === activeBandIdx ? `0 0 12px ${C.accent}18` : "none",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: idx === activeBandIdx ? C.accent : C.muted, fontWeight: 700, letterSpacing: "0.08em" }}>
                {slot.band} {idx === activeBandIdx && "← NOW"}
              </div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700, color: C.red }}>
                {slot.total}W
              </div>
            </div>
            {Object.entries(slot.devices).map(([dev, w]: any) => (
              <div key={dev} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: C.text }}>{dev}</span>
                  <span style={{ fontSize: 11, color: DEVICE_COLORS[dev] || C.muted, fontFamily: "'Orbitron',monospace" }}>{w}W</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${Math.min((w / slot.total) * 100, 100)}%`, background: DEVICE_COLORS[dev] || C.muted, borderRadius: 2, transition: "width 0.5s" }} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── Duty Cycle Histogram ────────────────────────────────────────────
function DutyCycleHistogram({ data }: { data: Record<string, any> }) {
  if (!data) return null
  const entries = Object.entries(data)
  const colors: Record<string, string> = { AC: C.accent, Fridge: C.purple, Fan: C.green, TV: C.amber, Geyser: C.red }
  const maxHours = 24
  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>⏱ Appliance Duty Cycle & Usage Duration</SectionTitle>
      <p style={{ fontSize: 12, color: C.muted, marginTop: -14, marginBottom: 20, lineHeight: 1.6 }}>
        Hours/day each appliance runs today vs 7-day average. High duty cycle = high cost impact.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
        {entries.map(([name, d]: any) => {
          const color = colors[name] || C.accent
          const todayPct = (d.hours_today / maxHours) * 100
          const avgPct   = (d.avg_7d / maxHours) * 100
          return (
            <div key={name} style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${color}25`, borderRadius: 12, padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{name}</span>
                <span style={{ fontSize: 10, color: C.muted }}>{d.on_cycles} cycles</span>
              </div>
              {/* Today */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>Today</span>
                  <span style={{ fontSize: 11, fontFamily: "'Orbitron',monospace", color }}>{d.hours_today}h</span>
                </div>
                <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${todayPct}%`, background: `linear-gradient(90deg,${color},${color}88)`, borderRadius: 4, transition: "width 0.6s", boxShadow: `0 0 8px ${color}44` }} />
                </div>
              </div>
              {/* 7-day avg */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>7d Avg</span>
                  <span style={{ fontSize: 11, fontFamily: "'Orbitron',monospace", color: C.muted }}>{d.avg_7d}h</span>
                </div>
                <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
                  <div style={{ height: "100%", width: `${avgPct}%`, background: `rgba(200,219,232,0.3)`, borderRadius: 4, transition: "width 0.6s" }} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ─── Time-of-Use Cost Optimisation ──────────────────────────────────
function TouOptimiser({ tou }: { tou: any }) {
  if (!tou) return null
  const bandColor: Record<string, string> = { peak: C.red, normal: C.amber, off_peak: C.green }
  const color = bandColor[tou.band] || C.accent
  const scoreAngle = (tou.score / 100) * 180 // 0–180 degree arc
  return (
    <SectionCard style={{ marginBottom: 24, border: `1px solid ${color}30`, boxShadow: `0 0 20px ${color}10` }}>
      <SectionTitle>🇮🇳 Time-of-Use Cost Optimisation</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 28, alignItems: "start" }}>
        {/* Score Gauge */}
        <div style={{ textAlign: "center" as const }}>
          <svg width={220} height={130} viewBox="0 0 220 130">
            <path d="M30 110 A80 80 0 0 1 190 110" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={14} strokeLinecap="round" />
            <path
              d={`M30 110 A80 80 0 0 1 ${30 + Math.cos(Math.PI - (scoreAngle * Math.PI / 180)) * 80 + 80} ${110 - Math.sin(Math.PI - (scoreAngle * Math.PI / 180)) * 80}`}
              fill="none" stroke={color} strokeWidth={14} strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}
            />
            <text x={110} y={95} textAnchor="middle" fill={color} style={{ fontFamily: "'Orbitron',monospace", fontSize: 28, fontWeight: 700 }}>{tou.score}</text>
            <text x={110} y={112} textAnchor="middle" fill={C.muted} style={{ fontSize: 10 }}>/100 ToU Score</text>
          </svg>
          <div style={{ marginTop: 4 }}>
            <Badge label={tou.band.replace("_", " ").toUpperCase()} color={color} />
          </div>
          <div style={{ marginTop: 8, fontFamily: "'Orbitron',monospace", fontSize: 13, color }}>
            ₹{tou.tariff_rs_kwh}/kWh
          </div>
        </div>

        {/* Windows + Recommendation */}
        <div>
          <div style={{ background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 4, letterSpacing: "0.06em" }}>💡 RECOMMENDATION</div>
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{tou.recommendation}</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {tou.windows.map((w: any, i: number) => {
              const wc = w.color === "green" ? C.green : w.color === "red" ? C.red : C.amber
              const isActive = tou.band === w.label.toLowerCase().replace(" ", "_")
              return (
                <div key={i} style={{
                  background: isActive ? wc + "15" : "rgba(0,0,0,0.2)",
                  border: `1px solid ${isActive ? wc + "50" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  <div style={{ fontSize: 10, color: wc, fontWeight: 700, marginBottom: 4 }}>{w.label}</div>
                  <div style={{ fontSize: 11, color: C.text, marginBottom: 4 }}>{w.hours}</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, color: wc }}>{w.rate}</div>
                  {isActive && <div style={{ marginTop: 6 }}><Badge label="NOW" color={wc} /></div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

// ─── Occupancy Inference Panel ───────────────────────────────────────
function OccupancyPanel({ occ }: { occ: any }) {
  if (!occ) return null
  const stateColor: Record<string, string> = {
    "Sleep": C.purple, "Away": C.amber, "Home — Active": C.green, "Home — Idle": C.accent,
  }
  const color = stateColor[occ.state] || C.accent
  return (
    <SectionCard style={{ marginBottom: 24, border: `1px solid ${color}30` }}>
      <SectionTitle>🧠 Occupancy Inference (HMM-Driven)</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 24, alignItems: "center" }}>
        {/* State */}
        <div style={{ textAlign: "center" as const }}>
          <div style={{ fontSize: 52, marginBottom: 8 }}>{occ.icon}</div>
          <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, fontWeight: 700, color }}>{occ.state}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{occ.confidence}% confidence</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 6, background: "rgba(255,255,255,0.07)", borderRadius: 3, width: 100, margin: "0 auto" }}>
              <div style={{ height: "100%", width: `${occ.confidence}%`, background: color, borderRadius: 3, boxShadow: `0 0 8px ${color}66` }} />
            </div>
          </div>
        </div>

        {/* Load info */}
        <div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Load Regime: <span style={{ color }}>{occ.regime}</span></div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.8 }}>
            The HMM model analyses your aggregate load pattern and infers your home's occupancy state.
            This enables smart automation triggers without cameras or sensors.
          </div>
        </div>

        {/* Automation triggers */}
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", marginBottom: 10 }}>AUTO TRIGGERS</div>
          {occ.automations.map((a: string, i: number) => (
            <div key={i} style={{
              background: `${color}10`, border: `1px solid ${color}25`,
              borderRadius: 8, padding: "6px 12px", marginBottom: 6,
              fontSize: 11, color: C.text, display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
              {a}
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  )
}

const C = {
  bg: "#04090f",
  surface: "rgba(255,255,255,0.03)",
  border: "rgba(0,229,255,0.10)",
  accent: "#00e5ff",
  green: "#39ff14",
  amber: "#ffb300",
  purple: "#b388ff",
  red: "#ff5252",
  text: "#c8dbe8",
  muted: "rgba(200,219,232,0.4)",
}

const APP_COLORS = [C.accent, C.green, C.amber, C.purple, C.red]

function riskColor(r: string) {
  if (r === "CRITICAL" || r === "HIGH") return C.red
  if (r === "WARNING" || r === "MODERATE") return C.amber
  return C.green
}

function SectionCard({ children, style = {} }: any) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "24px 28px", ...style }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: any) {
  return (
    <h2 style={{ fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 20 }}>
      {children}
    </h2>
  )
}

function StatRow({ label, value, color = C.text, mono = false }: any) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid rgba(0,229,255,0.06)` }}>
      <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: mono ? "'Orbitron',monospace" : "inherit" }}>{value}</span>
    </div>
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

function GaugeArc({ value, max = 100, color, label, unit = "" }: any) {
  const pct = Math.min(value / max, 1)
  const r = 52, cx = 64, cy = 64
  const startAngle = Math.PI * 0.8, endAngle = Math.PI * 2.2
  const totalArc = endAngle - startAngle
  const angle = startAngle + pct * totalArc
  const arcX = (a: number) => cx + r * Math.cos(a)
  const arcY = (a: number) => cy + r * Math.sin(a)
  const largeFull = totalArc > Math.PI ? 1 : 0
  const largeVal = pct * totalArc > Math.PI ? 1 : 0
  const trackPath = `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeFull} 1 ${arcX(endAngle)} ${arcY(endAngle)}`
  const valPath = pct > 0 ? `M ${arcX(startAngle)} ${arcY(startAngle)} A ${r} ${r} 0 ${largeVal} 1 ${arcX(angle)} ${arcY(angle)}` : ""
  return (
    <div style={{ textAlign: "center" as const }}>
      <svg width={128} height={100} viewBox="0 0 128 100">
        <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} strokeLinecap="round" />
        {valPath && <path d={valPath} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }} />}
        <text x={cx} y={cy + 10} textAnchor="middle" fill={color} style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700 }}>
          {typeof value === "number" ? value.toFixed(0) : value}
        </text>
        <text x={cx} y={cy + 26} textAnchor="middle" fill={C.muted} style={{ fontSize: 10 }}>{unit}</text>
      </svg>
      <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.06em", marginTop: -8 }}>{label}</div>
    </div>
  )
}

function ApplianceCard({ name, watt, pct, color, isOff, isDominant }: any) {
  const icons: Record<string, string> = { AC: "❄", Fridge: "🧊", Fan: "💨", TV: "📺", Geyser: "🔥", "Washing Machine": "🫧" }
  return (
    <div style={{
      background: isOff ? "rgba(255,82,82,0.04)" : C.surface,
      border: `1px solid ${isDominant ? color + "60" : isOff ? "rgba(255,82,82,0.2)" : color + "25"}`,
      borderRadius: 12, padding: "16px 18px", transition: "all 0.3s",
      boxShadow: isDominant ? `0 0 16px ${color}22` : "none",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 20 }}>{icons[name] || "⚡"}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: isOff ? C.muted : C.text }}>{name}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{pct.toFixed(1)}% of total</div>
          </div>
        </div>
        <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 15, fontWeight: 700, color: isOff ? C.muted : color }}>
          {isOff ? "OFF" : `${watt}W`}
        </div>
      </div>
      {isDominant && !isOff && (
        <div style={{ marginBottom: 8 }}>
          <Badge label="RF Active" color={color} />
        </div>
      )}
      <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{
          height: "100%", borderRadius: 2, width: `${isOff ? 0 : pct}%`,
          background: `linear-gradient(90deg,${color},${color}66)`,
          transition: "width 0.6s ease",
        }} />
      </div>
    </div>
  )
}

// NEW: ML Insight strip for consumer dashboard
function MLStrip({ ml }: { ml: any }) {
  if (!ml) return null
  const anomalyColor = ml.anomaly_score > 70 ? C.red : ml.anomaly_score > 40 ? C.amber : C.green
  const handleFeedback = async (isCorrect: boolean) => {
    try {
      await fetch("http://127.0.0.1:8000/feedback-disaggregation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          detected: ml.dominant_appliance,
          is_correct: isCorrect
        })
      });
      alert(isCorrect ? "Thanks! Model is learning." : "Noted. We'll adjust the model.");
    } catch { }
  }

  return (
    <div>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16,
      }}>
        {[
          { label: "RF Dominant", value: ml.dominant_appliance, color: C.accent, sub: `${ml.rf_confidence}% confidence` },
          { label: "Anomaly Score", value: `${ml.anomaly_score}%`, color: anomalyColor, sub: ml.anomaly_score > 70 ? "Spike detected" : "Normal" },
          { label: "HMM State", value: ml.hmm_state, color: C.purple, sub: "Consumption regime" },
          { label: "LSTM Forecast", value: ml.lstm_forecast_w > 0 ? `${ml.lstm_forecast_w.toFixed(0)}W` : "—", color: C.amber, sub: "Next interval" },
        ].map((item, i) => (
          <div key={i} style={{
            background: C.surface, border: `1px solid ${item.color}20`,
            borderRadius: 12, padding: "16px 18px",
            position: "relative" as const, overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${item.color},transparent)` }} />
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 6 }}>{item.label}</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: item.color, textTransform: "uppercase" as const }}>{item.value}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Active Learning Feedback Loop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.3)', padding: "10px 16px", borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 24 }}>
        <span style={{ fontSize: 12, color: C.muted }}>Was the dominant appliance correctly identified as <strong>{ml.dominant_appliance}</strong>?</span>
        <button onClick={() => handleFeedback(true)} style={{ background: `${C.green}20`, color: C.green, border: `1px solid ${C.green}50`, padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>YES</button>
        <button onClick={() => handleFeedback(false)} style={{ background: `${C.red}20`, color: C.red, border: `1px solid ${C.red}50`, padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer" }}>NO</button>
      </div>
    </div>
  )
}

// NILM Predict panel
function NilmPredict() {
  const [watts, setWatts] = useState("1200")
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const r = await fetch("http://127.0.0.1:8000/nilm-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggregate: parseFloat(watts), timestamp: new Date().toISOString() }),
      })
      setResult(await r.json())
    } catch { setResult(null) }
    setLoading(false)
  }

  return (
    <SectionCard style={{ marginBottom: 24 }}>
      <SectionTitle>NILM Predict — Manual Input</SectionTitle>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
        <input
          type="number"
          value={watts}
          onChange={e => setWatts(e.target.value)}
          style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "10px 14px", color: C.accent,
            fontFamily: "'Orbitron',monospace", fontSize: 16, width: 160,
            outline: "none",
          }}
          placeholder="Watts"
        />
        <button onClick={run} disabled={loading} style={{
          background: `${C.accent}18`, border: `1px solid ${C.accent}40`,
          borderRadius: 8, padding: "10px 20px", color: C.accent,
          fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700,
          cursor: "pointer", letterSpacing: "0.08em",
          opacity: loading ? 0.5 : 1,
        }}>
          {loading ? "RUNNING..." : "RUN INFERENCE"}
        </button>
      </div>
      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "RF Label", value: result.rf_label, color: C.accent },
            { label: "Confidence", value: `${(result.rf_confidence * 100).toFixed(1)}%`, color: C.green },
            { label: "Anomaly", value: `${(result.anomaly_score * 100).toFixed(1)}%`, color: result.anomaly_score > 0.7 ? C.red : C.green },
            { label: "LSTM Fcst", value: result.lstm_forecast > 0 ? `${result.lstm_forecast.toFixed(0)}W` : "—", color: C.amber },
          ].map((r, i) => (
            <div key={i} style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${r.color}20` }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4, letterSpacing: "0.08em" }}>{r.label}</div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: r.color, textTransform: "uppercase" as const }}>{r.value}</div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function UpgradeSimulator() {
  const [appliance, setAppliance] = useState("AC")
  const [currentStars, setCurrentStars] = useState(2)
  const [targetStars, setTargetStars] = useState(5)
  const [hours, setHours] = useState(6)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const runSim = async () => {
    setLoading(true)
    try {
      const r = await fetch(`http://127.0.0.1:8000/simulate-upgrade?appliance=${appliance}&current_stars=${currentStars}&target_stars=${targetStars}&daily_hours=${hours}`)
      setResult(await r.json())
    } catch { setResult(null) }
    setLoading(false)
  }

  return (
    <SectionCard style={{ marginBottom: 24, border: `1px solid ${C.purple}40` }}>
      <SectionTitle><span style={{ color: C.purple }}>What-If Simulator (Appliance Upgrades)</span></SectionTitle>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select value={appliance} onChange={e => setAppliance(e.target.value)} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: C.text, fontFamily: "'Orbitron',monospace", outline: "none" }}>
          {["AC", "Fridge", "Fan", "TV", "Geyser", "Washing Machine"].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>From:</span>
          <select value={currentStars} onChange={e => setCurrentStars(Number(e.target.value))} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", color: C.text, outline: "none" }}>
            {[1, 2, 3].map(s => <option key={s} value={s}>{s} Star</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>To:</span>
          <select value={targetStars} onChange={e => setTargetStars(Number(e.target.value))} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", color: C.text, outline: "none" }}>
            {[4, 5].map(s => <option key={s} value={s}>{s} Star</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: C.muted }}>Hours/day:</span>
          <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px", color: C.text, width: 60, outline: "none" }} />
        </div>
        <button onClick={runSim} disabled={loading} style={{ background: `${C.purple}20`, border: `1px solid ${C.purple}50`, borderRadius: 8, padding: "8px 16px", color: C.purple, fontFamily: "'Orbitron',monospace", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          {loading ? "CALCULATING..." : "SIMULATE"}
        </button>
      </div>

      {result && result.monthly_savings_rs !== undefined && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.accent}20` }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Load Reduction</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.accent }}>⬇ {result.reduction_pct}%</div>
            <div style={{ fontSize: 10, color: C.text, marginTop: 4 }}>{result.current_w}W → {result.target_w}W</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.green}20` }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Monthly Savings</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.green }}>₹{Number(result.monthly_savings_rs).toLocaleString()}</div>
          </div>
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.green}40`, boxShadow: `0 0 10px ${C.green}20` }}>
            <div style={{ fontSize: 10, color: C.green, marginBottom: 4 }}>Yearly Projection</div>
            <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: C.green }}>₹{Number(result.yearly_savings_rs).toLocaleString()}</div>
          </div>
        </div>
      )}
      {result && result.detail && (
        <div style={{ color: C.red, fontSize: 12, marginTop: 12 }}>API Error: {JSON.stringify(result.detail)}</div>
      )}
    </SectionCard>
  )
}

const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, name, percent }: any) => {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill={C.muted} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" style={{ fontSize: 10 }}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  )
}

// ─── Smart Plug Mini Toggle ────────────────────────────────
function MiniToggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div onClick={e => { e.stopPropagation(); onChange() }} style={{
      width: 44, height: 24, borderRadius: 24,
      background: on ? C.green + "22" : "rgba(255,255,255,0.06)",
      border: `1.5px solid ${on ? C.green : "rgba(255,255,255,0.15)"}`,
      position: "relative" as const, cursor: "pointer",
      transition: "all 0.25s ease", flexShrink: 0,
      boxShadow: on ? `0 0 10px ${C.green}44` : "none",
    }}>
      <div style={{
        position: "absolute", top: "50%",
        transform: `translateY(-50%) translateX(${on ? 22 : 3}px)`,
        width: 16, height: 16, borderRadius: "50%",
        background: on ? C.green : "rgba(255,255,255,0.25)",
        transition: "all 0.25s ease",
        boxShadow: on ? `0 0 6px ${C.green}` : "none",
      }} />
    </div>
  )
}

const PLUG_META: Record<string, { icon: string; color: string }> = {
  ac:              { icon: "❄️",  color: "#00e5ff" },
  fridge:          { icon: "🧊",  color: "#b388ff" },
  fan:             { icon: "💨",  color: "#39ff14" },
  tv:              { icon: "📺",  color: "#e040fb" },
  geyser:          { icon: "🔥",  color: "#ffb300" },
  washing_machine: { icon: "🫧",  color: "#00bcd4" },
  microwave:       { icon: "📡",  color: "#ff9800" },
  light:           { icon: "💡",  color: "#ffee58" },
  other:           { icon: "🔌",  color: "#90a4ae" },
}

function SmartPlugSection() {
  const [plugs, setPlugs]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [totalW, setTotalW]   = useState(0)

  const fetchPlugs = async () => {
    try {
      const r = await fetch("http://127.0.0.1:8000/devices")
      const d = await r.json()
      setPlugs(d)
      setTotalW(d.filter((p: any) => p.on).reduce((s: number, p: any) => s + p.watts_now, 0))
      setLoading(false)
    } catch {}
  }

  useEffect(() => {
    fetchPlugs()
    const iv = setInterval(fetchPlugs, 4000)
    return () => clearInterval(iv)
  }, [])

  const toggle = async (id: string) => {
    await fetch(`http://127.0.0.1:8000/devices/${id}/toggle`, { method: "POST" })
    fetchPlugs()
  }

  const allOff = async () => {
    await Promise.all(plugs.filter(p => p.on).map(p => fetch(`http://127.0.0.1:8000/devices/${p.id}/toggle`, { method: "POST" })))
    fetchPlugs()
  }

  if (loading) return null

  const activeCount = plugs.filter(p => p.on).length

  return (
    <SectionCard style={{ marginBottom: 24, border: `1px solid rgba(0,188,212,0.25)` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <SectionTitle>🔌 Smart Plug Control</SectionTitle>
          <p style={{ fontSize: 12, color: C.muted, marginTop: -14 }}>
            {activeCount} of {plugs.length} plugs active · {totalW.toFixed(0)}W live draw
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/devices" style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", color: "#00bcd4", textDecoration: "none",
            background: "rgba(0,188,212,0.1)", border: "1px solid rgba(0,188,212,0.3)",
          }}>MANAGE ALL →</a>
          <button onClick={allOff} style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.08em", color: C.red, cursor: "pointer",
            background: C.red + "10", border: `1px solid ${C.red}30`,
          }}>ALL OFF</button>
        </div>
      </div>

      {plugs.length === 0 ? (
        <div style={{ textAlign: "center" as const, padding: "24px 0", opacity: 0.4 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em" }}>
            NO PLUGS REGISTERED — <a href="/devices" style={{ color: "#00bcd4" }}>ADD ONE →</a>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {plugs.map(plug => {
            const meta = PLUG_META[plug.appliance] ?? PLUG_META.other
            return (
              <div key={plug.id} style={{
                background: plug.on ? meta.color + "08" : "rgba(0,0,0,0.2)",
                border: `1px solid ${plug.on ? meta.color + "35" : "rgba(255,255,255,0.07)"}`,
                borderRadius: 12, padding: "14px 16px",
                transition: "all 0.25s ease",
                boxShadow: plug.on ? `0 2px 16px ${meta.color}12` : "none",
              }}>
                {/* Top row: icon + name + toggle */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20, filter: plug.on ? "none" : "grayscale(1) opacity(0.4)" }}>
                    {meta.icon}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: plug.on ? "#fff" : C.muted,
                      whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>
                      {plug.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>{plug.room}</div>
                  </div>
                  <MiniToggle on={plug.on} onChange={() => toggle(plug.id)} />
                </div>

                {/* Watt + cost row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{
                    fontFamily: "'Orbitron',monospace", fontSize: 14, fontWeight: 700,
                    color: plug.on ? meta.color : C.muted,
                  }}>
                    {plug.on ? `${plug.watts_now}W` : "OFF"}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>₹{plug.cost_today}/day</div>
                </div>

                {/* Mini energy bar */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.05)", borderRadius: 2, marginTop: 10 }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: plug.on ? `${Math.min((plug.watts_now / (PLUG_META[plug.appliance]?.color === "#ffb300" ? 2000 : 1200)) * 100, 100)}%` : "0%",
                    background: `linear-gradient(90deg,${meta.color}88,${meta.color})`,
                    transition: "width 0.5s ease",
                  }} />
                </div>

                {/* Schedule badge if set */}
                {plug.schedule && (
                  <div style={{ marginTop: 8, fontSize: 9, color: C.amber, letterSpacing: "0.06em" }}>
                    ⏰ {plug.schedule.off_at && `AUTO OFF ${plug.schedule.off_at}`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

export default function ConsumerDashboard() {
  const [data, setData] = useState<any>(null)
  const [paused, setPaused] = useState(false)
  const [history, setHistory] = useState<{ t: number; load: number; carbon: number; forecast: number }[]>([])
  const [mode, setMode] = useState<"postpaid" | "prepaid">("postpaid")
  const [tick, setTick] = useState(0)
  const [shutdown, setShutdown] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const doFetch = () => {
      if (paused) return
      fetch(`http://127.0.0.1:8000/consumer-dashboard?mode=${mode}`)
        .then(r => r.json()).then((d: any) => {
          setData(d)
          setTick(t => {
            const next = t + 1
            setHistory(prev => [...prev.slice(-40), {
              t: next,
              load: d.total_load,
              carbon: d.carbon_footprint,
              forecast: d.ml?.lstm_forecast_w ?? 0,
            }])
            return next
          })
        }).catch(() => { })
    }
    doFetch()
    const iv = setInterval(doFetch, 3500)
    return () => clearInterval(iv)
  }, [paused, mode])

  const toggleDevice = async (device: string) => {
    const newStatus = !shutdown[device]
    setShutdown(prev => ({ ...prev, [device]: newStatus }))
    await fetch("http://127.0.0.1:8000/toggle-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device, status: newStatus }),
    }).catch(() => { })
  }

  if (!data) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: C.bg }}>
      <div style={{ fontFamily: "'Orbitron',monospace", color: C.accent, fontSize: 14, letterSpacing: "0.2em" }}>LOADING...</div>
    </div>
  )

  const appliances = data.appliances ?? {}
  const applianceData = Object.entries(appliances).map(([name, value]) => ({ name, value: value as number }))
  const totalLoad = data.total_load ?? 0
  const pieData = applianceData.filter(a => (a.value as number) > 0)
  const dominantAppliance = data.ml?.dominant_appliance ?? ""

  const recommendations: { icon: string; text: string; saving?: string }[] = []
  if (data.efficiency_score < 60) recommendations.push({ icon: "⚡", text: "High consumption detected. Consider shifting heavy loads to off-peak hours (10PM–6AM).", saving: "Save up to ₹200/month" })
  if (data.carbon_footprint > 2) recommendations.push({ icon: "🌱", text: "Carbon footprint elevated. Running AC at 26°C instead of 22°C reduces load by ~25%.", saving: "Save ~300W" })
  if (data.ml?.anomaly_score > 50) recommendations.push({ icon: "⚠️", text: `Anomaly detected (${data.ml.anomaly_score}% probability). Unusual load spike — check ${dominantAppliance || "appliances"}.`, saving: undefined })
  if (data.ml?.hmm_state === "High Usage") recommendations.push({ icon: "📊", text: "HMM model detects high-usage regime. This is a peak consumption window — optimal time to defer non-essential loads.", saving: undefined })
  if (recommendations.length === 0) recommendations.push({ icon: "✅", text: "All systems normal. Consumption is within efficient range.", saving: undefined })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; font-family: 'DM Sans', sans-serif; color: ${C.text}; }
        .device-toggle { cursor: pointer; transition: all 0.2s; }
        .device-toggle:hover { opacity: 0.8; }
      `}</style>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px 80px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.15em", fontFamily: "'Orbitron',monospace", marginBottom: 8 }}>CONSUMER DASHBOARD</div>
            <h1 style={{ fontFamily: "'Orbitron',monospace", fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 4 }}>Residential Monitor</h1>
            <p style={{ fontSize: 13, color: C.muted }}>Live appliance disaggregation · ML-powered insights</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {(["postpaid", "prepaid"] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: "8px 18px", borderRadius: 8, cursor: "pointer",
                fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                background: mode === m ? `${C.accent}18` : "transparent",
                border: `1px solid ${mode === m ? C.accent + "50" : "rgba(255,255,255,0.08)"}`,
                color: mode === m ? C.accent : C.muted,
                transition: "all 0.2s",
              }}>{m.toUpperCase()}</button>
            ))}
            <button onClick={() => setPaused(p => !p)} style={{
              padding: "8px 18px", borderRadius: 8, cursor: "pointer",
              fontFamily: "'Orbitron',monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              background: paused ? `${C.amber}18` : "transparent",
              border: `1px solid ${paused ? C.amber + "50" : "rgba(255,255,255,0.08)"}`,
              color: paused ? C.amber : C.muted,
            }}>{paused ? "▶ RESUME" : "⏸ PAUSE"}</button>
          </div>
        </div>

        {/* ML Insight Strip — NEW */}
        <MLStrip ml={data.ml} />

        {/* Row 1: KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
          <SectionCard style={{ padding: "20px 24px" }}>
            <SectionTitle>Billing</SectionTitle>
            <StatRow label="Current Bill" value={`₹${data.current_bill?.toFixed(0)}`} mono color={C.accent} />
            <StatRow label="End-Month Est." value={`₹${data.predicted_end_month?.toFixed(0)}`} mono color={C.amber} />
            <StatRow label="Total Load" value={`${totalLoad}W`} mono color={C.accent} />
            <StatRow label="Financial Stability" value={`${data.financial_stability}%`} color={data.financial_stability > 75 ? C.green : C.amber} />
          </SectionCard>

          <SectionCard>
            <SectionTitle>Efficiency & Carbon</SectionTitle>
            <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", paddingTop: 8 }}>
              <GaugeArc value={data.efficiency_score} max={100} color={data.efficiency_score > 70 ? C.green : C.amber} label="Efficiency" unit="/ 100" />
              <GaugeArc value={data.carbon_footprint} max={5} color={data.carbon_footprint > 3 ? C.red : C.green} label="Carbon" unit="kg CO₂" />
            </div>
          </SectionCard>

          <SectionCard>
            <SectionTitle>{mode === "prepaid" ? "Prepaid Balance" : "Account Status"}</SectionTitle>
            {mode === "prepaid" ? (
              <>
                <div style={{ textAlign: "center" as const, padding: "12px 0 20px" }}>
                  <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", marginBottom: 8, textTransform: "uppercase" as const }}>Balance Remaining</div>
                  <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 32, fontWeight: 700, color: riskColor(data.cutoff_risk) }}>
                    ₹{data.prepaid_balance?.toFixed(0)}
                  </div>
                  <div style={{ marginTop: 10 }}><RiskBadge level={data.cutoff_risk} /></div>
                </div>
                <StatRow label="Days Remaining" value={`${data.days_left} days`} />
                <StatRow label="Daily Cost" value={`₹${(data.current_bill / new Date().getDate()).toFixed(1)}`} />
              </>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {[
                  { label: "Peak Hour Risk", value: totalLoad > 4000 ? "HIGH" : totalLoad > 3000 ? "MODERATE" : "LOW" },
                  { label: "Bill Shock Risk", value: data.predicted_end_month > 6000 ? "HIGH" : data.predicted_end_month > 4000 ? "MODERATE" : "LOW" },
                  { label: "Anomaly Risk", value: data.ml?.anomaly_score > 70 ? "HIGH" : data.ml?.anomaly_score > 40 ? "MODERATE" : "LOW" },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid rgba(0,229,255,0.06)` }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{s.label}</span>
                    <RiskBadge level={s.value} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* New Stat: Gamification / Benchmarking */}
          <SectionCard style={{ padding: "20px 24px" }}>
            <SectionTitle>Community Benchmark</SectionTitle>
            <StatRow label="Neighborhood Avg" value={`${data.neighborhood_avg?.toFixed(0)}W`} mono />
            <StatRow
              label="Vs Neighborhood"
              value={data.user_comparison_pct > 0 ? `+${data.user_comparison_pct}%` : `${data.user_comparison_pct}%`}
              color={data.user_comparison_pct > 0 ? "#ff5252" : C.green}
              mono
            />
            <div style={{ marginTop: 12, padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: 8, fontSize: 11, color: C.text, border: `1px solid rgba(255,255,255,0.05)` }}>
              {data.user_comparison_pct < 0
                ? "🎉 You are more efficient than similar homes in your area!"
                : "💡 Reduce usage to improve your neighborhood rank."}
            </div>
          </SectionCard>
        </div>

        {/* Row 2: Appliance Cards + Remote Control */}
        <SectionCard style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <SectionTitle>Appliance Disaggregation — Live</SectionTitle>
            <div style={{ fontSize: 11, color: C.muted }}>Click card to toggle remote shutdown</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 12 }}>
            {applianceData.map((a, i) => (
              <div key={a.name} className="device-toggle" onClick={() => toggleDevice(a.name)}>
                <ApplianceCard
                  name={a.name}
                  watt={a.value}
                  pct={(a.value / totalLoad) * 100 || 0}
                  color={APP_COLORS[i % 5]}
                  isOff={shutdown[a.name] || a.value === 0}
                  isDominant={a.name.toLowerCase() === dominantAppliance.toLowerCase()}
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Row 2.5: Ghost Load and Appliance Health (NEW) */}
        {data.appliance_health && (
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24, marginBottom: 24 }}>
            {/* Vampire Power Insights */}
            <SectionCard>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 24 }}>🧛‍♂️</span>
                <SectionTitle>Ghost Load Tracking</SectionTitle>
              </div>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 32, fontWeight: 700, color: C.text, marginBottom: 8 }}>
                {data.ghost_load_w?.toFixed(0)}W
              </div>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
                This is your "always-on" vampire power trace while your house is asleep.
              </p>
              <div style={{ background: `${C.green}18`, border: `1px solid ${C.green}40`, borderRadius: 8, padding: 12 }}>
                <span style={{ fontSize: 10, color: C.green, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Potential Savings</span>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 16, fontWeight: 700, color: C.green, marginTop: 4 }}>
                  ₹{data.potential_savings?.toFixed(0)} / mo
                </div>
              </div>
            </SectionCard>

            {/* Appliance Health intelligence */}
            <SectionCard>
              <SectionTitle>Appliance Health & Upgrade Intelligence</SectionTitle>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                {Object.entries(data.appliance_health).map(([app, health]: any) => (
                  <div key={app} style={{
                    background: health.upgrade_recommended ? "rgba(255,82,82,0.05)" : "rgba(0,0,0,0.3)",
                    border: `1px solid ${health.upgrade_recommended ? C.red + "40" : C.border}`,
                    borderRadius: 10, padding: "12px 14px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{app}</span>
                      <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, color: health.score > 80 ? C.green : health.score > 60 ? C.amber : C.red }}>
                        {health.score}/100
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>Status: <span style={{ color: "white" }}>{health.status}</span></div>
                    {health.upgrade_recommended && (
                      <div style={{ marginTop: 8 }}>
                        <Badge label="UPGRADE RECOMMENDED" color={C.red} />
                        <div style={{ fontSize: 9, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>
                          Consuming more power than baseline specs. Upgrading could save ~10-15%.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── NEW: Reactive & Apparent Power per appliance ── */}
        {data.power_breakdown && <PowerBreakdownTable data={data.power_breakdown} />}

        {/* ── NEW: Vampire / Standby Load by time-of-day ── */}
        {data.vampire_tod && <VampireTOD data={data.vampire_tod} />}

        {/* ── NEW: Duty Cycle & Usage Duration Histogram ── */}
        {data.duty_cycle && <DutyCycleHistogram data={data.duty_cycle} />}

        {/* ── NEW: Indian ToU Cost Optimisation ── */}
        {data.tou && <TouOptimiser tou={data.tou} />}

        {/* ── NEW: Occupancy Inference ── */}
        {data.occupancy && <OccupancyPanel occ={data.occupancy} />}

        {/* Row 3: 3D House */}
        <SectionCard style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <SectionTitle>Live Home Energy Visualisation</SectionTitle>
              <p style={{ fontSize: 12, color: C.muted, marginTop: -12, lineHeight: 1.6 }}>Windows glow when appliances are active. Wall colour shifts with load level.</p>
            </div>
            {data.ml && (
              <div style={{ textAlign: "right" as const }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>HMM STATE</div>
                <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 13, color: C.purple }}>{data.ml.hmm_state}</div>
              </div>
            )}
          </div>
          <div style={{ height: 340, borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.3)", border: `1px solid ${C.border}` }}>
            <HouseScene appliances={appliances} totalLoad={totalLoad} efficiency={data.efficiency_score ?? 72} />
          </div>
        </SectionCard>

        {/* Row 4: Charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 24, marginBottom: 24 }}>
          <SectionCard>
            <SectionTitle>Live Load vs LSTM Forecast</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(0,229,255,0.06)" />
                <XAxis dataKey="t" hide />
                <YAxis stroke={C.muted} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => [`${v}W`, n === "load" ? "Actual" : "LSTM Forecast"]} />
                <Area type="monotone" dataKey="load" stroke={C.accent} fill="url(#loadGrad)" strokeWidth={2} />
                <ReferenceLine y={data.ml?.lstm_forecast_w ?? 0} stroke={C.amber} strokeDasharray="4 3"
                  label={{ value: "Forecast", fill: C.amber, fontSize: 9, position: "right" }} />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard>
            <SectionTitle>Usage Distribution</SectionTitle>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={36} labelLine={false} label={renderCustomLabel}>
                  {pieData.map((_, i) => <Cell key={i} fill={APP_COLORS[i % 5]} opacity={0.85} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any, n: any) => [`${v}W`, n]} />
              </PieChart>
            </ResponsiveContainer>
          </SectionCard>
        </div>

        {/* Row 5: Carbon Trend */}
        <SectionCard style={{ marginBottom: 24 }}>
          <SectionTitle>Carbon Footprint Trend</SectionTitle>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={history}>
              <defs>
                <linearGradient id="carbonGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff5252" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ff5252" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,82,82,0.06)" />
              <XAxis dataKey="t" hide />
              <YAxis stroke={C.muted} tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}kg`} />
              <Tooltip contentStyle={{ background: "#0a1929", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} formatter={(v: any) => [`${v} kg CO₂`, "Carbon"]} />
              <Area type="monotone" dataKey="carbon" stroke="#ff5252" fill="url(#carbonGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* NILM Predict — NEW */}
        <NilmPredict />

        {/* What-If Simulator — NEW */}
        <UpgradeSimulator />

        {/* Smart Plug Control — Live Devices */}
        <SmartPlugSection />

        {/* AI Recommendations */}
        <SectionCard>
          <SectionTitle>AI Smart Recommendations</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
            {recommendations.map((r, i) => (
              <div key={i} style={{
                background: "rgba(0,0,0,0.25)",
                border: `1px solid ${r.text.includes("normal") ? C.green + "40" : C.amber + "30"}`,
                borderLeft: `3px solid ${r.text.includes("normal") ? C.green : r.text.includes("Anomaly") ? C.red : C.amber}`,
                borderRadius: 10, padding: "14px 16px",
                display: "flex", gap: 12, alignItems: "flex-start",
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
                <div>
                  <p style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{r.text}</p>
                  {r.saving && <span style={{ fontSize: 10, color: C.green, fontWeight: 600, letterSpacing: "0.06em", marginTop: 4, display: "block" }}>{r.saving}</span>}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </>
  )
}