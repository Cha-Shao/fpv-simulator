import { useEffect, useRef, useState } from 'react'
import { FPVScene } from './components/FPVScene'
import type { Telemetry } from './components/FPVScene'
import { HUD } from './components/HUD'
import { useGamepad } from './hooks/useGamepad'
import './App.css'

const defaultTelemetry: Telemetry = {
  roll: 0, pitch: 0, yaw: 0,
  speedMs: 0, altAgl: 0, altAsl: 50, throttle: 0,
}

function App() {
  const gamepad = useGamepad()
  const [useKeyboard] = useState(true)
  const [camTiltDeg, setCamTiltDeg] = useState(20)
  const camTiltRef = useRef<number>(20)
  const keyboardRef = useRef<Record<string, boolean>>({})
  const telemetryRef = useRef<Telemetry>({ ...defaultTelemetry })
  const [telemetry, setTelemetry] = useState<Telemetry>({ ...defaultTelemetry })

  // Keep camTiltRef in sync with state via effect (avoids render-time ref mutation error)
  useEffect(() => { camTiltRef.current = camTiltDeg }, [camTiltDeg])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { keyboardRef.current[e.code] = true }
    const onKeyUp = (e: KeyboardEvent) => { keyboardRef.current[e.code] = false }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // Sync telemetry ref → React state at ~30 Hz for HUD rendering
  useEffect(() => {
    const id = setInterval(() => {
      setTelemetry({ ...telemetryRef.current })
    }, 33)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app-container">
      <FPVScene
        gamepad={gamepad}
        useKeyboard={useKeyboard}
        keyboardRef={keyboardRef}
        telemetryRef={telemetryRef}
        camTiltRef={camTiltRef}
      />
      <HUD gamepad={gamepad} useKeyboard={useKeyboard} telemetry={telemetry} />

      {/* Camera tilt slider */}
      <div style={{
        position: 'absolute', top: 12, right: 16, pointerEvents: 'all',
        background: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: '6px 12px',
        color: '#ccc', fontFamily: 'monospace', fontSize: 11, display: 'flex',
        flexDirection: 'column', gap: 4, alignItems: 'flex-end',
      }}>
        <label style={{ whiteSpace: 'nowrap' }}>
          CAM TILT: {camTiltDeg}°
        </label>
        <input
          type="range" min={0} max={45} value={camTiltDeg}
          onChange={e => setCamTiltDeg(Number(e.target.value))}
          style={{ width: 100, accentColor: '#0af' }}
        />
      </div>
    </div>
  )
}

export default App
