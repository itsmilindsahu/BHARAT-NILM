"use client"

import { useAlertEngine } from "./NotificationContext"

export function AlertEngineWrapper() {
  useAlertEngine()
  return null
}