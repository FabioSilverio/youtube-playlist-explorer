/* =============================================
   YouTube Playlist Explorer — Application
   ============================================= */

(() => {
  'use strict';

  const DEFAULT_TRACKED_CHANNELS = [
    { id: 'UCnI_h3e6b5jGLfly2SY57SA', title: 'HasanAbi', handle: '@HasanAbi', group: 'Hasan' },
    { id: 'UCtoaZpBnrd0lhycxYJ4MNOQ', title: 'HasanAbi Archive', handle: '@HasanAbiArchivefan2', group: 'Hasan' },
    { id: 'UC1hW1iEFDsW-6V0zC8jqVQA', title: 'Hasan Reactions', handle: '@HasanReactionsfanTwo', group: 'Hasan' },
    { id: 'UCN7jo9su_7oDqwpfin8lgjw', title: 'Hasanabi Clips', handle: '@HasanabiClips', group: 'Hasan' },
    { id: 'UCBBQ9PIs8ARguuwVJZowGIg', title: 'Hasanabi Productions', handle: '@HasanabiProductionsfanchannel', group: 'Hasan' },
    { id: 'UCWE7noWEACLMziyBrQxlTgQ', title: 'Hasanabi Central', handle: '@HasanabiCentral1453', group: 'Hasan' },
    { id: 'UC6U-yoC2sJ_TA-OOcJ9PF9A', title: 'HASANABI Stream TW', handle: '@HASANABIStreamTW', group: 'Hasan' },
    { id: 'UCWHClDRLdVr2BeRS9b9sNZQ', title: 'Destiny', handle: '@destiny', group: 'Destiny' },
    { id: 'UC4aqtbSmF7jDxOeiD19eZCA', title: 'DesTiny Clipper', handle: '@dggfanboy', group: 'Destiny' },
    { id: 'UC554eY5jNUfDq3yDOJYirOQ', title: 'Last Night On Destiny', handle: '@LastNightOnDestiny', group: 'Destiny' },
    { id: 'UCRDQkGpuVCeMfqdrSGhk2Hg', title: 'DestinyVault', handle: '@DestinyVault', group: 'Destiny' },
    { id: 'UCUC1Y65XvU2n9lb6GvfAQ5g', title: 'Destiny DGG Clips', handle: '@DestinyDGGClips', group: 'Destiny' },
    { id: 'UCeRrWJtDH_NUXQAwzCYpf1w', title: 'DGG clips', handle: '@DGGclips', group: 'Destiny' },
    { id: 'UCNer6UYFzkD7n3JhE4vgjFQ', title: 'DGG_Clips', handle: '@DGG_Clips', group: 'Destiny' },
  ];

  function getInitialTrackedChannels() {
    try {
      const raw = localStorage.getItem('yt_explorer_tracked_channels');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Unable to read tracked channels from storage.', error);
    }

    localStorage.setItem('yt_explorer_tracked_channels', JSON.stringify(DEFAULT_TRACKED_CHANNELS));
    return DEFAULT_TRACKED_CHANNELS.map((channel) => ({ ...channel }));
  }

  function getInitialTrackedSeenAt() {
    const defaults = { All: 0, Hasan: 0, Destiny: 0, Custom: 0 };
    try {
      const raw = localStorage.getItem('yt_explorer_tracked_seen_at');
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...(parsed || {}) };
    } catch (error) {
      console.warn('Unable to read tracked seen timestamps.', error);
      return defaults;
    }
  }

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
    searchMode: 'filter', // 'filter' | 'youtube' | 'continue'
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
    pinnedPlaylists: JSON.parse(localStorage.getItem('yt_explorer_pinned_playlists') || '[]'),

    // Tracked channels feed
    trackedChannels: getInitialTrackedChannels(),
    trackedFeedVideos: [],
    activeTrackedGroup: 'All',
    trackedSeenAt: getInitialTrackedSeenAt(),
    trackedSeenBaseline: { All: 0, Hasan: 0, Destiny: 0, Custom: 0 },
    trackedNewCounts: { All: 0, Hasan: 0, Destiny: 0, Custom: 0 },

    // Custom Video Tags { "videoId": ["tag1", "tag2"] }
    videoTags: JSON.parse(localStorage.getItem('yt_explorer_tags') || '{}'),

    // Continue Watching state
    continueWatching: JSON.parse(localStorage.getItem('yt_explorer_continue') || '{}'),
    activeVideo: null,
    currentPlayerVideoId: null,
    player: null,
    playerApiReady: false,
    pendingPlayerVideo: null,
    playerProgressTimer: null,

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
    playerPanel: $('#player-panel'),
    playerMount: $('#youtube-player'),
    playerTitle: $('#player-title'),
    playerMeta: $('#player-meta'),
    playerProgress: $('#player-progress'),
    btnOpenYoutube: $('#btn-open-youtube'),
    btnClosePlayer: $('#btn-close-player'),
    videoGrid: $('#video-grid'),
    loadingSpinner: $('#loading-spinner'),
    emptyState: $('#empty-state'),
    emptyStateTitle: $('#empty-state-title'),
    emptyStateText: $('#empty-state-text'),
    welcomeState: $('#welcome-state'),
    loadMoreWrapper: $('#load-more-wrapper'),
    btnLoadMore: $('#btn-load-more'),
    
    toastContainer: $('#toast-container'),
    
    playlistModal: $('#playlist-modal'),
    modalPlaylistList: $('#modal-playlist-list'),
    playlistModalTags: $('#playlist-modal-tags'),
    btnCloseModal: $('#btn-close-modal'),

    btnFollowPlaylist: $('#btn-follow-playlist'),
    btnManageTracked: $('#btn-manage-tracked'),
    followModal: $('#follow-modal'),
    btnCloseFollowModal: $('#btn-close-follow-modal'),
    followInput: $('#follow-input'),
    btnAddFollow: $('#btn-add-follow'),

    trackedModal: $('#tracked-modal'),
    btnCloseTrackedModal: $('#btn-close-tracked-modal'),
    trackedInput: $('#tracked-input'),
    btnAddTracked: $('#btn-add-tracked'),
    btnResetTracked: $('#btn-reset-tracked'),
    trackedChannelList: $('#tracked-channel-list'),

    tagModal: $('#tag-modal'),
    btnCloseTagModal: $('#btn-close-tag-modal'),
    tagInput: $('#tag-input'),
    btnSaveTags: $('#btn-save-tags'),
  };

  // ---- State specific to adding videos ----
  let videoToAdd = null;
  let btnToAdd = null;
  let pendingAuthRequest = null;
  let silentRenewPromise = null;

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

  function chunkArray(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  function getUploadsPlaylistId(channelId) {
    return channelId && channelId.startsWith('UC') ? `UU${channelId.slice(2)}` : channelId;
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
      if (state.continueWatching[videoId]) {
        delete state.continueWatching[videoId];
        persistContinueWatching();
        renderPlaylists();
        if (state.activePlaylistId === 'CONTINUE_WATCHING') {
          state.allVideos = getContinueWatchingVideos();
          state.detectedCategories = new Set(state.allVideos.map((video) => video.category).filter(Boolean));
          renderCategoryChips();
        }
      }
    }
    persistWatchedVideos();
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

  function saveContinueProgress(video, progressSeconds) {
    if (!video || !video.id) return;

    const duration = video.duration || 0;
    const seconds = Math.max(0, Math.floor(progressSeconds || 0));
    const existing = state.continueWatching[video.id];

    if (duration && seconds >= Math.max(duration - 15, duration * 0.95)) {
      delete state.continueWatching[video.id];
      state.watchedVideos.add(video.id);
      persistWatchedVideos();
      persistContinueWatching();
      renderPlaylists();
      if (state.activePlaylistId === 'CONTINUE_WATCHING') {
        state.allVideos = getContinueWatchingVideos();
        state.detectedCategories = new Set(state.allVideos.map((entry) => entry.category).filter(Boolean));
        renderCategoryChips();
        applyFilters();
      }
      return;
    }

    if (seconds < 5 && !existing) return;

    state.continueWatching[video.id] = {
      ...existing,
      ...video,
      durationFormatted: video.durationFormatted || formatDuration(duration),
      progressSeconds: seconds,
      lastPlayedAt: Date.now(),
    };

    persistContinueWatching();

    if (!existing) {
      renderPlaylists();
    }

    if (state.activePlaylistId === 'CONTINUE_WATCHING') {
      state.allVideos = getContinueWatchingVideos();
      state.detectedCategories = new Set(state.allVideos.map((entry) => entry.category).filter(Boolean));
    }
  }

  function stopPlayerProgressTracking() {
    if (state.playerProgressTimer) {
      clearInterval(state.playerProgressTimer);
      state.playerProgressTimer = null;
    }
  }

  function syncPlayerProgress() {
    if (!state.player || !state.activeVideo) return;

    try {
      const currentTime = state.player.getCurrentTime ? state.player.getCurrentTime() : 0;
      const duration = state.player.getDuration ? state.player.getDuration() : state.activeVideo.duration || 0;

      if (duration && !state.activeVideo.duration) {
        state.activeVideo.duration = duration;
        state.activeVideo.durationFormatted = formatDuration(duration);
      }

      saveContinueProgress(state.activeVideo, currentTime);

      const progressEntry = getResumeEntry(state.activeVideo.id);
      if (progressEntry) {
        dom.playerProgress.textContent = formatResumeLabel(progressEntry.progressSeconds, duration || state.activeVideo.duration);
      } else if (state.watchedVideos.has(state.activeVideo.id)) {
        dom.playerProgress.textContent = 'Finished just now';
      } else {
        dom.playerProgress.textContent = '';
      }
    } catch (error) {
      console.warn('Unable to sync player progress.', error);
    }
  }

  function startPlayerProgressTracking() {
    stopPlayerProgressTracking();
    state.playerProgressTimer = setInterval(syncPlayerProgress, 5000);
  }

  function handlePlayerStateChange(event) {
    const playerState = window.YT?.PlayerState;
    if (!playerState) return;

    if (event.data === playerState.PLAYING) {
      startPlayerProgressTracking();
    } else if (event.data === playerState.PAUSED || event.data === playerState.BUFFERING) {
      syncPlayerProgress();
    } else if (event.data === playerState.ENDED) {
      syncPlayerProgress();
      stopPlayerProgressTracking();
    }
  }

  function closePlayer() {
    syncPlayerProgress();
    stopPlayerProgressTracking();
    if (state.player?.stopVideo) {
      state.player.stopVideo();
    }
    hide(dom.playerPanel);
  }

  function ensurePlayerApi() {
    if (window.YT?.Player) {
      state.playerApiReady = true;
      return;
    }

    if (!window.onYouTubeIframeAPIReady) {
      window.onYouTubeIframeAPIReady = () => {
        state.playerApiReady = true;
        if (state.pendingPlayerVideo) {
          const pending = state.pendingPlayerVideo;
          state.pendingPlayerVideo = null;
          openInlinePlayer(pending);
        }
      };
    }

    if (!document.querySelector('script[data-yt-api="true"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.dataset.ytApi = 'true';
      document.head.appendChild(script);
    }
  }

  function openInlinePlayer(video) {
    if (!video) return;

    state.activeVideo = { ...video };
    show(dom.playerPanel);
    dom.playerTitle.textContent = video.title;
    dom.playerMeta.textContent = [video.channel, video.category, video.durationFormatted].filter(Boolean).join(' • ');

    const resumeEntry = getResumeEntry(video.id);
    dom.playerProgress.textContent = resumeEntry
      ? formatResumeLabel(resumeEntry.progressSeconds, video.duration)
      : 'Starting from the beginning';

    ensurePlayerApi();
    if (!state.playerApiReady || !window.YT?.Player) {
      state.pendingPlayerVideo = video;
      return;
    }

    const startSeconds = resumeEntry?.progressSeconds || 0;
    state.currentPlayerVideoId = video.id;

    if (!state.player) {
      state.player = new window.YT.Player(dom.playerMount, {
        videoId: video.id,
        playerVars: {
          autoplay: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          start: startSeconds,
        },
        events: {
          onReady: () => {
            if (startSeconds > 0) {
              state.player.seekTo(startSeconds, true);
            }
            state.player.playVideo();
            startPlayerProgressTracking();
          },
          onStateChange: handlePlayerStateChange,
        },
      });
    } else {
      state.player.loadVideoById({
        videoId: video.id,
        startSeconds,
      });
      startPlayerProgressTracking();
    }

    dom.playerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function persistWatchedVideos() {
    localStorage.setItem('yt_explorer_watched', JSON.stringify([...state.watchedVideos]));
  }

  function persistTrackedChannels() {
    localStorage.setItem('yt_explorer_tracked_channels', JSON.stringify(state.trackedChannels));
  }

  function persistTrackedSeenAt() {
    localStorage.setItem('yt_explorer_tracked_seen_at', JSON.stringify(state.trackedSeenAt));
  }

  function persistContinueWatching() {
    localStorage.setItem('yt_explorer_continue', JSON.stringify(state.continueWatching));
  }

  function persistFollowedPlaylists() {
    localStorage.setItem('yt_explorer_followed', JSON.stringify(state.followedPlaylists));
  }

  function persistPinnedPlaylists() {
    localStorage.setItem('yt_explorer_pinned_playlists', JSON.stringify(state.pinnedPlaylists));
  }

  function persistSelectedVideo(video) {
    localStorage.setItem('yt_explorer_selected_video', JSON.stringify(video));
  }

  function refreshPlaybackStateFromStorage() {
    try {
      state.continueWatching = JSON.parse(localStorage.getItem('yt_explorer_continue') || '{}');
    } catch (error) {
      console.warn('Unable to refresh continue watching from storage.', error);
      state.continueWatching = {};
    }

    try {
      state.watchedVideos = new Set(JSON.parse(localStorage.getItem('yt_explorer_watched') || '[]'));
    } catch (error) {
      console.warn('Unable to refresh watched videos from storage.', error);
      state.watchedVideos = new Set();
    }

    renderPlaylists();

    if (!state.activePlaylistId) return;

    if (state.activePlaylistId === 'CONTINUE_WATCHING') {
      state.allVideos = getContinueWatchingVideos();
      state.detectedCategories = new Set(state.allVideos.map((video) => video.category).filter(Boolean));
      renderCategoryChips();
    }

    applyFilters();
  }

  function isPlaylistPinned(playlistId) {
    return state.pinnedPlaylists.includes(playlistId);
  }

  function togglePinnedPlaylist(playlistId) {
    if (!playlistId) return;

    if (isPlaylistPinned(playlistId)) {
      state.pinnedPlaylists = state.pinnedPlaylists.filter((id) => id !== playlistId);
      showToast('Playlist unpinned.');
    } else {
      state.pinnedPlaylists = [...state.pinnedPlaylists, playlistId];
      showToast('Playlist pinned for quick access.');
    }

    persistPinnedPlaylists();
    renderPlaylists();
  }

  function getContinueWatchingVideos() {
    return Object.values(state.continueWatching)
      .filter((video) => (video.progressSeconds || 0) > 0)
      .sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));
  }

  function getResumeEntry(videoId) {
    return state.continueWatching[videoId] || null;
  }

  function getResumePercent(video, resumeEntry = getResumeEntry(video.id)) {
    if (!resumeEntry || !video.duration) return 0;
    return Math.max(0, Math.min(100, (resumeEntry.progressSeconds / video.duration) * 100));
  }

  function formatResumeLabel(progressSeconds, durationSeconds) {
    const current = formatDuration(Math.max(0, Math.floor(progressSeconds || 0)));
    if (!durationSeconds) return `Continue from ${current}`;
    return `Continue from ${current} of ${formatDuration(Math.floor(durationSeconds))}`;
  }

  function updateEmptyState(title, text) {
    dom.emptyStateTitle.textContent = title;
    dom.emptyStateText.textContent = text;
  }

  function openWatchPage(video) {
    if (!video?.id) return;
    persistSelectedVideo(video);
    window.location.href = `watch.html?v=${encodeURIComponent(video.id)}`;
  }

  function getTrackedGroups() {
    const groups = [...new Set(state.trackedChannels.map((channel) => channel.group || 'Custom'))].sort();
    return ['All', ...groups];
  }

  function getTrackedVideosForActiveGroup() {
    if (state.activeTrackedGroup === 'All') {
      return [...state.trackedFeedVideos];
    }
    return state.trackedFeedVideos.filter((video) => (video.trackedGroup || 'Custom') === state.activeTrackedGroup);
  }

  function getTrackedBaselineForVideo(video) {
    if (state.activeTrackedGroup === 'All') {
      return state.trackedSeenBaseline.All || 0;
    }
    return state.trackedSeenBaseline[video.trackedGroup || 'Custom'] || 0;
  }

  function isTrackedVideoNew(video) {
    if (video.sourceType !== 'tracked') return false;
    const publishedAt = new Date(video.addedAt).getTime();
    const baseline = getTrackedBaselineForVideo(video);
    return publishedAt > baseline;
  }

  function markTrackedGroupSeen(group) {
    const now = Date.now();
    if (group === 'All') {
      state.trackedSeenAt.All = now;
      getTrackedGroups().filter((entry) => entry !== 'All').forEach((entry) => {
        state.trackedSeenAt[entry] = now;
      });
    } else {
      state.trackedSeenAt[group] = now;
    }
    persistTrackedSeenAt();
  }

  function recalculateTrackedNewCounts(videos, baseline = state.trackedSeenAt) {
    const counts = { All: 0 };
    getTrackedGroups().filter((group) => group !== 'All').forEach((group) => {
      counts[group] = 0;
    });

    videos.forEach((video) => {
      const publishedAt = new Date(video.addedAt).getTime();
      if (publishedAt > (baseline.All || 0)) {
        counts.All += 1;
      }

      const group = video.trackedGroup || 'Custom';
      if (!(group in counts)) counts[group] = 0;
      if (publishedAt > (baseline[group] || 0)) {
        counts[group] += 1;
      }
    });

    state.trackedNewCounts = counts;
  }

  function applyTrackedFeedSelection(markSeen = false) {
    state.allVideos = getTrackedVideosForActiveGroup();
    state.detectedCategories = new Set(state.allVideos.map((video) => video.category).filter(Boolean));
    state.nextPageToken = null;
    renderCategoryChips();
    applyFilters();

    if (markSeen) {
      markTrackedGroupSeen(state.activeTrackedGroup);
      renderPlaylists();
    }
  }

  function normalizeChannelReference(input) {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Enter a channel handle, URL, or channel ID.');
    }

    if (/^UC[\w-]{20,}$/.test(trimmed)) {
      return { kind: 'id', value: trimmed };
    }

    if (trimmed.startsWith('@')) {
      return { kind: 'handle', value: trimmed };
    }

    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0]?.startsWith('@')) {
        return { kind: 'handle', value: parts[0] };
      }
      if (parts[0] === 'channel' && parts[1]) {
        return { kind: 'id', value: parts[1] };
      }
    }

    throw new Error('Use a channel @handle, channel URL, or channel ID.');
  }

  function renderTrackedChannelsList() {
    dom.trackedChannelList.innerHTML = '';

    if (state.trackedChannels.length === 0) {
      dom.trackedChannelList.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">No tracked channels yet.</p>';
      return;
    }

    [...state.trackedChannels]
      .sort((a, b) => `${a.group}-${a.title}`.localeCompare(`${b.group}-${b.title}`))
      .forEach((channel) => {
        const row = document.createElement('div');
        row.className = 'tracked-channel-item';
        row.innerHTML = `
          <span class="tracked-channel-badge">${escHtml(channel.group || 'Feed')}</span>
          <div class="tracked-channel-meta">
            <div class="tracked-channel-title">${escHtml(channel.title)}</div>
            <div class="tracked-channel-handle">${escHtml(channel.handle || channel.id)}</div>
          </div>
          <button class="tracked-channel-remove" type="button">Remove</button>
        `;

        row.querySelector('.tracked-channel-remove').addEventListener('click', () => {
          removeTrackedChannel(channel.id);
        });

        dom.trackedChannelList.appendChild(row);
      });
  }

  function openTrackedModal() {
    renderTrackedChannelsList();
    dom.trackedInput.value = '';
    show(dom.trackedModal);
    setTimeout(() => dom.trackedInput.focus(), 100);
  }

  function closeTrackedModal() {
    hide(dom.trackedModal);
  }

  function removeTrackedChannel(channelId) {
    state.trackedChannels = state.trackedChannels.filter((channel) => channel.id !== channelId);
    if (!getTrackedGroups().includes(state.activeTrackedGroup)) {
      state.activeTrackedGroup = 'All';
    }
    persistTrackedChannels();
    renderTrackedChannelsList();
    renderPlaylists();

    fetchTrackedFeed({ background: state.activePlaylistId !== 'TRACKED_FEED' });
  }

  function resetTrackedChannels() {
    state.trackedChannels = DEFAULT_TRACKED_CHANNELS.map((channel) => ({ ...channel }));
    state.activeTrackedGroup = 'All';
    persistTrackedChannels();
    renderTrackedChannelsList();
    renderPlaylists();
    showToast('Tracked channels reset to defaults.');

    fetchTrackedFeed({ background: state.activePlaylistId !== 'TRACKED_FEED' });
  }

  async function lookupTrackedChannel(reference) {
    const url = reference.kind === 'id'
      ? `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(reference.value)}`
      : `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(reference.value.replace(/^@/, ''))}`;

    const data = await apiFetch(url);
    const channel = data.items?.[0];
    if (!channel) {
      throw new Error('Channel not found. Try a different handle or URL.');
    }

    const handle = channel.snippet.customUrl
      ? `@${channel.snippet.customUrl.replace(/^@/, '')}`
      : (reference.kind === 'handle' ? reference.value : channel.id);

    const title = channel.snippet.title || handle || channel.id;
    const lower = `${title} ${handle}`.toLowerCase();
    const group = lower.includes('hasan') ? 'Hasan' : lower.includes('destiny') || lower.includes('dgg') ? 'Destiny' : 'Custom';

    return {
      id: channel.id,
      title,
      handle,
      group,
    };
  }

  async function addTrackedChannel() {
    const raw = dom.trackedInput.value.trim();
    if (!raw) return;

    const originalLabel = dom.btnAddTracked.textContent;
    dom.btnAddTracked.disabled = true;
    dom.btnAddTracked.textContent = 'Adding...';

    try {
      const reference = normalizeChannelReference(raw);
      const channel = await lookupTrackedChannel(reference);
      if (state.trackedChannels.some((entry) => entry.id === channel.id)) {
        showToast('This channel is already tracked.', 'error');
        return;
      }

      state.trackedChannels.push(channel);
      persistTrackedChannels();
      renderTrackedChannelsList();
      renderPlaylists();
      dom.trackedInput.value = '';
      showToast(`Added ${channel.title} to tracked feed.`);

      fetchTrackedFeed({ background: state.activePlaylistId !== 'TRACKED_FEED' });
    } catch (error) {
      console.error('Add tracked channel failed:', error);
      showToast(error.message || 'Failed to add tracked channel.', 'error');
    } finally {
      dom.btnAddTracked.disabled = false;
      dom.btnAddTracked.textContent = originalLabel;
    }
  }

  // ---- Auth (Google Identity Services) ----
  let tokenClient;
  let tokenRefreshTimer = null;
  let tokenExpiryNoticeTimer = null;

  function initAuth() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: handleAuthResponse,
    });

    dom.btnLogin.addEventListener('click', () => {
      requestAccessToken({ interactive: true, prompt: 'select_account' }).catch(() => {});
    });

    dom.btnLogout.addEventListener('click', () => {
      stopTokenTimers();
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

  function stopTokenTimers() {
    if (tokenRefreshTimer) {
      clearTimeout(tokenRefreshTimer);
      tokenRefreshTimer = null;
    }
    if (tokenExpiryNoticeTimer) {
      clearTimeout(tokenExpiryNoticeTimer);
      tokenExpiryNoticeTimer = null;
    }
  }

  function requestAccessToken({ interactive = false, prompt = '' } = {}) {
    if (!tokenClient) {
      return Promise.reject(new Error('Google login is not ready yet.'));
    }

    return new Promise((resolve, reject) => {
      pendingAuthRequest = { interactive, resolve, reject };
      tokenClient.requestAccessToken({ prompt });
    });
  }

  async function renewAccessTokenSilently() {
    if (!state.accessToken || !tokenClient) return false;
    if (silentRenewPromise) return silentRenewPromise;

    silentRenewPromise = requestAccessToken({ interactive: false, prompt: '' })
      .then(() => true)
      .catch((error) => {
        console.warn('Silent renew failed:', error);
        return false;
      })
      .finally(() => {
        silentRenewPromise = null;
      });

    return silentRenewPromise;
  }

  function handleAuthResponse(resp) {
    const request = pendingAuthRequest;
    pendingAuthRequest = null;

    if (resp.error) {
      console.warn('Auth response error:', resp.error);
      if (request?.interactive) {
        state.accessToken = null;
        localStorage.removeItem('yt_explorer_session');
        localStorage.setItem('yt_explorer_is_logged_in', 'false');
        show(dom.loginOverlay);
        hide(dom.app);
      }
      request?.reject(new Error(resp.error));
      return;
    }

    state.accessToken = resp.access_token;
    localStorage.setItem('yt_explorer_is_logged_in', 'true');

    const expiresAt = Date.now() + (resp.expires_in || 3500) * 1000;
    localStorage.setItem('yt_explorer_session', JSON.stringify({
      accessToken: resp.access_token,
      expiresAt,
    }));

    setupTokenRefresh(expiresAt);

    hide(dom.loginOverlay);
    show(dom.app);
    request?.resolve(resp);

    if (request?.interactive) {
      fetchUserInfo();
      fetchPlaylists();
      fetchTrackedFeed({ background: true });
    }
  }

  function handleAuthExpiry() {
    state.accessToken = null;
    stopTokenTimers();
    localStorage.removeItem('yt_explorer_session');
    localStorage.setItem('yt_explorer_is_logged_in', 'false');
    
    if (dom.btnLogin) {
      const originalSVG = '<svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
      dom.btnLogin.innerHTML = originalSVG + ' Sign in with Google';
      dom.btnLogin.disabled = false;
    }
    
    show(dom.loginOverlay);
    hide(dom.app);
  }

  async function apiFetch(url, options = {}, hasRetriedAuth = false) {
    if (!state.accessToken) {
       console.warn("Attempted apiFetch without access token. Halting request.");
       throw new Error('No access token available.');
    }

    let res = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${state.accessToken}`, ...(options.headers || {}) },
    });

    if (res.status === 401 && !hasRetriedAuth) {
      const renewed = await renewAccessTokenSilently();
      if (renewed && state.accessToken) {
        res = await fetch(url, {
          ...options,
          headers: { Authorization: `Bearer ${state.accessToken}`, ...(options.headers || {}) },
        });
      }
    }

    if (res.status === 401) {
      console.warn("API returned 401 Unauthorized.");
      handleAuthExpiry();
      
      if (!state.isInitialLoad) {
        showToast("Session expired. Please log in again.", "error");
      }
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

  async function fetchTrackedFeed({ background = false } = {}) {
    if (state.isLoading) return;

    const baseline = { ...state.trackedSeenAt };

    if (!background) {
      state.isLoading = true;
      show(dom.loadingSpinner);
      hide(dom.emptyState);
      hide(dom.loadMoreWrapper);
      dom.videoGrid.innerHTML = '';
    }

    try {
      const perChannelLimit = 4;
      const feedResponses = await Promise.allSettled(
        state.trackedChannels.map(async (channel) => {
          const uploadsPlaylistId = getUploadsPlaylistId(channel.id);
          const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${perChannelLimit}`;
          const data = await apiFetch(url);
          return { channel, items: data.items || [] };
        })
      );

      const aggregated = [];
      feedResponses.forEach((result) => {
        if (result.status !== 'fulfilled') {
          console.warn('Tracked channel fetch failed:', result.reason);
          return;
        }

        const { channel, items } = result.value;
        items.forEach((item) => {
          const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
          if (!videoId) return;

          aggregated.push({
            id: videoId,
            title: item.snippet.title,
            channel: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || channel.title,
            thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
            addedAt: item.contentDetails?.videoPublishedAt || item.snippet.publishedAt,
            duration: 0,
            durationFormatted: '0:00',
            category: channel.group,
            isPodcast: false,
            description: '',
            tags: [],
            sourceType: 'tracked',
            trackedChannelId: channel.id,
            trackedChannelHandle: channel.handle,
            trackedGroup: channel.group,
          });
        });
      });

      const deduped = Array.from(new Map(aggregated.map((video) => [video.id, video])).values());
      const videoIds = deduped.map((video) => video.id).filter(Boolean);

      const detailMap = {};
      const detailChunks = chunkArray(videoIds, 50);
      for (const ids of detailChunks) {
        const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(',')}&maxResults=50`;
        const detailData = await apiFetch(detailUrl);
        (detailData.items || []).forEach((video) => {
          detailMap[video.id] = {
            duration: parseDuration(video.contentDetails.duration),
            description: video.snippet.description || '',
            categoryId: video.snippet.categoryId,
            tags: video.snippet.tags || [],
            channel: video.snippet.channelTitle || '',
          };
        });
      }

      const mergedVideos = deduped
        .map((video) => {
          const detail = detailMap[video.id] || null;
          const duration = detail?.duration || 0;
          const channelTitle = detail?.channel || video.channel;
          return {
            ...video,
            channel: channelTitle,
            duration,
            durationFormatted: formatDuration(duration),
            category: detail?.categoryId ? (YT_CATEGORIES[detail.categoryId] || video.trackedGroup || 'Other') : (video.trackedGroup || 'Other'),
            isPodcast: isPodcast(video.title, channelTitle, duration),
            description: detail?.description || '',
            tags: detail?.tags || [],
          };
        })
        .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

      state.trackedSeenBaseline = baseline;
      state.trackedFeedVideos = mergedVideos;
      recalculateTrackedNewCounts(mergedVideos, baseline);

      if (!background && state.activePlaylistId === 'TRACKED_FEED') {
        applyTrackedFeedSelection(true);
      } else {
        renderPlaylists();
      }
    } catch (error) {
      console.error('Tracked feed error:', error);
      if (!background) {
        showToast('Failed to load tracked channels feed.', 'error');
      }
    } finally {
      if (!background) {
        state.isLoading = false;
        hide(dom.loadingSpinner);
      }
    }
  }

  function renderPlaylists() {
    dom.sidebarList.innerHTML = '';
    const continueWatchingVideos = getContinueWatchingVideos();
    const trackedGroups = getTrackedGroups();
    const totalTrackedNew = state.trackedNewCounts.All || 0;
    const pinnedOrder = new Map(state.pinnedPlaylists.map((id, index) => [id, index]));

    const appendDivider = (label) => {
      const divider = document.createElement('div');
      divider.className = 'playlist-section-label';
      divider.textContent = label;
      dom.sidebarList.appendChild(divider);
    };

    const appendPlaylistEntry = (pl, { isFollowed = false } = {}) => {
      const thumb = pl.snippet.thumbnails?.medium?.url || pl.snippet.thumbnails?.default?.url || '';
      const count = pl.contentDetails?.itemCount || 0;
      const pinned = isPlaylistPinned(pl.id);

      const div = document.createElement('div');
      div.className = 'playlist-item' + (state.activePlaylistId === pl.id ? ' active' : '');
      div.innerHTML = `
        <img class="playlist-thumb" src="${thumb}" alt="" loading="lazy" />
        <div class="playlist-meta">
          <div class="playlist-title" title="${escHtml(pl.snippet.title)}">${escHtml(pl.snippet.title)}</div>
          <div class="playlist-video-count">${count} video${count !== 1 ? 's' : ''}</div>
        </div>
        <div class="playlist-actions">
          <button class="playlist-action-btn playlist-pin-btn ${pinned ? 'is-pinned' : ''}" title="${pinned ? 'Unpin playlist' : 'Pin playlist'}" data-action="pin" aria-label="${pinned ? 'Unpin playlist' : 'Pin playlist'}">
            <svg width="14" height="14" fill="${pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 17v5"/><path d="M5 8V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v4l-4 5v3H9v-3z"/></svg>
          </button>
          ${isFollowed ? `
            <button class="playlist-action-btn playlist-remove-btn" title="Unfollow playlist" data-action="remove" aria-label="Unfollow playlist">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          ` : ''}
        </div>
      `;

      div.querySelector('[data-action="pin"]').addEventListener('click', (e) => {
        e.stopPropagation();
        togglePinnedPlaylist(pl.id);
      });

      if (isFollowed) {
        div.querySelector('[data-action="remove"]').addEventListener('click', (e) => {
          e.stopPropagation();
          unfollowPlaylist(pl.id);
        });
      }

      div.addEventListener('click', () => selectPlaylist(pl.id, div));
      dom.sidebarList.appendChild(div);
    };

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

    const trackedItem = document.createElement('div');
    trackedItem.className = 'playlist-item' + (state.activePlaylistId === 'TRACKED_FEED' ? ' active' : '');
    trackedItem.innerHTML = `
      <div class="playlist-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg-card);">
        <svg width="20" height="20" fill="none" stroke="var(--accent)" stroke-width="2" viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M9 17h6"/></svg>
      </div>
      <div class="playlist-meta">
        <div class="playlist-title">Tracked Feed</div>
        <div class="playlist-video-count">${state.trackedChannels.length} channels monitored</div>
      </div>
      ${totalTrackedNew > 0 ? `<span class="feed-count-badge">${totalTrackedNew}</span>` : ''}
    `;
    trackedItem.addEventListener('click', () => selectTrackedFeedGroup('All', trackedItem));
    dom.sidebarList.appendChild(trackedItem);

    trackedGroups
      .filter((group) => group !== 'All')
      .forEach((group) => {
        const groupItem = document.createElement('div');
        groupItem.className = 'playlist-item tracked-group-item' + (state.activePlaylistId === 'TRACKED_FEED' && state.activeTrackedGroup === group ? ' active' : '');
        groupItem.innerHTML = `
          <div class="playlist-meta">
            <div class="playlist-title">${escHtml(group)}</div>
            <div class="playlist-video-count">${state.trackedChannels.filter((channel) => (channel.group || 'Custom') === group).length} channels</div>
          </div>
          ${(state.trackedNewCounts[group] || 0) > 0 ? `<span class="feed-count-badge">${state.trackedNewCounts[group]}</span>` : ''}
        `;
        groupItem.addEventListener('click', () => selectTrackedFeedGroup(group, groupItem));
        dom.sidebarList.appendChild(groupItem);
      });

    const continueItem = document.createElement('div');
    continueItem.className = 'playlist-item' + (state.activePlaylistId === 'CONTINUE_WATCHING' ? ' active' : '');
    continueItem.innerHTML = `
      <div class="playlist-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--bg-card);">
        <svg width="20" height="20" fill="none" stroke="var(--accent)" stroke-width="2" viewBox="0 0 24 24"><path d="M12 6v6l4 2"/><circle cx="12" cy="12" r="9"/></svg>
      </div>
      <div class="playlist-meta">
        <div class="playlist-title">Continue Watching</div>
        <div class="playlist-video-count">${continueWatchingVideos.length > 0 ? `${continueWatchingVideos.length} in progress` : 'Resume where you left off'}</div>
      </div>
    `;
    continueItem.addEventListener('click', () => selectPlaylist('CONTINUE_WATCHING', continueItem));
    dom.sidebarList.appendChild(continueItem);

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

    const pinnedEntries = state.pinnedPlaylists
      .map((playlistId) => {
        const own = state.playlists.find((playlist) => playlist.id === playlistId);
        if (own) return { playlist: own, isFollowed: false };

        const followed = state.followedPlaylists.find((playlist) => playlist.id === playlistId);
        if (followed) return { playlist: followed, isFollowed: true };

        return null;
      })
      .filter(Boolean)
      .sort((a, b) => (pinnedOrder.get(a.playlist.id) || 0) - (pinnedOrder.get(b.playlist.id) || 0));

    const ownPlaylists = state.playlists.filter((playlist) => !pinnedOrder.has(playlist.id));
    const followedPlaylists = state.followedPlaylists.filter((playlist) => !pinnedOrder.has(playlist.id));

    if (pinnedEntries.length > 0) {
      appendDivider('Pinned Playlists');
      pinnedEntries.forEach(({ playlist, isFollowed }) => appendPlaylistEntry(playlist, { isFollowed }));
    }

    ownPlaylists.forEach((playlist) => appendPlaylistEntry(playlist));

    if (followedPlaylists.length > 0) {
      appendDivider('Followed Playlists');
      followedPlaylists.forEach((playlist) => appendPlaylistEntry(playlist, { isFollowed: true }));
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
    } else if (playlistId === 'TRACKED_FEED') {
      state.searchMode = 'tracked';
      hide(dom.discoverBar);
      show(dom.filterBar);
      dom.filterBar.classList.remove('mobile-open');
      await fetchTrackedFeed();
    } else if (playlistId === 'CONTINUE_WATCHING') {
      state.searchMode = 'continue';
      hide(dom.discoverBar);
      show(dom.filterBar);
      dom.filterBar.classList.remove('mobile-open');
      state.allVideos = getContinueWatchingVideos();
      state.detectedCategories = new Set(state.allVideos.map((video) => video.category).filter(Boolean));
      renderCategoryChips();
      applyFilters();
    } else {
      state.searchMode = 'filter';
      hide(dom.discoverBar);
      show(dom.filterBar);
      dom.filterBar.classList.remove('mobile-open'); // Close filters on mobile when switching playlists
      await loadPlaylistVideos();
    }
  }

  async function selectTrackedFeedGroup(group, el) {
    state.activeTrackedGroup = group;
    await selectPlaylist('TRACKED_FEED', el);
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

  function setupTokenRefresh(expiresAt) {
    stopTokenTimers();
    if (!expiresAt) {
      try {
        const raw = localStorage.getItem('yt_explorer_session');
        if (raw) expiresAt = JSON.parse(raw).expiresAt;
      } catch(e) {}
    }
    if (!expiresAt) return;
    
    const timeUntilExpiry = expiresAt - Date.now();
    const renewAt = Math.max(30 * 1000, timeUntilExpiry - 10 * 60 * 1000);

    if (timeUntilExpiry <= 0) {
      handleAuthExpiry();
      return;
    }

    tokenRefreshTimer = setTimeout(async () => {
      const renewed = await renewAccessTokenSilently();
      if (!renewed) {
        const remaining = expiresAt - Date.now();
        if (remaining > 0) {
          tokenExpiryNoticeTimer = setTimeout(() => {
            showToast('Session expiring soon. If requests fail, click Sign in to renew.', 'error');
          }, Math.max(0, remaining - 60 * 1000));
        }
      }
    }, renewAt);
  }

  function applyFilters() {
    let videos = state.searchMode === 'youtube' ? [...state.ytSearchResults] : [...state.allVideos];

    // Search (only if local filtering)
    if (state.searchQuery && state.searchMode !== 'youtube') {
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
    const trackedNewVisible = state.activePlaylistId === 'TRACKED_FEED'
      ? videos.filter((video) => isTrackedVideoNew(video)).length
      : 0;
    dom.resultsCount.textContent = state.activePlaylistId === 'TRACKED_FEED'
      ? `${videos.length} video${videos.length !== 1 ? 's' : ''} found • ${trackedNewVisible} new since your last visit`
      : `${videos.length} video${videos.length !== 1 ? 's' : ''} found`;

    if (state.searchMode === 'youtube') {
      hide(dom.loadMoreWrapper); // basic search doesn't implement pagination yet
    } else {
      if (state.nextPageToken) {
        show(dom.loadMoreWrapper);
      } else {
        hide(dom.loadMoreWrapper);
      }
    }

    const shouldShowEmpty = videos.length === 0 && (
      state.allVideos.length > 0 ||
      state.searchMode === 'youtube' ||
      state.activePlaylistId === 'CONTINUE_WATCHING'
    );

    if (state.activePlaylistId === 'CONTINUE_WATCHING') {
      updateEmptyState(
        shouldShowEmpty ? 'Nothing queued right now' : 'No videos found',
        state.allVideos.length === 0
          ? 'Start a video here and we will save your place automatically.'
          : 'Try adjusting your filters or search terms.'
      );
    } else if (state.activePlaylistId === 'TRACKED_FEED') {
      updateEmptyState(
        shouldShowEmpty ? 'No fresh uploads yet' : 'No videos found',
        state.allVideos.length === 0
          ? 'The tracked feed is ready, but none of the monitored channels returned recent uploads yet.'
          : 'Try adjusting your filters or search terms.'
      );
    } else {
      updateEmptyState('No videos found', 'Try adjusting your filters or search terms.');
    }

    if (shouldShowEmpty) {
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
      const resumeEntry = getResumeEntry(v.id);
      const resumePercent = getResumePercent(v, resumeEntry);
      const isNewTrackedVideo = isTrackedVideoNew(v);
      
      const tagsHtml = hasTags 
        ? `<div class="video-tags-container">
            ${customTags.map(t => `<span class="video-custom-tag">${escHtml(t)}</span>`).join('')}
           </div>`
        : '';
      const progressHtml = resumeEntry && resumePercent > 0
        ? `
          <div class="video-progress-track">
            <span style="width:${resumePercent.toFixed(2)}%"></span>
          </div>
        `
        : '';
      const resumeHtml = resumeEntry
        ? `<div class="video-resume-note">${escHtml(formatResumeLabel(resumeEntry.progressSeconds, v.duration))}</div>`
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
          ${isNewTrackedVideo ? '<span class="video-new-badge">New</span>' : ''}
          ${isWatched ? '<span class="watched-badge"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> Watched</span>' : ''}
          <span class="video-duration-badge">${v.durationFormatted}</span>
          ${progressHtml}
          ${state.searchMode !== 'youtube' 
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
          ${resumeHtml}
          ${tagsHtml}
        </div>
      `;

      // Video click handling
      const playBtn = card.querySelector('.video-play-overlay');
      const thumbWrap = card.querySelector('.video-thumb');
      const title = card.querySelector('.video-title');
      
      const openVideo = () => openWatchPage(v);
      playBtn.addEventListener('click', openVideo);
      thumbWrap.addEventListener('click', openVideo);
      title.addEventListener('click', openVideo);

      // Watched / Add toggle logic
      if (state.searchMode !== 'youtube') {
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
      c.classList.toggle(
        'active',
        c.dataset.duration === value ||
        c.dataset.date === value ||
        c.dataset.category === value ||
        c.dataset.type === value ||
        c.dataset.watched === value
      );
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

    dom.btnOpenYoutube.addEventListener('click', () => {
      if (!state.activeVideo?.id) return;
      window.open(`https://www.youtube.com/watch?v=${state.activeVideo.id}`, '_blank', 'noopener');
    });

    dom.btnClosePlayer.addEventListener('click', closePlayer);

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

    dom.btnManageTracked.addEventListener('click', () => {
      openTrackedModal();
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

    dom.btnCloseTrackedModal.addEventListener('click', closeTrackedModal);
    dom.trackedModal.addEventListener('click', (e) => {
      if (e.target === dom.trackedModal) closeTrackedModal();
    });
    dom.btnAddTracked.addEventListener('click', addTrackedChannel);
    dom.trackedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTrackedChannel();
    });
    dom.btnResetTracked.addEventListener('click', resetTrackedChannels);

    window.addEventListener('pageshow', () => {
      refreshPlaybackStateFromStorage();
    });

    window.addEventListener('focus', () => {
      refreshPlaybackStateFromStorage();
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
        persistFollowedPlaylists();
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
    state.pinnedPlaylists = state.pinnedPlaylists.filter((id) => id !== playlistId);
    persistFollowedPlaylists();
    persistPinnedPlaylists();
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
        await fetchTrackedFeed({ background: true });
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
