# Particle Viewer

A Vue 3 + Three.js application that displays images from Google Photos as animated particles.

## Features

- 🎨 Beautiful particle animations from images
- 📸 Loads images from Google Photos public albums
- 🚀 No server needed for local development
- ⚡ Client-side image fetching
- 🌐 Works on Vercel with serverless functions

## Setup

### 1. Configure Google Photos Share Link

Create a `.env` file in the root directory:

```env
VITE_GOOGLE_PHOTOS_SHARE_LINK=https://photos.app.goo.gl/YOUR_ALBUM_ID
```

Or the app will use the default share link.

### 2. Make Your Album Public

1. Open your Google Photos album
2. Click "Share"
3. Create a shareable link
4. Copy the link (format: `https://photos.app.goo.gl/ALBUM_ID`)
5. Add it to your `.env` file

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Run Development Server

```bash
pnpm run dev
```

This will start both:
- **Backend server** on `http://localhost:3001` (for public album fallback)
- **Frontend** on `http://localhost:5173`

The app will try client-side fetching first, then fall back to the server if needed.

## How It Works

1. **Client-side method** (primary): Fetches the public album HTML and extracts image URLs
2. **Serverless function** (fallback): Uses Vercel serverless function if client-side fails
3. **OAuth API** (last resort): Only if you set up OAuth (not needed for public albums)

## Deployment to Vercel

1. Push your code to GitHub
2. Connect to Vercel
3. Deploy

The serverless functions in `/api` will be automatically deployed and used as fallback.

## Project Structure

```
├── src/
│   ├── components/
│   │   └── ParticleViewer.vue    # Main particle viewer component
│   ├── services/
│   │   ├── googlePhotos.ts       # OAuth API method (fallback)
│   │   └── googlePhotosPublicClient.ts  # Client-side method (primary)
│   └── App.vue                    # Main app component
├── api/
│   ├── public-album.js           # Serverless function for public albums
│   └── images.js                  # Serverless function for OAuth API
└── vercel.json                    # Vercel configuration
```

## Environment Variables

### Required (for public albums)
- `VITE_GOOGLE_PHOTOS_SHARE_LINK` - Your public Google Photos album share link

### Optional (for OAuth API method)
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret
- `GOOGLE_REFRESH_TOKEN` - OAuth refresh token
- `GOOGLE_PHOTOS_ALBUM_ID` - Album ID for API access

## License

MIT
