import type { GamepadState } from '../hooks/useGamepad'
import type { Telemetry } from './FPVScene'

interface Props {
  gamepad: GamepadState
  useKeyboard: boolean
  telemetry: Telemetry
  invertPitchY: boolean
  camTiltDeg: number
  showHorizonLines: boolean
}

// ── Artificial Horizon ───────────────────────────────────────────
function AttitudeIndicator({ roll, pitch }: { roll: number; pitch: number }) {
  const SIZE = 110
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = SIZE / 2 - 4

  // Sky occupies top, ground bottom; pitch shifts the horizon line
  const pitchPxPerDeg = 1.8
  const pitchOffset = pitch * pitchPxPerDeg  // positive pitch → horizon moves up

  // Horizon line clipped to circle
  // We rotate the whole inner group by -roll
  const skyColor = '#1a6acc'
  const gndColor = '#7a4e2d'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={SIZE} height={SIZE} style={{ display: 'block' }}>
        <defs>
          <clipPath id="ai-clip">
            <circle cx={CX} cy={CY} r={R} />
          </clipPath>
        </defs>
        {/* Outer ring */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#555" strokeWidth={2} />

        {/* Rotating attitude group */}
        <g transform={`rotate(${roll}, ${CX}, ${CY})`} clipPath="url(#ai-clip)">
          {/* Sky */}
          <rect x={0} y={0} width={SIZE} height={CY - pitchOffset} fill={skyColor} />
          {/* Ground */}
          <rect x={0} y={CY - pitchOffset} width={SIZE} height={SIZE} fill={gndColor} />

          {/* Pitch ladder */}
          {[-20, -10, 10, 20].map(deg => {
            const y = CY - pitchOffset - deg * pitchPxPerDeg
            const len = deg % 20 === 0 ? 28 : 18
            return (
              <g key={deg}>
                <line x1={CX - len} y1={y} x2={CX + len} y2={y} stroke="white" strokeWidth={1} opacity={0.8} />
                <text x={CX + len + 3} y={y + 3} fill="white" fontSize={7} opacity={0.8}>{Math.abs(deg)}</text>
              </g>
            )
          })}
          {/* Horizon line */}
          <line x1={0} y1={CY - pitchOffset} x2={SIZE} y2={CY - pitchOffset} stroke="white" strokeWidth={1.5} />
        </g>

        {/* Fixed aircraft reference */}
        <line x1={CX - 22} y1={CY} x2={CX - 8} y2={CY} stroke="#ff0" strokeWidth={2} />
        <line x1={CX + 8} y1={CY} x2={CX + 22} y2={CY} stroke="#ff0" strokeWidth={2} />
        <circle cx={CX} cy={CY} r={2.5} fill="#ff0" />

        {/* Roll arc tick marks */}
        {[-60, -45, -30, -20, -10, 10, 20, 30, 45, 60].map(deg => {
          const rad = (deg - 90) * Math.PI / 180
          const inner = R - 8
          const outer = R - 2
          return (
            <line key={deg}
              x1={CX + Math.cos(rad) * inner} y1={CY + Math.sin(rad) * inner}
              x2={CX + Math.cos(rad) * outer} y2={CY + Math.sin(rad) * outer}
              stroke="white" strokeWidth={1} opacity={0.6}
            />
          )
        })}
        {/* Roll pointer */}
        <g transform={`rotate(${roll}, ${CX}, ${CY})`}>
          <polygon points={`${CX},${CY - R + 2} ${CX - 4},${CY - R + 9} ${CX + 4},${CY - R + 9}`} fill="#ff0" />
        </g>
      </svg>
      <span style={{ fontSize: 9, color: '#aaa', letterSpacing: 1 }}>ATTITUDE</span>
    </div>
  )
}

