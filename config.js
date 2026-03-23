// ============================================
// YouTube Playlist Explorer — Configuration
// ============================================
// 1. Go to https://console.cloud.google.com/
// 2. Create a project & enable "YouTube Data API v3"
// 3. Create OAuth 2.0 Client ID (Web app)
//    - Authorized JS origin: http://localhost:3000
//    - Authorized redirect URI: http://localhost:3000
// 4. Paste your Client ID below:

const CONFIG = {
  CLIENT_ID: '243815206995-4q78gfudru073crceoceppb9tgjbl37b.apps.googleusercontent.com',
  API_KEY: '', // Optional: for public-only access without OAuth
  CACHE_API_BASE: 'https://youtube-playlist-explorer-cache.fabiogsilverio.workers.dev', // Optional centralized cache backend, e.g. https://your-worker.example.workers.dev
  SCOPES: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/youtube/v3/rest',
  MAX_RESULTS: 50,
};
