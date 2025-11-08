/**
 * Google Photos API Service
 * 
 * This service fetches images from Google Photos albums.
 * Supports both OAuth API method and public share link method.
 */

// Backend API endpoint
// For Vercel: uses empty string (same origin, /api routes handled by Vercel)
// For local dev: uses http://localhost:3001
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '')

// Public share link (if using public album method)
const PUBLIC_SHARE_LINK = import.meta.env.VITE_GOOGLE_PHOTOS_SHARE_LINK || 'https://photos.app.goo.gl/Vivqp6g4bvuBNtXt9'

/**
 * Get images from Google Photos album via backend API (OAuth method)
 * No authentication needed on the frontend - backend handles it
 */
export async function getImagesFromAlbum(_albumId?: string): Promise<string[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/images`)
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch images' }))
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    return data.images || []
  } catch (error: any) {
    console.error('Error fetching images from backend:', error)
    throw new Error(error.message || 'Failed to fetch images from Google Photos')
  }
}

/**
 * Get images from public Google Photos album via share link
 * No OAuth required - uses public share link
 * Returns proxied URLs to avoid CORS issues
 */
export async function getImagesFromPublicAlbum(shareLink?: string): Promise<string[]> {
  try {
    const link = shareLink || PUBLIC_SHARE_LINK
    const response = await fetch(`${API_BASE_URL}/api/public-album?shareLink=${encodeURIComponent(link)}`)
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to fetch images' }))
      throw new Error(error.error || `HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const imageUrls = data.images || []
    
    // Proxy all image URLs through our server to avoid CORS issues
    return imageUrls.map((url: string) => {
      // If already a proxied URL, return as-is
      if (url.includes('/api/image-proxy')) {
        return url
      }
      // Otherwise, proxy through our server
      return `${API_BASE_URL}/api/image-proxy?url=${encodeURIComponent(url)}`
    })
  } catch (error: any) {
    console.error('Error fetching images from public album:', error)
    throw new Error(error.message || 'Failed to fetch images from public album')
  }
}

