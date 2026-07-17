// Tính giờ Việt Nam (UTC+7) một cách thủ công, không phụ thuộc múi giờ hệ điều hành của server
function getVietnamNow() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000);
}

function getVietnamDateString(date) {
  const base = date ? new Date(date.getTime() + 7 * 60 * 60 * 1000) : getVietnamNow();
  return base.toISOString().split('T')[0]; // YYYY-MM-DD theo giờ VN
}

function formatVietnamDateTime(date) {
  const vn = date ? new Date(date.getTime() + 7 * 60 * 60 * 1000) : getVietnamNow();
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())} ngày ${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
}

module.exports = { getVietnamNow, getVietnamDateString, formatVietnamDateTime };