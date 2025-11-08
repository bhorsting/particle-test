<template>
  <div ref="containerRef" class="particle-viewer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as THREE from 'three'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { setupLighting, animateLighting } from './particleViewer/lighting'

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
let showingWork = false // Track if work gallery is showing
let workImagePlanes: THREE.Mesh[] = [] // Array to store work image planes
let selectedWorkImage: THREE.Mesh | null = null // Currently selected/enlarged image
let raycaster: THREE.Raycaster | null = null
let yellowRect: THREE.Mesh | null = null
let pinkRect: THREE.Mesh | null = null
let cyanRect: THREE.Mesh | null = null
let loadingTextMesh: THREE.Mesh | null = null
let yellowSpotlight: THREE.SpotLight | null = null
let magentaSpotlight: THREE.SpotLight | null = null
let cyanSpotlight: THREE.SpotLight | null = null
const defaultSpotlightAngle = Math.PI / 40 // Original narrow angle
let targetSpotlightAngle = defaultSpotlightAngle // Target angle for smooth interpolation
let currentSpotlightAngle = defaultSpotlightAngle // Current angle
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
  
  // Yellow rectangle - use MeshStandardMaterial so it responds to lighting
  const yellowGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const yellowMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffff00,
    transparent: true,
    opacity: 0.75,
    metalness: 0.1,
    roughness: 0.3
  })
  yellowRect = new THREE.Mesh(yellowGeometry, yellowMaterial)
  yellowRect.rotation.z = rotationAngle
  yellowRect.position.set(-2, 1, -18) // Different z position to avoid z-fighting
  scene.add(yellowRect)
  
  // Pink rectangle - use MeshStandardMaterial so it responds to lighting
  const pinkGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const pinkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff00ff,
    transparent: true,
    opacity: 0.75,
    metalness: 0.1,
    roughness: 0.3
  })
  pinkRect = new THREE.Mesh(pinkGeometry, pinkMaterial)
  pinkRect.rotation.z = rotationAngle
  pinkRect.position.set(0, 0, -20) // Middle z position
  scene.add(pinkRect)
  
  // Cyan rectangle - use MeshStandardMaterial so it responds to lighting
  const cyanGeometry = new THREE.PlaneGeometry(rectSize, rectSize)
  const cyanMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ffff,
    transparent: true,
    opacity: 0.75,
    metalness: 0.1,
    roughness: 0.3
  })
  cyanRect = new THREE.Mesh(cyanGeometry, cyanMaterial)
  cyanRect.rotation.z = rotationAngle
  cyanRect.position.set(2, -1, -22) // Furthest back
  scene.add(cyanRect)
  
  // Create three colored spotlights using the lighting module
  // Create a minimal state object for the lighting module
  const lightingState = {
    scene,
    yellowSpotlight: null as THREE.SpotLight | null,
    magentaSpotlight: null as THREE.SpotLight | null,
    cyanSpotlight: null as THREE.SpotLight | null,
    containerRef
  }
  
  // Setup lighting using the module
  setupLighting(lightingState)
  
  // Get the lights from the state
  yellowSpotlight = lightingState.yellowSpotlight
  magentaSpotlight = lightingState.magentaSpotlight
  cyanSpotlight = lightingState.cyanSpotlight

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
  // Enable HDR tone mapping for better color range and lighting
  renderer.toneMapping = THREE.ACESFilmicToneMapping // High-quality HDR tone mapping
  renderer.toneMappingExposure = 1.0 // Adjust this to control overall brightness (0.5-2.0 range works well)
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
      
      // BAS HORSTING zooms out
      if (clickedMesh === textMesh) {
        // If email or CV is showing, show menu first
        if (showingEmail) {
          showMenu()
        }
        if (showingCV) {
          hideCVWords()
        }
        if (showingWork) {
          hideWorkGallery()
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
      
      // WORK shows gallery
      if (clickedMesh === workTextMesh) {
        // If email or CV is showing, show menu first
        if (showingEmail) {
          showMenu()
        }
        if (showingCV) {
          hideCVWords()
        }
        
        if (showingWork) {
          // If already showing work, hide it
          hideWorkGallery()
        } else {
          // Show work gallery
          showWorkGallery()
        }
      }
      
      // Check if clicked on a work image
      if (showingWork && workImagePlanes.length > 0) {
        const workIntersects = raycaster.intersectObjects(workImagePlanes)
        if (workIntersects.length > 0) {
          const clickedImage = workIntersects[0]!.object as THREE.Mesh
          if (selectedWorkImage === clickedImage) {
            // If clicking the same image, go back to grid
            showWorkGrid()
          } else {
            // Enlarge and center the clicked image
            showWorkImage(clickedImage)
          }
          return // Don't process other clicks
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
      if (clickedMesh === cvTextMesh && !showingCV && !showingEmail && !showingWork) {
        showCVWords()
      } else if (showingCV && clickedMesh && cvTextMeshes.includes(clickedMesh)) {
        // Clicking any CV word hides CV and shows menu
        hideCVWords()
      }
    } else {
      // Clicked outside of any text/image - check if we need to go back
      if (showingWork && selectedWorkImage) {
        // If an image is selected, go back to grid
        showWorkGrid()
      } else if (showingWork) {
        // If showing grid, go back to menu
        hideWorkGallery()
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
        roughness: 0.3
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
        roughness: 0.3
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
        roughness: 0.3
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
        roughness: 0.3
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
        roughness: 0.3
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
        side: THREE.DoubleSide
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
      
      // Enable shadow receiving on particles (but not casting)
      instancedMesh.receiveShadow = true
      instancedMesh.castShadow = false // Particles don't cast shadows, only text does
      
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

// Show loading text
const showLoadingText = () => {
  if (loadingTextMesh) {
    loadingTextMesh.visible = true
    const material = loadingTextMesh.material as THREE.MeshStandardMaterial
    animateOpacity(material, 1.0, 200)
    return
  }
  
  // Create loading text if it doesn't exist
  const loader = new FontLoader()
  loader.load(
    '/fonts/font_sans.json',
    (font) => {
      const loadingGeometry = new TextGeometry('LOADING...', {
        font: font,
        size: 0.12,
        depth: 0,
        curveSegments: 12,
        bevelEnabled: false
      })
      
      loadingGeometry.computeBoundingBox()
      if (loadingGeometry.boundingBox) {
        const centerOffsetX = -0.5 * (loadingGeometry.boundingBox.max.x + loadingGeometry.boundingBox.min.x)
        const centerOffsetY = -0.5 * (loadingGeometry.boundingBox.max.y + loadingGeometry.boundingBox.min.y)
        loadingGeometry.translate(centerOffsetX, centerOffsetY, 0)
      }
      
      const loadingMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        metalness: 0.1,
        roughness: 0.3
      })
      
      loadingTextMesh = new THREE.Mesh(loadingGeometry, loadingMaterial)
      loadingTextMesh.castShadow = true
      loadingTextMesh.position.z = 0.1
      loadingTextMesh.visible = true
      scene.add(loadingTextMesh)
      
      // Animate in
      animateOpacity(loadingMaterial, 1.0, 200)
    },
    undefined,
    (error) => {
      console.warn('Failed to load font for loading text:', error)
    }
  )
}

// Hide loading text
const hideLoadingText = () => {
  if (loadingTextMesh) {
    const material = loadingTextMesh.material as THREE.MeshStandardMaterial
    animateOpacity(material, 0, 200)
    setTimeout(() => {
      if (loadingTextMesh) {
        loadingTextMesh.visible = false
      }
    }, 200)
  }
}

// Show work gallery - create image planes in a grid
const showWorkGallery = async () => {
  showingWork = true
  selectedWorkImage = null
  
  // Hide all text
  const allText = [textMesh, workTextMesh, cvTextMesh, contactTextMesh, emailTextMesh].filter(Boolean) as THREE.Mesh[]
  if (allText.length > 0) {
    animateMenuTransition(allText, 0, 0, 300)
  }
  
  // Remove background rectangles completely from scene and dispose of them
  if (yellowRect) {
    yellowRect.visible = false // Hide immediately
    scene.remove(yellowRect)
    yellowRect.geometry.dispose()
    const yellowMat = yellowRect.material as THREE.MeshStandardMaterial
    yellowMat.dispose()
    yellowRect = null
  }
  if (pinkRect) {
    pinkRect.visible = false // Hide immediately
    scene.remove(pinkRect)
    pinkRect.geometry.dispose()
    const pinkMat = pinkRect.material as THREE.MeshStandardMaterial
    pinkMat.dispose()
    pinkRect = null
  }
  if (cyanRect) {
    cyanRect.visible = false // Hide immediately
    scene.remove(cyanRect)
    cyanRect.geometry.dispose()
    const cyanMat = cyanRect.material as THREE.MeshStandardMaterial
    cyanMat.dispose()
    cyanRect = null
  }
  
  // Force immediate render to clear GPU cache
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
  
  // Show loading text
  showLoadingText()
  
  // Create image planes if not already created
  if (workImagePlanes.length === 0) {
    await createWorkImagePlanes()
  }
  
  // Hide loading text after images are loaded
  hideLoadingText()
  
  // Show image planes in grid layout
  showWorkGrid()
  
  // Position camera to view the grid
  updateCameraForWorkGrid()
  
  // Animate spotlights to be 50% wider than twice as wide (3x default) for work mode
  targetSpotlightAngle = defaultSpotlightAngle * 3
}

// Create image planes from props.images
const createWorkImagePlanes = async () => {
  if (props.images.length === 0) return
  
  const loader = new THREE.TextureLoader()
  
  for (let i = 0; i < props.images.length; i++) {
    let imageUrl: string | undefined = props.images[i]
    if (!imageUrl) continue
    
    try {
      // Extract original URL if it's proxied
      let originalUrl = imageUrl
      if (imageUrl.includes('/api/image-proxy')) {
        // Extract the original URL from the proxied URL
        const urlMatch = imageUrl.match(/[?&]url=([^&]+)/)
        if (urlMatch) {
          originalUrl = decodeURIComponent(urlMatch[1] || '')
        } else {
          // If we can't extract, use as-is
          originalUrl = imageUrl
        }
      }
      
      // Request higher resolution images for work gallery
      // Remove existing size parameters and request higher resolution
      let highResUrl = originalUrl
      if (originalUrl.includes('googleusercontent.com') || originalUrl.includes('ggpht.com')) {
        // Remove any existing size parameters
        const baseUrl = originalUrl.split('=')[0]
        if (baseUrl) {
          // Request 1280px resolution
          highResUrl = baseUrl + '=w1280-h1280'
        } else {
          // Fallback if split fails
          highResUrl = originalUrl + '=w1280-h1280'
        }
      }
      
      // Proxy the high-res URL if needed
      let finalImageUrl: string = highResUrl
      if (highResUrl.includes('googleusercontent.com') || highResUrl.includes('ggpht.com')) {
        // Need to proxy through our server
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
        finalImageUrl = `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(highResUrl)}`
      }
      
      if (!finalImageUrl) continue
      
      const texture = await new Promise<THREE.Texture>((resolve, reject) => {
        loader.load(
          finalImageUrl,
          (texture) => {
            // Configure texture for high quality
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = true
            texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1
            resolve(texture)
          },
          undefined,
          reject
        )
      })
      
      // Calculate aspect ratio
      const img = texture.image as HTMLImageElement
      const aspect = img.width / img.height
      const baseSize = 0.4 // Increased base size for better visibility
      const width = aspect >= 1 ? baseSize : baseSize * aspect
      const height = aspect >= 1 ? baseSize / aspect : baseSize
      
      // Create plane geometry
      const geometry = new THREE.PlaneGeometry(width, height)
      const material = new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      })
      
      const plane = new THREE.Mesh(geometry, material)
      plane.position.z = 0.2 // Above particles
      plane.castShadow = true // Work images cast shadows
      plane.receiveShadow = true // Work images can also receive shadows
      plane.userData = { 
        originalPosition: plane.position.clone(), 
        originalScale: plane.scale.clone(),
        originalImageUrl: originalUrl // Store original unproxied URL for high-res loading
      }
      
      // Create white border plane behind the image
      const borderWidth = 0.01 // Border thickness
      const borderGeometry = new THREE.PlaneGeometry(width + borderWidth * 2, height + borderWidth * 2)
      const borderMaterial = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
      })
      const borderPlane = new THREE.Mesh(borderGeometry, borderMaterial)
      borderPlane.position.copy(plane.position)
      borderPlane.position.z = plane.position.z - 0.001 // Slightly behind the image
      borderPlane.castShadow = true // Border also casts shadows
      borderPlane.receiveShadow = true
      
      // Store border reference in plane userData
      plane.userData.borderPlane = borderPlane
      
      scene.add(borderPlane)
      scene.add(plane)
      workImagePlanes.push(plane)
    } catch (error) {
      console.error(`Failed to load image ${i}:`, error)
    }
  }
}

