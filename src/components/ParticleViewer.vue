<template>
  <div ref="containerRef" class="particle-viewer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

interface Props {
  images: string[]
  particleDensity?: number // particles per pixel (0-1)
  transitionDuration?: number // in milliseconds
  autoAdvance?: boolean
  autoAdvanceInterval?: number // in milliseconds
}

const props = withDefaults(defineProps<Props>(), {
  particleDensity: 0.1,
  transitionDuration: 2000,
  autoAdvance: false,
  autoAdvanceInterval: 3000
})

const containerRef = ref<HTMLElement | null>(null)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let gridHelper: THREE.GridHelper | null = null
let currentParticles: THREE.InstancedMesh | null = null
let nextParticles: THREE.InstancedMesh | null = null
let currentImageIndex = 0
let isTransitioning = false
let animationFrameId: number | null = null
let autoAdvanceTimer: number | null = null
let resizeObserver: ResizeObserver | null = null
let textMesh: THREE.Mesh | null = null
let workTextMesh: THREE.Mesh | null = null
let cvTextMesh: THREE.Mesh | null = null
let contactTextMesh: THREE.Mesh | null = null
let emailTextMesh: THREE.Mesh | null = null
let showingEmail = false // Track if email is currently shown
let cvTextMeshes: THREE.Mesh[] = [] // Array to store CV text meshes
let showingCV = false // Track if CV words are currently shown
let raycaster: THREE.Raycaster | null = null
let mouse = new THREE.Vector2()
let isCameraZoomedOut = false // Track if camera is zoomed out for WORK view
let targetCameraZ = 5 // Target camera Z position for smooth interpolation
let currentCameraZ = 5 // Current camera Z position

// Mouse tracking for rotation
let mouseX = 0
let mouseY = 0
let targetRotationX = 0
let targetRotationY = 0
let currentRotationX = 0
let currentRotationY = 0

// Particle system parameters

const explodeForce = 2
const implodeSpeed = 0.02

// Initialize Three.js scene
const initScene = () => {
  if (!containerRef.value) return

  // Scene setup
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x330099) // Black background
  
  // Create grid of black lines between text and particles
  const gridSize = 10 // Size of the grid
  const divisions = 100 // Number of divisions
    gridHelper = new THREE.GridHelper(gridSize, divisions, 0x000000, 0xffffff)
  gridHelper.material.opacity = 0.5
  gridHelper.material.transparent = true
    gridHelper.position.z = 0.15 // Behind all
  gridHelper.rotateX(Math.PI / 2)
  scene.add(gridHelper)
  
  // Create three rotated rectangles for background
  const rectSize = 12 // Large size to cover background
  const rotationAngle = 30 * (Math.PI / 180) // 30 degrees in radians
  
  // Yellow rectangle
  const yellowGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const yellowMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffff00,
    transparent: true,
    opacity: 0.75
  })
  const yellowRect = new THREE.Mesh(yellowGeometry, yellowMaterial)
  yellowRect.rotation.z = rotationAngle
  yellowRect.position.set(-2, 1, -18) // Different z position to avoid z-fighting
  scene.add(yellowRect)
  
  // Pink rectangle
  const pinkGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const pinkMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xff00ff,
    transparent: true,
    opacity: 0.75
  })
  const pinkRect = new THREE.Mesh(pinkGeometry, pinkMaterial)
  pinkRect.rotation.z = rotationAngle
  pinkRect.position.set(0, 0, -20) // Middle z position
  scene.add(pinkRect)
  
  // Cyan rectangle
  const cyanGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const cyanMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ffff,
    transparent: true,
    opacity: 0.75
  })
  const cyanRect = new THREE.Mesh(cyanGeometry, cyanMaterial)
  cyanRect.rotation.z = rotationAngle
  cyanRect.position.set(2, -1, -22) // Furthest back
  scene.add(cyanRect)
  
  // Add directional light for shadows (positioned above the text)
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
  directionalLight.position.set(0, 2, 3)
  directionalLight.castShadow = true
  
  // Configure shadow camera for the light
  directionalLight.shadow.camera.left = -2
  directionalLight.shadow.camera.right = 2
  directionalLight.shadow.camera.top = 2
  directionalLight.shadow.camera.bottom = -2
  directionalLight.shadow.camera.near = 0.1
  directionalLight.shadow.camera.far = 10
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  directionalLight.shadow.bias = -0.0001
  
  scene.add(directionalLight)
  
  // Store light reference for updating shader uniforms
  ;(scene as any).directionalLight = directionalLight
  
  // Add ambient light for overall illumination
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
  scene.add(ambientLight)

  // Camera setup
  camera = new THREE.PerspectiveCamera(
    5,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.z = 5
  targetCameraZ = 5
  currentCameraZ = 5

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(window.devicePixelRatio)
  // Enable shadows
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap // Soft shadows
  containerRef.value.appendChild(renderer.domElement)

  // Handle window resize
  window.addEventListener('resize', handleResize)
  
  // Set up ResizeObserver for container
  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    resizeObserver.observe(containerRef.value)
  }
  
  // Initialize raycaster for hover detection
  raycaster = new THREE.Raycaster()
  
  // Set up mouse tracking for rotation and hover detection
  const handleMouseMove = (event: MouseEvent) => {
    // Normalize mouse position to -1 to 1 range
    mouseX = (event.clientX / window.innerWidth) * 2 - 1
    mouseY = (event.clientY / window.innerHeight) * 2 - 1
    
    // Calculate target rotation (subtle, max ~15 degrees)
    targetRotationY = mouseX * 0.15 // Rotate around Y axis (left/right)
    targetRotationX = -mouseY * 0.15 // Rotate around X axis (up/down, inverted)
    
    // Update mouse position for raycasting
    mouse.x = mouseX
    mouse.y = -mouseY // Invert Y for Three.js coordinate system
  }
  
  window.addEventListener('mousemove', handleMouseMove)
  
  // Store handler for cleanup
  ;(window as any).__particleViewerMouseHandler = handleMouseMove
  
  // Handle clicks for interactive text elements
  const handleClick = (event: MouseEvent) => {
    if (!raycaster || !camera) return
    
    // Update mouse position for raycasting
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    
    raycaster.setFromCamera(mouse, camera)
    // Include email text mesh and CV words in raycasting for click detection
    const textMeshes = [
      textMesh, 
      workTextMesh, 
      cvTextMesh, 
      contactTextMesh, 
      emailTextMesh,
      ...cvTextMeshes
    ].filter(Boolean) as THREE.Mesh[]
    const intersects = raycaster.intersectObjects(textMeshes)
    
    if (intersects.length > 0) {
      const clickedMesh = intersects[0]!.object as THREE.Mesh
      
      // BAS HORSTING and WORK both zoom out
      if (clickedMesh === textMesh || clickedMesh === workTextMesh) {
        // If email or CV is showing, show menu first
        if (showingEmail) {
          showMenu()
        }
        if (showingCV) {
          hideCVWords()
        }
        
        // Toggle camera zoom
        if (isCameraZoomedOut) {
          // Zoom back in
          updateCameraForParticles()
          isCameraZoomedOut = false
        } else {
          // Zoom out to see particle animations better
          targetCameraZ = currentCameraZ * 3 // Move camera back 3x
          isCameraZoomedOut = true
        }
      }
      
      // CONTACT shows email, email hides and shows menu
      if (clickedMesh === contactTextMesh && !showingEmail && !showingCV) {
        // Hide menu items and show email
        showEmail()
      } else if (clickedMesh === emailTextMesh && showingEmail) {
        // Hide email and show menu items
        showMenu()
      }
      
      // CV shows list of words
      if (clickedMesh === cvTextMesh && !showingCV && !showingEmail) {
        showCVWords()
      } else if (showingCV && clickedMesh && cvTextMeshes.includes(clickedMesh)) {
        // Clicking any CV word hides CV and shows menu
        hideCVWords()
      }
    }
  }
  
  window.addEventListener('click', handleClick)
  
  // Store click handler for cleanup
  ;(window as any).__particleViewerClickHandler = handleClick
  
  // Load font and create 3D text
  create3DText()
}

