"use client"

import { useEffect, useRef } from "react"
import { useNotifications, Alert, AlertSeverity, AlertSource } from "./NotificationContext"

// ─── Config ───────────────────────────────────────────────
const SEV: Record<AlertSeverity, { color: string; bg: string; icon: string; label: string }> = {
  critical: { color: "#ff5252", bg: "rgba(255,82,82,0.10)",  icon: "⚠",  label: "CRITICAL" },
  warning:  { color: "#ffb300", bg: "rgba(255,179,0,0.10)",  icon: "▲",  label: "WARNING"  },
  info:     { color: "#00e5ff", bg: "rgba(0,229,255,0.10)",  icon: "ℹ",  label: "INFO"     },
  success:  { color: "#39ff14", bg: "rgba(57,255,20,0.10)",  icon: "✓",  label: "OK"       },
}

const SRC: Record<AlertSource, { label: string; color: string }> = {
  consumer:   { label: "Consumer",   color: "#39ff14" },
  industrial: { label: "Industrial", color: "#ffb300" },
  grid:       { label: "DISCOM",     color: "#e040fb" },
  research:   { label: "Research",   color: "#00e5ff" },
}

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 60)  return `${s}s ago`
  if (s < 3600) return `${Math.floor(s/60)}m ago`
  return `${Math.floor(s/3600)}h ago`
}

// ─── Single alert row ─────────────────────────────────────
function AlertRow({ alert, onRead }: { alert: Alert; onRead: () => void }) {
  const sev = SEV[alert.severity]
  const src = SRC[alert.source]
  return (
    <div
      onClick={onRead}
      style={{
        padding: "14px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        background: alert.read ? "transparent" : sev.bg,
        cursor: "pointer",
        transition: "background 0.2s",
        position: "relative" as const,
      }}
    >
      {/* Unread dot */}
      {!alert.read && (
        <div style={{
          position: "absolute", top: 14, right: 14,
          width: 7, height: 7, borderRadius: "50%",
          background: sev.color,
          boxShadow: `0 0 6px ${sev.color}`,
        }} />
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Icon */}
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: sev.bg, border: `1px solid ${sev.color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, color: sev.color,
        }}>{sev.icon}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{alert.title}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
              padding: "1px 6px", borderRadius: 4,
              background: sev.color + "20", color: sev.color,
            }}>{sev.label}</span>
            <span style={{
              fontSize: 9, letterSpacing: "0.08em",
              padding: "1px 6px", borderRadius: 4,
              background: src.color + "15", color: src.color,
            }}>{src.label}</span>
          </div>

          {/* Message */}
          <p style={{ fontSize: 11, color: "rgba(200,219,232,0.6)", lineHeight: 1.5, margin: 0 }}>
            {alert.message}
          </p>

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
            {alert.value && (
              <span style={{
                fontSize: 11, fontFamily: "'Orbitron',monospace",
                color: sev.color, fontWeight: 700,
              }}>{alert.value}</span>
            )}
            <span style={{ fontSize: 10, color: "rgba(200,219,232,0.3)", marginLeft: "auto" }}>
              {timeAgo(alert.timestamp)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Slide-out panel ──────────────────────────────────────
function NotificationPanel() {
  const { alerts, unreadCount, markAllRead, markRead, clearAll, panelOpen, setPanelOpen } = useNotifications()
  const panelRef = useRef<HTMLDivElement>(null!)

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    setTimeout(() => document.addEventListener("mousedown", handler), 0)
    return () => document.removeEventListener("mousedown", handler)
  }, [panelOpen, setPanelOpen])

  const criticals = alerts.filter(a => a.severity === "critical").length
  const warnings  = alerts.filter(a => a.severity === "warning").length

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        top: 0, right: 0,
        width: 380,
        height: "100vh",
        background: "rgba(4,9,15,0.97)",
        borderLeft: "1px solid rgba(0,229,255,0.12)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column" as const,
        transform: panelOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Panel header */}
      <div style={{
        padding: "20px 20px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "0.1em" }}>
              ALERTS
            </span>
            {unreadCount > 0 && (
              <span style={{
                background: "#ff5252", color: "#fff",
                fontSize: 10, fontWeight: 700,
                padding: "2px 7px", borderRadius: 10,
              }}>{unreadCount}</span>
            )}
          </div>
          <button
            onClick={() => setPanelOpen(false)}
            style={{
              background: "rgba(255,255,255,0.06)", border: "none",
              color: "rgba(200,219,232,0.6)", cursor: "pointer",
              width: 28, height: 28, borderRadius: 8, fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          {[
            { label: "Critical", count: criticals, color: "#ff5252" },
            { label: "Warning",  count: warnings,  color: "#ffb300" },
            { label: "Total",    count: alerts.length, color: "#00e5ff" },
          ].map(s => (
            <div key={s.label} style={{
              background: s.color + "10", border: `1px solid ${s.color}25`,
              borderRadius: 8, padding: "8px 10px", textAlign: "center" as const,
            }}>
              <div style={{ fontFamily: "'Orbitron',monospace", fontSize: 18, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 9, color: "rgba(200,219,232,0.4)", letterSpacing: "0.08em", marginTop: 2 }}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        {alerts.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={markAllRead} style={{
              flex: 1, padding: "7px 0", borderRadius: 7,
              background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.2)",
              color: "#00e5ff", fontSize: 10, fontWeight: 600, cursor: "pointer",
              letterSpacing: "0.06em",
            }}>MARK ALL READ</button>
            <button onClick={clearAll} style={{
              flex: 1, padding: "7px 0", borderRadius: 7,
              background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)",
              color: "#ff5252", fontSize: 10, fontWeight: 600, cursor: "pointer",
              letterSpacing: "0.06em",
            }}>CLEAR ALL</button>
          </div>
        )}
      </div>

      {/* Alert list */}
      <div style={{ flex: 1, overflowY: "auto" as const }}>
        {alerts.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column" as const,
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 12, opacity: 0.4,
          }}>
            <span style={{ fontSize: 36 }}>🔕</span>
            <span style={{ fontFamily: "'Orbitron',monospace", fontSize: 10, color: "#fff", letterSpacing: "0.1em" }}>
              NO ALERTS
            </span>
          </div>
        ) : (
          alerts.map(alert => (
            <AlertRow key={alert.id} alert={alert} onRead={() => markRead(alert.id)} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Bell button (drop this in any navbar) ────────────────
export function NotificationBell() {
  const { unreadCount, alerts, panelOpen, setPanelOpen } = useNotifications()
  const hasCritical = alerts.some(a => a.severity === "critical" && !a.read)

  return (
    <>
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        style={{
          position: "relative" as const,
          background: panelOpen ? "rgba(0,229,255,0.12)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${hasCritical ? "rgba(255,82,82,0.4)" : "rgba(0,229,255,0.15)"}`,
          borderRadius: 10,
          width: 38, height: 38,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
          transition: "all 0.2s",
          boxShadow: hasCritical ? "0 0 12px rgba(255,82,82,0.3)" : "none",
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute",
            top: -5, right: -5,
            background: hasCritical ? "#ff5252" : "#ffb300",
            color: "#fff",
            fontSize: 9, fontWeight: 700,
            minWidth: 16, height: 16,
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
            boxShadow: `0 0 8px ${hasCritical ? "#ff5252" : "#ffb300"}`,
            animation: hasCritical ? "criticalPulse 1s ease-in-out infinite" : "none",
          }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <NotificationPanel />

      <style>{`
        @keyframes criticalPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.25); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.2); border-radius: 2px; }
      `}</style>
    </>
  )
}