// Show work images in grid layout
const showWorkGrid = () => {
  selectedWorkImage = null
  
  if (workImagePlanes.length === 0) return
  
  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(workImagePlanes.length))
  const rows = Math.ceil(workImagePlanes.length / cols)
  const spacing = 0.5 // Space between images
  const margin = 0.25 // Margin around the grid
  
  // Calculate total grid size
  const totalWidth = cols * spacing - spacing + margin * 2
  const totalHeight = rows * spacing - spacing + margin * 2
  
  // Calculate starting position (top-left)
  const startX = -totalWidth / 2 + margin
  const startY = totalHeight / 2 - margin
  
  // Make all images and borders visible first
  workImagePlanes.forEach(plane => {
    const material = plane.material as THREE.MeshStandardMaterial
    animateOpacity(material, 1.0, 200)
    
    // Show border
    const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
    if (borderPlane) {
      const borderMaterial = borderPlane.material as THREE.MeshStandardMaterial
      animateOpacity(borderMaterial, 1.0, 200)
    }
  })
  
  // Position images in grid
  workImagePlanes.forEach((plane, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    
    const targetX = startX + col * spacing
    const targetY = startY - row * spacing
    const targetZ = 0.2
    
    // Get original size from texture
    const material = plane.material as THREE.MeshBasicMaterial
    const texture = material.map
    if (texture) {
      const img = texture.image as HTMLImageElement
      const aspect = img.width / img.height
      const baseSize = 0.4 // Increased for better visibility
      const width = aspect >= 1 ? baseSize : baseSize * aspect
      const height = aspect >= 1 ? baseSize / aspect : baseSize
      
      // Animate to grid position with original size
      animateImageToPosition(plane, targetX, targetY, targetZ, width, height, 1, 1.0, 500)
      
      // Animate border to match
      const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
      if (borderPlane) {
        const borderWidth = 0.01
        animateImageToPosition(borderPlane, targetX, targetY, targetZ - 0.001, width + borderWidth * 2, height + borderWidth * 2, 1, 1.0, 500)
      }
    } else {
      // Fallback if no texture
      animateImageToPosition(plane, targetX, targetY, targetZ, 0.3, 0.3, 1, 1.0, 500)
      
      // Animate border to match
      const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
      if (borderPlane) {
        const borderWidth = 0.01
        animateImageToPosition(borderPlane, targetX, targetY, targetZ - 0.001, 0.3 + borderWidth * 2, 0.3 + borderWidth * 2, 1, 1.0, 500)
      }
    }
  })
  
  // Update camera for grid view
  updateCameraForWorkGrid()
}

