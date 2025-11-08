import * as THREE from 'three'
import type { ParticleViewerState } from './types'
import { setupLighting } from './lighting'

/**
 * Initialize the Three.js scene with background elements
 */

export function initScene(state: ParticleViewerState) {
  if (!state.containerRef.value) return

  // Scene setup
  state.scene = new THREE.Scene()
  state.scene.background = new THREE.Color(0x330099)
  
  // Create grid
  const gridSize = 10
  const divisions = 100
  state.gridHelper = new THREE.GridHelper(gridSize, divisions, 0x000000, 0xffffff)
  state.gridHelper.material.opacity = 0.5
  state.gridHelper.material.transparent = true
  state.gridHelper.position.z = 0.15
  state.gridHelper.rotateX(Math.PI / 2)
  state.scene.add(state.gridHelper)
  
  // Create three rotated rectangles for background
  const rectSize = 12
  const rotationAngle = 30 * (Math.PI / 180)
  
  // Yellow rectangle
  const yellowGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const yellowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffff00,
    transparent: true,
    opacity: 0.75
  })
  const yellowRect = new THREE.Mesh(yellowGeometry, yellowMaterial)
  yellowRect.rotation.z = rotationAngle
  yellowRect.position.set(-2, 1, -18)
  state.scene.add(yellowRect)
  
  // Pink rectangle
  const pinkGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const pinkMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff00ff,
    transparent: true,
    opacity: 0.75
  })
  const pinkRect = new THREE.Mesh(pinkGeometry, pinkMaterial)
  pinkRect.rotation.z = rotationAngle
  pinkRect.position.set(0, 0, -20)
  state.scene.add(pinkRect)
  
  // Cyan rectangle
  const cyanGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const cyanMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ffff,
    transparent: true,
    opacity: 0.75
  })
  const cyanRect = new THREE.Mesh(cyanGeometry, cyanMaterial)
  cyanRect.rotation.z = rotationAngle
  cyanRect.position.set(2, -1, -22)
  state.scene.add(cyanRect)
  
  // Setup lighting
  setupLighting(state)

  // Camera setup
  state.camera = new THREE.PerspectiveCamera(
    5,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  state.camera.position.z = 5
  state.targetCameraZ = 5
  state.currentCameraZ = 5

  // Renderer setup
  state.renderer = new THREE.WebGLRenderer({ antialias: true })
  state.renderer.setSize(window.innerWidth, window.innerHeight)
  state.renderer.setPixelRatio(window.devicePixelRatio)
  state.renderer.shadowMap.enabled = true
  state.renderer.shadowMap.type = THREE.PCFSoftShadowMap
  state.containerRef.value.appendChild(state.renderer.domElement)

  // Initialize raycaster
  state.raycaster = new THREE.Raycaster()
}

