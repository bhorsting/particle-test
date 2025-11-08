/**
 * Minimal server for local development
 * Handles public Google Photos album fetching (fallback for client-side method)
 */

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

// Enable CORS for frontend
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}))

app.use(express.json())

// Endpoint to get images from public album (no OAuth needed)
app.get('/api/public-album', async (req, res) => {
  try {
    const shareLink = req.query.shareLink || 'https://photos.app.goo.gl/Vivqp6g4bvuBNtXt9'
    
    // Extract the share token from the URL
    let shareToken = shareLink
    if (shareLink.includes('photos.app.goo.gl/')) {
      shareToken = shareLink.split('photos.app.goo.gl/')[1]?.split('?')[0] || shareLink
    }

    // Fetch the share link page
    const response = await fetch(`https://photos.app.goo.gl/${shareToken}`)
    const html = await response.text()

    // Parse HTML to extract image URLs
    const imageUrls = []
    
    // Method 1: Look for img tags with Google Photos URLs
    const imgMatches = html.match(/<img[^>]+src="([^"]+)"/gi)
    if (imgMatches) {
      imgMatches.forEach(match => {
        const urlMatch = match.match(/src="([^"]+)"/i)
        if (urlMatch) {
          const url = urlMatch[1]
          if (url && (url.includes('googleusercontent.com') || url.includes('ggpht.com'))) {
            // Add size parameter if not present
            const finalUrl = url.includes('=') 
              ? url.replace(/=s\d+/, '=w2048-h2048')
              : url + '=w2048-h2048'
            imageUrls.push(finalUrl)
          }
        }
      })
    }

    // Method 2: Look in script tags for image data
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs)
    if (scriptMatches) {
      scriptMatches.forEach(script => {
        const urlMatches = script.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|gif|webp)/gi)
        if (urlMatches) {
          urlMatches.forEach(url => {
            if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
              const finalUrl = url.includes('=') 
                ? url.replace(/=s\d+/, '=w2048-h2048')
                : url + '=w2048-h2048'
              imageUrls.push(finalUrl)
            }
          })
        }
      })
    }

    // Remove duplicates
    const uniqueUrls = [...new Set(imageUrls)]

    if (uniqueUrls.length === 0) {
      return res.status(500).json({ 
        error: 'Could not extract images from public album',
        message: 'The album might not be publicly accessible or the format has changed'
      })
    }

    res.json({ images: uniqueUrls })
  } catch (error) {
    console.error('Error fetching public album:', error)
    res.status(500).json({ 
      error: 'Failed to fetch images from public album',
      message: error.message 
    })
  }
})

// Image proxy endpoint - fetches images from Google Photos and serves with CORS headers
app.get('/api/image-proxy', async (req, res) => {
  try {
    const imageUrl = req.query.url
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' })
    }

    // Fetch the image from Google Photos
    const imageResponse = await fetch(imageUrl)
    
    if (!imageResponse.ok) {
      return res.status(imageResponse.status).json({ error: 'Failed to fetch image' })
    }

    // Get the image data
    const imageBuffer = await imageResponse.arrayBuffer()
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000') // Cache for 1 year

    // Send the image
    res.send(Buffer.from(imageBuffer))
  } catch (error) {
    console.error('Error proxying image:', error)
    res.status(500).json({ 
      error: 'Failed to proxy image',
      message: error.message 
    })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'public-album-server' })
})

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})

