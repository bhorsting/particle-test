<script setup lang="ts">
import { ref } from 'vue'
import ParticleViewer from './components/ParticleViewer.vue'

// Example images - replace with your own image URLs
const images = ref<string[]>([
  // Add your image URLs here
  // Example: 'https://example.com/image1.jpg',
  // 'https://example.com/image2.jpg',
  "img/1.jpg",
  "img/2.jpg",
  "img/3.jpg",
])

// You can also load local images from the public folder
// Example: '/images/image1.jpg'
</script>

<template>
  <ParticleViewer 
    :images="images" 
    :particle-density="0.1"
    :transition-duration="8000"
    :auto-advance="true"
    :auto-advance-interval="3000"
  />
</template>

<style scoped>
/* App component styles - full window */
</style>
