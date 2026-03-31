(() => {
  'use strict';

  const STORAGE_KEYS = {
    continueWatching: 'yt_explorer_continue',
    watchedVideos: 'yt_explorer_watched',
    selectedVideo: 'yt_explorer_selected_video',
    session: 'yt_explorer_session',
    watchPreferences: 'yt_explorer_watch_preferences',
  };

  const dom = {
    header: document.querySelector('.watch-header'),
    backButton: document.getElementById('btn-back'),
    cinemaButton: document.getElementById('btn-toggle-cinema'),
    youtubeButton: document.getElementById('btn-open-youtube-watch'),
    playerMount: document.getElementById('watch-player'),
    title: document.getElementById('watch-title'),
    channel: document.getElementById('watch-channel'),
    details: document.getElementById('watch-details'),
    progress: document.getElementById('watch-progress'),
    statusBadge: document.getElementById('watch-status-badge'),
    description: document.getElementById('watch-description'),
  };

  const state = {
    video: null,
    player: null,
    progressTimer: null,
    playerReady: false,
    theaterMode: false,
    layoutFrame: null,
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn(`Unable to read ${key}.`, error);
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  function parseDuration(isoDuration) {
    const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(isoDuration || '');
    if (!match) return 0;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  function timeAgo(value) {
    if (!value) return '';
    const now = Date.now();
    const date = new Date(value).getTime();
    if (Number.isNaN(date)) return '';

    const deltaSeconds = Math.max(1, Math.floor((now - date) / 1000));
    const units = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];

    for (const [label, size] of units) {
      const amount = Math.floor(deltaSeconds / size);
      if (amount >= 1) {
        return `${amount} ${label}${amount !== 1 ? 's' : ''} ago`;
      }
    }

    return 'Just now';
  }

  function formatResumeLabel(progressSeconds, duration) {
    if (!progressSeconds) return '';
    const current = formatDuration(progressSeconds);
    const total = duration ? ` of ${formatDuration(duration)}` : '';
    return `Resume from ${current}${total}`;
  }

  function getVideoIdFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v') || '';
  }

  function getSessionToken() {
    const session = readJson(STORAGE_KEYS.session, null);
    if (!session?.accessToken || !session?.expiresAt || Date.now() > session.expiresAt) {
      return null;
    }
    return session.accessToken;
  }

  function getSelectedVideo(videoId) {
    const selected = readJson(STORAGE_KEYS.selectedVideo, null);
    if (selected?.id === videoId) return selected;
    return null;
  }

  function getContinueEntry(videoId) {
    const continueWatching = readJson(STORAGE_KEYS.continueWatching, {});
    return continueWatching[videoId] || null;
  }

  async function fetchVideoMetadata(videoId) {
    const accessToken = getSessionToken();
    if (!accessToken || !videoId) return null;

    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Metadata request failed with status ${response.status}`);
      }

      const payload = await response.json();
      const item = payload.items?.[0];
      if (!item) return null;

      const duration = parseDuration(item.contentDetails?.duration);

      return {
        id: item.id,
        title: item.snippet?.title || 'YouTube video',
        channel: item.snippet?.channelTitle || 'YouTube',
        thumbnail: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
        addedAt: item.snippet?.publishedAt || '',
        duration,
        durationFormatted: formatDuration(duration),
        description: item.snippet?.description || 'No description available.',
        category: 'Video',
        isPodcast: false,
        tags: item.snippet?.tags || [],
      };
    } catch (error) {
      console.warn('Unable to fetch video metadata for watch page.', error);
      return null;
    }
  }

  async function resolveVideo(videoId) {
    const selected = getSelectedVideo(videoId);
    if (selected) return selected;

    const continueEntry = getContinueEntry(videoId);
    if (continueEntry) return continueEntry;

    const fetched = await fetchVideoMetadata(videoId);
    if (fetched) return fetched;

    if (!videoId) return null;

    return {
      id: videoId,
      title: 'YouTube video',
      channel: 'YouTube',
      thumbnail: '',
      addedAt: '',
      duration: 0,
      durationFormatted: '0:00',
      description: 'Open the video on YouTube if this page could not load its full metadata.',
      category: 'Video',
      isPodcast: false,
      tags: [],
    };
  }

  function persistSelectedVideo(video) {
    if (!video?.id) return;
    writeJson(STORAGE_KEYS.selectedVideo, video);
  }

  function getResumeSeconds(videoId) {
    const entry = getContinueEntry(videoId);
    return entry?.progressSeconds || 0;
  }

  function getWatchedSet() {
    return new Set(readJson(STORAGE_KEYS.watchedVideos, []));
  }

  function updateProgressUi() {
    if (!state.video) return;

    const continueEntry = getContinueEntry(state.video.id);
    const watchedVideos = getWatchedSet();

    if (continueEntry?.progressSeconds) {
      dom.progress.textContent = formatResumeLabel(continueEntry.progressSeconds, continueEntry.duration || state.video.duration);
      dom.statusBadge.textContent = 'In progress';
      dom.statusBadge.classList.remove('hidden');
      return;
    }

    if (watchedVideos.has(state.video.id)) {
      dom.progress.textContent = 'Finished';
      dom.statusBadge.textContent = 'Finished';
      dom.statusBadge.classList.remove('hidden');
      return;
    }

    dom.progress.textContent = '';
    dom.statusBadge.classList.add('hidden');
  }

  function renderVideoMeta() {
    if (!state.video) return;

    document.title = `${state.video.title} - YouTube Playlist Explorer`;
    dom.title.textContent = state.video.title || 'YouTube video';
    dom.channel.textContent = state.video.channel || 'YouTube';

    const detailParts = [];
    if (state.video.addedAt) {
      detailParts.push(timeAgo(state.video.addedAt));
    }
    if (state.video.duration || state.video.durationFormatted) {
      detailParts.push(state.video.durationFormatted || formatDuration(state.video.duration));
    }
    dom.details.textContent = detailParts.join(' | ');
    dom.description.textContent = state.video.description || 'No description available.';
    updateProgressUi();
  }

  function syncPlayerLayout() {
    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const headerHeight = dom.header?.offsetHeight || 0;
    const horizontalPadding = state.theaterMode ? 20 : 48;
    const verticalReserve = state.theaterMode ? headerHeight + 56 : headerHeight + 160;
    const maxWidth = state.theaterMode ? 2560 : 1920;
    const availableWidth = Math.max(320, viewportWidth - horizontalPadding);
    const availableHeight = Math.max(220, viewportHeight - verticalReserve);
    const widthFromHeight = availableHeight * (16 / 9);
    const targetWidth = Math.min(availableWidth, widthFromHeight, maxWidth);
    const targetHeight = Math.round(targetWidth * (9 / 16));

    document.documentElement.style.setProperty('--watch-player-width', `${Math.round(targetWidth)}px`);
    document.documentElement.style.setProperty('--watch-player-height', `${targetHeight}px`);
  }

  function schedulePlayerLayoutSync() {
    if (state.layoutFrame) {
      cancelAnimationFrame(state.layoutFrame);
    }

    state.layoutFrame = requestAnimationFrame(() => {
      state.layoutFrame = null;
      syncPlayerLayout();
    });
  }

  function setTheaterMode(enabled) {
    state.theaterMode = Boolean(enabled);
    document.body.classList.toggle('theater-mode', state.theaterMode);
    dom.cinemaButton.textContent = state.theaterMode ? 'Exit cinema mode' : 'Cinema mode';
    writeJson(STORAGE_KEYS.watchPreferences, {
      theaterMode: state.theaterMode,
    });
    schedulePlayerLayoutSync();
  }

  function saveContinueProgress(progressSeconds) {
    if (!state.video?.id) return;

    const duration = state.video.duration || 0;
    const seconds = Math.max(0, Math.floor(progressSeconds || 0));
    const continueWatching = readJson(STORAGE_KEYS.continueWatching, {});
    const existing = continueWatching[state.video.id];
    const watchedVideos = getWatchedSet();

    if (duration && seconds >= Math.max(duration - 15, duration * 0.95)) {
      delete continueWatching[state.video.id];
      watchedVideos.add(state.video.id);
      writeJson(STORAGE_KEYS.continueWatching, continueWatching);
      writeJson(STORAGE_KEYS.watchedVideos, [...watchedVideos]);
      updateProgressUi();
      return;
    }

    if (seconds < 1 && !existing) return;

    const updatedVideo = {
      ...existing,
      ...state.video,
      duration,
      durationFormatted: formatDuration(duration),
      progressSeconds: seconds,
      lastPlayedAt: Date.now(),
    };

    continueWatching[state.video.id] = updatedVideo;
    state.video = updatedVideo;
    persistSelectedVideo(updatedVideo);
    writeJson(STORAGE_KEYS.continueWatching, continueWatching);
    updateProgressUi();
  }

  function syncPlayerProgress() {
    if (!state.player || !state.playerReady || !state.video) return;

    try {
      const currentTime = state.player.getCurrentTime ? state.player.getCurrentTime() : 0;
      const duration = state.player.getDuration ? state.player.getDuration() : state.video.duration || 0;

      if (duration && duration !== state.video.duration) {
        state.video.duration = duration;
        state.video.durationFormatted = formatDuration(duration);
        renderVideoMeta();
      }

      saveContinueProgress(currentTime);
    } catch (error) {
      console.warn('Unable to sync watch page progress.', error);
    }
  }

  function stopProgressTracking() {
    if (state.progressTimer) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
    }
  }

  function startProgressTracking() {
    stopProgressTracking();
    state.progressTimer = setInterval(syncPlayerProgress, 5000);
  }

  function onPlayerStateChange(event) {
    const playerState = window.YT?.PlayerState;
    if (!playerState) return;

    if (event.data === playerState.PLAYING) {
      const seedTime = Math.max(1, Math.floor(event.target?.getCurrentTime ? event.target.getCurrentTime() : 0));
      saveContinueProgress(seedTime);
      startProgressTracking();
    } else if (event.data === playerState.PAUSED || event.data === playerState.BUFFERING) {
      syncPlayerProgress();
    } else if (event.data === playerState.ENDED) {
      syncPlayerProgress();
      stopProgressTracking();
    }
  }

  function renderMissingState(message) {
    dom.title.textContent = 'Video unavailable';
    dom.channel.textContent = '';
    dom.details.textContent = '';
    dom.progress.textContent = '';
    dom.statusBadge.classList.add('hidden');
    dom.description.textContent = message;
    dom.playerMount.innerHTML = `<div class="watch-player-empty">${message}</div>`;
  }

  function loadYoutubeIframeApi() {
    if (window.YT?.Player) {
      return Promise.resolve();
    }

    if (window.__ytIframeApiPromise) {
      return window.__ytIframeApiPromise;
    }

    window.__ytIframeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.head.appendChild(script);
    });

    return window.__ytIframeApiPromise;
  }

  async function mountPlayer() {
    if (!state.video?.id) {
      renderMissingState('No video was selected for this page.');
      return;
    }

    await loadYoutubeIframeApi();

    const resumeSeconds = getResumeSeconds(state.video.id);

    state.player = new window.YT.Player('watch-player', {
      videoId: state.video.id,
      playerVars: {
        autoplay: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        start: resumeSeconds > 5 ? resumeSeconds : 0,
      },
      events: {
        onReady: (event) => {
          state.playerReady = true;
          const duration = event.target.getDuration ? event.target.getDuration() : 0;
          if (duration && duration !== state.video.duration) {
            state.video.duration = duration;
            state.video.durationFormatted = formatDuration(duration);
            persistSelectedVideo(state.video);
          }

          if (resumeSeconds > 5) {
            event.target.seekTo(resumeSeconds, true);
          }

          renderVideoMeta();
        },
        onStateChange,
      },
    });
  }

  function onStateChange(event) {
    onPlayerStateChange(event);
  }

  function bindEvents() {
    dom.backButton.addEventListener('click', () => {
      syncPlayerProgress();
      if (window.history.length > 1) {
        window.history.back();
      } else {
        window.location.href = 'index.html';
      }
    });

    dom.cinemaButton.addEventListener('click', () => {
      setTheaterMode(!state.theaterMode);
    });

    dom.youtubeButton.addEventListener('click', () => {
      if (!state.video?.id) return;
      syncPlayerProgress();
      window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(state.video.id)}`, '_blank', 'noopener');
    });

    window.addEventListener('pagehide', syncPlayerProgress);
    window.addEventListener('beforeunload', syncPlayerProgress);
    window.addEventListener('resize', schedulePlayerLayoutSync);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        syncPlayerProgress();
      } else {
        schedulePlayerLayoutSync();
      }
    });
  }

  async function init() {
    const preferences = readJson(STORAGE_KEYS.watchPreferences, {});
    setTheaterMode(Boolean(preferences.theaterMode));
    bindEvents();

    const videoId = getVideoIdFromQuery();
    if (!videoId) {
      renderMissingState('Open a video from the library first so this page knows what to play.');
      return;
    }

    state.video = await resolveVideo(videoId);
    if (!state.video) {
      renderMissingState('We could not load this video right now.');
      return;
    }

    schedulePlayerLayoutSync();
    persistSelectedVideo(state.video);
    renderVideoMeta();
    mountPlayer();
  }

  init().catch((error) => {
    console.error('Watch page failed to initialize.', error);
    renderMissingState('Something went wrong while opening this video.');
  });
})();