// Show a single enlarged image
const showWorkImage = async (imageMesh: THREE.Mesh) => {
  selectedWorkImage = imageMesh
  
  // Load higher resolution version if available
  const originalUrl = imageMesh.userData.originalImageUrl
  if (originalUrl && (originalUrl.includes('googleusercontent.com') || originalUrl.includes('ggpht.com'))) {
    // Request even higher resolution for enlarged view
    const baseUrl = originalUrl.split('=')[0]
    if (baseUrl) {
      const highResUrl = baseUrl + '=w1280-h1280' // Request 1280px resolution
      
      // Proxy the high-res URL
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')
      const proxiedHighResUrl = `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(highResUrl)}`
    
      try {
        const loader = new THREE.TextureLoader()
        const newTexture = await new Promise<THREE.Texture>((resolve, reject) => {
          loader.load(
            proxiedHighResUrl,
          (texture) => {
            texture.minFilter = THREE.LinearFilter
            texture.magFilter = THREE.LinearFilter
            texture.generateMipmaps = true
            texture.anisotropy = renderer ? renderer.capabilities.getMaxAnisotropy() : 1
            resolve(texture)
          },
          undefined,
          reject
        )
      })
      
      // Replace texture
      const material = imageMesh.material as THREE.MeshBasicMaterial
      if (material.map) {
        material.map.dispose()
      }
      material.map = newTexture
      material.needsUpdate = true
    } catch (error) {
      console.warn('Failed to load high-res image, using existing:', error)
    }
    } else {
      // If baseUrl is undefined, skip high-res loading
    }
  }
  
  // Calculate size to fit screen with margin
  const margin = 0.1 // 10% margin
  const maxWidth = 1.8 * (1 - margin * 2) // Increased max size
  const maxHeight = 1.8 * (1 - margin * 2)
  
  // Get original aspect ratio from texture
  const material = imageMesh.material as THREE.MeshBasicMaterial
  const texture = material.map
  if (!texture) return
  
  const img = texture.image as HTMLImageElement
  const aspect = img.width / img.height
  let width = maxWidth
  let height = maxHeight
  
  if (aspect >= 1) {
    height = width / aspect
    if (height > maxHeight) {
      height = maxHeight
      width = height * aspect
    }
  } else {
    width = height * aspect
    if (width > maxWidth) {
      width = maxWidth
      height = width / aspect
    }
  }
  
  // Center and enlarge the selected image
  animateImageToPosition(imageMesh, 0, 0, 0.3, width, height, 1, 1.0, 500)
  
  // Animate border to match
  const borderPlane = imageMesh.userData.borderPlane as THREE.Mesh | undefined
  if (borderPlane) {
    const borderWidth = 0.01
    animateImageToPosition(borderPlane, 0, 0, 0.3 - 0.001, width + borderWidth * 2, height + borderWidth * 2, 1, 1.0, 500)
  }
  
  // Hide other images and their borders
  workImagePlanes.forEach(plane => {
    if (plane !== imageMesh) {
      const material = plane.material as THREE.MeshStandardMaterial
      animateOpacity(material, 0, 300)
      
      const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
      if (borderPlane) {
        const borderMaterial = borderPlane.material as THREE.MeshStandardMaterial
        animateOpacity(borderMaterial, 0, 300)
      }
    }
  })
  
  // Update camera for single image view
  updateCameraForWorkImage(width, height)
}

