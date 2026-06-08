const { getVideoDurationSeconds } = require('../utils/videoDuration');

const MAX_URLS = 40;

/**
 * POST /api/media/video-durations
 * Body: { urls: string[] } — unique lesson embed URLs (YouTube / Vimeo).
 * Response: { durations: { [url: string]: number | null } } — seconds per URL (same key as sent).
 */
async function postVideoDurations(req, res) {
  try {
    const urls = req.body?.urls;
    if (!Array.isArray(urls)) {
      return res.status(400).json({ message: 'Body must include urls: string[]' });
    }
    const cleaned = [...new Set(urls.map((u) => String(u || '').trim()).filter(Boolean))].slice(0, MAX_URLS);
    if (cleaned.length === 0) {
      return res.json({ durations: {} });
    }

    const durations = {};
    await Promise.all(
      cleaned.map(async (u) => {
        try {
          durations[u] = await getVideoDurationSeconds(u);
        } catch {
          durations[u] = null;
        }
      })
    );

    return res.json({ durations });
  } catch (err) {
    console.error('[mediaMeta] video-durations:', err);
    return res.status(500).json({ message: 'Could not resolve video durations' });
  }
}

module.exports = {
  postVideoDurations,
};
