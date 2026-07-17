const axios = require('axios');
const { geminiApiKey, openWeatherApiKey } = require('../config/env');
const { getForecast, getCurrentWeather, resolveLocation, suggestActivityWindows } = require('./weatherService');
const { createSchedule, getSchedules, updateSchedule, deleteSchedule } = require('./scheduleService');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const DEFAULT_LAT = 10.762622;
const DEFAULT_LON = 106.660172;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatHourVi(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Tìm lịch khớp nhất với mô tả (activity_type / date / start_hour) do AI trích ra từ câu nói tự nhiên
 */
function findBestScheduleMatch(schedules, target = {}) {
  if (!schedules || schedules.length === 0) return null;
  const norm = (s) => (s || '').toString().trim().toLowerCase();

  let candidates = schedules;

  if (target.date) {
    const byDate = candidates.filter((s) => s.date === target.date);
    if (byDate.length) candidates = byDate;
  }

  if (target.activity_type) {
    const t = norm(target.activity_type);
    const byActivity = candidates.filter((s) => norm(s.activity_type).includes(t) || t.includes(norm(s.activity_type)));
    if (byActivity.length) candidates = byActivity;
  }

  if (target.start_hour != null) {
    candidates = [...candidates].sort(
      (a, b) => Math.abs(a.start_hour - target.start_hour) - Math.abs(b.start_hour - target.start_hour)
    );
  } else {
    candidates = [...candidates].sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  return candidates[0] || null;
}

/**
 * Lấy dữ liệu thời tiết thật để đưa vào context cho AI
 */
async function buildWeatherContext(lat = DEFAULT_LAT, lon = DEFAULT_LON) {
  try {
    const [currentRes, forecastRes] = await Promise.all([
      getCurrentWeather({ lat, lon }),
      getForecast({ lat, lon })
    ]);

    const w = currentRes.data;
    const f = forecastRes.data;

    return `
DỮ LIỆU THỜI TIẾT THỰC TẾ (${new Date().toLocaleString('vi-VN')}):
- Nhiệt độ hiện tại: ${w.temperature}°C
- Độ ẩm: ${w.humidity}%
- Tốc độ gió: ${w.windSpeed} m/s
- Mô tả: ${w.description}
- Thành phố: ${w.city}

DỰ BÁO:
- 30 phút tới: ${f.forecast_30min.temperature}°C, mưa ${f.forecast_30min.rain_chance}%, ${f.forecast_30min.rain_level}
- 1 giờ tới: ${f.forecast_1h.temperature}°C, mưa ${f.forecast_1h.rain_chance}%, ${f.forecast_1h.rain_level}
- 3 giờ tới: ${f.forecast_3h.temperature}°C, mưa ${f.forecast_3h.rain_chance}%, ${f.forecast_3h.rain_level}
- 6 giờ tới: ${f.forecast_6h.temperature}°C, mưa ${f.forecast_6h.rain_chance}%, ${f.forecast_6h.rain_level}
- 12 giờ tới: ${f.forecast_12h.temperature}°C, mưa ${f.forecast_12h.rain_chance}%, ${f.forecast_12h.rain_level}
- 24 giờ tới: ${f.forecast_24h.temperature}°C, mưa ${f.forecast_24h.rain_chance}%, ${f.forecast_24h.rain_level}
`;
  } catch (err) {
    logger.warn('Không thể lấy weather context cho AI', { error: err.message });
    return 'Không có dữ liệu thời tiết thực tế lúc này.';
  }
}

/**
 * Gọi Gemini API — tự retry khi 429, ném AppError rõ ràng cho các lỗi khác
 */
async function callGemini(systemPrompt, userMessage, retries = 2) {
  if (!geminiApiKey) {
    throw new AppError('Chưa cấu hình GEMINI_API_KEY.', 500, 'MISSING_GEMINI_KEY');
  }

  const body = {
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\nNgười dùng: ${userMessage}` }] }
    ],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
  };

  try {
    const response = await axios.post(`${GEMINI_API_URL}?key=${geminiApiKey}`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text.trim();
  } catch (err) {
    const status = err.response?.status;
    const apiMessage = err.response?.data?.error?.message || err.message;

    if (status === 429 && retries > 0) {
      const retryAfterSec = Number(err.response?.headers?.['retry-after']) || 5;
      logger.warn(`Gemini 429 - đợi ${retryAfterSec}s rồi thử lại`, { retriesLeft: retries });
      await sleep(retryAfterSec * 1000);
      return callGemini(systemPrompt, userMessage, retries - 1);
    }

    logger.error('Gemini API lỗi', { status, apiMessage });

    if (status === 429) throw new AppError('Gemini API đã hết hạn mức (quota). Vui lòng thử lại sau ít phút.', 502, 'GEMINI_RATE_LIMIT');
    if (status === 400) throw new AppError('Yêu cầu gửi tới Gemini không hợp lệ (có thể sai tên model).', 502, 'GEMINI_BAD_REQUEST');
    if (status === 403 || status === 401) throw new AppError('GEMINI_API_KEY không hợp lệ hoặc chưa được cấp quyền.', 502, 'GEMINI_AUTH_ERROR');
    if (err.code === 'ECONNABORTED') throw new AppError('Gemini API phản hồi quá chậm (timeout).', 502, 'GEMINI_TIMEOUT');
    throw new AppError(`Không thể kết nối tới Gemini API: ${apiMessage}`, 502, 'GEMINI_NETWORK_ERROR');
  }
}

/**
 * Phân tích intent: tạo / xem / sửa / hủy lịch, gợi ý giờ đẹp, hay hỏi thời tiết thường
 */
async function parseIntent(userMessage) {
  const systemPrompt = `Bạn là AI phân tích yêu cầu người dùng về thời tiết và lịch hẹn.
Nhiệm vụ: phân tích tin nhắn và trả về JSON theo format sau (KHÔNG thêm text nào khác ngoài JSON):

{
  "intent": "create_schedule" | "update_schedule" | "delete_schedule" | "view_schedule" | "suggest_time" | "ask_weather" | "other",

  "schedule": {                    // chỉ khi intent = "create_schedule"
    "activity_type": string,
    "date": "YYYY-MM-DD",
    "start_hour": number,
    "end_hour": number
  },

  "target": {                      // chỉ khi intent = "update_schedule" | "delete_schedule" — mô tả lịch CẦN TÌM
    "activity_type": string_or_null,
    "date": "YYYY-MM-DD"_or_null,
    "start_hour": number_or_null
  },

  "updates": {                     // chỉ khi intent = "update_schedule" — CÁC TRƯỜNG MUỐN ĐỔI, để null nếu không đổi
    "activity_type": string_or_null,
    "date": "YYYY-MM-DD"_or_null,
    "start_hour": number_or_null,
    "end_hour": number_or_null
  },

  "view_date": "YYYY-MM-DD" | "all",   // chỉ khi intent = "view_schedule"

  "suggest": {                     // chỉ khi intent = "suggest_time"
    "activity_type": string_or_null,     // vd "đi chơi", "chạy bộ", "đạp xe"; null = gợi ý tất cả loại
    "location_name": string_or_null,     // tên nơi muốn đến; null = dùng vị trí hiện tại
    "date": "YYYY-MM-DD"_or_null         // null = hôm nay
  },

  "reply_hint": string
}

Ngày hôm nay (giờ Việt Nam): ${new Date().toLocaleDateString('vi-VN')} — ${new Date().toISOString().split('T')[0]}
Quy tắc giờ: "chiều nay" → 14:00-18:00, "sáng mai" → 07:00-11:00, "tối nay" → 18:00-22:00.

Ví dụ:
- "xem lịch của tôi" → view_schedule, view_date="all"
- "hôm nay tôi có lịch gì" → view_schedule, view_date=hôm nay
- "đổi lịch tưới cây sang 5h chiều" → update_schedule, target.activity_type="tưới cây", updates.start_hour=17
- "hủy lịch chạy bộ sáng mai" → delete_schedule, target.activity_type="chạy bộ", target.date=ngày mai
- "gợi ý giờ đẹp đi Đà Lạt chơi cuối tuần này" → suggest_time, suggest.location_name="Đà Lạt", suggest.activity_type="đi chơi"
- "giờ nào đẹp để chạy bộ hôm nay" → suggest_time, suggest.activity_type="chạy bộ", suggest.location_name=null`;

  try {
    const raw = await callGemini(systemPrompt, userMessage);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { intent: 'other', reply_hint: '' };
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    logger.warn('Không thể parse intent từ AI', { error: err.message });
    return { intent: 'other', reply_hint: '' };
  }
}

/**
 * Hàm chính: xử lý tin nhắn từ người dùng
 */
async function handleChatMessage({ message, lat = DEFAULT_LAT, lon = DEFAULT_LON }) {
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    throw new AppError('Tin nhắn không được rỗng.', 400, 'EMPTY_MESSAGE');
  }

  const intentResult = await parseIntent(message);

  // ── Tạo lịch ──
  if (intentResult.intent === 'create_schedule' && intentResult.schedule) {
    const weatherContext = await buildWeatherContext(lat, lon);
    const { activity_type, date, start_hour, end_hour } = intentResult.schedule;

    let scheduleResult = null;
    let scheduleError = null;

    try {
      scheduleResult = await createSchedule({
        activity_type, date,
        start_hour: Number(start_hour),
        end_hour: Number(end_hour),
        latitude: lat, longitude: lon
      });
    } catch (err) {
      scheduleError = err.message;
    }

    const systemPrompt = `Bạn là trợ lý thời tiết thông minh của ứng dụng dự báo thời tiết Việt Nam.
Hãy trả lời bằng tiếng Việt, ngắn gọn, thân thiện, dưới 3 câu.
${weatherContext}`;

    const contextMessage = scheduleError
      ? `Người dùng muốn đặt lịch "${activity_type}" lúc ${start_hour}h-${end_hour}h ngày ${date} nhưng gặp lỗi: ${scheduleError}. Hãy xin lỗi và giải thích.`
      : `Đã đặt lịch thành công: "${activity_type}" lúc ${start_hour}h-${end_hour}h ngày ${date}. Dựa vào dữ liệu thời tiết, hãy đánh giá xem khung giờ này có phù hợp không và đưa ra lời khuyên.`;

    let aiReply;
    try {
      aiReply = await callGemini(systemPrompt, contextMessage);
    } catch (err) {
      aiReply = scheduleError
        ? `Không thể tạo lịch "${activity_type}" lúc ${start_hour}h-${end_hour}h ngày ${date}: ${scheduleError}`
        : `Đã đặt lịch "${activity_type}" lúc ${start_hour}h-${end_hour}h ngày ${date} thành công.`;
    }

    return {
      success: true,
      reply: aiReply,
      action: scheduleError ? 'schedule_failed' : 'schedule_created',
      schedule: scheduleError ? null : scheduleResult?.data
    };
  }

  // ── Xem lịch ──
  if (intentResult.intent === 'view_schedule') {
    const schedulesRes = await getSchedules({ limit: 50 });
    let list = schedulesRes.data || [];
    const viewDate = intentResult.view_date;
    if (viewDate && viewDate !== 'all') list = list.filter((s) => s.date === viewDate);

    if (list.length === 0) {
      return {
        success: true,
        reply: viewDate && viewDate !== 'all' ? `Bạn không có lịch nào vào ngày ${viewDate}.` : 'Bạn hiện chưa có lịch nào.',
        action: 'view_schedule',
        schedules: []
      };
    }

    const sorted = [...list].sort((a, b) => new Date(a.date) - new Date(b.date) || a.start_hour - b.start_hour);
    const lines = sorted.map((s) => `• ${s.activity_type} — ${s.date}, ${s.start_hour}h-${s.end_hour}h (${s.status || 'pending'})`);

    return {
      success: true,
      reply: `Bạn có ${list.length} lịch:\n${lines.join('\n')}`,
      action: 'view_schedule',
      schedules: sorted
    };
  }

  // ── Sửa lịch ──
  if (intentResult.intent === 'update_schedule') {
    const schedulesRes = await getSchedules({ limit: 50 });
    const match = findBestScheduleMatch(schedulesRes.data, intentResult.target || {});

    if (!match) {
      return { success: true, reply: 'Mình không tìm thấy lịch nào khớp để sửa. Bạn nói rõ tên hoạt động hoặc ngày giúp mình nhé.', action: 'update_failed' };
    }

    const u = intentResult.updates || {};
    const updates = {};
    if (u.activity_type) updates.activity_type = u.activity_type;
    if (u.date) updates.date = u.date;
    if (u.start_hour != null) updates.start_hour = Number(u.start_hour);
    if (u.end_hour != null) updates.end_hour = Number(u.end_hour);

    if (Object.keys(updates).length === 0) {
      return { success: true, reply: `Bạn muốn đổi giờ hay đổi hoạt động của lịch "${match.activity_type}" (${match.date}) thành gì?`, action: 'update_failed' };
    }

    try {
      const updated = await updateSchedule(match.id, updates);
      return {
        success: true,
        reply: `Đã cập nhật lịch "${match.activity_type}" (${match.date}) thành: ${updated.data.activity_type}, ${updated.data.date}, ${updated.data.start_hour}h-${updated.data.end_hour}h.`,
        action: 'schedule_updated',
        schedule: updated.data
      };
    } catch (err) {
      return { success: true, reply: `Không thể cập nhật lịch: ${err.message}`, action: 'update_failed' };
    }
  }

  // ── Hủy lịch ──
  if (intentResult.intent === 'delete_schedule') {
    const schedulesRes = await getSchedules({ limit: 50 });
    const match = findBestScheduleMatch(schedulesRes.data, intentResult.target || {});

    if (!match) {
      return { success: true, reply: 'Mình không tìm thấy lịch nào khớp để hủy. Bạn nói rõ tên hoạt động hoặc ngày giúp mình nhé.', action: 'delete_failed' };
    }

    try {
      await deleteSchedule(match.id);
      return {
        success: true,
        reply: `Đã hủy lịch "${match.activity_type}" lúc ${match.start_hour}h-${match.end_hour}h ngày ${match.date}.`,
        action: 'schedule_deleted'
      };
    } catch (err) {
      return { success: true, reply: `Không thể hủy lịch: ${err.message}`, action: 'delete_failed' };
    }
  }

  // ── Gợi ý khung giờ đẹp (tại nơi muốn đến, hoặc vị trí hiện tại) ──
  if (intentResult.intent === 'suggest_time') {
    const s = intentResult.suggest || {};
    const targetDate = s.date || new Date().toISOString().split('T')[0];

    let targetLat = lat;
    let targetLon = lon;
    let locationLabel = 'vị trí hiện tại của bạn';

    if (s.location_name) {
      try {
        const loc = await resolveLocation(s.location_name);
        targetLat = loc.lat;
        targetLon = loc.lon;
        locationLabel = `${loc.name}${loc.country ? ', ' + loc.country : ''}`;
      } catch (err) {
        return { success: true, reply: `Mình không tìm thấy địa điểm "${s.location_name}". Bạn kiểm tra lại tên giúp mình nhé.`, action: 'suggest_failed' };
      }
    }

    let suggestionResult;
    try {
      suggestionResult = await suggestActivityWindows({ lat: targetLat, lon: targetLon, date: targetDate });
    } catch (err) {
      return { success: true, reply: `Không lấy được dự báo cho ${locationLabel}: ${err.message}`, action: 'suggest_failed' };
    }

    let suggestions = suggestionResult.data.suggestions || [];
    if (s.activity_type) {
      const t = s.activity_type.toLowerCase();
      const filtered = suggestions.filter((it) => it.activity.toLowerCase().includes(t) || t.includes(it.activity.toLowerCase()));
      if (filtered.length) suggestions = filtered;
    }

    const hasAny = suggestions.some((it) => it.windows.length > 0);
    if (!hasAny) {
      return {
        success: true,
        reply: `Ngày ${targetDate} tại ${locationLabel} thời tiết không thuận lợi lắm cho hoạt động ngoài trời, bạn cân nhắc đổi ngày nhé.`,
        action: 'suggest_time',
        suggestions
      };
    }

    const lines = suggestions
      .filter((it) => it.windows.length > 0)
      .map((it) => `• ${it.activity}: ${it.windows.map((w) => `${formatHourVi(w.hour)} (${w.label}, ${w.temperature}°C, ${w.rain_chance}% mưa)`).join(', ')}`);

    return {
      success: true,
      reply: `Gợi ý khung giờ đẹp ngày ${targetDate} tại ${locationLabel}:\n${lines.join('\n')}`,
      action: 'suggest_time',
      suggestions
    };
  }

  // ── Hỏi thời tiết thông thường ──
  const weatherContext = await buildWeatherContext(lat, lon);
  const systemPrompt = `Bạn là trợ lý thời tiết thông minh của ứng dụng dự báo thời tiết Việt Nam.
Hãy trả lời bằng tiếng Việt, thân thiện, chính xác, dựa HOÀN TOÀN vào dữ liệu thực tế dưới đây.
KHÔNG bịa số liệu. Nếu không có thông tin, hãy nói rõ.
${weatherContext}`;

  let aiReply;
  try {
    aiReply = await callGemini(systemPrompt, message);
  } catch (err) {
    aiReply = err.errorCode === 'GEMINI_RATE_LIMIT'
      ? 'Trợ lý AI đang bị giới hạn số lượt hỏi (quota Gemini miễn phí). Bạn đợi khoảng 1 phút rồi hỏi lại nhé!'
      : 'Xin lỗi, trợ lý AI đang gặp sự cố kết nối. Bạn có thể xem trực tiếp dữ liệu thời tiết trên dashboard trong lúc chờ nhé!';
  }

  return { success: true, reply: aiReply, action: 'answer' };
}

module.exports = {
  handleChatMessage
};