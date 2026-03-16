/* =============================================
   YouTube Playlist Explorer — Application
   ============================================= */

(() => {
  'use strict';

  // ---- State ----
  const state = {
    accessToken: null,
    user: null,
    playlists: [],
    activePlaylistId: null,
    allVideos: [],          // all videos in active playlist (all pages)
    filteredVideos: [],     // after filters applied
    nextPageToken: null,
    isLoading: false,

    // Filters & Search
    searchMode: 'filter', // 'filter' | 'youtube'
    ytSearchResults: [],
    searchQuery: '',
    durationFilter: 'all',
    dateFilter: 'all',
    customDateFrom: null,
    customDateTo: null,
    categoryFilter: 'all',
    typeFilter: 'all',
    watchedFilter: 'all',
    keywords: '',
    sortBy: 'dateDesc',

    // Watched State Persistence
    watchedVideos: new Set(JSON.parse(localStorage.getItem('yt_explorer_watched') || '[]')),

    // Category map from YouTube
    categoryMap: {},
    detectedCategories: new Set(),

    // Followed Playlists
    followedPlaylists: JSON.parse(localStorage.getItem('yt_explorer_followed') || '[]'),

    // Custom Video Tags { "videoId": ["tag1", "tag2"] }
    videoTags: JSON.parse(localStorage.getItem('yt_explorer_tags') || '{}'),

    isInitialLoad: true, // track startup check
  };

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    loginOverlay: $('#login-overlay'),
    btnLogin: $('#btn-login'),
    app: $('#app'),
    btnLogout: $('#btn-logout'),
    userAvatar: $('#user-avatar'),
    userName: $('#user-name'),

    sidebarToggle: $('#btn-sidebar-toggle'),
    sidebar: $('#sidebar'),
    sidebarList: $('#sidebar-list'),
    playlistCount: $('#playlist-count'),

    searchInput: $('#search-input'),
    btnClearSearch: $('#btn-clear-search'),
    
    discoverBar: $('#discover-bar'),
    discoverInput: $('#discover-input'),
    btnClearDiscover: $('#btn-clear-discover'),
    btnSearchDiscover: $('#btn-search-discover'),
    
    filterBar: $('#filter-bar'),

    durationChips: $('#duration-chips'),
    dateChips: $('#date-chips'),
    customDateRange: $('#custom-date-range'),
    dateFrom: $('#date-from'),
    dateTo: $('#date-to'),
    btnApplyDate: $('#btn-apply-date'),
    categoryChips: $('#category-chips'),
    typeChips: $('#type-chips'),
    watchedChips: $('#watched-chips'),
    keywordInput: $('#keyword-input'),
    sortSelect: $('#sort-select'),

    mobileNav: $('#mobile-nav'),

    activeFilters: $('#active-filters'),
    activeFilterTags: $('#active-filter-tags'),
    btnClearFilters: $('#btn-clear-filters'),

    resultsCount: $('#results-count'),
    videoGrid: $('#video-grid'),
    loadingSpinner: $('#loading-spinner'),
    emptyState: $('#empty-state'),
    welcomeState: $('#welcome-state'),
    loadMoreWrapper: $('#load-more-wrapper'),
    btnLoadMore: $('#btn-load-more'),
    
    toastContainer: $('#toast-container'),
    
    playlistModal: $('#playlist-modal'),
    modalPlaylistList: $('#modal-playlist-list'),
    playlistModalTags: $('#playlist-modal-tags'),
    btnCloseModal: $('#btn-close-modal'),

    btnFollowPlaylist: $('#btn-follow-playlist'),
    followModal: $('#follow-modal'),
    btnCloseFollowModal: $('#btn-close-follow-modal'),
    followInput: $('#follow-input'),
    btnAddFollow: $('#btn-add-follow'),

    tagModal: $('#tag-modal'),
    btnCloseTagModal: $('#btn-close-tag-modal'),
    tagInput: $('#tag-input'),
    btnSaveTags: $('#btn-save-tags'),
  };

  // ---- State specific to adding videos ----
  let videoToAdd = null;
  let btnToAdd = null;

  // ---- YouTube Category mapping (most common) ----
  const YT_CATEGORIES = {
    '1': 'Film & Animation', '2': 'Autos & Vehicles', '10': 'Music',
    '15': 'Pets & Animals', '17': 'Sports', '18': 'Short Movies',
    '19': 'Travel & Events', '20': 'Gaming', '21': 'Videoblogging',
    '22': 'People & Blogs', '23': 'Comedy', '24': 'Entertainment',
    '25': 'News & Politics', '26': 'Howto & Style', '27': 'Education',
    '28': 'Science & Technology', '29': 'Nonprofits & Activism',
    '30': 'Movies', '43': 'Shows',
  };

  // ---- Utility ----
  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function parseDuration(iso) {
    // PT1H2M3S → seconds
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }

  function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    if (d < 1) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7) return `${d} days ago`;
    if (d < 30) return `${Math.floor(d / 7)} week${Math.floor(d / 7) > 1 ? 's' : ''} ago`;
    if (d < 365) return `${Math.floor(d / 30)} month${Math.floor(d / 30) > 1 ? 's' : ''} ago`;
    return `${Math.floor(d / 365)} year${Math.floor(d / 365) > 1 ? 's' : ''} ago`;
  }

  function isPodcast(title, channel, duration) {
    // Basic heuristic: duration > 30m and specific words
    const t = (title + ' ' + channel).toLowerCase();
    const podcastKeywords = [
      'podcast', 'pod', 'ep', 'episode', 'jre', 'flow', 'podpah', 
      'inteligência', 'vênus', 'ticaracatica', 'huberman', 'fridman', 
      'diary of a ceo', 'shawn ryan', 'joe rogan', 'megyn kelly'
    ];
    if (duration > 1800 && podcastKeywords.some(kw => t.includes(kw))) {
      return true;
    }
    // Very long videos with multiple faces or "interview" are often podcasts but harder to detect.
    // If it has 'podcast' in the title regardless of length:
    if (t.includes('podcast')) return true;
    return false;
  }

  function toggleWatched(videoId) {
    if (state.watchedVideos.has(videoId)) {
      state.watchedVideos.delete(videoId);
    } else {
      state.watchedVideos.add(videoId);
    }
    localStorage.setItem('yt_explorer_watched', JSON.stringify([...state.watchedVideos]));
  }

  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icon = type === 'success' 
      ? '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>';
      
    toast.innerHTML = `${icon}<span>${escHtml(message)}</span>`;
    dom.toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('hiding');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3000);
  }
  
  function parseTags(tagString) {
    if (!tagString) return [];
    return tagString.split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  }

  // ---- Auth (Google Identity Services) ----
  let tokenClient;

  function initAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: handleAuthResponse,
    });

    dom.btnLogin.addEventListener('click', () => {
      tokenClient.requestAccessToken({ prompt: 'select_account' });
    });

    dom.btnLogout.addEventListener('click', () => {
      if (state.accessToken) {
        google.accounts.oauth2.revoke(state.accessToken, () => {});
      }
      state.accessToken = null;
      localStorage.removeItem('yt_explorer_session');
      localStorage.removeItem('yt_explorer_is_logged_in');
      show(dom.loginOverlay);
      hide(dom.app);
    });
  }

  function handleAuthResponse(resp) {
    if (resp.error) {
      // Silent refresh failed or user cancelled; just show the login screen cleanly.
      // Do NOT show error toast here - user just needs to click login.
      console.warn('Auth response error:', resp.error);
      state.accessToken = null;
      localStorage.removeItem('yt_explorer_session');
      localStorage.setItem('yt_explorer_is_logged_in', 'false');
      show(dom.loginOverlay);
      hide(dom.app);
      return;
    }
    state.accessToken = resp.access_token;
    localStorage.setItem('yt_explorer_is_logged_in', 'true');

    // Persist session with expiry
    const expiresAt = Date.now() + (resp.expires_in || 3500) * 1000;
    localStorage.setItem('yt_explorer_session', JSON.stringify({
      accessToken: resp.access_token,
      expiresAt,
    }));

    // Schedule a token refresh 5 min before expiry
    setupTokenRefresh(expiresAt);

    hide(dom.loginOverlay);
    show(dom.app);
    fetchUserInfo();
    fetchPlaylists();
  }

  async function apiFetch(url, options = {}) {
    if (!state.accessToken) {
       console.warn("Attempted apiFetch without access token. Halting request.");
       throw new Error('No access token available.');
    }
    const res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${state.accessToken}`, ...(options.headers || {}) },
    });
    if (res.status === 401) {
      console.warn("API returned 401 Unauthorized.");
      state.accessToken = null;
      localStorage.removeItem('yt_explorer_session');
      localStorage.setItem('yt_explorer_is_logged_in', 'false');
      
      if (dom.btnLogin) {
         const originalSVG = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
         dom.btnLogin.innerHTML = originalSVG + ' Sign in with Google';
         dom.btnLogin.disabled = false;
      }
      
      // Only show error toast if it's NOT the first load check.
      // This prevents "session expired" pops on page load if the local token is dead.
      if (!state.isInitialLoad) {
        showToast("Session expired. Please log in again.", "error");
      }
      
      show(dom.loginOverlay);
      hide(dom.app);
      throw new Error(`API 401: Unauthorized`);
    }
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async function fetchUserInfo() {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        console.warn('User profile is unavailable for the current token.', res.status);
        state.user = null;
        dom.userAvatar.src = '';
        dom.userName.textContent = '';
        return null;
      }

      if (!res.ok) {
        throw new Error(`User info ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      state.user = data;
      dom.userAvatar.src = data.picture || '';
      dom.userName.textContent = data.name || data.email || '';
      return data;
    } catch (e) {
      console.error('User info error:', e);
      return null;
    }
  }

  // ---- Playlists ----
  async function fetchPlaylists(pageToken = '', isSilent = false, tempPlaylists = []) {
    try {
      if (!pageToken && !isSilent) {
        state.playlists = []; // Clear on first page 
      }
      
      let url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=${CONFIG.MAX_RESULTS}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = await apiFetch(url);
      tempPlaylists.push(...data.items);

      if (data.nextPageToken) {
        await fetchPlaylists(data.nextPageToken, isSilent, tempPlaylists);
      } else {
        // All pages fetched
        state.playlists = tempPlaylists;
        dom.playlistCount.textContent = state.playlists.length;
        renderPlaylists();
      }
    } catch (e) {
      console.error('Playlists error:', e);
    }
  }

  function renderPlaylists() {
    dom.sidebarList.innerHTML = '';

    // Add "Discover YouTube" special entry
    const discoverItem = document.createElement('div');
    discoverItem.className = 'playlist-item' + (state.activePlaylistId === 'DISCOVER' ? ' active' : '');
    discoverItem.innerHTML = `
      <div class="playlist-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg-card);">
        <svg width="20" height="20" fill="var(--accent)" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>
      <div class="playlist-meta">
        <div class="playlist-title">Discover YouTube</div>
        <div class="playlist-video-count">Search globally</div>
      </div>
    `;
    discoverItem.addEventListener('click', () => selectPlaylist('DISCOVER', discoverItem));
    dom.sidebarList.appendChild(discoverItem);

    // Add "Liked Videos" as a special entry
    const likedItem = document.createElement('div');
    likedItem.className = 'playlist-item' + (state.activePlaylistId === 'LL' ? ' active' : '');
    likedItem.innerHTML = `
      <div class="playlist-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg-card);">
        <svg width="20" height="20" fill="var(--accent)" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
      </div>
      <div class="playlist-meta">
        <div class="playlist-title">Liked Videos</div>
        <div class="playlist-video-count">Special playlist</div>
      </div>
    `;
    likedItem.addEventListener('click', () => selectPlaylist('LL', likedItem));
    dom.sidebarList.appendChild(likedItem);

    state.playlists.forEach((pl) => {
      const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
      const count = pl.contentDetails?.itemCount || 0;

      const div = document.createElement('div');
      div.className = 'playlist-item' + (state.activePlaylistId === pl.id ? ' active' : '');
      div.innerHTML = `
        <img class="playlist-thumb" src="${thumb}" alt="" loading="lazy" />
        <div class="playlist-meta">
          <div class="playlist-title" title="${pl.snippet.title}">${pl.snippet.title}</div>
          <div class="playlist-video-count">${count} video${count !== 1 ? 's' : ''}</div>
        </div>
      `;
      div.addEventListener('click', () => selectPlaylist(pl.id, div));
      dom.sidebarList.appendChild(div);
    });

    if (state.followedPlaylists.length > 0) {
      const divider = document.createElement('div');
      divider.style.margin = '16px 10px 8px';
      divider.style.fontSize = '0.75rem';
      divider.style.fontWeight = '600';
      divider.style.color = 'var(--text-muted)';
      divider.style.textTransform = 'uppercase';
      divider.textContent = 'Followed Playlists';
      dom.sidebarList.appendChild(divider);

      state.followedPlaylists.forEach((pl) => {
        const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
        const count = pl.contentDetails?.itemCount || 0;

        const div = document.createElement('div');
        div.className = 'playlist-item' + (state.activePlaylistId === pl.id ? ' active' : '');
        div.innerHTML = `
          <img class="playlist-thumb" src="${thumb}" alt="" loading="lazy" />
          <div class="playlist-meta">
            <div class="playlist-title" title="${pl.snippet.title}">${pl.snippet.title}</div>
            <div class="playlist-video-count">${count} video${count !== 1 ? 's' : ''}</div>
          </div>
          <button class="playlist-remove-btn" title="Unfollow playlist" data-id="${pl.id}">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        `;
        
        div.querySelector('.playlist-remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          unfollowPlaylist(pl.id);
        });
        
        div.addEventListener('click', () => selectPlaylist(pl.id, div));
        dom.sidebarList.appendChild(div);
      });
    }
  }

  async function selectPlaylist(playlistId, el) {
    if (state.isLoading) return;

    // Update active state
    $$('.playlist-item').forEach((item) => item.classList.remove('active'));
    el.classList.add('active');

    state.activePlaylistId = playlistId;
    state.allVideos = [];
    state.nextPageToken = null;
    state.detectedCategories = new Set();

    // Reset filters
    resetFilters();

    // Collapse sidebar on mobile
    if (window.innerWidth <= 1024) {
      dom.sidebar.classList.remove('open');
    }

    hide(dom.welcomeState);
    
    if (playlistId === 'DISCOVER') {
      state.searchMode = 'youtube';
      show(dom.discoverBar);
      hide(dom.filterBar);
      dom.videoGrid.innerHTML = '';
      hide(dom.emptyState);
      hide(dom.loadMoreWrapper);
      
      // If we already have a discover search, show it. Otherwise wait for user search.
      if (dom.discoverInput.value.trim()) {
        performYoutubeSearch();
      }
    } else {
      state.searchMode = 'filter';
      hide(dom.discoverBar);
      show(dom.filterBar);
      dom.filterBar.classList.remove('mobile-open'); // Close filters on mobile when switching playlists
      await loadPlaylistVideos();
    }
  }

  // ---- Videos ----
  async function loadPlaylistVideos(pageToken = '', isSilent = false) {
    if (state.isLoading && !isSilent) return;
    
    if (!isSilent) {
      state.isLoading = true;
      show(dom.loadingSpinner);
      hide(dom.emptyState);
      hide(dom.loadMoreWrapper);
      if (!pageToken) dom.videoGrid.innerHTML = '';
    }

    try {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${state.activePlaylistId}&maxResults=${CONFIG.MAX_RESULTS}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = await apiFetch(url);
      const nextPageToken = data.nextPageToken || null;

      // Extract video IDs to get durations + categories
      const videoIds = data.items
        .map((item) => item.contentDetails?.videoId || item.snippet?.resourceId?.videoId)
        .filter(Boolean);

      let videoDetails = {};
      if (videoIds.length > 0) {
        const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(',')}&maxResults=${CONFIG.MAX_RESULTS}`;
        const detailData = await apiFetch(detailUrl);
        detailData.items.forEach((v) => {
          videoDetails[v.id] = {
            duration: parseDuration(v.contentDetails.duration),
            durationISO: v.contentDetails.duration,
            categoryId: v.snippet.categoryId,
            description: v.snippet.description || '',
            tags: v.snippet.tags || [],
          };
        });
      }

      // Merge data
      const newVideos = data.items
        .filter((item) => {
          const vid = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
          return vid && videoDetails[vid];
        })
        .map((item) => {
          const vid = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
          const detail = videoDetails[vid];
          const catName = YT_CATEGORIES[detail.categoryId] || 'Other';
          
          const isPod = isPodcast(item.snippet.title, item.snippet.videoOwnerChannelTitle || '', detail.duration);

          return {
            id: vid,
            title: item.snippet.title,
            channel: item.snippet.videoOwnerChannelTitle || '',
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            addedAt: item.snippet.publishedAt,
            duration: detail.duration,
            durationFormatted: formatDuration(detail.duration),
            category: catName,
            isPodcast: isPod,
            description: detail.description,
            tags: detail.tags || [],
          };
        });

      if (isSilent) {
        // For silent refresh, we currently only refresh the "first page" to stay simple
        // OR we could merge into existing state. Let's just update the top part for now.
        // Actually, to be safe and avoid state mismatch, let's keep it simple: 
        // if silent, we replace the whole array with this new chunk (which works if only viewing 1st page)
        // A better silent refresh would need to handle all loaded pages.
        state.allVideos = newVideos;
        // Re-detect categories from this chunk
        state.detectedCategories = new Set(newVideos.map(v => v.category));
      } else {
        if (!pageToken) {
          state.allVideos = newVideos;
          state.detectedCategories = new Set(newVideos.map(v => v.category));
        } else {
          state.allVideos.push(...newVideos);
          newVideos.forEach(v => state.detectedCategories.add(v.category));
        }
      }

      state.nextPageToken = nextPageToken;
      renderCategoryChips();
      applyFilters();

    } catch (e) {
      console.error('Video load error:', e);
      if (!isSilent) showToast('Failed to load videos.', 'error');
    } finally {
      if (!isSilent) {
        state.isLoading = false;
        hide(dom.loadingSpinner);
      }
    }
  }

  function renderCategoryChips() {
    const existing = dom.categoryChips.querySelectorAll('[data-category]:not([data-category="all"])');
    existing.forEach((el) => el.remove());

    [...state.detectedCategories].sort().forEach((cat) => {
      const btn = document.createElement('button');
      btn.className = 'chip' + (state.categoryFilter === cat ? ' active' : '');
      btn.dataset.category = cat;
      btn.textContent = cat;
      dom.categoryChips.appendChild(btn);
    });
  }

  // ---- Filters & YouTube Search ----
  async function performYoutubeSearch() {
    const query = dom.discoverInput.value.trim();
    if (!query) {
      state.ytSearchResults = [];
      applyFilters();
      return;
    }
    
    state.searchQuery = query; // keep in sync
    state.isLoading = true;
    show(dom.loadingSpinner);
    hide(dom.emptyState);
    hide(dom.loadMoreWrapper);
    dom.videoGrid.innerHTML = '';
    
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=24&order=relevance`;
      const data = await apiFetch(url);
      
      const videoIds = data.items.map(item => item.id.videoId).filter(Boolean);
      let videoDetails = {};
      
      if (videoIds.length > 0) {
        const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds.join(',')}&maxResults=50`;
        const detailData = await apiFetch(detailUrl);
        detailData.items.forEach((v) => {
          videoDetails[v.id] = {
            duration: parseDuration(v.contentDetails.duration),
            categoryId: v.snippet.categoryId,
            description: v.snippet.description || '',
          };
        });
      }

      state.ytSearchResults = data.items.map(item => {
        const vid = item.id.videoId;
        const detail = videoDetails[vid] || { duration: 0, categoryId: '24', description: '' };
        const catName = YT_CATEGORIES[detail.categoryId] || 'Other';
        
        return {
          id: vid,
          title: item.snippet.title,
          channel: item.snippet.channelTitle || '',
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || '',
          addedAt: item.snippet.publishedAt,
          duration: detail.duration,
          durationFormatted: formatDuration(detail.duration),
          category: catName,
          isPodcast: false, // simplified for search
          description: detail.description,
          tags: [],
        };
      });
      
    } catch (e) {
      console.error('YouTube Search error:', e);
      showToast('Search failed. Check your connection or API limit.', 'error');
    } finally {
      state.isLoading = false;
      hide(dom.loadingSpinner);
      applyFilters(); // will render ytSearchResults
    }
  }

  function openPlaylistModal(videoId, btnEl) {
    videoToAdd = videoId;
    btnToAdd = btnEl;
    
    dom.modalPlaylistList.innerHTML = '';
    
    const validPlaylists = state.playlists.filter(p => p.id !== 'LL');
    
    if (validPlaylists.length === 0) {
      dom.modalPlaylistList.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">You don\'t have any playlists to add to.</p>';
    } else {
      validPlaylists.forEach(pl => {
        const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
        const item = document.createElement('div');
        item.className = 'modal-playlist-item';
        item.innerHTML = `
          <img class="modal-playlist-thumb" src="${thumb}" alt="" />
          <span class="modal-playlist-title">${escHtml(pl.snippet.title)}</span>
        `;
        item.addEventListener('click', () => {
          hide(dom.playlistModal);
          const tagsStr = dom.playlistModalTags.value;
          addToPlaylist(videoId, pl.id, btnEl, tagsStr);
        });
        dom.modalPlaylistList.appendChild(item);
      });
    }
    
    dom.playlistModalTags.value = '';
    show(dom.playlistModal);
  }

  async function addToPlaylist(videoId, playlistId, btnEl, tagsStr = '') {
    const originalText = btnEl.innerHTML;
    btnEl.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;"></div>';
    btnEl.disabled = true;

    try {
      const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            playlistId: playlistId,
            resourceId: {
              kind: 'youtube#video',
              videoId: videoId
            }
          }
        })
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      showToast('Added to playlist successfully!');
      btnEl.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Added';
      btnEl.style.background = 'var(--green)';

      // Process tags if provided
      const tags = parseTags(tagsStr);
      if (tags.length > 0) {
        state.videoTags[videoId] = tags;
        localStorage.setItem('yt_explorer_tags', JSON.stringify(state.videoTags));
      }
      
      // Trigger a silent refresh of playlists and current view
      silentRefresh();
      
    } catch (e) {
      console.error('Error adding to playlist:', e);
      showToast('Failed to add video. Make sure you have permission.', 'error');
      btnEl.innerHTML = originalText;
      btnEl.disabled = false;
    }
  }

  async function silentRefresh() {
    if (!state.accessToken) return;
    
    try {
      // ONLY refresh playlists silently to avoid replacing currently viewing videos
      await fetchPlaylists('', true);
      
    } catch (e) {
      console.error('Silent refresh failed:', e);
    }
  }

  // Token auto-refresh — show login screen when token is about to expire,
  // so user can click once to renew without losing where they are.
  let tokenRefreshTimer = null;
  function setupTokenRefresh(expiresAt) {
    if (tokenRefreshTimer) clearTimeout(tokenRefreshTimer);
    if (!expiresAt) {
      try {
        const raw = localStorage.getItem('yt_explorer_session');
        if (raw) expiresAt = JSON.parse(raw).expiresAt;
      } catch(e) {}
    }
    if (!expiresAt) return;
    
    const timeUntilExpiry = expiresAt - Date.now();
    // Warn the user 5 minutes before the token expires
    const warnAt = timeUntilExpiry - 5 * 60 * 1000;
    
    if (warnAt > 0) {
      tokenRefreshTimer = setTimeout(() => {
        showToast('Your session will expire in 5 minutes.', 'success');
        
        // After another 5 minutes, force logout
        setTimeout(() => {
          if (state.accessToken) {
            state.accessToken = null;
            localStorage.removeItem('yt_explorer_session');
            localStorage.setItem('yt_explorer_is_logged_in', 'false');
            show(dom.loginOverlay);
            hide(dom.app);
          }
        }, 5 * 60 * 1000);
      }, warnAt);
    } else if (timeUntilExpiry > 0) {
      // Already in the warning window
      console.warn('Token expires very soon.');
    }
  }

  function applyFilters() {
    let videos = state.searchMode === 'youtube' ? [...state.ytSearchResults] : [...state.allVideos];

    // Search (only if local filtering)
    if (state.searchQuery && state.searchMode === 'filter') {
      const q = state.searchQuery.toLowerCase();
      videos = videos.filter((v) =>
        v.title.toLowerCase().includes(q) ||
        v.channel.toLowerCase().includes(q) ||
        v.description.toLowerCase().includes(q)
      );
    }

    // Duration
    if (state.durationFilter !== 'all') {
      videos = videos.filter((v) => {
        switch (state.durationFilter) {
          case 'short': return v.duration < 240;
          case 'medium': return v.duration >= 240 && v.duration < 1200;
          case 'long': return v.duration >= 1200 && v.duration < 3600;
          case 'movie': return v.duration >= 3600;
          default: return true;
        }
      });
    }

    // Date
    if (state.dateFilter !== 'all') {
      const now = Date.now();
      videos = videos.filter((v) => {
        const added = new Date(v.addedAt).getTime();
        switch (state.dateFilter) {
          case 'week': return now - added <= 7 * 86400000;
          case 'month': return now - added <= 30 * 86400000;
          case '3months': return now - added <= 90 * 86400000;
          case 'year': return now - added <= 365 * 86400000;
          case 'custom': {
            if (state.customDateFrom && added < new Date(state.customDateFrom).getTime()) return false;
            if (state.customDateTo && added > new Date(state.customDateTo).getTime() + 86400000) return false;
            return true;
          }
          default: return true;
        }
      });
    }

    // Category
    if (state.categoryFilter !== 'all') {
      videos = videos.filter((v) => v.category === state.categoryFilter);
    }

    // Content Type (Podcast/Video)
    if (state.typeFilter !== 'all') {
      videos = videos.filter((v) => state.typeFilter === 'podcast' ? v.isPodcast : !v.isPodcast);
    }

    // Watched Status
    if (state.watchedFilter !== 'all') {
      videos = videos.filter((v) => {
        const watched = state.watchedVideos.has(v.id);
        return state.watchedFilter === 'watched' ? watched : !watched;
      });
    }

    // Keywords and Custom Tags
    if (state.keywords.trim()) {
      const kws = state.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      videos = videos.filter((v) => {
        const customTags = state.videoTags[v.id] || [];
        const text = (v.title + ' ' + v.description + ' ' + v.tags.join(' ') + ' ' + customTags.join(' ')).toLowerCase();
        return kws.some((kw) => text.includes(kw));
      });
    }

    // Sort
    videos = sortVideos(videos);

    state.filteredVideos = videos;
    renderVideos();
    updateActiveFilterTags();
    dom.resultsCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''} found`;

    if (state.searchMode === 'youtube') {
      hide(dom.loadMoreWrapper); // basic search doesn't implement pagination yet
    } else {
      if (state.nextPageToken) {
        show(dom.loadMoreWrapper);
      } else {
        hide(dom.loadMoreWrapper);
      }
    }

    if (videos.length === 0 && (state.allVideos.length > 0 || state.searchMode === 'youtube')) {
      show(dom.emptyState);
    } else {
      hide(dom.emptyState);
    }
  }

  function sortVideos(videos) {
    const copy = [...videos];
    switch (state.sortBy) {
      case 'dateDesc': return copy.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
      case 'dateAsc': return copy.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
      case 'titleAsc': return copy.sort((a, b) => a.title.localeCompare(b.title));
      case 'titleDesc': return copy.sort((a, b) => b.title.localeCompare(a.title));
      case 'durationAsc': return copy.sort((a, b) => a.duration - b.duration);
      case 'durationDesc': return copy.sort((a, b) => b.duration - a.duration);
      case 'channelAsc': return copy.sort((a, b) => a.channel.localeCompare(b.channel));
      default: return copy;
    }
  }

  function renderVideos() {
    dom.videoGrid.innerHTML = '';
    state.filteredVideos.forEach((v, i) => {
      const isWatched = state.watchedVideos.has(v.id);
      const customTags = state.videoTags[v.id] || [];
      const hasTags = customTags.length > 0;
      
      const tagsHtml = hasTags 
        ? `<div class="video-tags-container">
            ${customTags.map(t => `<span class="video-custom-tag">${escHtml(t)}</span>`).join('')}
           </div>`
        : '';
        
      const card = document.createElement('div');
      card.className = 'video-card' + (isWatched ? ' watched' : '');
      card.style.animationDelay = `${Math.min(i, 8) * 0.05}s`;
      card.innerHTML = `
        <div class="video-thumb-wrapper">
          <button class="btn-tag-video ${hasTags ? 'has-tags' : ''}" title="Edit Tags">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01"/></svg>
          </button>
          <img class="video-thumb" src="${v.thumbnail}" alt="${escHtml(v.title)}" loading="lazy" />
          ${isWatched ? '<span class="watched-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Watched</span>' : ''}
          <span class="video-duration-badge">${v.durationFormatted}</span>
          ${state.searchMode === 'filter' 
            ? `<button class="btn-mark-watched ${isWatched ? 'is-watched' : ''}" title="Mark as ${isWatched ? 'Unwatched' : 'Watched'}">
                <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
               </button>`
            : `<button class="btn-add-playlist" data-vid="${v.id}" title="Add to Playlist">
                 <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add
               </button>`
          }
          <div class="video-play-overlay">
            <div class="play-btn-circle">
              <svg width="22" height="22" fill="#fff" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
        <div class="video-info">
          <div class="video-title" title="${escHtml(v.title)}">${escHtml(v.title)}</div>
          <div class="video-channel">${escHtml(v.channel)}</div>
          <div class="video-meta-row">
            <span>${timeAgo(v.addedAt)}</span>
            <span class="video-category-badge">${escHtml(v.category)}</span>
            ${v.isPodcast ? '<span class="video-category-badge" style="background:rgba(168,85,247,0.12);color:var(--purple);">Podcast</span>' : ''}
          </div>
          ${tagsHtml}
        </div>
      `;

      // Video click handling
      const playBtn = card.querySelector('.video-play-overlay');
      const thumbWrap = card.querySelector('.video-thumb');
      const title = card.querySelector('.video-title');
      
      const openVideo = () => window.open(`https://www.youtube.com/watch?v=${v.id}`, '_blank');
      playBtn.addEventListener('click', openVideo);
      thumbWrap.addEventListener('click', openVideo);
      title.addEventListener('click', openVideo);

      // Watched / Add toggle logic
      if (state.searchMode === 'filter') {
        const watchBtn = card.querySelector('.btn-mark-watched');
        if (watchBtn) {
          watchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleWatched(v.id);
            applyFilters(); 
          });
        }
      } else {
        const addBtn = card.querySelector('.btn-add-playlist');
        if (addBtn) {
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openPlaylistModal(v.id, addBtn);
          });
        }
      }

      // Tag Video Logic
      const tagBtn = card.querySelector('.btn-tag-video');
      tagBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTagModal(v.id);
      });

      dom.videoGrid.appendChild(card);
    });
  }

  // ---- Tagging Modals ----
  let videoToTagId = null;
  function openTagModal(videoId) {
    videoToTagId = videoId;
    const currentTags = state.videoTags[videoId] || [];
    dom.tagInput.value = currentTags.join(', ');
    show(dom.tagModal);
    setTimeout(() => dom.tagInput.focus(), 100);
  }

  function saveTags() {
    if (!videoToTagId) return;
    const tags = parseTags(dom.tagInput.value);
    
    if (tags.length === 0) {
      delete state.videoTags[videoToTagId];
    } else {
      state.videoTags[videoToTagId] = tags;
    }
    
    localStorage.setItem('yt_explorer_tags', JSON.stringify(state.videoTags));
    hide(dom.tagModal);
    applyFilters(); // Re-render to show new tags and re-apply filters if needed
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function resetFilters() {
    state.searchQuery = '';
    state.durationFilter = 'all';
    state.dateFilter = 'all';
    state.customDateFrom = null;
    state.customDateTo = null;
    state.categoryFilter = 'all';
    state.typeFilter = 'all';
    state.watchedFilter = 'all';
    state.keywords = '';
    state.sortBy = 'dateDesc';

    dom.searchInput.value = '';
    hide(dom.btnClearSearch);
    dom.keywordInput.value = '';
    dom.sortSelect.value = 'dateDesc';
    dom.dateFrom.value = '';
    dom.dateTo.value = '';
    hide(dom.customDateRange);

    // Reset chip states
    setActiveChip(dom.durationChips, 'all');
    setActiveChip(dom.dateChips, 'all');
    setActiveChip(dom.categoryChips, 'all');
    setActiveChip(dom.typeChips, 'all');
    setActiveChip(dom.watchedChips, 'all');
  }

  function setActiveChip(container, value) {
    container.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('active', c.dataset.duration === value || c.dataset.date === value || c.dataset.category === value);
    });
  }

  function updateActiveFilterTags() {
    const tags = [];

    if (state.searchQuery) tags.push({ label: `Search: "${state.searchQuery}"`, clear: () => { state.searchQuery = ''; dom.searchInput.value = ''; hide(dom.btnClearSearch); } });
    if (state.durationFilter !== 'all') tags.push({ label: `Duration: ${state.durationFilter}`, clear: () => { state.durationFilter = 'all'; setActiveChip(dom.durationChips, 'all'); } });
    if (state.dateFilter !== 'all') {
      let label = `Date: ${state.dateFilter}`;
      if (state.dateFilter === 'custom') {
        label = `Date: ${state.customDateFrom || '...'} → ${state.customDateTo || '...'}`;
      }
      tags.push({ label, clear: () => { state.dateFilter = 'all'; state.customDateFrom = null; state.customDateTo = null; setActiveChip(dom.dateChips, 'all'); hide(dom.customDateRange); } });
    }
    if (state.categoryFilter !== 'all') tags.push({ label: `Category: ${state.categoryFilter}`, clear: () => { state.categoryFilter = 'all'; setActiveChip(dom.categoryChips, 'all'); } });
    if (state.typeFilter !== 'all') tags.push({ label: `Type: ${state.typeFilter}`, clear: () => { state.typeFilter = 'all'; setActiveChip(dom.typeChips, 'all'); } });
    if (state.watchedFilter !== 'all') tags.push({ label: `Status: ${state.watchedFilter}`, clear: () => { state.watchedFilter = 'all'; setActiveChip(dom.watchedChips, 'all'); } });
    if (state.keywords.trim()) tags.push({ label: `Keywords: ${state.keywords}`, clear: () => { state.keywords = ''; dom.keywordInput.value = ''; } });

    if (tags.length === 0) {
      hide(dom.activeFilters);
      return;
    }

    show(dom.activeFilters);
    dom.activeFilterTags.innerHTML = '';
    tags.forEach((t) => {
      const span = document.createElement('span');
      span.className = 'filter-tag';
      span.innerHTML = `${escHtml(t.label)} <span class="filter-tag-remove">✕</span>`;
      span.querySelector('.filter-tag-remove').addEventListener('click', () => {
        t.clear();
        applyFilters();
      });
      dom.activeFilterTags.appendChild(span);
    });
  }

  // ---- Event Listeners ----
  function bindEvents() {
    // Sidebar toggle
    dom.sidebarToggle.addEventListener('click', () => {
      if (window.innerWidth <= 1024) {
        dom.sidebar.classList.toggle('open');
      } else {
        dom.sidebar.classList.toggle('collapsed');
      }
    });

    // Discover Sub-header Search
    const triggerDiscover = () => {
      performYoutubeSearch();
    };
    
    dom.btnSearchDiscover.addEventListener('click', triggerDiscover);
    
    dom.discoverInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerDiscover();
    });
    
    dom.discoverInput.addEventListener('input', () => {
      dom.btnClearDiscover.classList.toggle('hidden', !dom.discoverInput.value.trim());
    });
    
    dom.btnClearDiscover.addEventListener('click', () => {
      dom.discoverInput.value = '';
      hide(dom.btnClearDiscover);
      dom.discoverInput.focus();
    });

    // Local Search Input
    const debouncedSearch = debounce(() => {
      state.searchQuery = dom.searchInput.value.trim();
      dom.btnClearSearch.classList.toggle('hidden', !state.searchQuery);
      
      if (state.searchMode === 'youtube') {
         // Should not happen as input is cleared, but just in case
      } else {
        applyFilters();
      }
    }, 500);
    dom.searchInput.addEventListener('input', debouncedSearch);

    dom.btnClearSearch.addEventListener('click', () => {
      dom.searchInput.value = '';
      state.searchQuery = '';
      hide(dom.btnClearSearch);
      applyFilters();
    });

    // Duration chips
    dom.durationChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.durationFilter = chip.dataset.duration;
      setActiveChip(dom.durationChips, chip.dataset.duration);
      applyFilters();
    });

    // Date chips
    dom.dateChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.dateFilter = chip.dataset.date;
      setActiveChip(dom.dateChips, chip.dataset.date);

      if (chip.dataset.date === 'custom') {
        show(dom.customDateRange);
      } else {
        hide(dom.customDateRange);
        state.customDateFrom = null;
        state.customDateTo = null;
        applyFilters();
      }
    });

    // Custom date apply
    dom.btnApplyDate.addEventListener('click', () => {
      state.customDateFrom = dom.dateFrom.value || null;
      state.customDateTo = dom.dateTo.value || null;
      applyFilters();
    });

    // Category chips (delegated because they're dynamic)
    dom.categoryChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.categoryFilter = chip.dataset.category;
      setActiveChip(dom.categoryChips, chip.dataset.category);
      applyFilters();
    });

    // Content Type 
    dom.typeChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.typeFilter = chip.dataset.type;
      setActiveChip(dom.typeChips, chip.dataset.type);
      applyFilters();
    });

    // Watched Status
    dom.watchedChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      state.watchedFilter = chip.dataset.watched;
      setActiveChip(dom.watchedChips, chip.dataset.watched);
      applyFilters();
    });

    // Keywords
    const debouncedKeywords = debounce(() => {
      state.keywords = dom.keywordInput.value;
      applyFilters();
    }, 400);
    dom.keywordInput.addEventListener('input', debouncedKeywords);

    // Sort
    dom.sortSelect.addEventListener('change', () => {
      state.sortBy = dom.sortSelect.value;
      applyFilters();
    });

    // Clear all filters
    dom.btnClearFilters.addEventListener('click', () => {
      resetFilters();
      applyFilters();
    });

    // Load more
    dom.btnLoadMore.addEventListener('click', () => {
      if (state.nextPageToken) {
        loadPlaylistVideos(state.nextPageToken);
      }
    });

    // Mobile nav
    dom.mobileNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-btn');
      if (!btn) return;

      // Update active state
      dom.mobileNav.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.target;
      if (target === 'sidebar') {
        dom.sidebar.classList.add('open');
        window.scrollTo(0, 0);
      } else if (target === 'search') {
        dom.sidebar.classList.remove('open');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => dom.searchInput.focus(), 300);
      } else if (target === 'filters') {
        dom.sidebar.classList.remove('open');
        const filterEl = document.getElementById('filter-bar');
        if (filterEl) {
          filterEl.classList.toggle('mobile-open');
          if (filterEl.classList.contains('mobile-open')) {
             filterEl.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }
    });
    
    // Modal Close
    dom.btnCloseModal.addEventListener('click', () => {
      hide(dom.playlistModal);
    });
    
    dom.playlistModal.addEventListener('click', (e) => {
      if (e.target === dom.playlistModal) hide(dom.playlistModal);
    });

    // Follow Modal
    dom.btnFollowPlaylist.addEventListener('click', () => {
      show(dom.followModal);
      setTimeout(() => dom.followInput.focus(), 100);
    });
    
    dom.btnCloseFollowModal.addEventListener('click', () => {
      hide(dom.followModal);
    });
    
    dom.followModal.addEventListener('click', (e) => {
      if (e.target === dom.followModal) hide(dom.followModal);
    });
    
    dom.btnAddFollow.addEventListener('click', followPlaylist);
    dom.followInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') followPlaylist();
    });

    // Tag Modal
    dom.btnCloseTagModal.addEventListener('click', () => {
      hide(dom.tagModal);
    });
    
    dom.tagModal.addEventListener('click', (e) => {
      if (e.target === dom.tagModal) hide(dom.tagModal);
    });

    dom.btnSaveTags.addEventListener('click', saveTags);
    dom.tagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveTags();
    });
  }

  async function followPlaylist() {
    const input = dom.followInput.value.trim();
    if (!input) return;
    
    // Extract playlist ID from URL or assume it's an ID
    let playlistId = input;
    try {
      if (input.includes('youtube.com') || input.includes('youtu.be')) {
        const url = new URL(input);
        playlistId = url.searchParams.get('list') || input;
      }
    } catch(e) {}
    
    // Check if already followed or in user's own playlists
    if (state.playlists.some(p => p.id === playlistId) || state.followedPlaylists.some(p => p.id === playlistId)) {
      showToast('Playlist already in your sidebar', 'error');
      return;
    }
    
    const originalText = dom.btnAddFollow.innerHTML;
    dom.btnAddFollow.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;border-top-color:#fff;"></div>';
    dom.btnAddFollow.disabled = true;

    try {
      const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}`;
      const data = await apiFetch(url);
      
      if (!data.items || data.items.length === 0) {
        showToast('Playlist not found or is private.', 'error');
      } else {
        const pl = data.items[0];
        state.followedPlaylists.push(pl);
        localStorage.setItem('yt_explorer_followed', JSON.stringify(state.followedPlaylists));
        renderPlaylists();
        showToast('Playlist followed successfully!');
        hide(dom.followModal);
        dom.followInput.value = '';
      }
    } catch(e) {
      console.error('Error fetching playlist:', e);
      showToast('Failed to follow playlist. Check the link.', 'error');
    } finally {
      dom.btnAddFollow.innerHTML = originalText;
      dom.btnAddFollow.disabled = false;
    }
  }

  function unfollowPlaylist(playlistId) {
    state.followedPlaylists = state.followedPlaylists.filter(p => p.id !== playlistId);
    localStorage.setItem('yt_explorer_followed', JSON.stringify(state.followedPlaylists));
    renderPlaylists();
    if (state.activePlaylistId === playlistId) {
      if (state.playlists.length > 0) {
        // Fake a click on the first playlist item to select it
        const first = dom.sidebarList.querySelector('.playlist-item');
        if (first) first.click();
      }
    }
    showToast('Playlist removed');
  }

  // ---- Init ----
  function tryRestoreSession() {
    try {
      const raw = localStorage.getItem('yt_explorer_session');
      if (!raw) return false;
      const session = JSON.parse(raw);
      
      if (Date.now() > session.expiresAt) {
        // Token expired; clean up and show login
        localStorage.removeItem('yt_explorer_session');
        localStorage.setItem('yt_explorer_is_logged_in', 'false');
        return false;
      }
      
      state.accessToken = session.accessToken;
      return true;
    } catch {
      localStorage.removeItem('yt_explorer_session');
      return false;
    }
  }

  async function init() {
    bindEvents();

    const restored = tryRestoreSession();

    if (restored === true) {
      // Valid token — show the app immediately
      hide(dom.loginOverlay);
      show(dom.app);
      
      state.isInitialLoad = true;
      try {
        await Promise.all([fetchUserInfo(), fetchPlaylists()]);
      } catch(e) {
        console.warn('Initial data load failed (likely stale token).');
      }
      state.isInitialLoad = false;
      
      setupTokenRefresh();
    } else {
      state.isInitialLoad = false;
    }

    // Load Google Identity Services
    const checkGIS = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts?.oauth2) {
        clearInterval(checkGIS);
        initAuth();
      }
    }, 100);
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
