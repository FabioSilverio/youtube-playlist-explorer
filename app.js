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

    // Filters
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
  };

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
      google.accounts.oauth2.revoke(state.accessToken, () => {
        state.accessToken = null;
        localStorage.removeItem('yt_explorer_session');
        show(dom.loginOverlay);
        hide(dom.app);
      });
    });
  }

  function handleAuthResponse(resp) {
    if (resp.error) {
      console.error('Auth error:', resp);
      return;
    }
    state.accessToken = resp.access_token;

    // Persist session
    const session = {
      accessToken: resp.access_token,
      expiresAt: Date.now() + (resp.expires_in || 3600) * 1000,
    };
    localStorage.setItem('yt_explorer_session', JSON.stringify(session));

    hide(dom.loginOverlay);
    show(dom.app);
    fetchUserInfo();
    fetchPlaylists();
  }

  async function apiFetch(url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${state.accessToken}` },
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
    return res.json();
  }

  async function fetchUserInfo() {
    try {
      const data = await apiFetch('https://www.googleapis.com/oauth2/v2/userinfo');
      state.user = data;
      dom.userAvatar.src = data.picture || '';
      dom.userName.textContent = data.name || data.email || '';
    } catch (e) {
      console.error('User info error:', e);
    }
  }

  // ---- Playlists ----
  async function fetchPlaylists(pageToken = '') {
    try {
      let url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=${CONFIG.MAX_RESULTS}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = await apiFetch(url);
      state.playlists.push(...data.items);
      dom.playlistCount.textContent = state.playlists.length;

      if (data.nextPageToken) {
        await fetchPlaylists(data.nextPageToken);
      }

      renderPlaylists();
    } catch (e) {
      console.error('Playlists error:', e);
    }
  }

  function renderPlaylists() {
    dom.sidebarList.innerHTML = '';

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
    await loadPlaylistVideos();
  }

  // ---- Videos ----
  async function loadPlaylistVideos(pageToken = '') {
    if (state.isLoading) return;
    state.isLoading = true;
    show(dom.loadingSpinner);
    hide(dom.emptyState);
    hide(dom.loadMoreWrapper);
    if (!pageToken) dom.videoGrid.innerHTML = '';

    try {
      let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${state.activePlaylistId}&maxResults=${CONFIG.MAX_RESULTS}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = await apiFetch(url);
      state.nextPageToken = data.nextPageToken || null;

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
          state.detectedCategories.add(catName);
          
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

      state.allVideos.push(...newVideos);

      // Update category chips
      renderCategoryChips();

      // Apply filters and render
      applyFilters();
    } catch (e) {
      console.error('Video load error:', e);
    } finally {
      state.isLoading = false;
      hide(dom.loadingSpinner);
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

  // ---- Filters ----
  function applyFilters() {
    let videos = [...state.allVideos];

    // Search
    if (state.searchQuery) {
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

    // Keywords
    if (state.keywords.trim()) {
      const kws = state.keywords.split(',').map((k) => k.trim().toLowerCase()).filter(Boolean);
      videos = videos.filter((v) => {
        const text = (v.title + ' ' + v.description + ' ' + v.tags.join(' ')).toLowerCase();
        return kws.some((kw) => text.includes(kw));
      });
    }

    // Sort
    videos = sortVideos(videos);

    state.filteredVideos = videos;
    renderVideos();
    updateActiveFilterTags();
    dom.resultsCount.textContent = `${videos.length} video${videos.length !== 1 ? 's' : ''} found`;

    if (state.nextPageToken) {
      show(dom.loadMoreWrapper);
    } else {
      hide(dom.loadMoreWrapper);
    }

    if (videos.length === 0 && state.allVideos.length > 0) {
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
      const card = document.createElement('div');
      card.className = 'video-card' + (isWatched ? ' watched' : '');
      card.style.animationDelay = `${Math.min(i, 8) * 0.05}s`;
      card.innerHTML = `
        <div class="video-thumb-wrapper">
          <img class="video-thumb" src="${v.thumbnail}" alt="${escHtml(v.title)}" loading="lazy" />
          ${isWatched ? '<span class="watched-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Watched</span>' : ''}
          <span class="video-duration-badge">${v.durationFormatted}</span>
          <button class="btn-mark-watched ${isWatched ? 'is-watched' : ''}" title="Mark as ${isWatched ? 'Unwatched' : 'Watched'}">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </button>
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

      // Watched toggle logic
      const watchBtn = card.querySelector('.btn-mark-watched');
      watchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWatched(v.id);
        applyFilters(); // Re-render to update badges & filters
      });

      dom.videoGrid.appendChild(card);
    });
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

    // Search
    const debouncedSearch = debounce(() => {
      state.searchQuery = dom.searchInput.value.trim();
      dom.btnClearSearch.classList.toggle('hidden', !state.searchQuery);
      applyFilters();
    }, 300);
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
        if (filterEl) filterEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // ---- Init ----
  function tryRestoreSession() {
    try {
      const raw = localStorage.getItem('yt_explorer_session');
      if (!raw) return false;
      const session = JSON.parse(raw);
      if (!session.accessToken || Date.now() > session.expiresAt) {
        localStorage.removeItem('yt_explorer_session');
        return false;
      }
      state.accessToken = session.accessToken;
      hide(dom.loginOverlay);
      show(dom.app);
      fetchUserInfo();
      fetchPlaylists();
      return true;
    } catch {
      localStorage.removeItem('yt_explorer_session');
      return false;
    }
  }

  function init() {
    bindEvents();

    // Try to restore previous session first
    const restored = tryRestoreSession();

    // Wait for Google Identity Services to load (needed for new logins or token refresh)
    const checkGIS = setInterval(() => {
      if (typeof google !== 'undefined' && google.accounts?.oauth2) {
        clearInterval(checkGIS);
        initAuth();

        // If session expired, set up silent re-auth
        if (!restored && !state.accessToken) {
          // User needs to click login
        }
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
