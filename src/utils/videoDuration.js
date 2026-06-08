/**
 * Resolve hosted video length in seconds (Vimeo oEmbed, optional YouTube Data API).
 */

function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    headers: { Accept: 'application/json', 'User-Agent': 'SSI-LMS/1.0' },
  }).finally(() => clearTimeout(t));
}

function parseYoutubeVideoId(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  const path = u.pathname || '';
  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0];
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    if (path.startsWith('/embed/')) {
      const id = path.split('/').filter(Boolean)[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (path === '/watch') {
      const id = u.searchParams.get('v');
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (path.startsWith('/shorts/') || path.startsWith('/live/')) {
      const id = path.split('/').filter(Boolean)[1];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
  }
  return null;
}

function parseIso8601Duration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const mi = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  const total = h * 3600 + mi * 60 + s;
  return Number.isFinite(total) && total > 0 ? total : null;
}

async function youtubeDurationSeconds(videoId) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !videoId) return null;
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${encodeURIComponent(
    videoId
  )}&key=${encodeURIComponent(key)}`;
  try {
    const r = await fetchWithTimeout(url, 8000);
    if (!r.ok) return null;
    const j = await r.json();
    const iso = j.items?.[0]?.contentDetails?.duration;
    return parseIso8601Duration(iso);
  } catch {
    return null;
  }
}

/** Canonical vimeo.com URL for oEmbed (needs numeric id + optional ?h=). */
function vimeoWatchUrlFromAny(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u;
  try {
    u = new URL(normalized);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./i, '').toLowerCase();
  const path = u.pathname || '';
  const hParam = u.searchParams.get('h');

  if (host === 'player.vimeo.com') {
    const m = path.match(/\/video\/(\d{5,15})/);
    if (!m) return null;
    const id = m[1];
    const h = hParam;
    return h ? `https://vimeo.com/${id}?h=${encodeURIComponent(h)}` : `https://vimeo.com/${id}`;
  }
  if (host === 'vimeo.com') {
    if (/\/(manage|settings|hub)\b/i.test(path)) return null;
    const parts = path.split('/').filter(Boolean);
    const id = [...parts].reverse().find((p) => /^\d{5,15}$/.test(p));
    if (!id) return null;
    const h = hParam;
    return h ? `https://vimeo.com/${id}?h=${encodeURIComponent(h)}` : `https://vimeo.com/${id}`;
  }
  return null;
}

async function vimeoDurationSeconds(rawUrl) {
  const canonical = vimeoWatchUrlFromAny(rawUrl);
  if (!canonical) return null;
  const oembed = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(canonical)}`;
  try {
    const r = await fetchWithTimeout(oembed, 8000);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.duration;
    if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) return null;
    return Math.round(d);
  } catch {
    return null;
  }
}

/**
 * @param {string} url lesson video_url
 * @returns {Promise<number|null>} duration in seconds
 */
async function getVideoDurationSeconds(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;

  const ytId = parseYoutubeVideoId(trimmed);
  if (ytId) {
    const sec = await youtubeDurationSeconds(ytId);
    if (sec != null) return sec;
  }

  if (/vimeo\.com/i.test(trimmed) || /player\.vimeo\.com/i.test(trimmed)) {
    return vimeoDurationSeconds(trimmed);
  }

  return null;
}

module.exports = {
  getVideoDurationSeconds,
  vimeoWatchUrlFromAny,
  parseYoutubeVideoId,
};
