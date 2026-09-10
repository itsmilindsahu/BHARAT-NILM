"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NotificationBell } from "./NotificationBell"

const LINKS = [
  { href: "/",           label: "Home",       color: "#00e5ff" },
  { href: "/professor",  label: "Research",   color: "#00e5ff" },
  { href: "/user",       label: "Consumer",   color: "#39ff14" },
  { href: "/industrial", label: "Industrial", color: "#ffb300" },
  { href: "/grid",       label: "DISCOM",     color: "#e040fb" },
  { href: "/infer",      label: "⚡ Infer",   color: "#ff9f00" },
  { href: "/devices",    label: "🔌 Devices", color: "#39ff14" },
]

export function GlobalNav() {
  const pathname = usePathname()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=DM+Sans:wght@400;500&display=swap');
        .gnav-link { transition: color 0.2s, border-color 0.2s; }
        .gnav-link:hover { opacity: 0.85; }
      `}</style>

      <nav style={{
        position: "sticky", top: 0, zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px",
        height: 52,
        background: "rgba(4,9,15,0.92)",
        borderBottom: "1px solid rgba(0,229,255,0.08)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}>

        {/* Logo */}
        <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
          <img
            src="/Logo-Bharat-NILM.png"
            alt="Bharat NILM"
            style={{
              height: 36,
              width: "auto",
              display: "block",
              filter: "drop-shadow(0 0 8px rgba(0,160,255,0.9)) drop-shadow(0 0 20px rgba(0,100,255,0.5))",
            }}
          />
        </Link>

        {/* Nav links */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {LINKS.map(l => {
            const active = pathname === l.href
            return (
              <Link key={l.href} href={l.href} className="gnav-link" style={{
                textDecoration: "none",
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: 11, fontWeight: 600,
                letterSpacing: "0.06em",
                color: active ? l.color : "rgba(200,219,232,0.45)",
                background: active ? l.color + "12" : "transparent",
                border: `1px solid ${active ? l.color + "30" : "transparent"}`,
              }}>
                {l.label}
              </Link>
            )
          })}
        </div>

        {/* Right side: live dot + bell */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: "50%",
              background: "#39ff14",
              boxShadow: "0 0 6px #39ff14",
              animation: "navPulse 2s ease-in-out infinite",
            }} />
            <span style={{ fontSize: 10, color: "#39ff14", letterSpacing: "0.1em", fontWeight: 600 }}>LIVE</span>
          </div>
          <NotificationBell />
        </div>

      </nav>

      <style>{`
        @keyframes navPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        main { padding-top: 0; }
      `}</style>
    </>
  )
}