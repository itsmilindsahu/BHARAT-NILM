"use client"

import { useEffect, useState } from "react"

const C = {
  bg:     "#04090f",
  accent: "#00e5ff",
  green:  "#39ff14",
  amber:  "#ffb300",
  red:    "#ff5252",
  muted:  "rgba(200,219,232,0.38)",
}

function QRCode({ url, size = 180 }: { url: string; size?: number }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(url)}&color=00e5ff&bgcolor=04090f&margin=12`
  return (
    <img src={src} alt="QR" style={{
      width: size, height: size, borderRadius: 14,
      border: "2px solid rgba(0,229,255,0.25)", display: "block",
    }} />
  )
}

export default function MeterLauncher() {
  const [show,       setShow]       = useState(false)
  const [localIP,    setLocalIP]    = useState("192.168.x.x")
  const [port,       setPort]       = useState("3000")
  const [phoneWatts, setPhoneWatts] = useState<number | null>(null)
  const [phoneActive,setPhoneActive]= useState(false)

  useEffect(() => {
    const h = window.location.hostname
    if (h !== "localhost" && h !== "127.0.0.1") setLocalIP(h)
    setPort(window.location.port || "3000")
  }, [])

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch("http://127.0.0.1:8000/meter/status")
        const d = await r.json()
        setPhoneActive(d.source === "phone" && d.active)
        setPhoneWatts(d.active ? d.watts : null)
      } catch {}
    }
    poll()
    const iv = setInterval(poll, 1500)
    return () => clearInterval(iv)
  }, [])

  const controllerURL = `http://${localIP}:${port}/meter`

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap');
        @keyframes mPulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
        @keyframes mFade  { from{opacity:0;transform:scale(0.94) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
      `}</style>

      {/* Live watts badge above button */}
      {phoneActive && phoneWatts !== null && !show && (
        <div onClick={() => setShow(true)} style={{
          position:"fixed", bottom:88, right:24, zIndex:997,
          padding:"6px 14px", borderRadius:100,
          background:"rgba(57,255,20,0.1)", border:`1px solid ${C.green}35`,
          cursor:"pointer", display:"flex", alignItems:"center", gap:7,
        }}>
          <div style={{ width:6, height:6, borderRadius:"50%",
            background:C.green, boxShadow:`0 0 7px ${C.green}`,
            animation:"mPulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontFamily:"'Orbitron',monospace", fontSize:10,
            fontWeight:700, color:C.green, letterSpacing:"0.08em" }}>
            📱 {Math.round(phoneWatts)}W
          </span>
        </div>
      )}

      {/* Floating button */}
      <button onClick={() => setShow(s => !s)} style={{
        position:"fixed", bottom:24, right:24, zIndex:998,
        width:52, height:52, borderRadius:"50%", cursor:"pointer",
        background: phoneActive
          ? `linear-gradient(135deg,${C.green}30,${C.green}50)`
          : `linear-gradient(135deg,rgba(0,229,255,0.15),rgba(0,229,255,0.28))`,
        border:`2px solid ${phoneActive ? C.green+"60" : C.accent+"45"}`,
        fontSize:20, display:"flex", alignItems:"center", justifyContent:"center",
        boxShadow: phoneActive
          ? `0 0 22px ${C.green}44,0 4px 16px rgba(0,0,0,0.4)`
          : `0 0 14px ${C.accent}28,0 4px 16px rgba(0,0,0,0.4)`,
        transition:"all 0.3s",
      }}>
        {phoneActive ? "📱" : "📡"}
      </button>

      {/* Panel */}
      {show && (
        <div style={{
          position:"fixed", bottom:86, right:24, zIndex:999,
          width:300, borderRadius:20, padding:"22px 20px",
          background:"rgba(4,9,15,0.97)",
          border:"1px solid rgba(0,229,255,0.18)",
          boxShadow:"0 0 60px rgba(0,229,255,0.07),0 20px 48px rgba(0,0,0,0.7)",
          backdropFilter:"blur(24px)",
          animation:"mFade 0.2s ease both",
        }}>
          <button onClick={() => setShow(false)} style={{
            position:"absolute", top:14, right:16,
            background:"none", border:"none", color:C.muted, fontSize:18, cursor:"pointer",
          }}>✕</button>

          <div style={{ fontFamily:"'Orbitron',monospace", fontSize:11,
            fontWeight:700, color:C.accent, letterSpacing:"0.12em", marginBottom:4 }}>
            📱 HAND TO JUDGE
          </div>
          <p style={{ fontSize:11, color:C.muted, marginBottom:18, lineHeight:1.6 }}>
            Scan on their phone. Whatever they set reflects live on all dashboards.
          </p>

          <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
            <QRCode url={controllerURL} size={180} />
          </div>

          <div style={{ background:"rgba(0,229,255,0.05)", borderRadius:10,
            padding:"10px 14px", marginBottom:16,
            border:"1px solid rgba(0,229,255,0.12)",
            fontFamily:"monospace", fontSize:11, color:C.accent,
            wordBreak:"break-all" as const, textAlign:"center" as const }}>
            {controllerURL}
          </div>

          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:9, color:C.muted, letterSpacing:"0.08em",
              marginBottom:6, fontWeight:600 }}>
              LOCAL IP — run ipconfig (Win) / ifconfig (Mac) to find yours
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <input value={localIP} onChange={e => setLocalIP(e.target.value)}
                style={{ flex:1, background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(0,229,255,0.15)", borderRadius:8,
                  padding:"7px 10px", color:C.accent,
                  fontFamily:"monospace", fontSize:12, outline:"none" }} />
              <input value={port} onChange={e => setPort(e.target.value)}
                style={{ width:58, background:"rgba(0,0,0,0.4)",
                  border:"1px solid rgba(0,229,255,0.15)", borderRadius:8,
                  padding:"7px 8px", color:C.accent,
                  fontFamily:"monospace", fontSize:12, outline:"none" }} />
            </div>
          </div>

          <div style={{ padding:"9px 14px", borderRadius:10,
            background: phoneActive ? "rgba(57,255,20,0.06)" : "rgba(255,255,255,0.03)",
            border:`1px solid ${phoneActive ? C.green+"25" : "rgba(255,255,255,0.06)"}`,
            display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <div style={{ width:6, height:6, borderRadius:"50%",
                background: phoneActive ? C.green : C.muted,
                animation: phoneActive ? "mPulse 1.2s ease-in-out infinite" : "none",
                boxShadow: phoneActive ? `0 0 6px ${C.green}` : "none" }} />
              <span style={{ fontSize:10, fontFamily:"'Orbitron',monospace",
                color: phoneActive ? C.green : C.muted, fontWeight:700, letterSpacing:"0.08em" }}>
                {phoneActive ? "PHONE IN CONTROL" : "WAITING FOR PHONE"}
              </span>
            </div>
            {phoneActive && phoneWatts !== null && (
              <span style={{ fontFamily:"'Orbitron',monospace", fontSize:12,
                fontWeight:700, color:C.green }}>
                {Math.round(phoneWatts)}W
              </span>
            )}
          </div>
        </div>
      )}
    </>
  )
}