// Create 3D text "Bas Horsting"
const create3DText = () => {
  const loader = new FontLoader()
  
  // Try to load Xiaomi Sans font, fallback to default if not available
  loader.load(
    '/fonts/font_sans.json',
    (font) => {
      // Create text geometry
      const textGeometry = new TextGeometry('BAS HORSTING', {
        font: font,
        size: 0.10, // Size relative to the scene
        depth: 0, // Depth/extrusion
        curveSegments: 12,
        bevelEnabled: false,
        
      })

      
      // Center the text
      textGeometry.computeBoundingBox()
      if (textGeometry.boundingBox) {
        const centerOffsetX = -0.5 * (textGeometry.boundingBox.max.x + textGeometry.boundingBox.min.x)
        const centerOffsetY = -0.5 * (textGeometry.boundingBox.max.y + textGeometry.boundingBox.min.y)
        textGeometry.translate(centerOffsetX, centerOffsetY, 0)
      }
      
      // Create material for the text (MeshStandardMaterial for proper shadow casting)
      const textMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0xffff66), // Make text emissive for glow
        emissiveIntensity: 0.5 // Strong glow on text
      })
      
      // Create mesh
      textMesh = new THREE.Mesh(textGeometry, textMaterial)
      
      // Enable shadow casting on the text
      textMesh.castShadow = true
      textMesh.receiveShadow = false
      
      // Position text in front of particles (slightly forward in Z)
      textMesh.position.z = 0.1
      
      // Add to scene
      scene.add(textMesh)
      
      // Get the bounding box to position smaller texts below, left-aligned
      textGeometry.computeBoundingBox()
      const mainTextHeight = textGeometry.boundingBox ? 
        (textGeometry.boundingBox.max.y - textGeometry.boundingBox.min.y) : 0.1
      const mainTextLeft = textGeometry.boundingBox ? 
        textGeometry.boundingBox.min.x : -0.5
      const spacing = 0.04 // Space between texts horizontally
      const smallTextSize = 0.06 // Smaller size for WORK, CV, CONTACT
      const smallTextY = -mainTextHeight / 2 - spacing - smallTextSize / 2
      let currentX = mainTextLeft // Start from left edge of main text
      
      // Create "WORK" text in yellow
      const workGeometry = new TextGeometry('WORK', {
        font: font,
        size: smallTextSize,
        depth: 0,
        curveSegments: 12,
        bevelEnabled: false
      })
      workGeometry.computeBoundingBox()
      // Don't center, keep left-aligned
      const workMaterial = new THREE.MeshStandardMaterial({
        color: 0xffff00, // Yellow
        transparent: true,
        opacity: 0.8,
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0xffff00),
        emissiveIntensity: 0.5
      })
      workTextMesh = new THREE.Mesh(workGeometry, workMaterial)
      workTextMesh.castShadow = true
      if (workGeometry.boundingBox) {
        workTextMesh.position.set(currentX - workGeometry.boundingBox.min.x, smallTextY, 0.1)
        currentX += (workGeometry.boundingBox.max.x - workGeometry.boundingBox.min.x) + spacing
      } else {
        workTextMesh.position.set(currentX, smallTextY, 0.1)
        currentX += 0.3 + spacing
      }
      scene.add(workTextMesh)
      
      // Create "CV" text in cyan
      const cvGeometry = new TextGeometry('CV', {
        font: font,
        size: smallTextSize,
        depth: 0,
        curveSegments: 12,
        bevelEnabled: false
      })
      cvGeometry.computeBoundingBox()
      const cvMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ffff, // Cyan
        transparent: true,
        opacity: 0.8,
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0x00ffff),
        emissiveIntensity: 0.5
      })
      cvTextMesh = new THREE.Mesh(cvGeometry, cvMaterial)
      cvTextMesh.castShadow = true
      if (cvGeometry.boundingBox) {
        cvTextMesh.position.set(currentX - cvGeometry.boundingBox.min.x, smallTextY, 0.1)
        currentX += (cvGeometry.boundingBox.max.x - cvGeometry.boundingBox.min.x) + spacing
      } else {
        cvTextMesh.position.set(currentX, smallTextY, 0.1)
        currentX += 0.2 + spacing
      }
      scene.add(cvTextMesh)
      
      // Create "CONTACT" text in magenta
      const contactGeometry = new TextGeometry('CONTACT', {
        font: font,
        size: smallTextSize,
        depth: 0,
        curveSegments: 12,
        bevelEnabled: false
      })
      contactGeometry.computeBoundingBox()
      const contactMaterial = new THREE.MeshStandardMaterial({
        color: 0xff00ff, // Magenta
        transparent: true,
        opacity: 0.8,
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0xff00ff),
        emissiveIntensity: 0.5
      })
      contactTextMesh = new THREE.Mesh(contactGeometry, contactMaterial)
      contactTextMesh.castShadow = true
      if (contactGeometry.boundingBox) {
        contactTextMesh.position.set(currentX - contactGeometry.boundingBox.min.x, smallTextY, 0.1)
      } else {
        contactTextMesh.position.set(currentX, smallTextY, 0.1)
      }
      scene.add(contactTextMesh)
      
      // Create "bhorsting@gmail.com" text in green, left-aligned (initially hidden)
      const emailGeometry = new TextGeometry('bhorsting@gmail.com', {
        font: font,
        size: smallTextSize,
        depth: 0,
        curveSegments: 12,
        bevelEnabled: false
      })
      emailGeometry.computeBoundingBox()
      // Don't center - keep left-aligned like menu items
      const emailMaterial = new THREE.MeshStandardMaterial({
        color: 0x00ff00, // Green
        transparent: true,
        opacity: 0, // Start hidden
        metalness: 0.1,
        roughness: 0.3,
        emissive: new THREE.Color(0x00ff00),
        emissiveIntensity: 0.5
      })
      emailTextMesh = new THREE.Mesh(emailGeometry, emailMaterial)
      emailTextMesh.castShadow = true
      // Position at the same Y as the menu items, left-aligned with menu
      if (emailGeometry.boundingBox) {
        emailTextMesh.position.set(mainTextLeft - emailGeometry.boundingBox.min.x, smallTextY, 0.1)
      } else {
        emailTextMesh.position.set(mainTextLeft, smallTextY, 0.1)
      }
      emailTextMesh.scale.set(0, 0, 0) // Start scaled down
      scene.add(emailTextMesh)
    },
    undefined,
    (error) => {
      console.warn('Failed to load Xiaomi Sans font, using default font:', error)
      // Fallback: try to use a default font or create text without custom font
      // For now, we'll just log the error - user can add the font file later
    }
  )
}

