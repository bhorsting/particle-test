# Vercel Deployment Guide

## Quick Deploy

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for Vercel"
   git push
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-detect Vue.js
   - Click Deploy

3. **That's it!** The app will work automatically.

## How It Works on Vercel

### Automatic Detection
- Vercel detects Vue.js from `package.json`
- Builds using `vite build`
- Serves static files from `dist/`

### Serverless Functions
- `/api/public-album.js` → Automatically deployed as serverless function
- Accessible at: `https://your-site.vercel.app/api/public-album`
- No configuration needed - Vercel auto-detects `/api` folder

### Frontend Configuration
- In production, `API_BASE_URL` defaults to `/api` (same origin)
- Frontend calls `/api/public-album` which routes to the serverless function
- CORS is handled automatically

## Environment Variables (Optional)

If you want to use a different share link, add to Vercel:

1. Go to Project Settings → Environment Variables
2. Add: `VITE_GOOGLE_PHOTOS_SHARE_LINK` = `https://photos.app.goo.gl/YOUR_ALBUM_ID`
3. Redeploy

## Testing Locally Before Deploy

```bash
# Test that everything works
pnpm run dev

# Build to test production build
pnpm run build
pnpm run preview
```

## Troubleshooting

### Images not loading on Vercel
- Check Vercel function logs: Deployments → Functions tab
- Verify the share link is public
- Check browser console for errors

### CORS errors
- Should be handled automatically by Vercel headers
- Check `vercel.json` configuration

### Function timeout
- Default timeout is 10s (free plan)
- Max is 30s (configured in `vercel.json`)
- If timeout, the album might be too large

## File Structure for Vercel

```
├── api/
│   └── public-album.js    # Serverless function (auto-deployed)
├── src/                    # Frontend code
├── vercel.json            # Vercel configuration
└── package.json           # Dependencies
```

Vercel automatically:
- Detects `/api` folder as serverless functions
- Builds Vue app with Vite
- Routes `/api/*` to serverless functions
- Serves static files from `dist/`

