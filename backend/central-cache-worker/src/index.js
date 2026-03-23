const DEFAULT_ALLOWED_ORIGINS = [
  'https://fabiosilverio.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function buildCorsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = getAllowedOrigins(env);
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Cache-Session',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

function sanitizePlaylist(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.id !== 'string' || !value.id.trim()) return null;
  if (!value.snippet || typeof value.snippet !== 'object') return null;

  return {
    id: value.id.trim(),
    snippet: {
      title: typeof value.snippet.title === 'string' ? value.snippet.title : 'Untitled playlist',
      thumbnails: value.snippet.thumbnails && typeof value.snippet.thumbnails === 'object'
        ? value.snippet.thumbnails
        : {},
    },
    contentDetails: {
      itemCount: Number(value.contentDetails?.itemCount || 0),
    },
  };
}

function sanitizeVideo(video) {
  if (!video || typeof video !== 'object') return null;
  if (typeof video.id !== 'string' || !video.id.trim()) return null;

  return {
    id: video.id,
    title: typeof video.title === 'string' ? video.title : '',
    channel: typeof video.channel === 'string' ? video.channel : '',
    thumbnail: typeof video.thumbnail === 'string' ? video.thumbnail : '',
    addedAt: typeof video.addedAt === 'string' ? video.addedAt : '',
    duration: Number(video.duration || 0),
    durationFormatted: typeof video.durationFormatted === 'string' ? video.durationFormatted : '0:00',
    category: typeof video.category === 'string' ? video.category : 'Other',
    isPodcast: Boolean(video.isPodcast),
    description: typeof video.description === 'string' ? video.description : '',
    tags: Array.isArray(video.tags) ? video.tags.filter((tag) => typeof tag === 'string').slice(0, 30) : [],
  };
}

function sanitizePlaylistVideoCache(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => typeof key === 'string' && key.trim() && entry && typeof entry === 'object')
      .slice(0, 200)
      .map(([key, entry]) => [
        key,
        {
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
          nextPageToken: typeof entry.nextPageToken === 'string' ? entry.nextPageToken : null,
          videos: Array.isArray(entry.videos)
            ? entry.videos.map(sanitizeVideo).filter(Boolean).slice(0, 500)
            : [],
        },
      ])
  );
}

function sanitizeContinueWatching(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => typeof key === 'string' && key.trim() && entry && typeof entry === 'object')
      .slice(0, 500)
      .map(([key, entry]) => [
        key,
        {
          progress: Number(entry.progress || 0),
          duration: Number(entry.duration || 0),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
          title: typeof entry.title === 'string' ? entry.title : '',
          channel: typeof entry.channel === 'string' ? entry.channel : '',
          thumbnail: typeof entry.thumbnail === 'string' ? entry.thumbnail : '',
        },
      ])
  );
}

function sanitizeSnapshot(payload) {
  return {
    playlists: Array.isArray(payload.playlists) ? payload.playlists.map(sanitizePlaylist).filter(Boolean).slice(0, 200) : [],
    playlistVideoCache: sanitizePlaylistVideoCache(payload.playlistVideoCache),
    followedPlaylists: Array.isArray(payload.followedPlaylists) ? payload.followedPlaylists.map(sanitizePlaylist).filter(Boolean).slice(0, 100) : [],
    pinnedPlaylists: Array.isArray(payload.pinnedPlaylists)
      ? [...new Set(payload.pinnedPlaylists.filter((value) => typeof value === 'string' && value.trim()))].slice(0, 200)
      : [],
    continueWatching: sanitizeContinueWatching(payload.continueWatching),
    watchLaterPlaylistId: typeof payload.watchLaterPlaylistId === 'string' ? payload.watchLaterPlaylistId : '',
    updatedAt: new Date().toISOString(),
  };
}

async function getUserIdFromSessionToken(request, env) {
  const sessionToken = String(request.headers.get('X-Cache-Session') || '').trim();
  if (!sessionToken) {
    return { userId: '', sessionToken: '' };
  }

  const userId = await env.CACHE_STORE.get(`cache-session:${sessionToken}`);
  if (!userId) {
    return { userId: '', sessionToken: '' };
  }

  return { userId, sessionToken };
}

async function requireGoogleUser(request) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Error('Missing bearer token.');
  }

  const token = match[1];
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo failed with ${response.status}.`);
  }

  const user = await response.json();
  if (!user?.id) {
    throw new Error('Google userinfo did not return a stable user id.');
  }

  return user;
}

async function ensureSessionToken(userId, env) {
  if (!userId) {
    throw new Error('Cannot issue cache session without a user id.');
  }

  const existingToken = await env.CACHE_STORE.get(`cache-user-session:${userId}`);
  if (existingToken) {
    await env.CACHE_STORE.put(`cache-session:${existingToken}`, userId);
    return existingToken;
  }

  const sessionToken = `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, '')}`;
  await env.CACHE_STORE.put(`cache-user-session:${userId}`, sessionToken);
  await env.CACHE_STORE.put(`cache-session:${sessionToken}`, userId);
  return sessionToken;
}

export default {
  async fetch(request, env) {
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true, service: 'central-cache-worker' }, { headers: corsHeaders });
    }

    if (url.pathname !== '/api/cache/snapshot') {
      return json({ error: 'Not found.' }, { status: 404, headers: corsHeaders });
    }

    if (!env.CACHE_STORE) {
      return json({ error: 'CACHE_STORE binding is missing.' }, { status: 500, headers: corsHeaders });
    }

    try {
      let { userId, sessionToken } = await getUserIdFromSessionToken(request, env);

      if (!userId) {
        const user = await requireGoogleUser(request);
        userId = user.id;
        sessionToken = await ensureSessionToken(user.id, env);
      }

      const storageKey = `snapshot:${userId}`;

      if (request.method === 'GET') {
        const snapshot = await env.CACHE_STORE.get(storageKey, 'json');
        return json({
          ok: true,
          snapshot: snapshot || {},
          sessionToken,
        }, { headers: corsHeaders });
      }

      if (request.method === 'POST') {
        const payload = await request.json();
        const snapshot = sanitizeSnapshot(payload || {});
        await env.CACHE_STORE.put(storageKey, JSON.stringify(snapshot));
        return json({
          ok: true,
          updatedAt: snapshot.updatedAt,
          sessionToken,
        }, { headers: corsHeaders });
      }

      return json({ error: 'Method not allowed.' }, { status: 405, headers: corsHeaders });
    } catch (error) {
      return json({
        error: error.message || 'Unexpected error.',
      }, { status: 401, headers: corsHeaders });
    }
  },
};
