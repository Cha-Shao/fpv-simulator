import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { GamepadState } from '../hooks/useGamepad'

export interface Telemetry {
  roll: number     // degrees
  pitch: number    // degrees
  yaw: number      // degrees 0-360
  speedMs: number  // m/s
  altAgl: number   // m above ground
  altAsl: number   // m above sea level
  throttle: number // 0..1
}

interface Props {
  gamepad: GamepadState
  useKeyboard: boolean
  keyboardRef: React.RefObject<Record<string, boolean>>
  telemetryRef: React.RefObject<Telemetry>
  camTiltRef: React.RefObject<number>  // live camera tilt degrees
}

// Drone physics state (mutable, lives in ref for perf)
interface DroneState {
  pos: THREE.Vector3
  vel: THREE.Vector3
  quat: THREE.Quaternion
  angVel: THREE.Vector3  // euler rates in body frame
  throttle: number
}

interface AABB {
  min: THREE.Vector3
  max: THREE.Vector3
}

export function FPVScene({ gamepad, useKeyboard, keyboardRef, telemetryRef, camTiltRef }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const w = mount.clientWidth
    const h = mount.clientHeight

    // ── Renderer ─────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // ── Scene ─────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)
    scene.fog = new THREE.Fog(0x87ceeb, 80, 300)

    // ── Camera (FPV — attached to drone) ──────────────────────────
    const camera = new THREE.PerspectiveCamera(90, w / h, 0.05, 500)
    camera.position.set(0, 0, 0)

    // ── Lights ───────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambient)
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(50, 100, 50)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.near = 1
    sun.shadow.camera.far = 400
    sun.shadow.camera.left = -150
    sun.shadow.camera.right = 150
    sun.shadow.camera.top = 150
    sun.shadow.camera.bottom = -150
    scene.add(sun)

    // ── Ground ───────────────────────────────────────────────────
    const groundGeo = new THREE.PlaneGeometry(400, 400, 80, 80)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a7c59 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid lines on ground
    const gridHelper = new THREE.GridHelper(400, 40, 0x2d5a35, 0x2d5a35)
    gridHelper.position.y = 0.01
    scene.add(gridHelper)

    // ── Buildings / obstacles ────────────────────────────────────
    const buildingAABBs: AABB[] = []
    const buildingMat = new THREE.MeshLambertMaterial({ color: 0x8b8b8b })
    const buildingDefs: [number, number, number, number, number][] = [
      [20, -30, 8, 14, 7], [-25, -40, 6, 22, 5], [40, 20, 10, 8, 9], [-50, 10, 7, 18, 6],
      [10, 50, 5, 12, 8], [-30, 60, 9, 7, 6], [60, -60, 11, 20, 8], [-70, -20, 6, 9, 7],
      [80, 40, 8, 16, 10], [-80, -80, 7, 11, 9],
    ]
    for (const [bx, bz, bw, bh, bd] of buildingDefs) {
      const geo = new THREE.BoxGeometry(bw, bh, bd)
      const mesh = new THREE.Mesh(geo, buildingMat)
      mesh.position.set(bx, bh / 2, bz)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
      buildingAABBs.push({
        min: new THREE.Vector3(bx - bw / 2, 0, bz - bd / 2),
        max: new THREE.Vector3(bx + bw / 2, bh, bz + bd / 2),
      })
    }

    // ── Trees ───────────────────────────────────────────────────
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x228b22 })
    for (let i = 0; i < 40; i++) {
      const s1 = (i * 7919) % 1000 / 1000
      const s2 = (i * 6271) % 1000 / 1000
      const s3 = (i * 3457) % 1000 / 1000
      const tx = (s1 - 0.5) * 300
      const tz = (s2 - 0.5) * 300
      const trunkH = 2 + s3 * 3
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, trunkH), trunkMat)
      trunk.position.set(tx, trunkH / 2, tz)
      trunk.castShadow = true
      scene.add(trunk)
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), leafMat)
      leaves.position.set(tx, trunkH + 1.2, tz)
      leaves.castShadow = true
      scene.add(leaves)
    }

    // ── Race gates ───────────────────────────────────────────────
    const gateMat = new THREE.MeshLambertMaterial({ color: 0xff4400 })
    const gatePositions = [[0, 3, -15], [15, 4, 0], [0, 3, 15], [-15, 4, 0]]
    for (const [gx, gy, gz] of gatePositions) {
      const group = new THREE.Group()
      // toroidal gate from tubes
      const ringGeo = new THREE.TorusGeometry(2.5, 0.2, 8, 32)
      const ring = new THREE.Mesh(ringGeo, gateMat)
      group.position.set(gx, gy, gz)
      scene.add(group)
      group.add(ring)
    }

    // ── Drone body + camera ───────────────────────────────────────
    const droneNode = new THREE.Object3D()
    scene.add(droneNode)

    // Visible drone mesh (simple cross frame)
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const armGeo = new THREE.BoxGeometry(0.5, 0.04, 0.08)
    const arm1 = new THREE.Mesh(armGeo, frameMat); droneNode.add(arm1)
    const arm2 = new THREE.Mesh(armGeo, frameMat); arm2.rotation.y = Math.PI / 2; droneNode.add(arm2)
    const motorMat = new THREE.MeshLambertMaterial({ color: 0x444444 })
    const motorGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8)
    const motorOffsets = [[0.22, 0, 0.22], [-0.22, 0, 0.22], [0.22, 0, -0.22], [-0.22, 0, -0.22]] as const
    for (const [mx, my, mz] of motorOffsets) {
      const m = new THREE.Mesh(motorGeo, motorMat); m.position.set(mx, my, mz); droneNode.add(m)
    }

    // Camera is mounted slightly forward with configurable tilt (updated live each frame)
    droneNode.add(camera)
    camera.position.set(0, 0.04, 0.06)

    // ── Physics constants ─────────────────────────────────────────
    const MASS = 0.6    // kg
    const DRONE_HALF = 0.25   // hitbox half-extent (m)
    const GROUND_Y = DRONE_HALF
    // Moment of inertia (diagonal, simplified symmetric quad)
    // I = m * r^2 for arm radius ~0.22 m per axis
    const I_PITCH = MASS * 0.22 * 0.22  // ~0.029 kg·m²
    const I_ROLL = I_PITCH
    const I_YAW = MASS * 0.22 * 0.22 * 2
    // Max torque per axis (N·m)
    const T_ROLL = 2.6
    const T_PITCH = 1.2
    const T_YAW = 1.2
    // Max thrust (N) — 2× hover to allow vertical accel
    const MAX_THRUST = MASS * 9.81 * 2.5
    const LINEAR_DRAG = 0.35  // s^-1 air drag coefficient
    const ANGULAR_DRAG = 3.5   // s^-1 angular damping

    // ── Physics state ─────────────────────────────────────────────
    const drone: DroneState = {
      pos: new THREE.Vector3(0, 3, 0),
      vel: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      angVel: new THREE.Vector3(), // body-frame angular velocity (rad/s)
      throttle: 0,
    }

    // ── Reusable temps ────────────────────────────────────────────
    const WORLD_UP = new THREE.Vector3(0, 1, 0)
    const GRAVITY = new THREE.Vector3(0, -9.81, 0)
    const tmpVec = new THREE.Vector3()
    const tmpQuat = new THREE.Quaternion()
    const euler = new THREE.Euler()

    // ── AABB collision resolver ───────────────────────────────────
    function resolveAABB(pos: THREE.Vector3): THREE.Vector3 | null {
      const { x: px, y: py, z: pz } = pos
      const h = DRONE_HALF
      for (const bb of buildingAABBs) {
        const ox = Math.min(px + h, bb.max.x) - Math.max(px - h, bb.min.x)
        const oy = Math.min(py + h, bb.max.y) - Math.max(py - h, bb.min.y)
        const oz = Math.min(pz + h, bb.max.z) - Math.max(pz - h, bb.min.z)
        if (ox > 0 && oy > 0 && oz > 0) {
          const minO = Math.min(ox, oy, oz)
          if (minO === ox) return new THREE.Vector3(ox * (px > (bb.min.x + bb.max.x) / 2 ? 1 : -1), 0, 0)
          if (minO === oy) return new THREE.Vector3(0, oy * (py > (bb.min.y + bb.max.y) / 2 ? 1 : -1), 0)
          return new THREE.Vector3(0, 0, oz * (pz > (bb.min.z + bb.max.z) / 2 ? 1 : -1))
        }
      }
      return null
    }

    let lastTime = performance.now()
    let animId = 0

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      // ── Read inputs ─────────────────────────────────────────
      let throttleCmd = 0   // 0..1
      let yawCmd = 0   // -1..1  → torque about body-Y
      let pitchCmd = 0   // -1..1  → torque about body-X
      let rollCmd = 0   // -1..1  → torque about body-Z

      if (gamepad.connected) {
        throttleCmd = Math.max(0, Math.min(1, -gamepad.leftY * 0.5 + 0.5))
        yawCmd = gamepad.leftX
        pitchCmd = gamepad.rightY
        rollCmd = gamepad.rightX
      }
      if (useKeyboard && keyboardRef.current) {
        const kb = keyboardRef.current
        if (kb['KeyW']) throttleCmd = Math.min(1, throttleCmd + 0.8)
        if (kb['KeyS']) throttleCmd = Math.max(0, throttleCmd - 0.8)
        if (kb['KeyA']) yawCmd = -1
        if (kb['KeyD']) yawCmd = 1
        if (kb['Numpad4']) rollCmd = -1
        if (kb['Numpad6']) rollCmd = 1
        if (kb['Numpad8']) pitchCmd = -1
        if (kb['Numpad5']) pitchCmd = 1
      }

      // ── Throttle smoothing ───────────────────────────────────
      drone.throttle += (throttleCmd - drone.throttle) * Math.min(1, dt * 10)

      // ── Body-frame torques → angular acceleration ────────────
      // τ = I * α  →  α = τ / I
      // angVel is in body frame (rad/s)
      const torqueX = pitchCmd * T_PITCH   // pitch: +X tilts nose up
      const torqueY = -yawCmd * T_YAW    // yaw:   +Y turns right
      const torqueZ = -rollCmd * T_ROLL   // roll:  +Z rolls right

      drone.angVel.x += (torqueX / I_PITCH) * dt
      drone.angVel.y += (torqueY / I_YAW) * dt
      drone.angVel.z += (torqueZ / I_ROLL) * dt

      // Angular drag (gyro friction + motor resistance)
      drone.angVel.multiplyScalar(Math.max(0, 1 - ANGULAR_DRAG * dt))

      // ── Integrate quaternion from body-frame angVel ──────────
      // q' = q + 0.5 * dt * q ⊗ ω_body
      const { x: wx, y: wy, z: wz } = drone.angVel
      const halfDt = dt * 0.5
      const q = drone.quat
      tmpQuat.set(
        q.w * wx * halfDt + q.y * wz * halfDt - q.z * wy * halfDt,
        q.w * wy * halfDt - q.x * wz * halfDt + q.z * wx * halfDt,
        q.w * wz * halfDt + q.x * wy * halfDt - q.y * wx * halfDt,
        -(q.x * wx * halfDt + q.y * wy * halfDt + q.z * wz * halfDt),
      )
      q.x += tmpQuat.x; q.y += tmpQuat.y; q.z += tmpQuat.z; q.w += tmpQuat.w
      q.normalize()

      // ── Thrust: force along body-up axis ────────────────────
      // Body-up = WORLD_UP rotated by drone quaternion
      const thrustForce = drone.throttle * MAX_THRUST
      tmpVec.copy(WORLD_UP).applyQuaternion(q).multiplyScalar(thrustForce / MASS)

      // ── Linear integration ───────────────────────────────────
      drone.vel.addScaledVector(GRAVITY, dt)
      drone.vel.addScaledVector(tmpVec, dt)
      drone.vel.multiplyScalar(Math.max(0, 1 - LINEAR_DRAG * dt))
      drone.pos.addScaledVector(drone.vel, dt)

      // ── Ground collision ─────────────────────────────────────
      if (drone.pos.y < GROUND_Y) {
        drone.pos.y = GROUND_Y
        if (drone.vel.y < 0) {
          // Inelastic bounce
          drone.vel.y *= -0.25
          // Horizontal friction on ground impact
          drone.vel.x *= 0.7
          drone.vel.z *= 0.7
        }
        // Gradually level attitude while on ground (preserve yaw)
        euler.setFromQuaternion(drone.quat, 'YXZ')
        const yawOnly = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, euler.y, 0, 'YXZ')
        )
        drone.quat.slerp(yawOnly, Math.min(1, dt * 6))
        // Angular damping on ground
        drone.angVel.multiplyScalar(Math.max(0, 1 - dt * 12))
      }

      // ── Building collision — elastic impulse ─────────────────
      const push = resolveAABB(drone.pos)
      if (push) {
        drone.pos.add(push)
        // Reflect velocity along collision normal, partial restitution
        const n = push.clone().normalize()
        const vn = drone.vel.dot(n)
        if (vn < 0) {
          // v' = v - (1 + e) * (v·n) * n,  e = 0.3 restitution
          drone.vel.addScaledVector(n, -(1 + 0.3) * vn)
          // Tangential friction
          const vt = drone.vel.clone().addScaledVector(n, -drone.vel.dot(n))
          drone.vel.copy(n.clone().multiplyScalar(drone.vel.dot(n))).add(vt.multiplyScalar(0.6))
        }
        // Angular impulse: randomise spin a bit on collision
        drone.angVel.x += (Math.random() - 0.5) * 2
        drone.angVel.z += (Math.random() - 0.5) * 2
      }

      // ── Apply to drone node ──────────────────────────────────
      droneNode.position.copy(drone.pos)
      droneNode.quaternion.copy(drone.quat)

      // ── Telemetry ────────────────────────────────────────────
      euler.setFromQuaternion(drone.quat, 'YXZ')
      if (telemetryRef.current) {
        telemetryRef.current.roll = THREE.MathUtils.radToDeg(euler.z)
        telemetryRef.current.pitch = THREE.MathUtils.radToDeg(euler.x)
        telemetryRef.current.yaw = ((THREE.MathUtils.radToDeg(euler.y) % 360) + 360) % 360
        telemetryRef.current.speedMs = drone.vel.length()
        telemetryRef.current.altAgl = Math.max(0, drone.pos.y - GROUND_Y)
        telemetryRef.current.altAsl = Math.max(0, drone.pos.y - GROUND_Y) + 50
        telemetryRef.current.throttle = drone.throttle
      }

      // ── Live camera tilt ─────────────────────────────────────
      camera.rotation.x = THREE.MathUtils.degToRad(camTiltRef.current ?? 20)

      renderer.render(scene, camera)
    }

    animate()

    // ── Resize handler ───────────────────────────────────────────
    const onResize = () => {
      const nw = mount.clientWidth
      const nh = mount.clientHeight
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
      renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad, useKeyboard])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
