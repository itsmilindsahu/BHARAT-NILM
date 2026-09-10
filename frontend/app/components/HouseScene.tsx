"use client"

import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import { useRef } from "react"
import * as THREE from "three"

interface ApplianceState {
  AC: number; Fridge: number; Fan: number; TV: number; Geyser: number
  [key: string]: number
}
interface SceneProps { appliances: ApplianceState; totalLoad: number; efficiency: number }

function lerp(a: number, b: number, t: number) { return a + (b - a) * Math.min(Math.max(t, 0), 1) }

// ─── Basic mesh builder ────────────────────────────────────
function B({ p, s, c, r = 0.6, m = 0.1, em, ei = 0, op = 1, rx = 0, ry = 0, rz = 0 }: {
  p: [number,number,number]; s: [number,number,number]; c: string
  r?: number; m?: number; em?: string; ei?: number; op?: number
  rx?: number; ry?: number; rz?: number
}) {
  return (
    <mesh position={p} rotation={[rx,ry,rz]} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={r} metalness={m}
        emissive={em ? new THREE.Color(em) : undefined}
        emissiveIntensity={em ? ei : 0}
        transparent={op < 1} opacity={op} />
    </mesh>
  )
}

// ─── Glowing panel (window/screen) ────────────────────────
function Glow({ p, s, c, on, base = 0.1 }: { p:[number,number,number]; s:[number,number,number]; c:string; on:boolean; base?:number }) {
  const r = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(() => {
    if (!r.current) return
    r.current.emissiveIntensity = lerp(r.current.emissiveIntensity, on ? 1.8 : base, 0.05)
    r.current.opacity = lerp(r.current.opacity, on ? 0.95 : 0.35, 0.05)
  })
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial ref={r} color={c} emissive={new THREE.Color(c)}
        emissiveIntensity={on ? 1.8 : base} transparent opacity={on ? 0.95 : 0.35} />
    </mesh>
  )
}

