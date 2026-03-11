import { useEffect, useRef, useState } from 'react'

export interface GamepadState {
  // Left stick: throttle (Y) + yaw (X)
  leftX: number   // yaw
  leftY: number   // throttle
  // Right stick: pitch (Y) + roll (X)
  rightX: number  // roll
  rightY: number  // pitch
  connected: boolean
  gamepadId: string
}

const defaultState: GamepadState = {
  leftX: 0,
  leftY: 0,
  rightX: 0,
  rightY: 0,
  connected: false,
  gamepadId: '',
}

function applyDeadzone(value: number, deadzone = 0.05): number {
  return Math.abs(value) < deadzone ? 0 : value
}

export function useGamepad(): GamepadState {
  const [state, setState] = useState<GamepadState>(defaultState)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      setState(prev => ({ ...prev, connected: true, gamepadId: e.gamepad.id }))
    }
    const onDisconnect = () => {
      setState({ ...defaultState })
    }

    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)

    const poll = () => {
      const gamepads = navigator.getGamepads()
      for (const gp of gamepads) {
        if (!gp) continue
        const leftX = applyDeadzone(gp.axes[0] ?? 0)
        const leftY = applyDeadzone(gp.axes[1] ?? 0)
        const rightX = applyDeadzone(gp.axes[2] ?? 0)
        const rightY = applyDeadzone(gp.axes[3] ?? 0)
        setState({
          leftX,
          leftY,
          rightX,
          rightY,
          connected: true,
          gamepadId: gp.id,
        })
        break
      }
      rafRef.current = requestAnimationFrame(poll)
    }

    rafRef.current = requestAnimationFrame(poll)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
    }
  }, [])

  return state
}
