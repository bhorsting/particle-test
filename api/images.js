/**
 * Vercel serverless function to fetch images from Google Photos
 */

import { google } from 'googleapis'

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
    const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN
    const GOOGLE_PHOTOS_ALBUM_ID = process.env.GOOGLE_PHOTOS_ALBUM_ID

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth credentials not configured' })
    }

    if (!GOOGLE_REFRESH_TOKEN) {
      return res.status(500).json({ error: 'Refresh token not configured. Please complete OAuth setup.' })
    }

    if (!GOOGLE_PHOTOS_ALBUM_ID) {
      return res.status(400).json({ error: 'Album ID not configured' })
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    )

    // Set refresh token
    oauth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN
    })

    // Get access token
    const { token } = await oauth2Client.getAccessToken()
    if (!token) {
      return res.status(500).json({ error: 'Failed to get access token' })
    }

    // Create Photos Library client
    const photos = google.photoslibrary({ version: 'v1', auth: oauth2Client })
    
    const imageUrls = []
    let nextPageToken = null

    do {
      const response = await photos.mediaItems.search({
        requestBody: {
          albumId: GOOGLE_PHOTOS_ALBUM_ID,
          pageSize: 100,
          pageToken: nextPageToken || undefined
        }
      })

      const mediaItems = response.data.mediaItems || []
      
      // Filter for images and get their URLs
      const imageItems = mediaItems.filter(
        (item) => item.mimeType?.startsWith('image/')
      )
      
      // Append size parameter for better quality
      imageUrls.push(...imageItems.map((item) => {
        const baseUrl = item.baseUrl || ''
        if (baseUrl.includes('=')) {
          return baseUrl.replace(/=s\d+/, '=w2048-h2048')
        }
        return baseUrl + '=w2048-h2048'
      }))

      nextPageToken = response.data.nextPageToken || null
    } while (nextPageToken)

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    return res.status(200).json({ images: imageUrls })
  } catch (error) {
    console.error('Error fetching images:', error)
    return res.status(500).json({ 
      error: 'Failed to fetch images',
      message: error.message 
    })
  }
}