// ── Speed Tape ───────────────────────────────────────────────────
function SpeedTape({ speedMs }: { speedMs: number }) {
  const speedKmh = speedMs * 3.6
  const H = 110
  const W = 48
  const pxPerKmh = 3

  const ticks: number[] = []
  const base = Math.floor(speedKmh / 5) * 5
  for (let v = base - 20; v <= base + 20; v += 5) {
    if (v >= 0) ticks.push(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <defs>
          <clipPath id="spd-clip"><rect x={0} y={0} width={W} height={H} /></clipPath>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.5)" />
        <g clipPath="url(#spd-clip)">
          {ticks.map(v => {
            const dy = (speedKmh - v) * pxPerKmh
            const y = H / 2 + dy
            return (
              <g key={v}>
                <line x1={W - 8} y1={y} x2={W - 2} y2={y} stroke="#aaa" strokeWidth={1} />
                <text x={2} y={y + 4} fill="#ccc" fontSize={9}>{v}</text>
              </g>
            )
          })}
        </g>
        {/* Current value box */}
        <rect x={1} y={H / 2 - 9} width={W - 2} height={18} fill="rgba(0,180,255,0.25)" stroke="#0af" strokeWidth={1} />
        <text x={W / 2} y={H / 2 + 5} fill="#0af" fontSize={11} fontWeight="bold" textAnchor="middle">
          {speedKmh.toFixed(0)}
        </text>
      </svg>
      <span style={{ fontSize: 9, color: '#aaa', letterSpacing: 1 }}>km/h</span>
    </div>
  )
}

// ── Altitude Tape ────────────────────────────────────────────────
function AltTape({ altAgl, altAsl }: { altAgl: number; altAsl: number }) {
  const H = 110
  const W = 54
  const pxPerM = 3
  const base = Math.floor(altAgl / 5) * 5
  const ticks: number[] = []
  for (let v = base - 15; v <= base + 15; v += 5) {
    if (v >= 0) ticks.push(v)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <defs>
          <clipPath id="alt-clip"><rect x={0} y={0} width={W} height={H} /></clipPath>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.5)" />
        <g clipPath="url(#alt-clip)">
          {ticks.map(v => {
            const dy = (altAgl - v) * pxPerM
            const y = H / 2 + dy
            return (
              <g key={v}>
                <line x1={2} y1={y} x2={9} y2={y} stroke="#aaa" strokeWidth={1} />
                <text x={12} y={y + 4} fill="#ccc" fontSize={9}>{v}</text>
              </g>
            )
          })}
        </g>
        <rect x={1} y={H / 2 - 9} width={W - 2} height={18} fill="rgba(100,255,100,0.2)" stroke="#4f4" strokeWidth={1} />
        <text x={W / 2} y={H / 2 + 5} fill="#4f4" fontSize={11} fontWeight="bold" textAnchor="middle">
          {altAgl.toFixed(1)}
        </text>
      </svg>
      <span style={{ fontSize: 9, color: '#aaa', letterSpacing: 1 }}>AGL m</span>
      <div style={{ fontSize: 10, color: '#8af', background: 'rgba(0,0,0,0.45)', padding: '1px 6px', marginTop: 2 }}>
        ASL {altAsl.toFixed(0)} m
      </div>
    </div>
  )
}