// ─── Wood floor planks ─────────────────────────────────────
function WoodFloor() {
  const plankColors = ["#c8944a","#be8a42","#d4a055","#c09048","#b88840"]
  return (
    <group position={[0,-0.501,0]} rotation={[-Math.PI/2,0,0]}>
      {/* Base */}
      <mesh receiveShadow>
        <planeGeometry args={[6,6]} />
        <meshStandardMaterial color="#b07838" roughness={0.85} />
      </mesh>
      {/* Planks */}
      {Array.from({length:14}, (_,i) => (
        <mesh key={i} position={[-2.8+i*0.42, 0, 0.001]} receiveShadow>
          <planeGeometry args={[0.4,6]} />
          <meshStandardMaterial color={plankColors[i%5]} roughness={0.8} />
        </mesh>
      ))}
      {/* Plank gaps */}
      {Array.from({length:13}, (_,i) => (
        <mesh key={i} position={[-2.6+i*0.42, 0, 0.002]}>
          <planeGeometry args={[0.02,6]} />
          <meshStandardMaterial color="#7a5020" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Ceiling fan ───────────────────────────────────────────
function CeilingFan({ on, p }: { on: boolean; p:[number,number,number] }) {
  const blades = useRef<THREE.Group>(null!)
  useFrame((_,dt) => { if (blades.current) blades.current.rotation.y += on ? dt*5 : dt*0.15 })
  return (
    <group position={p}>
      {/* Rod */}
      <mesh><cylinderGeometry args={[0.025,0.025,0.25,8]} /><meshStandardMaterial color="#888" metalness={0.9} roughness={0.1} /></mesh>
      {/* Motor */}
      <mesh position={[0,-0.17,0]}><cylinderGeometry args={[0.1,0.1,0.1,16]} /><meshStandardMaterial color="#555" metalness={0.8} roughness={0.2} /></mesh>
      {/* Blades */}
      <group ref={blades} position={[0,-0.17,0]}>
        {[0,1,2,3].map(i => (
          <mesh key={i} position={[Math.cos(i*Math.PI/2)*0.36,0,Math.sin(i*Math.PI/2)*0.36]}
            rotation={[0,i*Math.PI/2,0.08]}>
            <boxGeometry args={[0.6,0.025,0.14]} />
            <meshStandardMaterial color={on?"#e8dcc8":"#6a5840"} roughness={0.7} />
          </mesh>
        ))}
      </group>
      {/* Light globe */}
      <mesh position={[0,-0.26,0]}>
        <sphereGeometry args={[0.07,12,12]} />
        <meshStandardMaterial color="#fffae0" emissive={new THREE.Color("#ffe080")}
          emissiveIntensity={on?1.5:0.1} transparent opacity={on?0.9:0.5} />
      </mesh>
      {on && <pointLight position={[0,-0.3,0]} intensity={1.8} color="#ffe8a0" distance={5} decay={1.8} castShadow />}
    </group>
  )
}

// ─── TV ────────────────────────────────────────────────────
function TV({ on, p }: { on:boolean; p:[number,number,number] }) {
  const scr = useRef<THREE.MeshStandardMaterial>(null!)
  const t = useRef(0)
  useFrame((_,dt) => {
    t.current += dt
    if (!scr.current) return
    scr.current.emissiveIntensity = lerp(scr.current.emissiveIntensity, on ? 1.4+Math.sin(t.current*7)*0.08 : 0.02, 0.08)
  })
  return (
    <group position={p}>
      {/* Cabinet */}
      <B p={[0,-0.28,0]} s={[0.62,0.48,0.36]} c="#2c2c3c" r={0.3} m={0.5} />
      {/* TV body */}
      <B p={[0,0.12,0.04]} s={[0.72,0.44,0.07]} c="#111118" r={0.2} m={0.7} />
      {/* Screen */}
      <mesh position={[0,0.12,0.082]}>
        <boxGeometry args={[0.62,0.36,0.01]} />
        <meshStandardMaterial ref={scr} color="#001840" emissive={new THREE.Color("#1155ee")}
          emissiveIntensity={on?1.4:0.02} roughness={0.05} metalness={0.1} />
      </mesh>
      {/* Screen content lines */}
      {on && [0.06,-0.02,-0.1].map((y,i)=>(
        <mesh key={i} position={[0,0.12+y,0.09]}>
          <boxGeometry args={[0.45,0.025,0.001]} />
          <meshStandardMaterial color="#4488ff" emissive={new THREE.Color("#4488ff")} emissiveIntensity={0.8} transparent opacity={0.6} />
        </mesh>
      ))}
      {on && <pointLight position={[0,0.12,0.6]} intensity={0.8} color="#1144dd" distance={3} decay={2} />}
    </group>
  )
}

// ─── Fridge ────────────────────────────────────────────────
function Fridge({ on, p }: { on:boolean; p:[number,number,number] }) {
  const glow = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame(()=>{ if(glow.current) glow.current.emissiveIntensity = lerp(glow.current.emissiveIntensity, on?0.7:0.04, 0.04) })
  return (
    <group position={p}>
      {/* Body */}
      <B p={[0,0,0]} s={[0.58,1.16,0.52]} c="#d4e0ec" r={0.2} m={0.5} />
      {/* Door divider */}
      <B p={[0,0.08,0.265]} s={[0.52,0.02,0.01]} c="#a0b4c8" r={0.1} m={0.6} />
      {/* Handle */}
      <B p={[0.2,0.2,0.272]} s={[0.04,0.42,0.04]} c="#778899" r={0.1} m={0.9} />
      {/* Interior light leak */}
      <mesh position={[0,0.2,0.264]}>
        <boxGeometry args={[0.48,0.54,0.01]} />
        <meshStandardMaterial ref={glow} color="#c8e8ff" emissive={new THREE.Color("#a8d4ff")}
          emissiveIntensity={on?0.7:0.04} transparent opacity={on?0.4:0.08} />
      </mesh>
      {on && <pointLight position={[0,0.4,0.7]} intensity={0.4} color="#aaddff" distance={2.2} decay={2} />}
    </group>
  )
}

// ─── Geyser ────────────────────────────────────────────────
function Geyser({ on, p }: { on:boolean; p:[number,number,number] }) {
  const ring = useRef<THREE.MeshStandardMaterial>(null!)
  const t = useRef(0)
  useFrame((_,dt)=>{
    t.current += dt
    if(!ring.current) return
    ring.current.emissiveIntensity = lerp(ring.current.emissiveIntensity, on ? 1.0+Math.sin(t.current*2)*0.15 : 0.05, 0.05)
  })
  return (
    <group position={p}>
      <mesh><cylinderGeometry args={[0.19,0.19,0.55,20]} /><meshStandardMaterial color="#ccd8e4" roughness={0.2} metalness={0.7} /></mesh>
      <mesh><cylinderGeometry args={[0.20,0.20,0.56,20]} /><meshStandardMaterial color="#aabbc8" roughness={0.1} metalness={0.8} wireframe /></mesh>
      <mesh position={[0,-0.14,0]}>
        <torusGeometry args={[0.17,0.03,10,28]} />
        <meshStandardMaterial ref={ring} color="#ff6622" emissive={new THREE.Color("#ff4400")} emissiveIntensity={on?1.0:0.05} />
      </mesh>
      {/* Top pipe */}
      <B p={[0,0.35,0]} s={[0.04,0.16,0.04]} c="#889" r={0.1} m={0.9} />
      {on && <pointLight position={[0,0,0.35]} intensity={0.7} color="#ff6622" distance={2.5} decay={2} />}
    </group>
  )
}

// ─── AC unit ───────────────────────────────────────────────
function AC({ on, p }: { on:boolean; p:[number,number,number] }) {
  const t = useRef(0)
  const grillRef = useRef<THREE.MeshStandardMaterial>(null!)
  useFrame((_,dt)=>{
    t.current+=dt
    if(grillRef.current) grillRef.current.emissiveIntensity = lerp(grillRef.current.emissiveIntensity, on ? 0.55+Math.sin(t.current*2)*0.1 : 0.02, 0.04)
  })
  return (
    <group position={p}>
      <B p={[0,0,0]} s={[0.72,0.24,0.17]} c="#dce8f0" r={0.25} m={0.35} />
      {[-0.26,-0.10,0.06,0.22].map((x,i)=>(
        <mesh key={i} position={[x,0,0.09]}>
          <boxGeometry args={[0.025,0.17,0.01]} />
          <meshStandardMaterial ref={i===1?grillRef:undefined}
            color={on?"#88ccff":"#8899aa"} emissive={new THREE.Color(on?"#44aaff":"#000")}
            emissiveIntensity={on?0.5:0} />
        </mesh>
      ))}
      {/* LED */}
      <mesh position={[0.31,0.08,0.089]}>
        <sphereGeometry args={[0.016,8,8]} />
        <meshStandardMaterial color={on?"#00ffaa":"#223"} emissive={new THREE.Color(on?"#00ffaa":"#000")} emissiveIntensity={on?2.5:0} />
      </mesh>
      {/* Vents */}
      {[-0.2,0,0.2].map((z,i)=>(
        <B key={i} p={[0,-0.09,z*0.3]} s={[0.64,0.03,0.025]} c="#c0ccd8" />
      ))}
      {on && <pointLight position={[0,-0.5,0.4]} intensity={0.7} color="#66aaff" distance={3.5} decay={1.8} />}
    </group>
  )
}

// ─── Sofa ──────────────────────────────────────────────────
function Sofa({ p }: { p:[number,number,number] }) {
  return (
    <group position={p}>
      <B p={[0,-0.05,0]}     s={[1.15,0.24,0.52]} c="#4a5a72" r={0.9} />
      <B p={[0,0.2,-0.2]}    s={[1.15,0.44,0.15]} c="#42526a" r={0.9} />
      <B p={[-0.54,0.06,0]}  s={[0.1,0.34,0.52]}  c="#3c4c64" r={0.9} />
      <B p={[0.54,0.06,0]}   s={[0.1,0.34,0.52]}  c="#3c4c64" r={0.9} />
      {[-0.32,0,0.32].map((x,i)=>(
        <B key={i} p={[x,0.06,0.04]} s={[0.32,0.16,0.4]} c="#556070" r={0.95} />
      ))}
      <B p={[-0.38,0.26,-0.1]} s={[0.24,0.22,0.07]} c="#2e6ba8" r={0.9} />
      <B p={[0.35,0.26,-0.1]}  s={[0.22,0.18,0.07]} c="#c87060" r={0.9} />
      {/* Legs */}
      {[[-0.5,-0.2,0.22],[0.5,-0.2,0.22],[-0.5,-0.2,-0.22],[0.5,-0.2,-0.22]].map((lp,i)=>(
        <B key={i} p={lp as any} s={[0.06,0.1,0.06]} c="#2a2a2a" r={0.2} m={0.6} />
      ))}
    </group>
  )
}

// ─── Coffee table ──────────────────────────────────────────
function CoffeeTable({ p }: { p:[number,number,number] }) {
  return (
    <group position={p}>
      <B p={[0,0,0]}    s={[0.7,0.065,0.38]} c="#d4a866" r={0.5} />
      {/* Glass top illusion */}
      <mesh position={[0,0.036,0]}>
        <boxGeometry args={[0.66,0.02,0.34]} />
        <meshStandardMaterial color="#c8e8f8" roughness={0.05} metalness={0.1} transparent opacity={0.35} />
      </mesh>
      {[[-0.3,-0.12,-0.15],[0.3,-0.12,-0.15],[-0.3,-0.12,0.15],[0.3,-0.12,0.15]].map((lp,i)=>(
        <B key={i} p={lp as any} s={[0.055,0.22,0.055]} c="#b08850" r={0.6} />
      ))}
      {/* Items on table */}
      <B p={[-0.15,0.055,0.05]} s={[0.14,0.018,0.19]} c="#e8e0d0" r={0.9} />
      <mesh position={[0.18,0.06,0]}>
        <cylinderGeometry args={[0.04,0.04,0.09,10]} />
        <meshStandardMaterial color="#c04428" roughness={0.6} />
      </mesh>
    </group>
  )
}

// ─── Bed ──────────────────────────────────────────────────
function Bed({ p }: { p:[number,number,number] }) {
  return (
    <group position={p}>
      <B p={[0,-0.12,0]}    s={[0.88,0.14,1.55]} c="#7a5030" r={0.7} />
      <B p={[0,0.0,0]}      s={[0.82,0.12,1.44]} c="#e8e0d0" r={0.9} />
      <B p={[0,0.08,-0.62]} s={[0.66,0.08,0.24]} c="#f0ece4" r={0.95} />
      <B p={[0,0.07,0.2]}   s={[0.81,0.07,0.94]} c="#7a8fb5" r={0.95} />
      {/* Pattern on blanket */}
      {[-0.2,0,0.2].map((x,i)=>(
        <B key={i} p={[x,0.115,0.22]} s={[0.14,0.005,0.7]} c={["#9aabca","#6a7ea8","#8898ba"][i]} r={1} />
      ))}
      <B p={[0,0.23,-0.68]} s={[0.88,0.5,0.09]} c="#6a4020" r={0.7} />
      {/* Headboard detail */}
      {[-0.28,0,0.28].map((x,i)=>(
        <B key={i} p={[x,0.35,-0.685]} s={[0.22,0.28,0.04]} c="#7a5030" r={0.6} />
      ))}
      {/* Legs */}
      {[[-0.38,-0.22,0.7],[0.38,-0.22,0.7]].map((lp,i)=>(
        <B key={i} p={lp as any} s={[0.07,0.22,0.07]} c="#5a3820" r={0.5} />
      ))}
    </group>
  )
}

// ─── Bookshelf ─────────────────────────────────────────────
function Shelf({ p }: { p:[number,number,number] }) {
  const books = ["#c0392b","#2980b9","#27ae60","#f39c12","#8e44ad","#e67e22","#1abc9c","#e74c3c","#3498db"]
  return (
    <group position={p}>
      <B p={[0,0,0]}       s={[0.58,1.0,0.24]} c="#9c7040" r={0.6} />
      {[-0.36,-0.08,0.2].map((y,i)=>(
        <B key={i} p={[0,y,0.075]} s={[0.52,0.04,0.13]} c="#c8a060" r={0.4} />
      ))}
      {books.map((c,i)=>(
        <B key={i} p={[-0.18+(i%4)*0.11, -0.22+Math.floor(i/4)*0.27, 0.085]}
          s={[0.07,0.2,0.12]} c={c} r={0.8} />
      ))}
      {/* Decorative item */}
      <mesh position={[0.16,0.12,0.09]}>
        <sphereGeometry args={[0.055,10,10]} />
        <meshStandardMaterial color="#ddcc88" emissive={new THREE.Color("#aa9944")} emissiveIntensity={0.3} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

// ─── Rug ──────────────────────────────────────────────────
function Rug({ p }: { p:[number,number,number] }) {
  return (
    <group position={p} rotation={[-Math.PI/2,0,0]}>
      <mesh><planeGeometry args={[1.5,1.0]} /><meshStandardMaterial color="#7a4f3a" roughness={1} /></mesh>
      <mesh position={[0,0,0.001]}><planeGeometry args={[1.28,0.82]} /><meshStandardMaterial color="#c4956a" roughness={1} /></mesh>
      <mesh position={[0,0,0.002]}><planeGeometry args={[1.1,0.68]} /><meshStandardMaterial color="#a07050" roughness={1} /></mesh>
      {[-0.3,0,0.3].map((x,i)=>(
        <mesh key={i} position={[x,0,0.003]}>
          <planeGeometry args={[0.12,0.6]} />
          <meshStandardMaterial color="#d4aa80" roughness={1} />
        </mesh>
      ))}
    </group>
  )
}

// ─── Desk + lamp ──────────────────────────────────────────
function Desk({ p }: { p:[number,number,number] }) {
  return (
    <group position={p}>
      <B p={[0,0,0]}       s={[0.7,0.06,0.42]} c="#c49a54" r={0.5} />
      {[[-0.3,-0.2,-0.17],[0.3,-0.2,-0.17],[-0.3,-0.2,0.17],[0.3,-0.2,0.17]].map((lp,i)=>(
        <B key={i} p={lp as any} s={[0.055,0.38,0.055]} c="#a07840" r={0.5} />
      ))}
      {/* Lamp */}
      <B p={[0.25,0.05,-0.1]} s={[0.03,0.03,0.03]} c="#888" r={0.1} m={0.9} />
      <B p={[0.25,0.22,-0.1]} s={[0.025,0.3,0.025]} c="#888" r={0.1} m={0.9} />
      <mesh position={[0.25,0.39,-0.1]} rotation={[0,0,0.3]}>
        <coneGeometry args={[0.1,0.14,12,1,true]} />
        <meshStandardMaterial color="#f0d888" emissive={new THREE.Color("#ffe060")} emissiveIntensity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <pointLight position={[0.25,0.3,-0.1]} intensity={0.5} color="#ffe8a0" distance={2} decay={2} />
      {/* Laptop */}
      <B p={[-0.15,0.04,0.05]} s={[0.32,0.018,0.24]} c="#333" r={0.2} m={0.6} />
      <mesh position={[-0.15,0.15,-0.085]} rotation={[-0.8,0,0]}>
        <boxGeometry args={[0.3,0.21,0.015]} />
        <meshStandardMaterial color="#222" emissive={new THREE.Color("#1133aa")} emissiveIntensity={0.4} roughness={0.2} />
      </mesh>
    </group>
  )
}

// ─── Decorative plant ─────────────────────────────────────
function Plant({ p }: { p:[number,number,number] }) {
  return (
    <group position={p}>
      <mesh><cylinderGeometry args={[0.09,0.11,0.18,10]} /><meshStandardMaterial color="#8b4513" roughness={0.9} /></mesh>
      <mesh position={[0,0.2,0]}>
        <sphereGeometry args={[0.2,10,10]} />
        <meshStandardMaterial color="#2d7a2d" roughness={0.95} />
      </mesh>
      <mesh position={[0.1,0.28,0.08]}>
        <sphereGeometry args={[0.12,8,8]} />
        <meshStandardMaterial color="#3a9a3a" roughness={0.95} />
      </mesh>
      <mesh position={[-0.08,0.26,-0.06]}>
        <sphereGeometry args={[0.1,8,8]} />
        <meshStandardMaterial color="#256025" roughness={0.95} />
      </mesh>
    </group>
  )
}

// ─── Full room ─────────────────────────────────────────────
function Room({ appliances, totalLoad, efficiency }: SceneProps) {
  const isAC     = (appliances.AC     ?? 0) > 0
  const isFridge = (appliances.Fridge ?? 0) > 0
  const isFan    = (appliances.Fan    ?? 0) > 0
  const isTV     = (appliances.TV     ?? 0) > 0
  const isGeyser = (appliances.Geyser ?? 0) > 0

  const W = "#1e3352"  // wall
  const WL = "#233d60" // wall lighter

  return (
    <group>
      {/* ── FLOOR ── */}
      <WoodFloor />

      {/* ── WALLS ── */}
      {/* Back wall */}
      <mesh position={[0,1.25,-2.52]} receiveShadow>
        <planeGeometry args={[6,3.5]} />
        <meshStandardMaterial color={W} roughness={0.85} />
      </mesh>
      {/* Left wall */}
      <mesh rotation={[0,Math.PI/2,0]} position={[-2.52,1.25,0]} receiveShadow>
        <planeGeometry args={[6,3.5]} />
        <meshStandardMaterial color={WL} roughness={0.85} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI/2,0,0]} position={[0,3.01,0]}>
        <planeGeometry args={[6,6]} />
        <meshStandardMaterial color="#0e1e30" roughness={1} />
      </mesh>

      {/* Wall trim / wainscoting */}
      <B p={[0,0.02,-2.5]}  s={[6,0.06,0.04]} c="#152840" />
      <B p={[-2.5,0.02,0]}  s={[0.04,0.06,6]} c="#152840" />
      <B p={[0,1.0,-2.5]}   s={[6,0.04,0.03]} c="#1a3050" />
      <B p={[-2.5,1.0,0]}   s={[0.03,0.04,6]} c="#1a3050" />

      {/* Ceiling cornice */}
      <B p={[0,2.96,-2.5]}  s={[6,0.08,0.07]} c="#162640" />
      <B p={[-2.5,2.96,0]}  s={[0.07,0.08,6]} c="#162640" />

      {/* ── WINDOWS (back wall) ── */}
      {/* Window casing L */}
      <B p={[-1.15,1.55,-2.5]} s={[1.0,1.2,0.06]} c="#1a3355" />
      <Glow p={[-1.15,1.55,-2.47]} s={[0.82,0.98,0.03]} c="#ffe090" on={true} base={0.6} />
      {/* Curtain L */}
      <B p={[-1.65,1.55,-2.49]} s={[0.12,1.1,0.04]} c="#3a5078" r={0.9} />
      <B p={[-0.65,1.55,-2.49]} s={[0.12,1.1,0.04]} c="#3a5078" r={0.9} />

      {/* Window casing R */}
      <B p={[0.65,1.55,-2.5]} s={[1.0,1.2,0.06]} c="#1a3355" />
      <Glow p={[0.65,1.55,-2.47]} s={[0.82,0.98,0.03]} c="#ffe090" on={true} base={0.6} />
      <B p={[0.15,1.55,-2.49]}  s={[0.12,1.1,0.04]} c="#3a5078" r={0.9} />
      <B p={[1.15,1.55,-2.49]}  s={[0.12,1.1,0.04]} c="#3a5078" r={0.9} />

      {/* ── CEILING FAN ── */}
      <CeilingFan on={isFan} p={[0.2,2.88,-0.2]} />

      {/* ── AC (back wall high) ── */}
      <AC on={isAC} p={[1.7,2.2,-2.44]} />

      {/* ── FRIDGE (back-left corner) ── */}
      <Fridge on={isFridge} p={[-2.1,0.08,-2.0]} />

      {/* ── GEYSER (left wall, bathroom area) ── */}
      <Geyser on={isGeyser} p={[-2.44,1.72,1.1]} />

      {/* ── TV + UNIT ── */}
      <TV on={isTV} p={[1.6,-0.02,-2.3]} />

      {/* ── SOFA ── */}
      <Sofa p={[0.5,-0.28,0.8]} />

      {/* ── RUG ── */}
      <Rug p={[0.7,-0.498,0.15]} />

      {/* ── COFFEE TABLE ── */}
      <CoffeeTable p={[0.7,-0.44,-0.2]} />

      {/* ── BED ── */}
      <Bed p={[-1.2,-0.43,-0.95]} />

      {/* ── BOOKSHELF ── */}
      <Shelf p={[-2.3,0.0,1.4]} />

      {/* ── DESK ── */}
      <Desk p={[2.0,-0.3,1.1]} />

      {/* ── PLANT ── */}
      <Plant p={[-1.9,-0.3,1.85]} />

      {/* ── GLOBAL LIGHTING ── */}
      {/* Warm overhead fill */}
      <pointLight position={[0,2.7,0]}    intensity={2.2}  color="#fff5e0" distance={8} decay={1.4} castShadow />
      {/* Window light (sun) */}
      <pointLight position={[-0.3,1.8,-1.8]} intensity={1.0} color="#fffae8" distance={6} decay={1.8} />
      <pointLight position={[0.8,1.8,-1.8]}  intensity={0.8} color="#fffae8" distance={5} decay={1.8} />
      {/* Ambient fill from floor */}
      <pointLight position={[0,-0.2,0]}   intensity={0.35} color="#c8a870" distance={6} decay={2} />
      {/* Blue cool fill from far corner */}
      <pointLight position={[2.2,2.0,2.0]} intensity={0.3} color="#8ab0d8" distance={7} decay={2} />
    </group>
  )
}

// ─── Export ────────────────────────────────────────────────
interface HouseSceneProps {
  appliances?: ApplianceState; totalLoad?: number; efficiency?: number
}

export default function HouseScene({
  appliances = { AC: 0, Fridge: 250, Fan: 80, TV: 150, Geyser: 0 },
  totalLoad  = 480,
  efficiency = 72,
}: HouseSceneProps) {
  return (
    <div style={{ height: "100%", width: "100%", borderRadius: 12, overflow: "hidden" }}>
      <Canvas camera={{ position: [5.5,4.2,5.5], fov: 40 }} shadows
        style={{ background: "linear-gradient(135deg,#0a1628 0%,#0d1f38 60%,#091420 100%)" }}
        gl={{ antialias: true, shadowMapType: THREE.PCFSoftShadowMap } as any}>
        <ambientLight intensity={0.45} color="#c8d8f0" />
        <directionalLight position={[5,9,5]} intensity={0.8} color="#fff8e8" castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-near={0.5} shadow-camera-far={30}
          shadow-camera-left={-6} shadow-camera-right={6}
          shadow-camera-top={6} shadow-camera-bottom={-6} />

        <Room appliances={appliances} totalLoad={totalLoad} efficiency={efficiency} />

        <OrbitControls enableZoom={false} autoRotate={false}
          minPolarAngle={Math.PI/5} maxPolarAngle={Math.PI/2.6}
          minAzimuthAngle={-Math.PI/5} maxAzimuthAngle={Math.PI/3.5}
          enablePan={false} target={[0,0.5,0]} />
      </Canvas>
    </div>
  )
}