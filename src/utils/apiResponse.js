function sendSuccess(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, ...data });
}

function sendError(res, status, message, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

module.exports = { sendSuccess, sendError };
