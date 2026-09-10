"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts"

const API = "http://127.0.0.1:8000/devices"

// ─── Palette ──────────────────────────────────────────────
const C = {
  bg:      "#04090f",
  surface: "rgba(255,255,255,0.03)",
  border:  "rgba(0,229,255,0.09)",
  accent:  "#00e5ff",
  green:   "#39ff14",
  amber:   "#ffb300",
  red:     "#ff5252",
  purple:  "#b388ff",
  text:    "#c8dbe8",
  muted:   "rgba(200,219,232,0.4)",
}

const APPLIANCE_META: Record<string, { icon: string; color: string; label: string; maxW: number }> = {
  ac:              { icon: "❄️",  color: "#00e5ff", label: "Air Conditioner",  maxW: 1800 },
  fridge:          { icon: "🧊",  color: "#b388ff", label: "Refrigerator",     maxW: 250  },
  fan:             { icon: "💨",  color: "#39ff14", label: "Fan",              maxW: 100  },
  tv:              { icon: "📺",  color: "#e040fb", label: "Television",       maxW: 220  },
  geyser:          { icon: "🔥",  color: "#ffb300", label: "Geyser",           maxW: 2000 },
  washing_machine: { icon: "🫧",  color: "#00bcd4", label: "Washing Machine",  maxW: 800  },
  microwave:       { icon: "📡",  color: "#ff9800", label: "Microwave",        maxW: 1200 },
  light:           { icon: "💡",  color: "#ffee58", label: "Light",            maxW: 40   },
  other:           { icon: "🔌",  color: "#90a4ae", label: "Other",            maxW: 200  },
}

const ROOMS = ["Living Room","Bedroom","Kitchen","Bathroom","Office","Balcony","Other"]
const APPLIANCES = Object.keys(APPLIANCE_META)

// ─── Toggle switch ─────────────────────────────────────────
function Toggle({ on, onChange, size = 48 }: { on: boolean; onChange: () => void; size?: number }) {
  return (
    <div onClick={e => { e.stopPropagation(); onChange() }} style={{
      width: size, height: size * 0.52, borderRadius: size,
      background: on ? C.green + "22" : "rgba(255,255,255,0.06)",
      border: `1.5px solid ${on ? C.green : "rgba(255,255,255,0.15)"}`,
      position: "relative" as const, cursor: "pointer",
      transition: "all 0.25s ease", flexShrink: 0,
      boxShadow: on ? `0 0 14px ${C.green}44` : "none",
    }}>
      <div style={{
        position: "absolute", top: "50%",
        transform: `translateY(-50%) translateX(${on ? size * 0.48 : size * 0.05}px)`,
        width: size * 0.38, height: size * 0.38, borderRadius: "50%",
        background: on ? C.green : "rgba(255,255,255,0.25)",
        transition: "all 0.25s ease",
        boxShadow: on ? `0 0 8px ${C.green}` : "none",
      }} />
    </div>
  )
}

