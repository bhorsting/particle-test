<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ParticleViewer from './components/ParticleViewer.vue'
import { getImagesFromAlbum, getImagesFromPublicAlbum } from './services/googlePhotos'

// Image URLs - will be loaded from Google Photos
const images = ref<string[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

// Load images from Google Photos album via server-side methods
const loadImagesFromGooglePhotos = async () => {
  try {
    loading.value = true
    error.value = null
    
    // Try server-side public album method first
    try {
      const imageUrls = await getImagesFromPublicAlbum()
      if (imageUrls.length > 0) {
        images.value = imageUrls
        return
      }
    } catch (serverError) {
      console.log('Server-side public method failed, trying OAuth API:', serverError)
    }
    
    // Fallback: OAuth API method (requires server and OAuth setup)
    const imageUrls = await getImagesFromAlbum()
    
    if (imageUrls.length === 0) {
      error.value = 'No images found in the album.'
    } else {
      images.value = imageUrls
    }
  } catch (err: any) {
    console.error('Error loading images from Google Photos:', err)
    error.value = err.message || 'Failed to load images from Google Photos.'
  } finally {
    loading.value = false
  }
}


// On mount, try to load from Google Photos, fallback to local if backend is not available
onMounted(() => {
  loadImagesFromGooglePhotos()
})
</script>

<template>
  <div v-if="loading" class="loading-container">
    <div class="loading-message">
      <p>Loading images from Google Photos...</p>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
  <ParticleViewer 
    v-else-if="images.length > 0"
    :images="images" 
    :particle-density="0.1"
    :transition-duration="8000"
    :auto-advance="true"
    :auto-advance-interval="3000"
  />
  <div v-else class="error-container">
    <p class="error">{{ error || 'No images available' }}</p>
    <button @click="loadImagesFromGooglePhotos" class="retry-button">Retry</button>
  </div>
</template>

<style scoped>
.loading-container,
.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  width: 100vw;
  background-color: #330099;
  color: white;
  flex-direction: column;
  gap: 1rem;
}

.loading-message {
  text-align: center;
}

.error {
  color: #ff6b6b;
  margin-top: 1rem;
}

.retry-button {
  padding: 0.75rem 1.5rem;
  background-color: #00ffff;
  color: #000;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: bold;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: #00cccc;
}
</style>
