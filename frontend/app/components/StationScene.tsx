"use client"

import { Canvas } from "@react-three/fiber"
import { ContactShadows, OrbitControls, Sparkles } from "@react-three/drei"
import { useNotifications } from "./NotificationContext"

function PolarStationModel({ polarNight }: { polarNight: boolean }) {
  const night = polarNight
  const stationColor = night ? "#293d6a" : "#7fd4ff"
  const roofColor = night ? "#8058ff" : "#ffb300"

  return (
    <group position={[0, -1.8, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.7, 0]} receiveShadow>
        <circleGeometry args={[5.4, 64]} />
        <meshStandardMaterial color={night ? "#071622" : "#0a2034"} roughness={1} />
      </mesh>

      <mesh position={[-2.4, -0.15, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.6, 1.38]} />
        <meshStandardMaterial color={stationColor} metalness={0.1} roughness={0.88} />
      </mesh>
      <mesh position={[-2.4, 0.85, 0]} castShadow>
        <cylinderGeometry args={[0.86, 0.94, 0.28, 24]} />
        <meshStandardMaterial color={roofColor} roughness={0.86} />
      </mesh>

      <mesh position={[-0.6, -0.1, -1.4]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 1.8, 1.5]} />
        <meshStandardMaterial color={night ? "#41557d" : "#a0f6d9"} roughness={0.9} />
      </mesh>
      <mesh position={[-0.6, 0.95, -1.4]} castShadow>
        <cylinderGeometry args={[0.90, 0.92, 0.28, 24]} />
        <meshStandardMaterial color={night ? "#7b74ff" : "#39ff14"} roughness={0.84} />
      </mesh>

      <mesh position={[1.8, 0.1, 0.7]} castShadow receiveShadow>
        <boxGeometry args={[1.15, 2.1, 1.12]} />
        <meshStandardMaterial color={night ? "#33445a" : "#bcb8ff"} roughness={0.9} />
      </mesh>
      <mesh position={[1.8, 1.18, 0.7]} castShadow>
        <cylinderGeometry args={[0.42, 0.48, 0.26, 20]} />
        <meshStandardMaterial color={roofColor} roughness={0.8} />
      </mesh>

      <mesh position={[2.7, -0.2, -1.9]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.34, 2.8, 16]} />
        <meshStandardMaterial color={night ? "#a5b2d7" : "#c8dbe8"} roughness={0.8} />
      </mesh>
      <mesh position={[2.7, 1.75, -1.9]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color={night ? "#00e5ff" : "#ffe8aa"} emissive={night ? "#00e5ff" : "#ffb300"} emissiveIntensity={0.8} />
      </mesh>

      <mesh position={[-2.8, -0.8, -2.2]} rotation={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 3.6, 8]} />
        <meshStandardMaterial color={"#99a"} />
      </mesh>
      <mesh position={[-2.6, -0.5, -2.6]}>
        <boxGeometry args={[0.9, 0.3, 0.9]} />
        <meshStandardMaterial color={"#00e5ff"} transparent opacity={0.8} />
      </mesh>

      <mesh position={[-2.8, -0.88, 2.2]}>
        <boxGeometry args={[0.8, 0.24, 0.8]} />
        <meshStandardMaterial color={night ? "#e9b683" : "#ffb300"} emissive={"#ffb300"} emissiveIntensity={0.4} />
      </mesh>
    </group>
  )
}

export function StationScene() {
  const { blizzardMode, polarNight } = useNotifications()

  return (
    <div style={{ width: "100%", height: 280, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(0,229,255,0.14)", background: "rgba(0,0,0,0.25)" }}>
      <Canvas camera={{ position: [7, 5.8, 7], fov: 47 }} shadows>
        <color attach="background" args={[polarNight ? "#020514" : "#071b2a"]} />
        <ambientLight intensity={polarNight ? 0.7 : 1.1} color={polarNight ? "#8899cc" : "#b9d7ff"} />
        <directionalLight position={[8, 12, 5]} intensity={polarNight ? 0.5 : 1.7} color={polarNight ? "#a6b7ff" : "#fff8e6"} castShadow />
        <spotLight position={[-4, 4, 6]} intensity={polarNight ? 0.4 : 0.8} angle={0.44} distance={32} />

        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 3.8} maxPolarAngle={Math.PI / 2.2} autoRotate autoRotateSpeed={blizzardMode ? 1.8 : 0.8} />

        <PolarStationModel polarNight={polarNight} />

        {blizzardMode && (
          <Sparkles count={blizzardMode ? 150 : 20} scale={[7, 3, 5]} size={2.5} speed={0.5} color="#bdeaff" opacity={0.72} />
        )}

        <ContactShadows position={[0, -1.78, 0]} opacity={0.7} scale={7} blur={2} far={4.4} />
      </Canvas>
    </div>
  )
}