// Hide work gallery and show menu
const hideWorkGallery = () => {
  showingWork = false
  selectedWorkImage = null
  
  // Remove and dispose of all work image planes and their borders
  workImagePlanes.forEach(plane => {
    plane.visible = false // Hide immediately
    scene.remove(plane)
    plane.geometry.dispose()
    const material = plane.material as THREE.MeshStandardMaterial
    if (material.map) {
      material.map.dispose()
    }
    material.dispose()
    
    // Remove and dispose of border
    const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
    if (borderPlane) {
      borderPlane.visible = false
      scene.remove(borderPlane)
      borderPlane.geometry.dispose()
      const borderMaterial = borderPlane.material as THREE.MeshStandardMaterial
      borderMaterial.dispose()
    }
  })
  workImagePlanes = []
  
  // Ensure background rectangles are completely removed (double-check)
  if (yellowRect) {
    if (scene.children.includes(yellowRect)) {
      yellowRect.visible = false // Hide immediately
      scene.remove(yellowRect)
    }
    yellowRect.geometry.dispose()
    const yellowMat = yellowRect.material as THREE.MeshStandardMaterial
    yellowMat.dispose()
    yellowRect = null
  }
  if (pinkRect) {
    if (scene.children.includes(pinkRect)) {
      pinkRect.visible = false // Hide immediately
      scene.remove(pinkRect)
    }
    pinkRect.geometry.dispose()
    const pinkMat = pinkRect.material as THREE.MeshStandardMaterial
    pinkMat.dispose()
    pinkRect = null
  }
  if (cyanRect) {
    if (scene.children.includes(cyanRect)) {
      cyanRect.visible = false // Hide immediately
      scene.remove(cyanRect)
    }
    cyanRect.geometry.dispose()
    const cyanMat = cyanRect.material as THREE.MeshStandardMaterial
    cyanMat.dispose()
    cyanRect = null
  }
  
  // Force immediate render to clear GPU cache
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
  
  // Reset camera zoom to default level
  targetCameraZ = 5
  
  // Animate spotlights back to original angle
  targetSpotlightAngle = defaultSpotlightAngle
  
  // Show main text and menu
  const mainText = [textMesh].filter(Boolean) as THREE.Mesh[]
  const menuItems = [workTextMesh, cvTextMesh, contactTextMesh].filter(Boolean) as THREE.Mesh[]
  
  if (mainText.length > 0) {
    animateMenuTransition(mainText, 0.8, 1, 300)
  }
  if (menuItems.length > 0) {
    animateMenuTransition(menuItems, 0.8, 1, 300)
  }
  
  // Reset camera (this will also update zoom based on particles, but we've set default above)
  updateCameraForParticles()
}

