import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import type { GamepadState } from '../hooks/useGamepad'

const MASS = 0.6
const DRONE_HALF = 0.25
const MAX_THRUST = MASS * 9.81 * 5
const MAX_REVERSE_THRUST = MASS * 9.81 * 1.1
const T_ROLL = .3
const T_PITCH = .3
const T_YAW = .3

export interface Telemetry {
  roll: number
  pitch: number
  yaw: number
  speedMs: number
  altAgl: number
  altAsl: number
  throttle: number // -1..1
}

interface Props {
  gamepad: GamepadState
  useKeyboard: boolean
  invertPitchY: boolean
  levelRequestRef: React.MutableRefObject<number>
  keyboardRef: React.RefObject<Record<string, boolean>>
  telemetryRef: React.RefObject<Telemetry>
  camTiltRef: React.RefObject<number>
}

interface BuildingDef {
  x: number
  z: number
  w: number
  h: number
  d: number
}

export function FPVScene({ gamepad, useKeyboard, invertPitchY, levelRequestRef, keyboardRef, telemetryRef, camTiltRef }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const w = mount.clientWidth
    const h = mount.clientHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)
    scene.fog = new THREE.Fog(0x87ceeb, 80, 300)

    const camera = new THREE.PerspectiveCamera(90, w / h, 0.05, 500)
    camera.position.set(0, 0, 0)

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

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400, 80, 80),
      new THREE.MeshLambertMaterial({ color: 0x4a7c59 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    const gridHelper = new THREE.GridHelper(400, 40, 0x2d5a35, 0x2d5a35)
    gridHelper.position.y = 0.01
    scene.add(gridHelper)

    const buildingDefs: BuildingDef[] = [
      { x: 20, z: -30, w: 8, h: 14, d: 7 },
      { x: -25, z: -40, w: 6, h: 22, d: 5 },
      { x: 40, z: 20, w: 10, h: 8, d: 9 },
      { x: -50, z: 10, w: 7, h: 18, d: 6 },
      { x: 10, z: 50, w: 5, h: 12, d: 8 },
      { x: -30, z: 60, w: 9, h: 7, d: 6 },
      { x: 60, z: -60, w: 11, h: 20, d: 8 },
      { x: -70, z: -20, w: 6, h: 9, d: 7 },
      { x: 80, z: 40, w: 8, h: 16, d: 10 },
      { x: -80, z: -80, w: 7, h: 11, d: 9 },
    ]

    const buildingMat = new THREE.MeshLambertMaterial({ color: 0x8b8b8b })
    for (const def of buildingDefs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(def.w, def.h, def.d), buildingMat)
      mesh.position.set(def.x, def.h / 2, def.z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    }

    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x228b22 })
    for (let i = 0; i < 40; i++) {
      const s1 = ((i * 7919) % 1000) / 1000
      const s2 = ((i * 6271) % 1000) / 1000
      const s3 = ((i * 3457) % 1000) / 1000
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

    const gateMat = new THREE.MeshLambertMaterial({ color: 0xff4400 })
    const gatePositions = [[0, 3, -15], [15, 4, 0], [0, 3, 15], [-15, 4, 0]] as const
    for (const [gx, gy, gz] of gatePositions) {
      const group = new THREE.Group()
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.2, 8, 32), gateMat)
      group.position.set(gx, gy, gz)
      group.add(ring)
      scene.add(group)
    }

    const droneNode = new THREE.Object3D()
    scene.add(droneNode)

    const frameMat = new THREE.MeshLambertMaterial({ color: 0x222222 })
    const armGeo = new THREE.BoxGeometry(0.5, 0.04, 0.08)
    const arm1 = new THREE.Mesh(armGeo, frameMat)
    const arm2 = new THREE.Mesh(armGeo, frameMat)
    arm2.rotation.y = Math.PI / 2
    droneNode.add(arm1)
    droneNode.add(arm2)

    const motorMat = new THREE.MeshLambertMaterial({ color: 0x444444 })
    const motorGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8)
    const motorOffsets = [[0.22, 0, 0.22], [-0.22, 0, 0.22], [0.22, 0, -0.22], [-0.22, 0, -0.22]] as const
    for (const [mx, my, mz] of motorOffsets) {
      const m = new THREE.Mesh(motorGeo, motorMat)
      m.position.set(mx, my, mz)
      droneNode.add(m)
    }

    droneNode.add(camera)
    camera.position.set(0, 0.04, 0.06)

    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) })
    if (world.solver instanceof CANNON.GSSolver) {
      world.solver.iterations = 12
    }
    world.allowSleep = true

    const groundMaterial = new CANNON.Material('ground')
    const droneMaterial = new CANNON.Material('drone')
    world.addContactMaterial(new CANNON.ContactMaterial(droneMaterial, groundMaterial, {
      friction: 0.92,
      restitution: 0,
    }))

    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial })
    groundBody.addShape(new CANNON.Plane())
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(groundBody)

    for (const def of buildingDefs) {
      const body = new CANNON.Body({ mass: 0, material: groundMaterial })
      body.addShape(new CANNON.Box(new CANNON.Vec3(def.w / 2, def.h / 2, def.d / 2)))
      body.position.set(def.x, def.h / 2, def.z)
      world.addBody(body)
    }

    const droneBody = new CANNON.Body({
      mass: MASS,
      material: droneMaterial,
      position: new CANNON.Vec3(0, 3, 0),
      shape: new CANNON.Box(new CANNON.Vec3(DRONE_HALF, DRONE_HALF, DRONE_HALF)),
      linearDamping: 0.2,
      angularDamping: 0.35,
    })
    droneBody.sleepSpeedLimit = 0.03
    droneBody.sleepTimeLimit = 0.5
    world.addBody(droneBody)

    const euler = new THREE.Euler()
    const qThree = new THREE.Quaternion()
    const localCorners = [
      new THREE.Vector3(-DRONE_HALF, -DRONE_HALF, -DRONE_HALF),
      new THREE.Vector3(DRONE_HALF, -DRONE_HALF, -DRONE_HALF),
      new THREE.Vector3(-DRONE_HALF, -DRONE_HALF, DRONE_HALF),
      new THREE.Vector3(DRONE_HALF, -DRONE_HALF, DRONE_HALF),
      new THREE.Vector3(-DRONE_HALF, DRONE_HALF, -DRONE_HALF),
      new THREE.Vector3(DRONE_HALF, DRONE_HALF, -DRONE_HALF),
      new THREE.Vector3(-DRONE_HALF, DRONE_HALF, DRONE_HALF),
      new THREE.Vector3(DRONE_HALF, DRONE_HALF, DRONE_HALF),
    ]
    const cornerWorld = new THREE.Vector3()

    const centerOfMass = new CANNON.Vec3(0, 0, 0)
    const thrustLocal = new CANNON.Vec3(0, 0, 0)
    const torqueLocal = new CANNON.Vec3()
    const torqueWorld = new CANNON.Vec3()
    const levelAssistLocalTorque = new CANNON.Vec3()
    const levelAssistWorldTorque = new CANNON.Vec3()

    const applyDeadzone = (v: number, dz = 0.06) => (Math.abs(v) < dz ? 0 : v)
    const LEVEL_ASSIST_DURATION = 0.9
    const LEVEL_KP = 2.6
    const LEVEL_KD = 0.45
    const RESET_THROTTLE_MS = 350

    let throttle = 0
    let lastLevelRequest = levelRequestRef.current
    let prevRPressed = false
    let levelAssistTimeLeft = 0
    let nextResetAllowedAt = 0
    let lastTime = performance.now()
    let animId = 0

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const now = performance.now()
      const dt = Math.min((now - lastTime) / 1000, 0.05)
      lastTime = now

      const triggerLevelAssist = () => {
        if (now < nextResetAllowedAt) return
        nextResetAllowedAt = now + RESET_THROTTLE_MS
        levelAssistTimeLeft = LEVEL_ASSIST_DURATION
        droneBody.wakeUp()
      }

      let throttleCmd = 0
      let yawCmd = 0
      let pitchCmd = 0
      let rollCmd = 0

      if (gamepad.connected) {
        throttleCmd = Math.max(-1, Math.min(1, -gamepad.leftY))
        yawCmd = applyDeadzone(gamepad.leftX)
        pitchCmd = applyDeadzone(invertPitchY ? -gamepad.rightY : gamepad.rightY)
        rollCmd = applyDeadzone(gamepad.rightX)
      }

      if (useKeyboard && keyboardRef.current) {
        const kb = keyboardRef.current
        if (kb['KeyW']) throttleCmd = Math.min(1, throttleCmd + 0.8)
        if (kb['KeyS']) throttleCmd = Math.max(0, throttleCmd - 0.8)
        if (kb['KeyA']) yawCmd = -1
        if (kb['KeyD']) yawCmd = 1
        if (kb['Numpad4']) rollCmd = -1
        if (kb['Numpad6']) rollCmd = 1
        if (kb['Numpad8']) pitchCmd = invertPitchY ? 1 : -1
        if (kb['Numpad5']) pitchCmd = invertPitchY ? -1 : 1

        const rPressed = !!kb['KeyR']
        if (rPressed && !prevRPressed) {
          triggerLevelAssist()
        }
        prevRPressed = rPressed
      }

      if (levelRequestRef.current !== lastLevelRequest) {
        lastLevelRequest = levelRequestRef.current
        triggerLevelAssist()
      }

      throttle += (throttleCmd - throttle) * Math.min(1, dt * 8)

      const thrust = throttle >= 0
        ? throttle * MAX_THRUST
        : throttle * MAX_REVERSE_THRUST
      thrustLocal.set(0, thrust, 0)
      // Apply thrust in the drone local +Y axis through center of mass to avoid parasitic spin.
      droneBody.applyLocalForce(thrustLocal, centerOfMass)

      torqueLocal.set(pitchCmd * T_PITCH, -yawCmd * T_YAW, -rollCmd * T_ROLL)
      droneBody.quaternion.vmult(torqueLocal, torqueWorld)
      droneBody.applyTorque(torqueWorld)

      if (levelAssistTimeLeft > 0) {
        levelAssistTimeLeft = Math.max(0, levelAssistTimeLeft - dt)
        qThree.set(droneBody.quaternion.x, droneBody.quaternion.y, droneBody.quaternion.z, droneBody.quaternion.w)
        euler.setFromQuaternion(qThree, 'YXZ')
        levelAssistLocalTorque.set(
          -euler.x * LEVEL_KP - droneBody.angularVelocity.x * LEVEL_KD,
          0,
          -euler.z * LEVEL_KP - droneBody.angularVelocity.z * LEVEL_KD,
        )
        droneBody.quaternion.vmult(levelAssistLocalTorque, levelAssistWorldTorque)
        droneBody.applyTorque(levelAssistWorldTorque)
      }

      world.step(1 / 120, dt, 6)

      droneNode.position.set(droneBody.position.x, droneBody.position.y, droneBody.position.z)
      droneNode.quaternion.set(droneBody.quaternion.x, droneBody.quaternion.y, droneBody.quaternion.z, droneBody.quaternion.w)

      let minCornerY = Infinity
      for (const c of localCorners) {
        cornerWorld.copy(c).applyQuaternion(droneNode.quaternion).add(droneNode.position)
        if (cornerWorld.y < minCornerY) minCornerY = cornerWorld.y
      }
      const altAgl = Math.max(0, minCornerY)

      euler.setFromQuaternion(droneNode.quaternion, 'YXZ')
      if (telemetryRef.current) {
        telemetryRef.current.roll = THREE.MathUtils.radToDeg(euler.z)
        telemetryRef.current.pitch = THREE.MathUtils.radToDeg(euler.x)
        telemetryRef.current.yaw = ((THREE.MathUtils.radToDeg(euler.y) % 360) + 360) % 360
        telemetryRef.current.speedMs = droneBody.velocity.length()
        telemetryRef.current.altAgl = altAgl
        telemetryRef.current.altAsl = altAgl + 50
        telemetryRef.current.throttle = throttle
      }

      camera.rotation.x = THREE.MathUtils.degToRad(camTiltRef.current ?? 20)
      renderer.render(scene, camera)
    }

    animate()

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
      world.bodies.slice().forEach((b) => world.removeBody(b))
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gamepad, useKeyboard, invertPitchY, levelRequestRef])

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
}