// Calculate camera position to fill screen with particles
const updateCameraForParticles = () => {
  if (!camera || !currentParticles || isTransitioning) return

  // Use originalPositions from userData instead of current positions
  // This ensures we calculate based on final positions, not animated ones
  const userData = (currentParticles as any).userData
  if (!userData || !userData.originalPositions) {
    // Fallback: use bounding box if userData not available
    const box = new THREE.Box3()
    box.setFromObject(currentParticles)
    if (box.isEmpty()) {
      targetCameraZ = 5
      return
    }
    const size = box.getSize(new THREE.Vector3())
    if (size.x <= 0 || size.y <= 0 || !isFinite(size.x) || !isFinite(size.y)) {
      targetCameraZ = 5
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
      targetCameraZ = 5
      return
    }
    targetCameraZ = distance * 0.05
    // Don't call lookAt here - it resets rotation
    camera.updateProjectionMatrix()
    return
  }

  // Calculate bounding box from original positions (final positions)
  const originalPositions = userData.originalPositions as number[]
  const count = userData.count as number
  
  if (count === 0 || originalPositions.length === 0) {
    targetCameraZ = 5
    return
  }

  // Find min/max from original positions
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
  
  // Safety check: if size is too small or invalid, use fallback
  if (size.x <= 0 || size.y <= 0 || !isFinite(size.x) || !isFinite(size.y)) {
    targetCameraZ = 5
    return
  }
  
  // Get screen aspect ratio
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180) // Convert to radians
  const halfFovRad = fovRad / 2
  
  // Simple approximation: tan(x) ≈ x for small angles (good for camera FOV)
  const tanHalfFov = halfFovRad
  
  // Calculate the visible width and height at a given distance
  // visibleWidth = 2 * distance * tan(fov/2) * screenAspect
  // visibleHeight = 2 * distance * tan(fov/2)
  
  // For fill-box: we want the bounding box to fill the entire screen
  // Calculate required distance for width and height separately
  const distanceForWidth = (size.x / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (size.y / 2) / tanHalfFov
  
  // Use the smaller distance to ensure the bounding box fills the screen
  // (smaller distance = closer camera = larger apparent size = fills screen)
  // This ensures that if a horizontal cloud is shown on a vertical screen,
  // it will scale up to fill from top to bottom
  const distance = Math.min(distanceForWidth, distanceForHeight)
  
  // Safety check: ensure distance is valid and reasonable
  if (!isFinite(distance) || distance <= 0 || distance > 1000) {
    targetCameraZ = 5
    return
  }
  
  // Add some padding and set target Z
  targetCameraZ = distance * 0.5
  
  // Don't call lookAt here - it resets rotation
  // Rotation is handled in the animate loop via camera.position
  camera.updateProjectionMatrix()
}

const handleResize = () => {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  updateCameraForParticles()
}

