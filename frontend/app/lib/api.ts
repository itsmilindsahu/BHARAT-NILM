const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"

export function apiUrl(path = "") {
  const base = API_BASE.replace(/\/$/, "")
  if (!path) return base
  return `${base}${path.startsWith("/") ? path : `/${path}`}`
}

export const API_URL = API_BASE.replace(/\/$/, "")