// ─── Energy ring ──────────────────────────────────────────
function EnergyRing({ watts, maxW, color, size = 72 }: any) {
  const pct = Math.min(watts / maxW, 1)
  const r = size * 0.4, cx = size / 2, cy = size / 2
  const circ = 2 * Math.PI * r
  const dash = pct * circ
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 5px ${color}88)`, transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  )
}

// ─── Mini sparkline ───────────────────────────────────────
function Sparkline({ history, color }: any) {
  const data = (history ?? []).slice(-20).map((h: any, i: number) => ({ i, w: h.w }))
  if (data.length < 2) return <div style={{ height: 38 }} />
  const gid = `sg${color.replace(/[^a-z0-9]/gi,"")}`
  return (
    <ResponsiveContainer width="100%" height={38}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="w" stroke={color} fill={`url(#${gid})`} strokeWidth={1.5} dot={false} />
        <Tooltip contentStyle={{ display: "none" }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Schedule modal ───────────────────────────────────────
function ScheduleModal({ plug, onClose, onSave }: any) {
  const [onAt,  setOnAt]  = useState(plug.schedule?.on_at  ?? "")
  const [offAt, setOffAt] = useState(plug.schedule?.off_at ?? "")
  const [label, setLabel] = useState(plug.schedule?.label  ?? "")
  const meta = APPLIANCE_META[plug.appliance] ?? APPLIANCE_META.other

  return (
    <div style={{ position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.75)",
      backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:"#070e1a", border:`1px solid ${meta.color}30`,
        borderRadius:20, padding:32, width:380,
        boxShadow:`0 24px 80px rgba(0,0,0,0.6),0 0 40px ${meta.color}12`,
        animation:"fadeUp 0.2s ease",
      }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22 }}>
          <div>
            <h3 style={{ fontFamily:"'Orbitron',monospace",fontSize:13,color:"#fff",fontWeight:700 }}>
              Schedule — {plug.name}
            </h3>
            <p style={{ fontSize:11,color:C.muted,marginTop:3 }}>Auto on/off timer</p>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer" }}>✕</button>
        </div>

        {[{label:"Turn ON at",val:onAt,set:setOnAt},{label:"Turn OFF at",val:offAt,set:setOffAt}].map(f=>(
          <div key={f.label} style={{ marginBottom:14 }}>
            <label style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",display:"block",marginBottom:5 }}>
              {f.label.toUpperCase()}
            </label>
            <input type="time" value={f.val} onChange={e=>f.set(e.target.value)} style={{
              width:"100%",padding:"10px 14px",borderRadius:10,
              background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,
              color:"#fff",fontSize:16,outline:"none",colorScheme:"dark",
            }}/>
          </div>
        ))}

        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",display:"block",marginBottom:5 }}>
            LABEL (OPTIONAL)
          </label>
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="e.g. Morning routine"
            style={{ width:"100%",padding:"10px 14px",borderRadius:10,
              background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,
              color:"#fff",fontSize:13,outline:"none" }}/>
        </div>

        <div style={{ display:"flex",gap:10 }}>
          <button onClick={()=>onSave({on_at:onAt||null,off_at:offAt||null,label:label||null,repeat:true})}
            style={{ flex:1,padding:"12px 0",borderRadius:10,border:`1px solid ${meta.color}40`,cursor:"pointer",
              background:meta.color+"20",color:meta.color,fontSize:12,fontWeight:700,letterSpacing:"0.08em" }}>
            SAVE
          </button>
          {plug.schedule && (
            <button onClick={()=>onSave(null)}
              style={{ padding:"12px 16px",borderRadius:10,border:`1px solid ${C.red}30`,
                background:C.red+"10",color:C.red,fontSize:12,cursor:"pointer" }}>
              CLEAR
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Add plug modal ────────────────────────────────────────
function AddPlugModal({ onClose, onAdd }: any) {
  const [name,      setName]      = useState("")
  const [appliance, setAppliance] = useState("other")
  const [room,      setRoom]      = useState("Living Room")
  const meta = APPLIANCE_META[appliance]

  return (
    <div style={{ position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.78)",
      backdropFilter:"blur(12px)",display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:"#070e1a",border:`1px solid ${C.border}`,
        borderRadius:20,padding:32,width:430,
        boxShadow:"0 24px 80px rgba(0,0,0,0.6)",
        animation:"fadeUp 0.2s ease",
      }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22 }}>
          <h3 style={{ fontFamily:"'Orbitron',monospace",fontSize:13,color:"#fff",fontWeight:700 }}>
            Register Smart Plug
          </h3>
          <button onClick={onClose} style={{ background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer" }}>✕</button>
        </div>

        <label style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",display:"block",marginBottom:8 }}>APPLIANCE TYPE</label>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:18 }}>
          {APPLIANCES.map(a=>{
            const m=APPLIANCE_META[a]; const sel=appliance===a
            return (
              <button key={a} onClick={()=>setAppliance(a)} style={{
                padding:"10px 8px",borderRadius:10,cursor:"pointer",
                border:`1px solid ${sel?m.color+"50":"rgba(255,255,255,0.07)"}`,
                background:sel?m.color+"15":"transparent",
                display:"flex",flexDirection:"column" as const,alignItems:"center",gap:4,
                transition:"all 0.15s",
              }}>
                <span style={{ fontSize:18 }}>{m.icon}</span>
                <span style={{ fontSize:9,color:sel?m.color:C.muted,letterSpacing:"0.06em" }}>
                  {a.replace("_"," ").toUpperCase()}
                </span>
              </button>
            )
          })}
        </div>

        <label style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",display:"block",marginBottom:5 }}>PLUG NAME</label>
        <input value={name} onChange={e=>setName(e.target.value)}
          placeholder={`e.g. ${meta.label} — Bedroom`}
          onKeyDown={e=>{ if(e.key==="Enter"&&name.trim()){onAdd(name.trim(),appliance,room);onClose()} }}
          style={{ width:"100%",padding:"10px 14px",borderRadius:10,marginBottom:16,
            background:"rgba(0,0,0,0.4)",border:`1px solid ${C.border}`,
            color:"#fff",fontSize:13,outline:"none" }}/>

        <label style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",display:"block",marginBottom:5 }}>ROOM</label>
        <select value={room} onChange={e=>setRoom(e.target.value)} style={{
          width:"100%",padding:"10px 14px",borderRadius:10,marginBottom:24,
          background:"#0a1525",border:`1px solid ${C.border}`,color:"#fff",fontSize:13,outline:"none",
        }}>
          {ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
        </select>

        <button onClick={()=>{ if(name.trim()){onAdd(name.trim(),appliance,room);onClose()} }}
          disabled={!name.trim()} style={{
            width:"100%",padding:"13px 0",borderRadius:12,cursor:"pointer",
            background:name.trim()?`linear-gradient(135deg,${C.accent}20,${C.accent}40)`:"rgba(255,255,255,0.04)",
            color:name.trim()?C.accent:C.muted,fontSize:12,fontWeight:700,letterSpacing:"0.1em",
            border:`1px solid ${name.trim()?C.accent+"40":"transparent"}`,
            transition:"all 0.2s",
          }}>
          ADD PLUG
        </button>
      </div>
    </div>
  )
}

// ─── Plug card ────────────────────────────────────────────
function PlugCard({ plug, onToggle, onOpenSchedule, onRename, onDelete }: any) {
  const [renaming,  setRenaming]  = useState(false)
  const [draftName, setDraftName] = useState(plug.name)
  const meta  = APPLIANCE_META[plug.appliance] ?? APPLIANCE_META.other
  const color = plug.on ? meta.color : "rgba(255,255,255,0.18)"

  return (
    <div style={{
      background: plug.on ? meta.color+"08" : C.surface,
      border:`1px solid ${plug.on?meta.color+"30":"rgba(255,255,255,0.06)"}`,
      borderRadius:18,padding:"20px 22px",
      transition:"all 0.3s ease",
      boxShadow:plug.on?`0 4px 28px ${meta.color}12`:"none",
      animation:"fadeUp 0.4s ease both",
      position:"relative" as const,overflow:"hidden",
    }}>
      {/* Top accent */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:2,
        background:`linear-gradient(90deg,transparent,${color},transparent)`,
        transition:"all 0.3s" }} />

      {/* Header */}
      <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:16 }}>
        {/* Ring + icon */}
        <div style={{ position:"relative" as const,width:72,height:72,flexShrink:0 }}>
          <EnergyRing watts={plug.watts_now} maxW={meta.maxW} color={color} size={72} />
          <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:24,
            filter:plug.on?"none":"grayscale(1) opacity(0.35)" }}>
            {meta.icon}
          </div>
        </div>

        {/* Name */}
        <div style={{ flex:1,minWidth:0 }}>
          {renaming ? (
            <input autoFocus value={draftName} onChange={e=>setDraftName(e.target.value)}
              onBlur={()=>{ onRename(draftName); setRenaming(false) }}
              onKeyDown={e=>{ if(e.key==="Enter"){onRename(draftName);setRenaming(false)} if(e.key==="Escape"){setDraftName(plug.name);setRenaming(false)} }}
              style={{ width:"100%",background:"rgba(0,0,0,0.4)",
                border:`1px solid ${meta.color}50`,borderRadius:8,
                color:"#fff",fontSize:14,fontWeight:600,padding:"4px 8px",outline:"none" }}/>
          ) : (
            <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <span style={{ fontSize:14,fontWeight:600,color:"#fff",cursor:"pointer" }}
                onClick={()=>setRenaming(true)}>{plug.name}</span>
              <span style={{ fontSize:10,cursor:"pointer",opacity:0.35 }} onClick={()=>setRenaming(true)}>✏</span>
            </div>
          )}
          <div style={{ fontSize:10,color:C.muted,marginTop:3 }}>{plug.room} · {meta.label}</div>
          {plug.schedule && (
            <div style={{ marginTop:5,display:"inline-flex",alignItems:"center",gap:4,
              padding:"2px 8px",borderRadius:6,
              background:C.amber+"15",border:`1px solid ${C.amber}30`,
              fontSize:9,color:C.amber,letterSpacing:"0.06em" }}>
              ⏰{plug.schedule.on_at&&` ON ${plug.schedule.on_at}`}
              {plug.schedule.on_at&&plug.schedule.off_at&&" ·"}
              {plug.schedule.off_at&&` OFF ${plug.schedule.off_at}`}
            </div>
          )}
        </div>

        <Toggle on={plug.on} onChange={onToggle} size={52} />
      </div>

      {/* Stats */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12 }}>
        {[
          { label:"Now",        val: plug.on?`${plug.watts_now}W`:"OFF", color:plug.on?meta.color:C.muted },
          { label:"Today",      val:`₹${plug.cost_today}`,               color:C.text },
          { label:"Month",      val:`₹${plug.cost_month}`,               color:C.text },
        ].map(s=>(
          <div key={s.label} style={{ background:"rgba(0,0,0,0.2)",borderRadius:10,
            padding:"8px 10px",textAlign:"center" as const }}>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:12,fontWeight:700,color:s.color }}>
              {s.val}
            </div>
            <div style={{ fontSize:9,color:C.muted,marginTop:2,letterSpacing:"0.08em" }}>
              {s.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Sparkline */}
      {(plug.history?.length??0) > 2 && (
        <div style={{ marginBottom:12 }}>
          <Sparkline history={plug.history} color={plug.on?meta.color:"rgba(255,255,255,0.12)"} />
        </div>
      )}

      {/* Actions */}
      <div style={{ display:"flex",gap:8 }}>
        <button onClick={onOpenSchedule} style={{
          flex:1,padding:"7px 0",borderRadius:8,cursor:"pointer",
          background:"rgba(255,179,0,0.07)",border:`1px solid ${C.amber}22`,
          color:plug.schedule?C.amber:C.muted,fontSize:10,letterSpacing:"0.08em",fontWeight:600,
          transition:"all 0.2s",
        }}>⏰ {plug.schedule?"EDIT SCHED":"SET SCHED"}</button>

        <div style={{ padding:"7px 12px",borderRadius:8,
          background:"rgba(0,0,0,0.2)",border:"1px solid rgba(255,255,255,0.06)",
          display:"flex",alignItems:"center",gap:5 }}>
          <span style={{ fontSize:10,color:plug.signal_strength>70?C.green:C.amber }}>
            {"▂▄▆"[plug.signal_strength>80?2:plug.signal_strength>60?1:0]}
          </span>
          <span style={{ fontSize:9,color:C.muted }}>{plug.signal_strength}%</span>
        </div>

        <button onClick={onDelete} style={{
          padding:"7px 12px",borderRadius:8,cursor:"pointer",
          background:C.red+"08",border:`1px solid ${C.red}18`,
          color:C.red,fontSize:13,opacity:0.65,
          transition:"opacity 0.2s",
        }}>🗑</button>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────
export default function DevicesPage() {
  const [plugs,        setPlugs]        = useState<any[]>([])
  const [showAdd,      setShowAdd]      = useState(false)
  const [schedPlug,    setSchedPlug]    = useState<any>(null)
  const [filterRoom,   setFilterRoom]   = useState("All")
  const [filterStatus, setFilterStatus] = useState("All")
  const [loading,      setLoading]      = useState(true)
  const ivRef = useRef<any>(null)

  const fetchPlugs = useCallback(async () => {
    try {
      const r = await fetch(API)
      const d = await r.json()
      setPlugs(d); setLoading(false)
    } catch {}
  }, [])

  useEffect(() => {
    fetchPlugs()
    ivRef.current = setInterval(fetchPlugs, 3000)
    return () => clearInterval(ivRef.current)
  }, [fetchPlugs])

  const toggle     = async (id: string) => { await fetch(`${API}/${id}/toggle`,{method:"POST"}); fetchPlugs() }
  const addPlug    = async (name: string, appliance: string, room: string) => {
    await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,appliance,room})})
    fetchPlugs()
  }
  const renamePlug = async (id: string, name: string) => {
    await fetch(`${API}/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})})
    fetchPlugs()
  }
  const deletePlug = async (id: string) => {
    await fetch(`${API}/${id}`,{method:"DELETE"})
    setPlugs(prev=>prev.filter(p=>p.id!==id))
  }
  const saveSchedule = async (id: string, sched: any) => {
    if(sched===null) await fetch(`${API}/${id}/schedule`,{method:"DELETE"})
    else await fetch(`${API}/${id}/schedule`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(sched)})
    setSchedPlug(null); fetchPlugs()
  }

  const activeCount = plugs.filter(p=>p.on).length
  const totalWatts  = plugs.filter(p=>p.on).reduce((s,p)=>s+p.watts_now,0)
  const todayCost   = plugs.reduce((s,p)=>s+p.cost_today,0)
  const monthCost   = plugs.reduce((s,p)=>s+p.cost_month,0)
  const rooms       = ["All",...Array.from(new Set(plugs.map(p=>p.room)))]

  const visible = plugs
    .filter(p=>filterRoom==="All"||p.room===filterRoom)
    .filter(p=>filterStatus==="All"||(filterStatus==="On"?p.on:!p.on))

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=DM+Sans:wght@300;400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        body{background:${C.bg};font-family:'DM Sans',sans-serif;color:${C.text}}
        ::-webkit-scrollbar{width:6px}
        ::-webkit-scrollbar-thumb{background:rgba(0,229,255,0.15);border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        select option{background:#0a1525}
        input[type=time]::-webkit-calendar-picker-indicator{filter:invert(1)opacity(.4)}
      `}</style>

      <div style={{ position:"fixed",inset:0,zIndex:0,pointerEvents:"none",
        backgroundImage:`linear-gradient(rgba(0,229,255,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.022) 1px,transparent 1px)`,
        backgroundSize:"48px 48px" }} />

      <div style={{ position:"relative",zIndex:1,maxWidth:1200,margin:"0 auto",padding:"0 32px 80px" }}>

        {/* Header */}
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"24px 0 32px",borderBottom:`1px solid ${C.border}`,marginBottom:32 }}>
          <div>
            <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:6 }}>
              <a href="/" style={{ fontSize:11,color:C.muted,textDecoration:"none" }}>← HOME</a>
              <span style={{ color:C.border }}>›</span>
              <span style={{ fontSize:11,color:C.accent,letterSpacing:"0.06em" }}>DEVICES</span>
            </div>
            <h1 style={{ fontFamily:"'Orbitron',monospace",fontSize:20,fontWeight:900,color:"#fff",letterSpacing:"0.05em" }}>
              Smart Plug Control
            </h1>
            <p style={{ fontSize:13,color:C.muted,marginTop:4 }}>
              {plugs.length} plugs registered · {activeCount} active
            </p>
          </div>
          <button onClick={()=>setShowAdd(true)} style={{
            display:"flex",alignItems:"center",gap:8,
            padding:"10px 20px",borderRadius:12,border:`1px solid ${C.accent}40`,cursor:"pointer",
            background:`linear-gradient(135deg,${C.accent}18,${C.accent}32)`,
            color:C.accent,fontSize:12,fontWeight:700,letterSpacing:"0.08em",
            boxShadow:`0 0 20px ${C.accent}12`,
          }}>+ ADD PLUG</button>
        </div>

        {/* KPI strip */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:28 }}>
          {[
            { label:"Active Plugs",    val:`${activeCount}/${plugs.length}`, color:C.green  },
            { label:"Total Load",      val:totalWatts>0?`${totalWatts.toFixed(0)}W`:"0W",   color:C.accent },
            { label:"Cost Today",      val:`₹${todayCost.toFixed(2)}`,       color:C.amber  },
            { label:"Cost This Month", val:`₹${monthCost.toFixed(2)}`,       color:C.purple },
          ].map((k,i)=>(
            <div key={i} style={{
              background:C.surface,border:`1px solid ${k.color}20`,
              borderRadius:14,padding:"18px 20px",
              position:"relative" as const,overflow:"hidden",
              animation:`fadeUp 0.4s ease ${i*0.06}s both`,
            }}>
              <div style={{ position:"absolute",top:0,left:0,right:0,height:2,
                background:`linear-gradient(90deg,transparent,${k.color},transparent)` }} />
              <div style={{ fontSize:10,color:C.muted,letterSpacing:"0.1em",marginBottom:8 }}>
                {k.label.toUpperCase()}
              </div>
              <div style={{ fontFamily:"'Orbitron',monospace",fontSize:26,fontWeight:700,color:k.color }}>
                {k.val}
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24,flexWrap:"wrap" as const }}>
          <span style={{ fontSize:11,color:C.muted,letterSpacing:"0.08em" }}>FILTER:</span>
          {["All","On","Off"].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)} style={{
              padding:"5px 14px",borderRadius:8,cursor:"pointer",
              background:filterStatus===s?C.accent+"15":"transparent",
              border:`1px solid ${filterStatus===s?C.accent+"40":"rgba(255,255,255,0.08)"}`,
              color:filterStatus===s?C.accent:C.muted,
              fontSize:11,fontWeight:600,letterSpacing:"0.06em",transition:"all 0.2s",
            }}>{s}</button>
          ))}
          <div style={{ width:1,height:20,background:C.border }} />
          {rooms.map(r=>(
            <button key={r} onClick={()=>setFilterRoom(r)} style={{
              padding:"5px 14px",borderRadius:8,cursor:"pointer",
              background:filterRoom===r?"rgba(255,255,255,0.07)":"transparent",
              border:`1px solid ${filterRoom===r?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.06)"}`,
              color:filterRoom===r?"#fff":C.muted,
              fontSize:11,transition:"all 0.2s",
            }}>{r}</button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20 }}>
            {[1,2,3,4,5].map(i=>(
              <div key={i} style={{ height:260,borderRadius:18,
                background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",
                animation:"pulse 1.5s infinite" }} />
            ))}
          </div>
        ) : visible.length===0 ? (
          <div style={{ textAlign:"center" as const,padding:"80px 0",opacity:0.4 }}>
            <div style={{ fontSize:48,marginBottom:16 }}>🔌</div>
            <div style={{ fontFamily:"'Orbitron',monospace",fontSize:11,color:C.text,letterSpacing:"0.12em" }}>
              NO PLUGS FOUND
            </div>
          </div>
        ) : (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:20 }}>
            {visible.map(plug=>(
              <PlugCard key={plug.id} plug={plug}
                onToggle={()       => toggle(plug.id)}
                onOpenSchedule={() => setSchedPlug(plug)}
                onRename={(name: string) => renamePlug(plug.id,name)}
                onDelete={()       => deletePlug(plug.id)} />
            ))}
          </div>
        )}

        {/* Bulk actions */}
        {plugs.length>0 && (
          <div style={{ display:"flex",justifyContent:"center",gap:14,marginTop:36 }}>
            <button onClick={()=>Promise.all(plugs.filter(p=>p.on).map(p=>toggle(p.id)))} style={{
              padding:"10px 28px",borderRadius:10,cursor:"pointer",
              background:C.red+"08",border:`1px solid ${C.red}22`,
              color:C.red,fontSize:11,fontWeight:700,letterSpacing:"0.1em",
            }}>⏹ ALL OFF</button>
            <button onClick={()=>Promise.all(plugs.filter(p=>!p.on).map(p=>toggle(p.id)))} style={{
              padding:"10px 28px",borderRadius:10,cursor:"pointer",
              background:C.green+"08",border:`1px solid ${C.green}22`,
              color:C.green,fontSize:11,fontWeight:700,letterSpacing:"0.1em",
            }}>▶ ALL ON</button>
          </div>
        )}
      </div>

      {showAdd   && <AddPlugModal   onClose={()=>setShowAdd(false)} onAdd={addPlug} />}
      {schedPlug && <ScheduleModal  plug={schedPlug} onClose={()=>setSchedPlug(null)}
                      onSave={(s: any) => saveSchedule(schedPlug.id,s)} />}
    </>
  )
}