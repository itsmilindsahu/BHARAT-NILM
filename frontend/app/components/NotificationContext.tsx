"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react"
import { API_URL } from "../lib/api"

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
  blizzardMode: boolean
  polarNight: boolean
  setBlizzardMode: (enabled: boolean) => void
  setPolarNight: (enabled: boolean) => void
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
  const [blizzardMode, setBlizzardModeState] = useState(false)
  const [polarNight, setPolarNightState] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem("bharat-energy-simulation")
    if (!saved) return
    try {
      const mode = JSON.parse(saved)
      setBlizzardModeState(Boolean(mode.blizzard_mode))
      setPolarNightState(Boolean(mode.polar_night))
    } catch {}
  }, [])

  const syncSimulation = useCallback((nextBlizzard: boolean, nextPolarNight: boolean) => {
    const mode = { blizzard_mode: nextBlizzard, polar_night: nextPolarNight }
    window.localStorage.setItem("bharat-energy-simulation", JSON.stringify(mode))
    fetch(`${API_URL}/simulation-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode),
    }).catch(() => {})
  }, [])

  const setBlizzardMode = useCallback((enabled: boolean) => {
    setBlizzardModeState(enabled)
    syncSimulation(enabled, polarNight)
  }, [polarNight, syncSimulation])

  const setPolarNight = useCallback((enabled: boolean) => {
    setPolarNightState(enabled)
    syncSimulation(blizzardMode, enabled)
  }, [blizzardMode, syncSimulation])

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
      alerts, unreadCount, addAlert, markAllRead, markRead, clearAll, panelOpen, setPanelOpen,
      blizzardMode, polarNight, setBlizzardMode, setPolarNight,
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
        const r = await fetch(`${API_URL}/consumer-dashboard`)
        const d = await r.json()
        if (d.cutoff_risk === "CRITICAL")
          addAlert({ severity: "critical", source: "consumer", title: "Fuel Reserve Critical", message: "Fuel reserve is critically low — resupply risk imminent.", value: `${d.fuel?.reserve_liters ?? 0} L` })
        else if (d.cutoff_risk === "WARNING")
          addAlert({ severity: "warning", source: "consumer", title: "Fuel Reserve Low", message: "Schedule resupply soon to avoid service interruption.", value: `${d.fuel?.reserve_liters ?? 0} L` })
        if (d.total_load > 4500)
          addAlert({ severity: "critical", source: "consumer", title: "Extreme Load Detected", message: "Total residential load exceeds safe threshold.", value: `${d.total_load}W` })
        else if (d.total_load > 3500)
          addAlert({ severity: "warning", source: "consumer", title: "High Station Load Warning", message: "Consider shedding non-essential module load.", value: `${d.total_load}W` })
        if (d.efficiency_score < 50)
          addAlert({ severity: "warning", source: "consumer", title: "Low Efficiency Score", message: "Energy efficiency is below recommended levels.", value: `${d.efficiency_score}/100` })
        if (d.carbon_footprint > 3.5)
          addAlert({ severity: "warning", source: "consumer", title: "High Carbon Footprint", message: "Carbon output is above green threshold.", value: `${d.carbon_footprint} kg CO₂` })
      } catch {}

      // ── Industrial ──
      try {
        const r = await fetch(`${API_URL}/renewable-dashboard`)
        const d = await r.json()
        if (d.overload_risk === "HIGH")
          addAlert({ severity: "critical", source: "industrial", title: "Powerhouse Load Risk", message: "Genset load exceeds 90% — immediate action required.", value: `${d.genset_load_percent}%` })
        else if (d.overload_risk === "MODERATE")
          addAlert({ severity: "warning", source: "industrial", title: "Powerhouse Load Elevated", message: "Genset load above 75% — monitor closely.", value: `${d.genset_load_percent}%` })
        if (d.power_factor < 0.88)
          addAlert({ severity: "critical", source: "industrial", title: "Low Power Factor", message: "Power factor below 0.88 — inspect reactive load.", value: `PF ${d.power_factor}` })
        else if (d.power_factor < 0.92)
          addAlert({ severity: "warning", source: "industrial", title: "Power Factor Warning", message: "Power factor approaching penalty threshold.", value: `PF ${d.power_factor}` })
        if (d.genset_margin_kw < 35)
          addAlert({ severity: "critical", source: "industrial", title: "Genset Margin Low", message: "Current diesel draw is close to comfortable genset capacity.", value: `${d.genset_margin_kw} kW margin` })
        if (d.imbalance_percent > 12)
          addAlert({ severity: "warning", source: "industrial", title: "Phase Imbalance Detected", message: `R/Y/B phase imbalance at ${d.imbalance_percent}% — may cause motor damage.`, value: `${d.imbalance_percent}%` })
      } catch {}

      // ── Grid ──
      try {
        const r = await fetch(`${API_URL}/fuel-dashboard`)
        const d = await r.json()
        const highRisk = Object.entries(d.module_supply_risk ?? {}).filter(([, risk]) => risk === "HIGH")
        if (highRisk?.length > 0)
          addAlert({ severity: "critical", source: "grid", title: "Module Supply Risk", message: `${highRisk.length} module(s) in HIGH supply-risk zone: ${highRisk.map(([name]) => name).join(", ")}`, value: `${highRisk.length} modules` })
        if (d.fuel?.weather_normalised_efficiency_loss_pct > 12)
          addAlert({ severity: "critical", source: "grid", title: "Fuel Efficiency Loss Critical", message: "Weather-normalised fuel efficiency loss exceeds the station threshold.", value: `${d.weather_normalised_efficiency_loss_pct}%` })
        if ((d.unexpected_consumption_flags ?? []).length > 0)
          addAlert({ severity: "warning", source: "grid", title: "Unexpected Consumption Flag", message: d.unexpected_consumption_flags[0], value: "CHECK EQUIPMENT" })
      } catch {}

      // ── Model ──
      try {
        const r = await fetch(`${API_URL}/model-metrics`)
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