// ── Compass strip ────────────────────────────────────────────────
function Compass({ yaw }: { yaw: number }) {
  const W = 500
  const H = 28
  const pxPerDeg = 2
  const dirs: [number, string][] = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
  [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'], [360, 'N']]

  const ticks: number[] = []
  for (let d = 0; d < 360; d += 10) ticks.push(d)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50vw' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <clipPath id="cmp-clip"><rect x={0} y={0} width={W} height={H} /></clipPath>
        </defs>
        <rect x={0} y={0} width={W} height={H} fill="rgba(0,0,0,0.5)" />
        <g clipPath="url(#cmp-clip)">
          {ticks.map(d => {
            let delta = yaw - d
            while (delta > 180) delta -= 360
            while (delta < -180) delta += 360
            const x = W / 2 + delta * pxPerDeg
            if (x < -10 || x > W + 10) return null
            return (
              <g key={d}>
                <line x1={x} y1={d % 30 === 0 ? 6 : 12} x2={x} y2={H - 2} stroke="#888" strokeWidth={1} />
              </g>
            )
          })}
          {dirs.map(([d, label]) => {
            let delta = yaw - d
            while (delta > 180) delta -= 360
            while (delta < -180) delta += 360
            const x = W / 2 + delta * pxPerDeg
            if (x < -10 || x > W + 10) return null
            return (
              <text key={d + label} x={x} y={12} fill={d % 90 === 0 ? '#fff' : '#aaa'}
                fontSize={d % 90 === 0 ? 10 : 8} textAnchor="middle" fontWeight={d % 90 === 0 ? 'bold' : 'normal'}>
                {label}
              </text>
            )
          })}
        </g>
        {/* Center marker */}
        <polygon points={`${W / 2},${H - 1} ${W / 2 - 4},${H - 8} ${W / 2 + 4},${H - 8}`} fill="#ff0" />
      </svg>
      <span style={{ fontSize: 9, color: '#fa0', marginTop: 1, letterSpacing: 1 }}>
        {yaw.toFixed(0).padStart(3, '0')}°
      </span>
    </div>
  )
}

// ── Stick visualizer ─────────────────────────────────────────────
function StickViz({ x, y, label }: { x: number; y: number; label: string }) {
  const size = 58
  const cx = size / 2, cy = size / 2
  const r = size / 2 - 5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.4)" stroke="#555" strokeWidth={1} />
        <line x1={cx} y1={5} x2={cx} y2={size - 5} stroke="#444" strokeWidth={1} />
        <line x1={5} y1={cy} x2={size - 5} y2={cy} stroke="#444" strokeWidth={1} />
        <circle cx={cx + x * r} cy={cy + y * r} r={6} fill="#00e5ff" opacity={0.9} />
      </svg>
      <span style={{ fontSize: 9, color: '#aaa' }}>{label}</span>
    </div>
  )
}