// Convert image to particles
const imageToParticles = async (imageUrl: string): Promise<THREE.InstancedMesh> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = async () => {
      // Ensure image is fully decoded
      if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
        reject(new Error('Image failed to load completely'))
        return
      }
      
      const canvas = document.createElement('canvas')
      const canvasSize = 1600
      
      // Set canvas size first (this resets the context)
      canvas.width = canvasSize
      canvas.height = canvasSize
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('Could not get canvas context'))
        return
      }

      // Clear and fill canvas with black background
      ctx.clearRect(0, 0, canvasSize, canvasSize)
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvasSize, canvasSize)

      // Use natural dimensions for accurate aspect ratio
      const imgWidth = img.naturalWidth
      const imgHeight = img.naturalHeight
      
      if (imgWidth === 0 || imgHeight === 0) {
        reject(new Error('Invalid image dimensions'))
        return
      }
      
      const imgAspect = imgWidth / imgHeight
      
      // Calculate scale to fit image completely within canvas (maintaining aspect ratio)
      let drawWidth: number
      let drawHeight: number
      let offsetX: number
      let offsetY: number

      if (imgAspect >= 1) {
        // Image is wider or square - fit to width
        drawWidth = canvasSize
        drawHeight = canvasSize / imgAspect
        offsetX = 0
        offsetY = Math.round((canvasSize - drawHeight) / 2)
      } else {
        // Image is taller - fit to height
        drawWidth = canvasSize * imgAspect
        drawHeight = canvasSize
        offsetX = Math.round((canvasSize - drawWidth) / 2)
        offsetY = 0
      }

      // Ensure all drawing coordinates are integers to avoid sub-pixel rendering issues
      const drawX = Math.round(offsetX)
      const drawY = Math.round(offsetY)
      const drawW = Math.round(drawWidth)
      const drawH = Math.round(drawHeight)

      // Set image smoothing for better quality
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      
      // Draw image centered - use simpler 5-parameter version for reliability
      // This draws the entire image, scaled to fit
      ctx.drawImage(
        img,
        drawX, 
        drawY, 
        drawW, 
        drawH
      )


      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imageData.data

      const positions: number[] = []
      const colors: number[] = []
      const velocities: number[] = []
      const originalPositions: number[] = []

      // Sample pixels to create particles
      const step = Math.max(1, Math.floor(1 / props.particleDensity))
      
     
      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          // Skip pixels outside the image bounds (black background area)
          // Use strict bounds checking to avoid edge cases
          
          
          const index = (y * canvas.width + x) * 4
          if (index + 3 >= pixels.length) continue
          
          const r = pixels[index]!
          const g = pixels[index + 1]!
          const b = pixels[index + 2]!
          const a = pixels[index + 3]!

          // Skip transparent pixels
          if (a < 10) continue

          // Skip black pixels (pixels that don't contain image data)
          // Check if the pixel is essentially black (all channels very low)
          // if (r < 10 && g < 10 && b < 10) continue

          // Normalize color values to 0-1 range
          const rNorm = r / 255
          const gNorm = g / 255
          const bNorm = b / 255

          // Normalize coordinates to -1 to 1 range (canvas is square, so no aspect adjustment needed)
          const normalizedX = (x / canvas.width) * 2 - 1
          const normalizedY = 1 - (y / canvas.height) * 2

          // Store position
          positions.push(normalizedX, normalizedY, 0)
          originalPositions.push(normalizedX, normalizedY, 0)

          // Store color
          colors.push(rNorm, gNorm, bNorm)

          // Initial velocity for implode effect (start far away)
          velocities.push(
            -normalizedX * 100, // Start far away
            -normalizedY * 10,
            (Math.random() - 0.5) * 2
          )
        }
      }

      const particleCount = positions.length / 3
      
      // Create a single circle geometry that will be instanced
      const planeGeometry = new THREE.CircleGeometry(0.006, 6) // Small circle with 8 segments
      
      // Create instance colors array
      const instanceColors = new Float32Array(particleCount * 3)
      const matrix = new THREE.Matrix4()
      
      for (let i = 0; i < particleCount; i++) {
        // Store color for this instance
        const r = colors[i * 3]!
        const g = colors[i * 3 + 1]!
        const b = colors[i * 3 + 2]!
        instanceColors[i * 3] = r
        instanceColors[i * 3 + 1] = g
        instanceColors[i * 3 + 2] = b
      }
      
      // Create standard material with instanced colors and shadow support
      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(0x000000), // Base emissive
        emissiveIntensity: 0.2 // Add some emissive glow
      })
      
      // Inject instanceColor support into the standard material shader
      material.onBeforeCompile = (shader) => {
        // Replace color attribute with instanceColor for instanced rendering
        shader.vertexShader = shader.vertexShader.replace(
          '#include <color_vertex>',
          `
            #ifdef USE_COLOR
              #ifdef USE_INSTANCING
                vColor = instanceColor;
              #else
                vColor = color;
              #endif
            #endif
          `
        )
        
        // Add instanceColor attribute
        shader.vertexShader = `
          attribute vec3 instanceColor;
          ${shader.vertexShader}
        `
      }
      
      // Create instanced mesh
      const instancedMesh = new THREE.InstancedMesh(planeGeometry, material, particleCount)
      
      // Enable shadow receiving on particles
      instancedMesh.receiveShadow = true
      instancedMesh.castShadow = false
      
      // Set instance colors attribute (Three.js will automatically use this with vertexColors: true)
      instancedMesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(instanceColors, 3))
      
      for (let i = 0; i < particleCount; i++) {
        const x = positions[i * 3]!
        const y = positions[i * 3 + 1]!
        const z = positions[i * 3 + 2]!
        
        // Set position
        matrix.makeTranslation(x, y, z)
        instancedMesh.setMatrixAt(i, matrix)
      }
      
      // Update instance matrices
      instancedMesh.instanceMatrix.needsUpdate = true
      
      // Generate random delays for each particle (0 to 2 seconds)
      const delays = new Float32Array(particleCount)
      for (let i = 0; i < particleCount; i++) {
        delays[i] = Math.random() * 2000 // Random delay 0-2000ms
      }
      
      // Store additional data as custom properties for animation
      ;(instancedMesh as any).userData = {
        positions: positions,
        originalPositions: originalPositions,
        velocities: velocities,
        colors: Array.from(instanceColors),
        delays: Array.from(delays),
        count: particleCount
      }
      
      resolve(instancedMesh)
    }

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${imageUrl}`))
    }

    // Use the image URL directly (should already be proxied if needed)
    img.src = imageUrl
  })
}

// Transition from current to next image
const transitionToNext = async () => {
  if (isTransitioning || props.images.length === 0) return

  isTransitioning = true
  const nextIndex = (currentImageIndex + 1) % props.images.length
  const nextImageUrl = props.images[nextIndex]
  
  if (!nextImageUrl) {
    isTransitioning = false
    return
  }

  try {
    // Create next particle system
    nextParticles = await imageToParticles(nextImageUrl)
    
    // Start next particles far away (for implode effect)
    const nextUserData = (nextParticles as any).userData
    if (!nextUserData) {
      isTransitioning = false
      return
    }
    
    const nextPositions = nextUserData.positions as number[]
    const matrix = new THREE.Matrix4()
    
    for (let i = 0; i < nextUserData.count; i++) {
      const x = nextPositions[i * 3] ?? 0
      const y = nextPositions[i * 3 + 1] ?? 0
      const distance = Math.sqrt(x * x + y * y)
      const scale = 10 + distance * 5
      const farX = x * scale
      const farY = y * scale
      const farZ = (Math.random() - 0.5) * 20
      
      // Update position in userData
      nextPositions[i * 3] = farX
      nextPositions[i * 3 + 1] = farY
      nextPositions[i * 3 + 2] = farZ
      
      // Update instance matrix
      matrix.makeTranslation(farX, farY, farZ)
      nextParticles.setMatrixAt(i, matrix)
    }
    nextParticles.instanceMatrix.needsUpdate = true

    // Add next particles to scene
    scene.add(nextParticles)

    const startTime = Date.now()
    const duration = props.transitionDuration

    const animateTransition = () => {
      const elapsed = Date.now() - startTime
      const baseProgress = Math.min(elapsed / duration, 1)
      const easeProgress = easeInOutCubic(baseProgress)

      if (currentParticles) {
        // Explode current particles
        const currentUserData = (currentParticles as any).userData
        if (!currentUserData) {
          isTransitioning = false
          return
        }
        
        const currentPositions = currentUserData.positions as number[]
        const currentOriginalPositions = currentUserData.originalPositions as number[]
        const matrix = new THREE.Matrix4()
        
        const delays = currentUserData.delays as number[] || []
        
        for (let i = 0; i < currentUserData.count; i++) {
          // Calculate per-particle progress with random delay
          const particleDelay = delays[i] ?? 0
          const particleElapsed = Math.max(0, elapsed - particleDelay)
          const particleProgress = Math.min(particleElapsed / duration, 1)
          const particleExplodeEase = easeOutExponential(particleProgress)
          
          // Calculate direction from center
          const x = currentOriginalPositions[i * 3] ?? 0
          const y = currentOriginalPositions[i * 3 + 1] ?? 0
          const angle = Math.atan2(y, x)
          
          // Explode outward with some randomness
          // Use particleExplodeEase which accounts for the random delay
          const force = explodeForce * (1 + Math.random() * 0.5)
          const vx = (Math.cos(angle) * force + (Math.random() - 0.5) * 0.5) * particleExplodeEase * 0.1
          const vy = (Math.sin(angle) * force + (Math.random() - 0.5) * 0.5) * particleExplodeEase * 0.1
          const vz = (Math.random() - 0.5) * explodeForce * particleExplodeEase * 0.1

          const currentX = currentPositions[i * 3] ?? 0
          const currentY = currentPositions[i * 3 + 1] ?? 0
          const currentZ = currentPositions[i * 3 + 2] ?? 0
          
          const newX = currentX + vx
          const newY = currentY + vy
          const newZ = currentZ + vz
          
          // Update position in userData
          currentPositions[i * 3] = newX
          currentPositions[i * 3 + 1] = newY
          currentPositions[i * 3 + 2] = newZ
          
          // Update instance matrix
          matrix.makeTranslation(newX, newY, newZ)
          currentParticles.setMatrixAt(i, matrix)
        }
        currentParticles.instanceMatrix.needsUpdate = true

        // Fade out
        const material = currentParticles.material as THREE.MeshPhongMaterial
        material.opacity = 0.9 * (1 - easeProgress)
      }

      if (nextParticles) {
        // Implode next particles
        const nextUserData = (nextParticles as any).userData
        if (!nextUserData) {
          isTransitioning = false
          return
        }
        
        const nextPositions = nextUserData.positions as number[]
        const nextOriginalPositions = nextUserData.originalPositions as number[]
        const nextDelays = nextUserData.delays as number[] || []
        const matrix = new THREE.Matrix4()

        for (let i = 0; i < nextUserData.count; i++) {
          // Calculate per-particle progress with random delay
          const particleDelay = nextDelays[i] ?? 0
          const particleElapsed = Math.max(0, elapsed - particleDelay)
          const particleProgress = Math.min(particleElapsed / duration, 1)
          const particleEaseProgress = easeInOutCubic(particleProgress)
          
          const targetX = nextOriginalPositions[i * 3] ?? 0
          const targetY = nextOriginalPositions[i * 3 + 1] ?? 0
          const targetZ = nextOriginalPositions[i * 3 + 2] ?? 0
          
          const currentX = nextPositions[i * 3] ?? 0
          const currentY = nextPositions[i * 3 + 1] ?? 0
          const currentZ = nextPositions[i * 3 + 2] ?? 0

          const newX = currentX + (targetX - currentX) * implodeSpeed * (1 + particleEaseProgress * 10)
          const newY = currentY + (targetY - currentY) * implodeSpeed * (1 + particleEaseProgress * 10)
          const newZ = currentZ + (targetZ - currentZ) * implodeSpeed * (1 + particleEaseProgress * 10)
          
          // Update position in userData
          nextPositions[i * 3] = newX
          nextPositions[i * 3 + 1] = newY
          nextPositions[i * 3 + 2] = newZ
          
          // Update instance matrix
          matrix.makeTranslation(newX, newY, newZ)
          nextParticles.setMatrixAt(i, matrix)
        }
        nextParticles.instanceMatrix.needsUpdate = true

        // Fade in
        const material = nextParticles.material as THREE.MeshPhongMaterial
        material.opacity = 0.9 * easeProgress
      }

      if (baseProgress < 1) {
        animationFrameId = requestAnimationFrame(animateTransition)
      } else {
        // Transition complete
        if (currentParticles) {
          scene.remove(currentParticles)
          currentParticles.geometry.dispose()
          const material = currentParticles.material as THREE.MeshPhongMaterial
          material.dispose()
        }
        currentParticles = nextParticles
        nextParticles = null
        currentImageIndex = nextIndex
        isTransitioning = false
        
        // Update camera to fill screen with new particles
        updateCameraForParticles()

        // Start auto-advance timer if enabled
        if (props.autoAdvance) {
          startAutoAdvance()
        }
      }
    }

    animateTransition()
  } catch (error) {
    console.error('Error during transition:', error)
    isTransitioning = false
  }
}

// Easing functions
const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Ease-out exponential: starts very smooth, then speeds up dramatically (for explosion)
const easeOutExponential = (t: number): number => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

// Load initial image
const loadInitialImage = async () => {
  if (props.images.length === 0) return

  const imageUrl = props.images[currentImageIndex]
  if (!imageUrl) return

  try {
    currentParticles = await imageToParticles(imageUrl)
    
    // Start particles far away (for initial implode effect)
    const currentUserData = (currentParticles as any).userData
    if (currentUserData) {
      const positions = currentUserData.positions as number[]
      const originalPositions = currentUserData.originalPositions as number[]
      const matrix = new THREE.Matrix4()
      
      for (let i = 0; i < currentUserData.count; i++) {
        const x = originalPositions[i * 3] ?? 0
        const y = originalPositions[i * 3 + 1] ?? 0
        const distance = Math.sqrt(x * x + y * y)
        const scale = 10 + distance * 5
        const farX = x * scale
        const farY = y * scale
        const farZ = (Math.random() - 0.5) * 20
        
        // Update position in userData
        positions[i * 3] = farX
        positions[i * 3 + 1] = farY
        positions[i * 3 + 2] = farZ
        
        // Update instance matrix
        matrix.makeTranslation(farX, farY, farZ)
        currentParticles.setMatrixAt(i, matrix)
      }
      currentParticles.instanceMatrix.needsUpdate = true
    }
    
    scene.add(currentParticles)
    
    // Update camera to fill screen with particles
    updateCameraForParticles()

    // Animate particles in from far away
    const startTime = Date.now()
    const duration = props.transitionDuration

    const animateInitial = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeProgress = easeInOutCubic(progress)

      if (currentParticles) {
        const currentUserData = (currentParticles as any).userData
        if (!currentUserData) {
          return
        }
        
        const positions = currentUserData.positions as number[]
        const originalPositions = currentUserData.originalPositions as number[]
        const delays = currentUserData.delays as number[] || []
        const matrix = new THREE.Matrix4()

        for (let i = 0; i < currentUserData.count; i++) {
          // Calculate per-particle progress with random delay
          const particleDelay = delays[i] ?? 0
          const particleElapsed = Math.max(0, elapsed - particleDelay)
          const particleProgress = Math.min(particleElapsed / duration, 1)
          const particleEaseProgress = easeInOutCubic(particleProgress)
          
          const targetX = originalPositions[i * 3] ?? 0
          const targetY = originalPositions[i * 3 + 1] ?? 0
          const targetZ = originalPositions[i * 3 + 2] ?? 0
          
          const currentX = positions[i * 3] ?? 0
          const currentY = positions[i * 3 + 1] ?? 0
          const currentZ = positions[i * 3 + 2] ?? 0

          const newX = currentX + (targetX - currentX) * implodeSpeed * (1 + particleEaseProgress * 10)
          const newY = currentY + (targetY - currentY) * implodeSpeed * (1 + particleEaseProgress * 10)
          const newZ = currentZ + (targetZ - currentZ) * implodeSpeed * (1 + particleEaseProgress * 10)
          
          // Update position in userData
          positions[i * 3] = newX
          positions[i * 3 + 1] = newY
          positions[i * 3 + 2] = newZ
          
          // Update instance matrix
          matrix.makeTranslation(newX, newY, newZ)
          currentParticles.setMatrixAt(i, matrix)
        }
        currentParticles.instanceMatrix.needsUpdate = true

        const material = currentParticles.material as THREE.MeshPhongMaterial
        material.opacity = 0.9 * easeProgress
      }

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animateInitial)
      } else {
        // Start auto-advance timer if enabled
        if (props.autoAdvance) {
          startAutoAdvance()
        }
      }
    }

    animateInitial()
  } catch (error) {
    console.error('Error loading initial image:', error)
  }
}

// Animate menu items hiding/showing
const animateMenuTransition = (
  meshes: THREE.Mesh[],
  targetOpacity: number,
  targetScale: number,
  duration: number = 500
) => {
  const startTime = Date.now()
  const startOpacities = meshes.map(m => {
    const mat = m.material as THREE.MeshStandardMaterial
    return mat.opacity
  })
  const startScales = meshes.map(m => m.scale.x)
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easeProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2 // Ease in-out
    
    meshes.forEach((mesh, i) => {
      const material = mesh.material as THREE.MeshStandardMaterial
      material.opacity = startOpacities[i]! + (targetOpacity - startOpacities[i]!) * easeProgress
      const scale = startScales[i]! + (targetScale - startScales[i]!) * easeProgress
      mesh.scale.set(scale, scale, scale)
    })
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// Show email and hide menu
const showEmail = () => {
  showingEmail = true
  const menuItems = [workTextMesh, cvTextMesh, contactTextMesh].filter(Boolean) as THREE.Mesh[]
  
  // Hide menu items
  if (menuItems.length > 0) {
    animateMenuTransition(menuItems, 0, 0, 300)
  }
  
  // Show email
  if (emailTextMesh) {
    animateMenuTransition([emailTextMesh], 0.8, 1, 300)
  }
}

// Show menu and hide email
const showMenu = () => {
  showingEmail = false
  
  // Hide email
  if (emailTextMesh) {
    animateMenuTransition([emailTextMesh], 0, 0, 300)
  }
  
  // Show menu items
  const menuItems = [workTextMesh, cvTextMesh, contactTextMesh].filter(Boolean) as THREE.Mesh[]
  if (menuItems.length > 0) {
    animateMenuTransition(menuItems, 0.8, 1, 300)
  }
}

// Show CV words
const showCVWords = () => {
  showingCV = true
  
  // Hide all existing text
  const allText = [textMesh, workTextMesh, cvTextMesh, contactTextMesh, emailTextMesh].filter(Boolean) as THREE.Mesh[]
  if (allText.length > 0) {
    animateMenuTransition(allText, 0, 0, 300)
  }
  
  // Create CV words if not already created
  if (cvTextMeshes.length === 0) {
    createCVWords()
  }
  
  // Show CV words with animation (with a small delay to ensure they're created)
  setTimeout(() => {
    if (cvTextMeshes.length > 0) {
      animateMenuTransition(cvTextMeshes, 0.8, 1, 300)
    }
  }, 100)
}

// Hide CV words and show menu
const hideCVWords = () => {
  showingCV = false
  
  // Hide CV words
  if (cvTextMeshes.length > 0) {
    animateMenuTransition(cvTextMeshes, 0, 0, 300)
  }
  
  // Show main text and menu
  const mainText = [textMesh].filter(Boolean) as THREE.Mesh[]
  const menuItems = [workTextMesh, cvTextMesh, contactTextMesh].filter(Boolean) as THREE.Mesh[]
  
  if (mainText.length > 0) {
    animateMenuTransition(mainText, 0.8, 1, 300)
  }
  if (menuItems.length > 0) {
    animateMenuTransition(menuItems, 0.8, 1, 300)
  }
}

// Create CV words
const createCVWords = () => {
  if (!textMesh) return // Need font to be loaded first
  
  const words = [
    '40 YEARS OF EXPERIENCE IN', 'VUE', 'ANGULAR', 'REACT', 
    'THREEJS', 'CINEMA4D', 'AFTERFX', 'PHOTOSHOP', 'C++', 'TYPESCRIPT', 'JAVASCRIPT', 
    'NODEJS', 'C#', 'VIDEO', '3D', 'SOUND', 'MUSIC', 'ESP32', 'ARDUINO', 'RASPBERRY PI', 'ANALOGUE ELECTRONICS', 
    'DIGITAL ELECTRONICS', 'AI'
  ]
  
  const colors = [
    0x00ffff, // Cyan
    0xff00ff, // Magenta
    0xffff00  // Yellow
  ]
  
  const wordSize = 0.04
  const spacing = 0.06
  const wordsPerRow = 4
  const totalRows = Math.ceil(words.length / wordsPerRow)
  const totalHeight = (totalRows - 1) * spacing + wordSize
  const startY = totalHeight / 2 // Center vertically
  
  let currentX = -0.6
  let currentY = startY
  let colorIndex = 0
  
  // Get font from existing text mesh
  const loader = new FontLoader()
  loader.load(
    '/fonts/font_sans.json',
    (font) => {
      words.forEach((word, index) => {
        const wordGeometry = new TextGeometry(word, {
          font: font,
          size: wordSize,
          depth: 0,
          curveSegments: 12,
          bevelEnabled: false
        })
        wordGeometry.computeBoundingBox()
        
        const color = colors[colorIndex]!
        const wordMaterial = new THREE.MeshStandardMaterial({
          color: color,
          transparent: true,
          opacity: 0, // Start hidden
          metalness: 0.1,
          roughness: 0.3,
          emissive: new THREE.Color(color),
          emissiveIntensity: 0.5
        })
        
        const wordMesh = new THREE.Mesh(wordGeometry, wordMaterial)
        wordMesh.castShadow = true
        
        // Position in grid
        if (wordGeometry.boundingBox) {
          const wordWidth = wordGeometry.boundingBox.max.x - wordGeometry.boundingBox.min.x
          wordMesh.position.set(currentX - wordGeometry.boundingBox.min.x, currentY, 0.1)
          currentX += wordWidth + spacing
        } else {
          wordMesh.position.set(currentX, currentY, 0.1)
          currentX += 0.3 + spacing
        }
        
        // Move to next row if needed
        if ((index + 1) % wordsPerRow === 0) {
          currentX = -0.6
          currentY -= spacing
        }
        
        wordMesh.scale.set(0, 0, 0) // Start scaled down
        scene.add(wordMesh)
        cvTextMeshes.push(wordMesh)
        
        // Alternate color
        colorIndex = (colorIndex + 1) % colors.length
      })
    },
    undefined,
    (error) => {
      console.warn('Failed to load font for CV words:', error)
    }
  )
}

// Animation loop
const animate = () => {
  if (!renderer || !scene || !camera) return

  // Shadow maps are automatically handled by Three.js with standard materials

  // Smooth interpolation for camera zoom
  const zoomLerpFactor = 0.01 // Smooth interpolation speed for zoom
  currentCameraZ += (targetCameraZ - currentCameraZ) * zoomLerpFactor

  // Smooth interpolation for mouse-based rotation
  const lerpFactor = 0.05 // Smooth interpolation speed
  currentRotationX += (targetRotationX - currentRotationX) * lerpFactor
  currentRotationY += (targetRotationY - currentRotationY) * lerpFactor

  // Check for hover on text meshes and update glow
  if (raycaster && camera) {
    raycaster.setFromCamera(mouse, camera)
    // Include CV words in hover detection
    const textMeshes = [
      textMesh, 
      workTextMesh, 
      cvTextMesh, 
      contactTextMesh, 
      emailTextMesh,
      ...cvTextMeshes
    ].filter(Boolean) as THREE.Mesh[]
    const intersects = raycaster.intersectObjects(textMeshes)
    
    // Reset all text emissive intensities (only for visible items)
    if (textMesh && !showingCV) {
      const material = textMesh.material as THREE.MeshStandardMaterial
      material.emissiveIntensity = 0.5
    }
    if (!showingEmail && !showingCV) {
      // Only reset menu items if menu is showing
      if (workTextMesh) {
        const material = workTextMesh.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = 0.5
      }
      if (cvTextMesh) {
        const material = cvTextMesh.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = 0.5
      }
      if (contactTextMesh) {
        const material = contactTextMesh.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = 0.5
      }
    }
    if (showingEmail && emailTextMesh) {
      // Only reset email if email is showing
      const material = emailTextMesh.material as THREE.MeshStandardMaterial
      material.emissiveIntensity = 0.5
    }
    if (showingCV) {
      // Reset CV words
      cvTextMeshes.forEach(mesh => {
        const material = mesh.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = 0.5
      })
    }
    
    // Update cursor and glow for hovered text (only if visible)
    if (intersects.length > 0) {
      const hoveredMesh = intersects[0]!.object as THREE.Mesh
      const material = hoveredMesh.material as THREE.MeshStandardMaterial
      
      // Only glow if the mesh is visible (opacity > 0 and scale > 0)
      if (material.opacity > 0.1 && hoveredMesh.scale.x > 0.1) {
        material.emissiveIntensity = 2.0 // Much brighter on hover
        
        // Change cursor to pointer
        if (containerRef.value) {
          containerRef.value.style.cursor = 'pointer'
        }
      }
    } else {
      // Reset cursor to default
      if (containerRef.value) {
        containerRef.value.style.cursor = 'default'
      }
    }
  }

  // Apply rotation to camera (but maintain zoom level)
  // Always apply rotation, regardless of transition state
  const autoRotateX = Math.sin(Date.now() * 0.0001) * 2
  const autoRotateY = Math.cos(Date.now() * 0.0001) * 2
  
  // Apply mouse rotation to camera position (always maintain rotation)
  // The rotation values are preserved in currentRotationX/Y and smoothly interpolated
  camera.position.x = autoRotateX + currentRotationY * 2
  camera.position.y = autoRotateY + currentRotationX * 2
  camera.position.z = currentCameraZ // Use smoothly interpolated zoom
  
  // LookAt recalculates rotation based on position, so rotation is maintained
  // as long as currentRotationX/Y values don't get reset
  camera.lookAt(0, 0, 0)

  renderer.render(scene, camera)
  animationFrameId = requestAnimationFrame(animate)
}

// Auto-advance functionality
const startAutoAdvance = () => {
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer)
  }
  autoAdvanceTimer = window.setTimeout(() => {
    transitionToNext()
  }, props.autoAdvanceInterval)
}

// Watch for image array changes
watch(() => props.images, () => {
  if (props.images.length > 0 && !isTransitioning) {
    currentImageIndex = 0
    if (currentParticles) {
      scene.remove(currentParticles)
      currentParticles.geometry.dispose()
      const material = currentParticles.material as THREE.MeshBasicMaterial
      material.dispose()
      currentParticles = null
    }
    loadInitialImage()
  }
}, { deep: true })

onMounted(() => {
  initScene()
  animate()
  loadInitialImage()
})

onUnmounted(() => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
  if (autoAdvanceTimer) {
    clearTimeout(autoAdvanceTimer)
  }
  window.removeEventListener('resize', handleResize)
  
  // Remove mouse event listeners
  const mouseHandler = (window as any).__particleViewerMouseHandler
  if (mouseHandler) {
    window.removeEventListener('mousemove', mouseHandler)
    delete (window as any).__particleViewerMouseHandler
  }
  
  const clickHandler = (window as any).__particleViewerClickHandler
  if (clickHandler) {
    window.removeEventListener('click', clickHandler)
    delete (window as any).__particleViewerClickHandler
  }
  
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver.disconnect()
    resizeObserver = null
  }
  
  if (gridHelper) {
    scene.remove(gridHelper)
    gridHelper.dispose()
    gridHelper = null
  }
  if (renderer) {
    renderer.dispose()
  }
  if (currentParticles) {
    currentParticles.geometry.dispose()
    const material = currentParticles.material as THREE.MeshBasicMaterial
    material.dispose()
  }
  if (nextParticles) {
    nextParticles.geometry.dispose()
          const material = nextParticles.material as THREE.MeshPhongMaterial
          material.dispose()
  }
  
  // Clean up text meshes
  if (textMesh) {
    scene.remove(textMesh)
    textMesh.geometry.dispose()
    const material = textMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    textMesh = null
  }
  if (workTextMesh) {
    scene.remove(workTextMesh)
    workTextMesh.geometry.dispose()
    const material = workTextMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    workTextMesh = null
  }
  if (cvTextMesh) {
    scene.remove(cvTextMesh)
    cvTextMesh.geometry.dispose()
    const material = cvTextMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    cvTextMesh = null
  }
  if (contactTextMesh) {
    scene.remove(contactTextMesh)
    contactTextMesh.geometry.dispose()
    const material = contactTextMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    contactTextMesh = null
  }
  if (emailTextMesh) {
    scene.remove(emailTextMesh)
    emailTextMesh.geometry.dispose()
    const material = emailTextMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    emailTextMesh = null
  }
  // Clean up CV words
  cvTextMeshes.forEach(mesh => {
    scene.remove(mesh)
    mesh.geometry.dispose()
    const material = mesh.material as THREE.MeshStandardMaterial
    material.dispose()
  })
  cvTextMeshes = []
})

// Expose method to manually advance
defineExpose({
  next: transitionToNext
})
</script>

<style scoped>
.particle-viewer {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.particle-viewer :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
