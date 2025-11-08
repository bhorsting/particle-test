/**
 * Vercel serverless function to fetch images from a public Google Photos album
 * Uses the public share link to extract image URLs
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
    // Google Photos share links embed images in a specific format
    // We need to extract the image data from the page
    
    // Method 1: Look for JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1])
        // Extract image URLs from structured data
        if (jsonData.image) {
          const images = Array.isArray(jsonData.image) ? jsonData.image : [jsonData.image]
          const imageUrls = images.map(img => typeof img === 'string' ? img : img.url).filter(Boolean)
          if (imageUrls.length > 0) {
            res.setHeader('Access-Control-Allow-Origin', '*')
            return res.status(200).json({ images: imageUrls })
          }
        }
      } catch (e) {
        // Continue to other methods
      }
    }

    // Method 2: Look for image URLs in script tags (Google Photos embeds data here)
    const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs)
    if (scriptMatches) {
      for (const script of scriptMatches) {
        // Look for image URLs in the script content
        const imageUrlMatches = script.match(/https?:\/\/[^"'\s]+\.(jpg|jpeg|png|gif|webp)/gi)
        if (imageUrlMatches && imageUrlMatches.length > 0) {
          // Filter for Google Photos CDN URLs
          const googlePhotosUrls = imageUrlMatches.filter(url => 
            url.includes('googleusercontent.com') || url.includes('ggpht.com')
          )
          if (googlePhotosUrls.length > 0) {
            // Remove duplicates and add size parameter
            const uniqueUrls = [...new Set(googlePhotosUrls)].map(url => {
              // Add size parameter if not present
              if (!url.includes('=')) {
                return url + '=w2048-h2048'
              }
              return url.replace(/=s\d+/, '=w2048-h2048')
            })
            
            res.setHeader('Access-Control-Allow-Origin', '*')
            return res.status(200).json({ images: uniqueUrls })
          }
        }
      }
    }

    // Method 3: Look for img tags
    const imgMatches = html.match(/<img[^>]+src="([^"]+)"/gi)
    if (imgMatches) {
      const imageUrls = imgMatches
        .map(match => match.match(/src="([^"]+)"/i)?.[1])
        .filter(url => url && (url.includes('googleusercontent.com') || url.includes('ggpht.com')))
        .map(url => {
          if (!url.includes('=')) {
            return url + '=w2048-h2048'
          }
          return url.replace(/=s\d+/, '=w2048-h2048')
        })
      
      if (imageUrls.length > 0) {
        const uniqueUrls = [...new Set(imageUrls)]
        res.setHeader('Access-Control-Allow-Origin', '*')
        return res.status(200).json({ images: uniqueUrls })
      }
    }

    // If all methods fail, return error
    return res.status(500).json({ 
      error: 'Could not extract images from public album',
      message: 'The album might not be publicly accessible or the format has changed'
    })

  } catch (error) {
    console.error('Error fetching public album:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch images from public album',
      message: error.message 
    })
  }
}