// Animate image to position and size
const animateImageToPosition = (
  mesh: THREE.Mesh,
  targetX: number,
  targetY: number,
  targetZ: number,
  targetWidth: number,
  targetHeight: number,
  targetScale: number,
  targetOpacity: number,
  duration: number
) => {
  const startTime = Date.now()
  const startX = mesh.position.x
  const startY = mesh.position.y
  const startZ = mesh.position.z
  const startWidth = (mesh.geometry as THREE.PlaneGeometry).parameters.width
  const startHeight = (mesh.geometry as THREE.PlaneGeometry).parameters.height
  const startScale = mesh.scale.x
  const material = mesh.material as THREE.MeshBasicMaterial
  const startOpacity = material.opacity
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easeProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2 // Ease in-out
    
    // Interpolate position
    mesh.position.x = startX + (targetX - startX) * easeProgress
    mesh.position.y = startY + (targetY - startY) * easeProgress
    mesh.position.z = startZ + (targetZ - startZ) * easeProgress
    
    // Interpolate scale
    const currentScale = startScale + (targetScale - startScale) * easeProgress
    mesh.scale.set(currentScale, currentScale, 1)
    
    // Interpolate size (resize geometry)
    const currentWidth = startWidth + (targetWidth - startWidth) * easeProgress
    const currentHeight = startHeight + (targetHeight - startHeight) * easeProgress
    mesh.geometry.dispose()
    mesh.geometry = new THREE.PlaneGeometry(currentWidth, currentHeight)
    
    // Interpolate opacity
    material.opacity = startOpacity + (targetOpacity - startOpacity) * easeProgress
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// Animate opacity
const animateOpacity = (material: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial, targetOpacity: number, duration: number) => {
  const startTime = Date.now()
  const startOpacity = material.opacity
  
  const animate = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easeProgress = progress < 0.5 
      ? 2 * progress * progress 
      : 1 - Math.pow(-2 * progress + 2, 2) / 2
    
    material.opacity = startOpacity + (targetOpacity - startOpacity) * easeProgress
    
    if (progress < 1) {
      requestAnimationFrame(animate)
    }
  }
  
  animate()
}

