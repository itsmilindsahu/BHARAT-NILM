"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react"

// ─── Types ────────────────────────────────────────────────
export type AlertSeverity = "critical" | "warning" | "info" | "success"
export type AlertSource = "consumer" | "industrial" | "grid" | "research"

export interface Alert {
  id: string
  severity: AlertSeverity
  source: AlertSource
  title: string
  message: string
  value?: string
  timestamp: Date
  read: boolean
}

interface NotificationContextType {
  alerts: Alert[]
  unreadCount: number
  addAlert: (alert: Omit<Alert, "id" | "timestamp" | "read">) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
}

// ─── Context ──────────────────────────────────────────────
const NotificationContext = createContext<NotificationContextType | null>(null)

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider")
  return ctx
}

// ─── Dedup helper ─────────────────────────────────────────
function makeId(source: AlertSource, title: string) {
  return `${source}::${title}`
}

// ─── Provider ─────────────────────────────────────────────
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const recentKeys = useRef<Map<string, number>>(new Map())

  const addAlert = useCallback((alert: Omit<Alert, "id" | "timestamp" | "read">) => {
    const key = makeId(alert.source, alert.title)
    const now = Date.now()
    const last = recentKeys.current.get(key) ?? 0
    // Debounce: same alert can only fire every 30s
    if (now - last < 30_000) return
    recentKeys.current.set(key, now)

    const newAlert: Alert = {
      ...alert,
      id: `${key}::${now}`,
      timestamp: new Date(),
      read: false,
    }

    setAlerts(prev => [newAlert, ...prev].slice(0, 50)) // keep max 50
  }, [])

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
  }, [])

  const markRead = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a))
  }, [])

  const clearAll = useCallback(() => {
    setAlerts([])
    recentKeys.current.clear()
  }, [])

  const unreadCount = alerts.filter(a => !a.read).length

  return (
    <NotificationContext.Provider value={{
      alerts, unreadCount, addAlert, markAllRead, markRead, clearAll, panelOpen, setPanelOpen
    }}>
      {children}
    </NotificationContext.Provider>
  )
}

// ─── Alert engine hook ────────────────────────────────────
// Drop this into any layout/page to start watching all backends
export function useAlertEngine() {
  const { addAlert } = useNotifications()

  useEffect(() => {
    const check = async () => {
      // ── Consumer ──
      try {
        const r = await fetch("http://127.0.0.1:8000/consumer-dashboard")
        const d = await r.json()
        if (d.cutoff_risk === "CRITICAL")
          addAlert({ severity: "critical", source: "consumer", title: "Prepaid Balance Critical", message: "Balance is critically low — disconnect risk imminent.", value: `₹${d.prepaid_balance?.toFixed(0)}` })
        else if (d.cutoff_risk === "WARNING")
          addAlert({ severity: "warning", source: "consumer", title: "Prepaid Balance Low", message: "Recharge soon to avoid service interruption.", value: `₹${d.prepaid_balance?.toFixed(0)}` })
        if (d.total_load > 4500)
          addAlert({ severity: "critical", source: "consumer", title: "Extreme Load Detected", message: "Total residential load exceeds safe threshold.", value: `${d.total_load}W` })
        else if (d.total_load > 3500)
          addAlert({ severity: "warning", source: "consumer", title: "High Load Warning", message: "Consider switching off non-essential appliances.", value: `${d.total_load}W` })
        if (d.efficiency_score < 50)
          addAlert({ severity: "warning", source: "consumer", title: "Low Efficiency Score", message: "Energy efficiency is below recommended levels.", value: `${d.efficiency_score}/100` })
        if (d.carbon_footprint > 3.5)
          addAlert({ severity: "warning", source: "consumer", title: "High Carbon Footprint", message: "Carbon output is above green threshold.", value: `${d.carbon_footprint} kg CO₂` })
      } catch {}

      // ── Industrial ──
      try {
        const r = await fetch("http://127.0.0.1:8000/industrial-dashboard")
        const d = await r.json()
        if (d.overload_risk === "HIGH")
          addAlert({ severity: "critical", source: "industrial", title: "Transformer Overload Risk", message: "Transformer load exceeds 90% — immediate action required.", value: `${d.transformer_load_percent}%` })
        else if (d.overload_risk === "MODERATE")
          addAlert({ severity: "warning", source: "industrial", title: "Transformer Load Elevated", message: "Transformer load above 75% — monitor closely.", value: `${d.transformer_load_percent}%` })
        if (d.penalty > 0)
          addAlert({ severity: "warning", source: "industrial", title: "Demand Penalty Incurred", message: `Peak demand exceeded contracted limit by ${d.excess_kva} kVA.`, value: `₹${d.penalty.toLocaleString()}` })
        if (d.power_factor < 0.88)
          addAlert({ severity: "critical", source: "industrial", title: "Low Power Factor", message: "Power factor below 0.88 — PF penalty applied.", value: `PF ${d.power_factor}` })
        else if (d.power_factor < 0.92)
          addAlert({ severity: "warning", source: "industrial", title: "Power Factor Warning", message: "Power factor approaching penalty threshold.", value: `PF ${d.power_factor}` })
        if (d.downtime_risk === "HIGH")
          addAlert({ severity: "critical", source: "industrial", title: "Machine Downtime Risk", message: "Vibration index indicates high breakdown probability.", value: "HIGH RISK" })
        if (d.imbalance_percent > 12)
          addAlert({ severity: "warning", source: "industrial", title: "Phase Imbalance Detected", message: `R/Y/B phase imbalance at ${d.imbalance_percent}% — may cause motor damage.`, value: `${d.imbalance_percent}%` })
      } catch {}

      // ── Grid ──
      try {
        const r = await fetch("http://127.0.0.1:8000/grid-dashboard")
        const d = await r.json()
        const highRisk = d.feeders?.filter((f: any) => f.risk === "HIGH")
        if (highRisk?.length > 0)
          addAlert({ severity: "critical", source: "grid", title: "Feeder Overload Alert", message: `${highRisk.length} feeder(s) in HIGH risk zone: ${highRisk.map((f: any) => f.name).join(", ")}`, value: `${highRisk.length} feeders` })
        if (d.avg_atc_loss > 12)
          addAlert({ severity: "critical", source: "grid", title: "AT&C Loss Critical", message: "Average AT&C loss exceeds 12% threshold across feeders.", value: `${d.avg_atc_loss}%` })
        else if (d.avg_atc_loss > 9)
          addAlert({ severity: "warning", source: "grid", title: "AT&C Loss Elevated", message: "Aggregate distribution losses above normal range.", value: `${d.avg_atc_loss}%` })
        if (d.surge_zone)
          addAlert({ severity: "warning", source: "grid", title: "Surge Zone Active", message: `${d.surge_zone} is the current surge zone. Intervention recommended.`, value: d.surge_zone })
      } catch {}

      // ── Model ──
      try {
        const r = await fetch("http://127.0.0.1:8000/model-metrics")
        const d = await r.json()
        if (d.accuracy < 0.88)
          addAlert({ severity: "warning", source: "research", title: "Model Accuracy Drop", message: "NILM model accuracy has fallen below 88%.", value: `${(d.accuracy * 100).toFixed(1)}%` })
        else
          addAlert({ severity: "success", source: "research", title: "Models Healthy", message: `All NILM models performing well. Accuracy: ${(d.accuracy*100).toFixed(1)}%`, value: `AUC ${d.auc}` })
      } catch {}
    }

    check()
    const iv = setInterval(check, 15_000)
    return () => clearInterval(iv)
  }, [addAlert])
}