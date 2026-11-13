import React, {Suspense, useCallback, useEffect, useMemo, useRef} from 'react'
import {Canvas, useFrame, useThree} from '@react-three/fiber'
import {CameraControls, ContactShadows, Environment, Lightformer, useGLTF, useProgress} from '@react-three/drei'
import {Vector3} from 'three'
import {preparePrototype, prototypeUrls} from './prototypeModel.js'

export function clearPrototype(variant) {
  useGLTF.clear(prototypeUrls[variant])
}

function LoadingProgress({onProgress}) {
  const progress = useProgress(state => state.progress)
  useEffect(() => onProgress(Math.min(100, Math.max(0, progress))), [progress, onProgress])
  return null
}

function CameraRig({bounds, command, reducedMotion}) {
  const controls = useRef()
  const lastCommand = useRef(null)
  const {width, height} = useThree(state => state.size)
  const fov = useThree(state => state.camera.fov)
  const radius = bounds.length() / 2
  const fit = useCallback(() => {
    const verticalFov = fov * Math.PI / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * width / height)
    const distance = radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2) * 1.08
    const position = new Vector3(4, 2.1, 6).normalize().multiplyScalar(distance)
    controls.current?.setLookAt(...position.toArray(), 0, 0, 0, !reducedMotion)
  }, [width, height, fov, radius, reducedMotion])

  useEffect(() => { fit() }, [fit])
  useEffect(() => {
    if (!command || !controls.current || lastCommand.current === command.id) return
    lastCommand.current = command.id
    const smooth = !reducedMotion
    if (command.type === 'reset') fit()
    if (command.type === 'in') controls.current.dolly(controls.current.distance * 0.2, smooth)
    if (command.type === 'out') controls.current.dolly(-controls.current.distance * 0.25, smooth)
    if (command.type === 'left') controls.current.rotate(-Math.PI / 8, 0, smooth)
    if (command.type === 'right') controls.current.rotate(Math.PI / 8, 0, smooth)
  }, [command, fit, reducedMotion])

  return <CameraControls ref={controls} makeDefault minDistance={radius * 1.2} maxDistance={radius * 10}
    minPolarAngle={0.08} maxPolarAngle={Math.PI / 2 + 0.08} smoothTime={reducedMotion ? 0 : 0.22}/>
}

function Prototype({variant, running, command, reducedMotion, onReady}) {
  const {scene} = useGLTF(prototypeUrls[variant], false, false)
  const prepared = useMemo(() => preparePrototype(scene), [scene])
  useEffect(() => { onReady() }, [prepared, onReady])
  useFrame((_, delta) => {
    if (running) prepared.rotors.forEach(rotor => { rotor.rotation.z -= Math.min(delta, 0.05) * 8 })
  })
  return <>
    <primitive object={prepared.object} dispose={null}/>
    <CameraRig bounds={prepared.size} command={command} reducedMotion={reducedMotion}/>
    <ContactShadows position={[0, -prepared.size.y / 2 - 0.02, 0]} opacity={0.42}
      scale={7} blur={2.8} far={4} resolution={256} frames={1}/>
  </>
}

function ContextMonitor({onContextLost}) {
  const canvas = useThree(state => state.gl.domElement)
  useEffect(() => {
    const lost = event => { event.preventDefault(); onContextLost() }
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [canvas, onContextLost])
  return null
}

export default function PrototypeScene({variant, running, visible, reducedMotion, command, onReady, onProgress, onContextLost}) {
  return <>
    <LoadingProgress onProgress={onProgress}/>
    <Canvas camera={{position: [4, 2.1, 6], fov: 36, near: 0.05, far: 100}}
      dpr={[1, 1.75]} gl={{antialias: true, alpha: true, powerPreference: 'low-power'}}
      frameloop={visible ? (running ? 'always' : 'demand') : 'never'} fallback={<p>WebGL est indisponible dans ce navigateur.</p>}>
      <ContextMonitor onContextLost={onContextLost}/>
      <ambientLight intensity={0.6}/>
      <directionalLight position={[4, 6, 5]} intensity={2.8} color="#f3fff6"/>
      <directionalLight position={[-4, 2, -3]} intensity={1.4} color="#b9ff73"/>
      <Environment resolution={128} frames={1}>
        <Lightformer position={[0, 5, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[6, 6, 1]} intensity={2.5}/>
        <Lightformer position={[-4, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[2, 5, 1]} intensity={2}/>
        <Lightformer position={[4, 2, -3]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 5, 1]} intensity={2} color="#b9ff73"/>
      </Environment>
      <Suspense fallback={null}>
        <Prototype key={variant} variant={variant} running={running} command={command}
          reducedMotion={reducedMotion} onReady={onReady}/>
      </Suspense>
    </Canvas>
  </>
}
