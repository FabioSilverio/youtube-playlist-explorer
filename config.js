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
  // Replace with your actual Client ID
  CLIENT_ID: '77659556064-0a3stkbbgnt2mffsog8kcvgq0i57ksro.apps.googleusercontent.com',

  // The scopes needed for this application
  SCOPES: 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube',

  // Max results per API call (50 is the YouTube API maximum)
  MAX_RESULTS: 50,
};
