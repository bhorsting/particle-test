/**
 * Vercel serverless function to proxy Google Photos images
 * Fetches images and serves them with proper CORS headers
 */

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
    return res.send(Buffer.from(imageBuffer))
  } catch (error) {
    console.error('Error proxying image:', error)
    return res.status(500).json({ 
      error: 'Failed to proxy image',
      message: error.message 
    })
  }
}