// Update camera to view work grid
const updateCameraForWorkGrid = () => {
  if (!camera || workImagePlanes.length === 0) return
  
  // Calculate grid bounds
  const cols = Math.ceil(Math.sqrt(workImagePlanes.length))
  const rows = Math.ceil(workImagePlanes.length / cols)
  const spacing = 0.5 // Match spacing in showWorkGrid
  const margin = 0.25 // Match margin in showWorkGrid
  
  const totalWidth = cols * spacing - spacing + margin * 2
  const totalHeight = rows * spacing - spacing + margin * 2
  
  // Calculate camera distance to fit grid
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180)
  const halfFovRad = fovRad / 2
  const tanHalfFov = halfFovRad
  
  const distanceForWidth = (totalWidth / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (totalHeight / 2) / tanHalfFov
  const distance = Math.max(distanceForWidth, distanceForHeight) * 1.1 // Add 10% padding
  
  targetCameraZ = distance
}

// Update camera to view single work image
const updateCameraForWorkImage = (width: number, height: number) => {
  if (!camera) return
  
  const screenAspect = window.innerWidth / window.innerHeight
  const fovRad = camera.fov * (Math.PI / 180)
  const halfFovRad = fovRad / 2
  const tanHalfFov = halfFovRad
  
  const distanceForWidth = (width / 2) / (tanHalfFov * screenAspect)
  const distanceForHeight = (height / 2) / tanHalfFov
  const distance = Math.max(distanceForWidth, distanceForHeight) * 1.1 // Add 10% padding
  
  targetCameraZ = distance
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
          roughness: 0.3
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

  // Smooth interpolation for spotlight angles
  const angleLerpFactor = 0.05 // Smooth interpolation speed for spotlight angles
  currentSpotlightAngle += (targetSpotlightAngle - currentSpotlightAngle) * angleLerpFactor
  
  // Update spotlight angles and shadow camera FOV
  if (yellowSpotlight && magentaSpotlight && cyanSpotlight) {
    yellowSpotlight.angle = currentSpotlightAngle
    magentaSpotlight.angle = currentSpotlightAngle
    cyanSpotlight.angle = currentSpotlightAngle
    
    // Update shadow camera FOV to match the spotlight angle (convert to degrees)
    const shadowFov = (currentSpotlightAngle * 180 / Math.PI) * 2 // FOV should be roughly 2x the angle
    const yellowShadowCamera = yellowSpotlight.shadow.camera as THREE.PerspectiveCamera
    const magentaShadowCamera = magentaSpotlight.shadow.camera as THREE.PerspectiveCamera
    const cyanShadowCamera = cyanSpotlight.shadow.camera as THREE.PerspectiveCamera
    
    yellowShadowCamera.fov = shadowFov
    magentaShadowCamera.fov = shadowFov
    cyanShadowCamera.fov = shadowFov
    
    yellowShadowCamera.updateProjectionMatrix()
    magentaShadowCamera.updateProjectionMatrix()
    cyanShadowCamera.updateProjectionMatrix()
  }

  // Smooth interpolation for mouse-based rotation
  const lerpFactor = 0.05 // Smooth interpolation speed
  currentRotationX += (targetRotationX - currentRotationX) * lerpFactor
  currentRotationY += (targetRotationY - currentRotationY) * lerpFactor

    // Check for hover on text meshes and update glow
    if (raycaster && camera) {
      raycaster.setFromCamera(mouse, camera)
      
      // Check hover on work images
      if (showingWork && workImagePlanes.length > 0) {
        const workIntersects = raycaster.intersectObjects(workImagePlanes)
        if (workIntersects.length > 0) {
          if (containerRef.value) {
            containerRef.value.style.cursor = 'pointer'
          }
        }
      }
      
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
    
    // Update cursor for hovered text (only if visible)
    if (intersects.length > 0) {
      const hoveredMesh = intersects[0]!.object as THREE.Mesh
      const material = hoveredMesh.material as THREE.MeshStandardMaterial
      
      // Only show cursor if the mesh is visible (opacity > 0 and scale > 0)
      if (material.opacity > 0.1 && hoveredMesh.scale.x > 0.1) {
        
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

  // Animate the three spotlights using the lighting module
  if (yellowSpotlight && magentaSpotlight && cyanSpotlight) {
    animateLighting({
      scene,
      yellowSpotlight,
      magentaSpotlight,
      cyanSpotlight,
      containerRef
    })
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
  
  // Clean up loading text
  if (loadingTextMesh) {
    scene.remove(loadingTextMesh)
    loadingTextMesh.geometry.dispose()
    const material = loadingTextMesh.material as THREE.MeshStandardMaterial
    material.dispose()
    loadingTextMesh = null
  }
  
  // Clean up work image planes and their borders
  workImagePlanes.forEach(plane => {
    scene.remove(plane)
    plane.geometry.dispose()
    const material = plane.material as THREE.MeshStandardMaterial
    if (material.map) {
      material.map.dispose()
    }
    material.dispose()
    
    // Clean up border
    const borderPlane = plane.userData.borderPlane as THREE.Mesh | undefined
    if (borderPlane) {
      scene.remove(borderPlane)
      borderPlane.geometry.dispose()
      const borderMaterial = borderPlane.material as THREE.MeshStandardMaterial
      borderMaterial.dispose()
    }
  })
  workImagePlanes = []
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
