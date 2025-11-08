import * as THREE from 'three'
import type { ParticleViewerState } from './types'

/**
 * Setup and animate the three colored spotlights
 */

interface LightingState {
  scene: THREE.Scene
  yellowSpotlight: THREE.SpotLight | null
  magentaSpotlight: THREE.SpotLight | null
  cyanSpotlight: THREE.SpotLight | null
  containerRef?: { value: HTMLElement | null }
}

interface SpotlightConfig {
  color: number
  intensity: number
  position: [number, number, number]
  target: [number, number, number]
  angle: number
  penumbra: number
  distance: number
  shadowFov: number
  shadowNear: number
  shadowFar: number
  shadowMapSize: number
  shadowBias: number
  shadowRadius: number
}

/**
 * Create and configure a spotlight with shadows
 */
function createSpotlight(config: SpotlightConfig, scene: THREE.Scene): THREE.SpotLight {
  const spotlight = new THREE.SpotLight(config.color, config.intensity)
  spotlight.position.set(...config.position)
  spotlight.castShadow = true
  spotlight.angle = config.angle
  spotlight.penumbra = config.penumbra
  spotlight.decay = 2
  spotlight.distance = config.distance
  spotlight.target.position.set(...config.target)
  spotlight.target.updateMatrixWorld()
  
  // Configure shadow camera
  const shadowCamera = spotlight.shadow.camera as THREE.PerspectiveCamera
  shadowCamera.fov = config.shadowFov
  shadowCamera.near = config.shadowNear
  shadowCamera.far = config.shadowFar
  spotlight.shadow.mapSize.width = config.shadowMapSize
  spotlight.shadow.mapSize.height = config.shadowMapSize
  spotlight.shadow.bias = config.shadowBias
  spotlight.shadow.radius = config.shadowRadius
  
  scene.add(spotlight)
  scene.add(spotlight.target)
  
  return spotlight
}

const defaultSpotlightConfig: Partial<SpotlightConfig> = {
  intensity: 50,
  angle: Math.PI / 40, // 18 degrees
  penumbra: 0.2,
  distance: 30,
  shadowFov: 30,
  shadowNear: 0.1,
  shadowFar: 30,
  shadowMapSize: 2048,
  shadowBias: -0.0001,
  shadowRadius: 4
}

export function setupLighting(state: ParticleViewerState | LightingState) {
  const { scene } = state

  // Yellow spotlight
  state.yellowSpotlight = createSpotlight({
    ...defaultSpotlightConfig,
    color: 0xffff00,
    position: [-3, 2, 4],
    target: [0, 0, 0]
  } as SpotlightConfig, scene)
  
  // Magenta spotlight
  state.magentaSpotlight = createSpotlight({
    ...defaultSpotlightConfig,
    color: 0xff00ff,
    position: [0, 2, 4],
    target: [0, 0, 0]
  } as SpotlightConfig, scene)
  
  // Cyan spotlight
  state.cyanSpotlight = createSpotlight({
    ...defaultSpotlightConfig,
    color: 0x00ffff,
    position: [3, 2, 4],
    target: [0, 0, 0]
  } as SpotlightConfig, scene)
  
  // Add a ground plane to receive shadows
  const groundGeometry = new THREE.PlaneGeometry(20, 20)
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide
  })
  const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial)
  groundPlane.rotation.x = -Math.PI / 2
  groundPlane.position.y = -1.5
  groundPlane.position.z = 0
  groundPlane.receiveShadow = true
  groundPlane.castShadow = false
  scene.add(groundPlane)
  
  // No ambient light - scene should be completely dark when spotlights are off
  // const ambientLight = new THREE.AmbientLight(0xffffff, 0)
  // scene.add(ambientLight)
}

export function animateLighting(state: ParticleViewerState | LightingState) {
  if (!state.yellowSpotlight || !state.magentaSpotlight || !state.cyanSpotlight) return

  const time = Date.now() * 0.0003
  const range = 4
  const height = 2.5
  const depth = 4
  
  // Yellow light
  const yellowX = Math.sin(time) * range
  state.yellowSpotlight.position.x = yellowX
  state.yellowSpotlight.position.y = height + Math.sin(time * 0.7) * 0.3
  state.yellowSpotlight.position.z = depth
  
  // Magenta light
  const magentaX = Math.sin(time + Math.PI) * range
  state.magentaSpotlight.position.x = magentaX
  state.magentaSpotlight.position.y = height + Math.sin(time * 0.7 + Math.PI / 3) * 0.3
  state.magentaSpotlight.position.z = depth
  
  // Cyan light
  const cyanX = Math.sin(time + Math.PI * 2 / 3) * range
  state.cyanSpotlight.position.x = cyanX
  state.cyanSpotlight.position.y = height + Math.sin(time * 0.7 + Math.PI * 2 / 3) * 0.3
  state.cyanSpotlight.position.z = depth
  
  // Animate target (center focus)
  const centerOffsetX = Math.sin(time * 0.5) * 0.2
  const centerOffsetY = Math.cos(time * 0.5) * 0.2
  const centerOffsetZ = Math.sin(time * 0.3) * 0.1
  
  state.yellowSpotlight.target.position.set(centerOffsetX, centerOffsetY, centerOffsetZ)
  state.magentaSpotlight.target.position.set(centerOffsetX, centerOffsetY, centerOffsetZ)
  state.cyanSpotlight.target.position.set(centerOffsetX, centerOffsetY, centerOffsetZ)
  
  state.yellowSpotlight.target.updateMatrixWorld()
  state.magentaSpotlight.target.updateMatrixWorld()
  state.cyanSpotlight.target.updateMatrixWorld()
  
  state.yellowSpotlight.shadow.camera.updateMatrixWorld()
  state.magentaSpotlight.shadow.camera.updateMatrixWorld()
  state.cyanSpotlight.shadow.camera.updateMatrixWorld()
}

