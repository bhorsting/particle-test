import * as THREE from 'three'

export interface ParticleViewerState {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  gridHelper: THREE.GridHelper | null
  currentParticles: THREE.InstancedMesh | null
  nextParticles: THREE.InstancedMesh | null
  currentImageIndex: number
  isTransitioning: boolean
  animationFrameId: number | null
  autoAdvanceTimer: number | null
  resizeObserver: ResizeObserver | null
  textMesh: THREE.Mesh | null
  workTextMesh: THREE.Mesh | null
  cvTextMesh: THREE.Mesh | null
  contactTextMesh: THREE.Mesh | null
  emailTextMesh: THREE.Mesh | null
  showingEmail: boolean
  cvTextMeshes: THREE.Mesh[]
  showingCV: boolean
  showingWork: boolean
  workImagePlanes: THREE.Mesh[]
  selectedWorkImage: THREE.Mesh | null
  raycaster: THREE.Raycaster | null
  yellowSpotlight: THREE.SpotLight | null
  magentaSpotlight: THREE.SpotLight | null
  cyanSpotlight: THREE.SpotLight | null
  mouse: THREE.Vector2
  isCameraZoomedOut: boolean
  targetCameraZ: number
  currentCameraZ: number
  mouseX: number
  mouseY: number
  targetRotationX: number
  targetRotationY: number
  currentRotationX: number
  currentRotationY: number
  containerRef: { value: HTMLElement | null }
}

export interface ParticleViewerProps {
  images: string[]
  particleDensity: number
  transitionDuration: number
  autoAdvance: boolean
  autoAdvanceInterval: number
}

export const explodeForce = 2
export const implodeSpeed = 0.02

