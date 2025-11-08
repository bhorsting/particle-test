import * as THREE from 'three'
import type { ParticleViewerState } from './types'

/**
 * Camera management functions
 */

export function updateCameraForParticles(state: ParticleViewerState) {
  const { camera, currentParticles, isTransitioning } = state
  if (!camera || !currentParticles || isTransitioning) return

  const userData = (currentParticles as any).userData
  if (!userData || !userData.originalPositions) {
    const box = new THREE.Box3()
    box.setFromObject(currentParticles)
    if (box.isEmpty()) {
      state.targetCameraZ = 5
      return
    }
    const size = box.getSize(new THREE.Vector3())
    if (size.x <= 0 || size.y <= 0 || !isFinite(size.x) || !isFinite(size.y)) {
      state.targetCameraZ = 5
      return
    }
    const screenAspect = window.innerWidth / window.innerHeight
    const fovRad = camera.fov * (Math.PI / 180)
    const halfFovRad = fovRad / 2
    const tanHalfFov = halfFovRad
    const distanceForWidth = (size.x / 2) / (tanHalfFov * screenAspect)
    const distanceForHeight = (size.y / 2) / tanHalfFov
    const distance = Math.min(distanceForWidth, distanceForHeight)
    if (!isFinite(distance) || distance <= 0 || distance > 1000) {
      state.targetCameraZ = 5
      return
    }
    state.targetCameraZ = distance * 0.05
    camera.updateProjectionMatrix()
    return
  }

  const originalPositions = userData.originalPositions as number[]
  const count = userData.count as number
  
  if (count === 0 || originalPositions.length === 0) {
    state.targetCameraZ = 5
    return
  }

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  
  for (let i = 0; i < count; i++) {
    const x = originalPositions[i * 3] ?? 0
    const y = originalPositions[i * 3 + 1] ?? 0
    const z = originalPositions[i * 3 + 2] ?? 0
    
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  
  const size = new THREE.Vector3(maxX - minX, maxY - minY, maxZ - minZ)
  
  if (size.x <= 0 || size.y <= 0 || !isFinite(size.x) || !isFinite(size.y)) {
    state.targetCameraZ = 5
    return
  }
  
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180)
  const halfFovRad = fovRad / 2
  const tanHalfFov = halfFovRad
  
  const distanceForWidth = (size.x / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (size.y / 2) / tanHalfFov
  const distance = Math.min(distanceForWidth, distanceForHeight)
  
  if (!isFinite(distance) || distance <= 0 || distance > 1000) {
    state.targetCameraZ = 5
    return
  }
  
  state.targetCameraZ = distance * 0.5
  camera.updateProjectionMatrix()
}

export function updateCameraForWorkGrid(state: ParticleViewerState) {
  const { camera, workImagePlanes } = state
  if (!camera || workImagePlanes.length === 0) return
  
  const cols = Math.ceil(Math.sqrt(workImagePlanes.length))
  const rows = Math.ceil(workImagePlanes.length / cols)
  const spacing = 0.4
  const margin = 0.2
  
  const totalWidth = cols * spacing - spacing + margin * 2
  const totalHeight = rows * spacing - spacing + margin * 2
  
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180)
  const halfFovRad = fovRad / 2
  const tanHalfFov = halfFovRad
  
  const distanceForWidth = (totalWidth / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (totalHeight / 2) / tanHalfFov
  const distance = Math.max(distanceForWidth, distanceForHeight) * 1.1
  
  state.targetCameraZ = distance
}

export function updateCameraForWorkImage(state: ParticleViewerState, width: number, height: number) {
  const { camera } = state
  if (!camera) return
  
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180)
  const halfFovRad = fovRad / 2
  const tanHalfFov = halfFovRad
  
  const distanceForWidth = (width / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (height / 2) / tanHalfFov
  const distance = Math.max(distanceForWidth, distanceForHeight) * 1.1
  
  state.targetCameraZ = distance
}

export function handleResize(state: ParticleViewerState) {
  const { camera, renderer } = state
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  updateCameraForParticles(state)
}