// ── Main HUD ─────────────────────────────────────────────────────
export function HUD({ gamepad, useKeyboard, telemetry, invertPitchY, camTiltDeg, showHorizonLines }: Props) {
  const { roll, pitch, yaw, speedMs, altAgl, altAsl, throttle } = telemetry
  const displayPitchStickY = invertPitchY ? -gamepad.rightY : gamepad.rightY
  const isHeightLimitExceeded = altAgl > 120
  const horizonOffsetY = camTiltDeg * 6

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', fontFamily: 'monospace' }}>
      <style>{`@keyframes hud-blink-red { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.15; } }`}</style>

      {/* ── Full-screen SVG overlay for nose line + horizon line ── */}
      {/* viewBox 0 0 1000 600: screen center is 500,300 */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        viewBox="0 0 1000 600"
        preserveAspectRatio="xMidYMid meet"
      >
        {showHorizonLines && (
          <>
            {/* Aircraft-fixed reference horizon (white dashed). */}
            <line
              x1="350" y1={`${300 + horizonOffsetY}`} x2="650" y2={`${300 + horizonOffsetY}`}
              stroke="#fff" strokeWidth="1.5" strokeDasharray="8,6" opacity="0.9"
            />

            {/* World horizon line with camera tilt offset: aligns to true ground horizon. */}
            <g transform={`translate(500, ${300 + horizonOffsetY + pitch * 6}) rotate(${roll}, 0, ${-pitch * 6})`}>
              <line x1="-380" y1="0" x2="-70" y2="0" stroke="#ff0" strokeWidth="1.5" opacity="0.8" />
              <line x1=" 70" y1="0" x2=" 380" y2="0" stroke="#ff0" strokeWidth="1.5" opacity="0.8" />
              {/* Left end tick */}
              <line x1="-380" y1="-6" x2="-380" y2="6" stroke="#ff0" strokeWidth="1.5" opacity="0.8" />
              {/* Right end tick */}
              <line x1=" 380" y1="-6" x2=" 380" y2="6" stroke="#ff0" strokeWidth="1.5" opacity="0.8" />
            </g>
          </>
        )}
      </svg>


      {isHeightLimitExceeded && (
        <div
          style={{
            position: 'absolute',
            top: '58%',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#ff1a1a',
            fontSize: 14,
            fontWeight: 'bold',
            letterSpacing: 1,
            textTransform: 'uppercase',
            animation: 'hud-blink-red 0.8s linear infinite',
            textShadow: '0 0 8px rgba(255,0,0,0.6)',
          }}
        >
          EXCEEDS HEIGHT LIMIT
        </div>
      )}

      {/* Top status bar */}
      <div style={{
        position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 20, alignItems: 'center',
        background: 'rgba(0,0,0,0.45)', padding: '4px 14px',
        color: '#e0e0e0', fontSize: 13, letterSpacing: 1,
      }}>
        <span style={{ color: '#f44', fontWeight: 'bold' }}>● REC</span>
        <span>FPV-SIM</span>
        <span style={{ color: gamepad.connected ? '#4f4' : '#fa0' }}>
          {gamepad.connected ? ('GP: ' + gamepad.gamepadId.slice(0, 22) + '…') : (useKeyboard ? '⌨ KEYBOARD' : 'NO INPUT')}
        </span>
      </div>

      {/* Compass — top center above status */}
      <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)' }}>
        <Compass yaw={yaw} />
      </div>

      {/* Left instruments: attitude + speed */}
      <div style={{
        position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center',
      }}>
        <AttitudeIndicator roll={roll} pitch={pitch} />
        <SpeedTape speedMs={speedMs} />
      </div>

      {/* Right instruments: altitude */}
      <div style={{
        position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
      }}>
        <AltTape altAgl={altAgl} altAsl={altAsl} />
        {/* Throttle bar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 12, height: 60, background: 'rgba(0,0,0,0.4)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#666' }} />
            <div style={{
              position: 'absolute', left: 0, right: 0,
              bottom: throttle >= 0 ? '50%' : undefined,
              top: throttle < 0 ? '50%' : undefined,
              height: `${Math.abs(throttle) * 50}%`,
              background: throttle >= 0 ? (throttle > 0.8 ? '#f44' : '#ff9800') : '#40c4ff',
            }} />
          </div>
          <span style={{ fontSize: 9, color: '#aaa' }}>THR {throttle.toFixed(2)}</span>
        </div>
      </div>

      {/* Bottom: sticks + roll/pitch readout */}
      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: 16, alignItems: 'flex-end',
        background: 'rgba(0,0,0,0.55)', padding: '8px 16px',
      }}>
        <StickViz x={gamepad.leftX} y={gamepad.leftY} label="YAW/THR" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', fontSize: 10, color: '#ccc', minWidth: 70 }}>
          <div>R <span style={{ color: '#0af' }}>{roll.toFixed(1)}°</span></div>
          <div>P <span style={{ color: '#0af' }}>{pitch.toFixed(1)}°</span></div>
          <div>Y <span style={{ color: '#fa0' }}>{yaw.toFixed(0)}°</span></div>
        </div>
        <StickViz x={gamepad.rightX} y={displayPitchStickY} label="ROLL/PITCH" />
      </div>

      {/* Keyboard hint */}
      {!gamepad.connected && (
        <div style={{
          position: 'absolute', bottom: 130, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.55)', padding: '5px 12px',
          color: '#bbb', fontSize: 11, whiteSpace: 'nowrap', textAlign: 'center',
        }}>
          W/S - 油门 &nbsp;|&nbsp; A/D - 偏航 &nbsp;|&nbsp; Num4/6 - 横滚 &nbsp;|&nbsp; Num8/5 - 俯仰 &nbsp;|&nbsp; R - 重置
        </div>
      )}
    </div>
  )
}

