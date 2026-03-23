# Central Cache Worker

This Worker stores per-user playlist snapshots so the frontend can keep working when the YouTube API quota is exhausted.

## What it stores

- `playlists`
- `playlistVideoCache`
- `followedPlaylists`
- `pinnedPlaylists`
- `continueWatching`
- `watchLaterPlaylistId`

## How it authenticates

The frontend sends the current Google OAuth access token in `Authorization: Bearer ...`.
The Worker validates that token through Google's `userinfo` endpoint and uses the returned Google user id as the cache key.

## Deploy

1. Create a Cloudflare KV namespace.
2. Put the namespace id into `wrangler.toml`.
3. Optionally adjust `ALLOWED_ORIGINS`.
4. Deploy:

```bash
wrangler deploy
```

5. Copy the Worker URL and set `CONFIG.CACHE_API_BASE` in [`config.js`](../../config.js).

## Endpoints

- `GET /health`
- `GET /api/cache/snapshot`
- `POST /api/cache/snapshot`
