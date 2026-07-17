import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Activity, Bell, BellRing, Bot, Calendar, CalendarDays,
  Droplets, Gauge, LoaderCircle, MessageCircle,
  Plus, Search, Send, SunMedium, Wind, X, CloudRain, Umbrella,
  RefreshCw, Pencil, Trash2, MapPin, Eye, Sun, PersonStanding
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
  });
}

function formatHour(h, m = 0) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Parse các kiểu gõ tay: "6h31", "06h31", "6:31", "18g", "8" ...
function parseTimeInput(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d{1,2})\s*[hHgG:.]?\s*(\d{1,2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] != null && match[2] !== '' ? Number(match[2]) : 0;
  if (Number.isNaN(hour) || hour < 0 || hour > 23) return null;
  if (Number.isNaN(minute) || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function rainLevelColor(level) {
  if (level === 'mưa lớn') return '#f87171';
  if (level === 'mưa vừa') return '#fb923c';
  if (level === 'mưa nhỏ') return '#facc15';
  return '#34d399';
}

function rainLevelBg(level) {
  if (level === 'mưa lớn') return 'bg-red-500/20 text-red-300 border-red-500/30';
  if (level === 'mưa vừa') return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
  if (level === 'mưa nhỏ') return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
}

const FORECAST_SLOTS = [
  { key: 'forecast_30min', label: '30 phút' },
  { key: 'forecast_1h',    label: '1 giờ' },
  { key: 'forecast_3h',    label: '3 giờ' },
  { key: 'forecast_6h',    label: '6 giờ' },
  { key: 'forecast_12h',   label: '12 giờ' },
  { key: 'forecast_24h',   label: '24 giờ' }
];

const FORECAST_STEP_OPTIONS = [
  { value: 10, label: '10 phút' },
  { value: 30, label: '30 phút' },
  { value: 60, label: '1 giờ' },
  { value: 180, label: '3 giờ' }
];

function formatSlotDateTime(isoTime) {
  return new Date(isoTime).toLocaleString('vi-VN', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit'
  });
}

const ACTIVITY_TYPES = ['xịt thuốc', 'phơi đồ', 'tưới cây', 'đi dạo', 'chạy bộ', 'khác'];

const TIME_PRESETS = [
  { label: 'Sáng sớm', start_hour: 5, end_hour: 7 },
  { label: 'Buổi sáng', start_hour: 7, end_hour: 11 },
  { label: 'Buổi trưa', start_hour: 11, end_hour: 13 },
  { label: 'Buổi chiều', start_hour: 13, end_hour: 17 },
  { label: 'Chiều tối', start_hour: 17, end_hour: 19 },
  { label: 'Buổi tối', start_hour: 19, end_hour: 22 }
];

const DEFAULT_TIME_KEY = 'weather_app_default_schedule_time';

function getSavedDefaultTime() {
  try {
    const raw = localStorage.getItem(DEFAULT_TIME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        start_hour: parsed.start_hour ?? 8,
        start_minute: parsed.start_minute ?? 0,
        end_hour: parsed.end_hour ?? 12,
        end_minute: parsed.end_minute ?? 0
      };
    }
  } catch {
    // bỏ qua nếu localStorage lỗi/không khả dụng
  }
  return { start_hour: 8, start_minute: 0, end_hour: 12, end_minute: 0 };
}

function saveDefaultTime(start_hour, start_minute, end_hour, end_minute) {
  try {
    localStorage.setItem(DEFAULT_TIME_KEY, JSON.stringify({ start_hour, start_minute, end_hour, end_minute }));
  } catch {
    // bỏ qua
  }
}

const AUTO_UPDATE_MS = {
  '5 phút': 5 * 60 * 1000,
  '15 phút': 15 * 60 * 1000,
  '30 phút': 30 * 60 * 1000,
  '1 giờ': 60 * 60 * 1000,
  'Tắt tự động cập nhật': null
};

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-3 text-center transition hover:bg-slate-700/60">
      <div className="flex justify-center text-sky-300">{icon}</div>
      <p className="mt-2 text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ForecastCard({ slot }) {
  if (!slot) return null;
  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-3xl font-bold text-white">{slot.temperature}°C</span>
        <span className={`text-xs border rounded-full px-2 py-1 ${rainLevelBg(slot.rain_level)}`}>
          {slot.rain_level}
        </span>
      </div>
      <p className="text-sm text-slate-300 capitalize">{slot.description}</p>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
        <span>💧 Độ ẩm: <b className="text-slate-200">{slot.humidity}%</b></span>
        <span>🌧 Mưa: <b style={{ color: rainLevelColor(slot.rain_level) }}>{slot.rain_chance}%</b></span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${slot.rain_chance}%`,
            backgroundColor: rainLevelColor(slot.rain_level)
          }}
        />
      </div>
    </div>
  );
}

function AlertBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
      {count > 9 ? '9+' : count}
    </span>
  );
}

// ─── Schedule Form Modal ─────────────────────────────────────────────────────

function ScheduleModal({ onClose, onSaved, lat, lon, editingSchedule }) {
  const isEditing = Boolean(editingSchedule);

  const [form, setForm] = useState(() =>
    isEditing
      ? {
          activity_type: editingSchedule.activity_type,
          date: editingSchedule.date,
          start_hour: editingSchedule.start_hour,
          start_minute: editingSchedule.start_minute || 0,
          end_hour: editingSchedule.end_hour,
          end_minute: editingSchedule.end_minute || 0,
          note: editingSchedule.note || ''
        }
      : {
          activity_type: 'phơi đồ',
          date: new Date().toISOString().split('T')[0],
          ...getSavedDefaultTime(),
          note: ''
        }
  );

  const [startTimeText, setStartTimeText] = useState(formatHour(form.start_hour, form.start_minute));
  const [endTimeText, setEndTimeText] = useState(formatHour(form.end_hour, form.end_minute));
  const [startTimeError, setStartTimeError] = useState('');
  const [endTimeError, setEndTimeError] = useState('');

  const [setAsDefault, setSetAsDefault] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forecastCheck, setForecastCheck] = useState(null);
  const [checking, setChecking] = useState(false);

  // Đồng bộ ô nhập text mỗi khi giờ đổi qua preset/chọn nhanh
  useEffect(() => {
    setStartTimeText(formatHour(form.start_hour, form.start_minute));
  }, [form.start_hour, form.start_minute]);

  useEffect(() => {
    setEndTimeText(formatHour(form.end_hour, form.end_minute));
  }, [form.end_hour, form.end_minute]);

  function handleStartTimeChange(text) {
    setStartTimeText(text);
    const parsed = parseTimeInput(text);
    if (!parsed) {
      setStartTimeError(text.trim() ? 'Giờ không hợp lệ (VD: 6h31, 18:00)' : '');
      return;
    }
    setStartTimeError('');
    setForm((f) => ({ ...f, start_hour: parsed.hour, start_minute: parsed.minute }));
  }

  function handleEndTimeChange(text) {
    setEndTimeText(text);
    const parsed = parseTimeInput(text);
    if (!parsed) {
      setEndTimeError(text.trim() ? 'Giờ không hợp lệ (VD: 19h00, 20:15)' : '');
      return;
    }
    setEndTimeError('');
    setForm((f) => ({ ...f, end_hour: parsed.hour, end_minute: parsed.minute }));
  }

  async function checkForecast() {
    setChecking(true);
    try {
      const res = await axios.get(
        `${API_BASE}/schedule/check?lat=${lat}&lon=${lon}&start_hour=${form.start_hour}&end_hour=${form.end_hour}`
      );
      setForecastCheck(res.data.data);
    } catch {
      setForecastCheck(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (startTimeError || endTimeError) {
      alert('Vui lòng nhập giờ đúng định dạng (VD: 6h31) trước khi lưu.');
      return;
    }
    const startTotal = form.start_hour * 60 + form.start_minute;
    const endTotal = form.end_hour * 60 + form.end_minute;
    if (startTotal >= endTotal) {
      alert('Giờ bắt đầu phải trước giờ kết thúc.');
      return;
    }

    setLoading(true);
    try {
      if (isEditing) {
        await axios.put(`${API_BASE}/schedule/${editingSchedule.id}`, { ...form, latitude: lat, longitude: lon });
      } else {
        await axios.post(`${API_BASE}/schedule`, { ...form, latitude: lat, longitude: lon });
        if (setAsDefault) saveDefaultTime(form.start_hour, form.start_minute, form.end_hour, form.end_minute);
      }
      onSaved();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.message || (isEditing ? 'Lỗi khi cập nhật lịch.' : 'Lỗi khi tạo lịch.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-400" /> {isEditing ? 'Sửa lịch hoạt động' : 'Đặt lịch hoạt động'}
          </h3>
          <button onClick={onClose} className="rounded-xl p-1.5 hover:bg-slate-700 text-slate-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Activity type */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Hoạt động</label>
            <select
              value={form.activity_type}
              onChange={(e) => setForm({ ...form, activity_type: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ngày</label>
            <input
              type="date"
              value={form.date}
              min={new Date().toISOString().split('T')[0]}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500"
            />
          </div>

          {/* Time range — tự gõ giờ, VD: 6h31 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Giờ bắt đầu</label>
              <input
                type="text"
                value={startTimeText}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                placeholder="VD: 6h31"
                className={`w-full rounded-xl border bg-slate-800 px-3 py-2 text-sm text-white outline-none ${
                  startTimeError ? 'border-rose-500/60 focus:border-rose-500' : 'border-slate-700 focus:border-sky-500'
                }`}
              />
              {startTimeError && <p className="text-[10px] text-rose-400 mt-1">{startTimeError}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Giờ kết thúc</label>
              <input
                type="text"
                value={endTimeText}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                placeholder="VD: 19h00"
                className={`w-full rounded-xl border bg-slate-800 px-3 py-2 text-sm text-white outline-none ${
                  endTimeError ? 'border-rose-500/60 focus:border-rose-500' : 'border-slate-700 focus:border-sky-500'
                }`}
              />
              {endTimeError && <p className="text-[10px] text-rose-400 mt-1">{endTimeError}</p>}
            </div>
          </div>

          {/* Chọn nhanh khung giờ */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Chọn nhanh</label>
            <div className="flex gap-2 flex-wrap">
              {TIME_PRESETS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() =>
                    setForm({ ...form, start_hour: p.start_hour, start_minute: 0, end_hour: p.end_hour, end_minute: 0 })
                  }
                  className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                    form.start_hour === p.start_hour && form.start_minute === 0 &&
                    form.end_hour === p.end_hour && form.end_minute === 0
                      ? 'border-sky-500/60 bg-sky-500/10 text-sky-300'
                      : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lưu khung giờ này làm mặc định cho lần đặt lịch sau */}
          {!isEditing && (
            <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={setAsDefault}
                onChange={(e) => setSetAsDefault(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 accent-sky-500"
              />
              Đặt khung giờ này làm mặc định cho lần sau
            </label>
          )}

          {/* Note */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ghi chú (tuỳ chọn)</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="VD: Ruộng lúa khu A"
              className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500 placeholder:text-slate-500"
            />
          </div>

          {/* Forecast check */}
          <button
            type="button"
            onClick={checkForecast}
            disabled={checking}
            className="w-full rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-300 hover:bg-sky-500/20 transition flex items-center justify-center gap-2"
          >
            {checking ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudRain className="h-4 w-4" />}
            Kiểm tra thời tiết khung giờ này
          </button>

          {forecastCheck && (
            <div className={`rounded-xl border p-3 text-sm ${forecastCheck.suitable ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
              {forecastCheck.suitable ? '✅' : '⚠️'} {forecastCheck.message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 transition flex items-center justify-center gap-2"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : (isEditing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />)}
            {isEditing ? 'Cập nhật lịch' : 'Đặt lịch'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────────

function ChatBubble({ lat, lon, onScheduleCreated }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: '👋 Xin chào! Tôi có thể giúp bạn kiểm tra thời tiết hoặc đặt lịch hoạt động. Thử hỏi: "Chiều nay có mưa không?" hoặc "Đặt lịch phơi đồ sáng mai".' }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);

    try {
      const res = await axios.post(`${API_BASE}/chat`, { message: text, lat, lon });
      const data = res.data;
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
      if (data.action === 'schedule_created') {
        onScheduleCreated?.();
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: '❌ ' + (err?.response?.data?.message || 'Lỗi kết nối. Vui lòng thử lại.') }
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/30 hover:scale-105 transition-transform"
      >
        {open ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-80 sm:w-96 rounded-3xl border border-white/10 bg-slate-900/95 backdrop-blur shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 bg-gradient-to-r from-sky-600/20 to-indigo-600/20">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20">
              <Bot className="h-5 w-5 text-sky-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Trợ lý thời tiết AI</p>
              <p className="text-xs text-slate-400">Powered by Gemini</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-80">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-sky-500 text-white rounded-br-sm'
                      : 'bg-slate-700/80 text-slate-100 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-700/80 text-slate-400 rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-1.5">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Đang suy nghĩ...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Nhắn tin với AI..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-sky-500 placeholder:text-slate-500"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="rounded-xl bg-sky-500 p-2 text-white hover:bg-sky-400 disabled:opacity-40 transition"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Alerts Panel ────────────────────────────────────────────────────────────

function AlertsPanel({ alerts, onMarkRead }) {
  if (!alerts.length) return null;

  return (
    <div className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-rose-400" />
          <h3 className="text-lg font-semibold text-white">Cảnh báo thời tiết</h3>
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{alerts.length}</span>
        </div>
        <button
          onClick={onMarkRead}
          className="text-xs text-slate-400 hover:text-white transition"
        >
          Đánh dấu tất cả đã đọc
        </button>
      </div>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`rounded-xl border p-3 text-sm ${
              alert.severity === 'danger'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : alert.severity === 'warning'
                ? 'border-orange-500/30 bg-orange-500/10 text-orange-200'
                : 'border-blue-500/30 bg-blue-500/10 text-blue-200'
            }`}
          >
            {alert.message}
            <div className="mt-1 text-xs opacity-60">{formatDate(alert.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Schedule List ────────────────────────────────────────────────────────────

function ScheduleList({ schedules, onAddNew, onEdit, onDelete }) {
  const statusConfig = {
    pending: { label: 'Đang chờ', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
    alerted: { label: 'Đã cảnh báo', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    done: { label: 'Hoàn thành', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
  };

  function handleDeleteClick(schedule) {
    const ok = window.confirm(`Bạn có chắc muốn xóa lịch "${schedule.activity_type}" (${schedule.date})?`);
    if (ok) onDelete(schedule.id);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-indigo-400" />
          <h3 className="text-lg font-semibold text-white">Lịch đã đặt</h3>
        </div>
        <button
          onClick={onAddNew}
          className="flex items-center gap-1.5 rounded-xl bg-sky-500/20 border border-sky-500/30 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/30 transition"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm lịch
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
          Chưa có lịch nào. Thêm lịch hoạt động để nhận cảnh báo thời tiết.
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => {
            const cfg = statusConfig[s.status] || statusConfig.pending;
            return (
              <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-800/60 px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{s.activity_type}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s.date} · {formatHour(s.start_hour, s.start_minute)} – {formatHour(s.end_hour, s.end_minute)}
                  </p>
                  {s.note && <p className="text-xs text-slate-500 mt-0.5 truncate">{s.note}</p>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
                  {cfg.label}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onEdit(s)}
                    title="Sửa lịch"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-sky-300 transition"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteClick(s)}
                    title="Xóa lịch"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-rose-400 transition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Custom Recharts Tooltip ──────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-sky-300 font-semibold">{payload[0].value}°C</p>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [city, setCity] = useState('Ho Chi Minh');
  const [coords, setCoords] = useState({ lat: 10.762622, lon: 106.660172 });
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('forecast_1h');
  const [forecastStep, setForecastStep] = useState(30);
  const [forecastSeries, setForecastSeries] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dayForecast, setDayForecast] = useState(null);
  const [extended, setExtended] = useState(null);
  const [bestWindows, setBestWindows] = useState([]);
  const [selectedSeriesIndex, setSelectedSeriesIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [autoUpdateInterval, setAutoUpdateInterval] = useState('15 phút');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [secondsToNext, setSecondsToNext] = useState(0);

  const loadWeather = useCallback(async (lat, lon) => {
    const [forecastRes, historyRes] = await Promise.all([
      axios.get(`${API_BASE}/weather/forecast?lat=${lat}&lon=${lon}`),
      axios.get(`${API_BASE}/weather/history?limit=8&page=1&sort=desc`)
    ]);
    setForecast(forecastRes.data?.data || null);
    setHistory(historyRes.data?.data || []);
  }, []);

  const loadForecastSeries = useCallback(async (lat, lon, step) => {
    try {
      const res = await axios.get(`${API_BASE}/weather/forecast/series?lat=${lat}&lon=${lon}&step=${step}&hours=6`);
      setForecastSeries(res.data?.data?.series || []);
      setSelectedSeriesIndex(0);
    } catch {
      setForecastSeries([]);
    }
  }, []);

  const loadDayForecast = useCallback(async (lat, lon, date) => {
    try {
      const res = await axios.get(`${API_BASE}/weather/forecast/date?lat=${lat}&lon=${lon}&date=${date}`);
      setDayForecast(res.data?.data || null);
    } catch {
      setDayForecast(null);
    }
  }, []);

  const loadExtended = useCallback(async (lat, lon) => {
    try {
      const res = await axios.get(`${API_BASE}/weather/extended?lat=${lat}&lon=${lon}`);
      setExtended(res.data?.data || null);
    } catch {
      setExtended(null);
    }
  }, []);

  const loadBestTimes = useCallback(async (lat, lon, date) => {
    try {
      const res = await axios.get(`${API_BASE}/weather/best-times?lat=${lat}&lon=${lon}&date=${date}`);
      setBestWindows(res.data?.data?.suggestions || []);
    } catch {
      setBestWindows([]);
    }
  }, []);

  const loadScheduleData = useCallback(async () => {
    try {
      const [schedRes, alertRes] = await Promise.all([
        axios.get(`${API_BASE}/schedule?limit=10`),
        axios.get(`${API_BASE}/schedule/alerts?limit=10`)
      ]);
      setSchedules(schedRes.data?.data || []);
      setAlerts(alertRes.data?.data || []);
    } catch {
      // schedule/alert tables may not exist yet — silently ignore
    }
  }, []);

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE}/weather/city?city=${encodeURIComponent(city)}`);
      const data = res.data?.data;
      if (data) {
        setWeather(data);
        const newLat = data.latitude;
        const newLon = data.longitude;
        setCoords({ lat: newLat, lon: newLon });
        await loadWeather(newLat, newLon);
        setLastUpdated(new Date());
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Không tìm thấy thành phố.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkAlertsRead() {
    try {
      await axios.patch(`${API_BASE}/schedule/alerts/read`, { ids: [] });
      setAlerts([]);
    } catch { /* ignore */ }
  }

  async function handleDeleteSchedule(id) {
    try {
      await axios.delete(`${API_BASE}/schedule/${id}`);
      await loadScheduleData();
    } catch (err) {
      alert(err?.response?.data?.message || 'Không thể xóa lịch.');
    }
  }

  function handleEditSchedule(schedule) {
    setEditingSchedule(schedule);
    setShowScheduleModal(true);
  }

  function handleCloseScheduleModal() {
    setShowScheduleModal(false);
    setEditingSchedule(null);
  }

  const refreshWeatherNow = useCallback(async () => {
    try {
      const currentRes = await axios.get(`${API_BASE}/weather/current?lat=${coords.lat}&lon=${coords.lon}`);
      const data = currentRes.data?.data;
      if (data) setWeather(data);
      await loadWeather(coords.lat, coords.lon);
      setLastUpdated(new Date());
    } catch {
      // im lặng bỏ qua lỗi refresh nền, không làm phiền người dùng
    }
  }, [coords, loadWeather]);

  // Initial load — also fetch current weather separately
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        let lat, lon;
        try {
          const geo = await getDeviceLocation();
          lat = geo.lat;
          lon = geo.lon;
          setCoords({ lat, lon });
          const currentRes = await axios.get(`${API_BASE}/weather/current?lat=${lat}&lon=${lon}`);
          if (currentRes.data?.data) {
            setWeather(currentRes.data.data);
            setCity(currentRes.data.data.city || city);
          }
        } catch {
          const currentRes = await axios.get(`${API_BASE}/weather/city?city=${encodeURIComponent(city)}`);
          const data = currentRes.data?.data;
          if (data) {
            setWeather(data);
            lat = data.latitude;
            lon = data.longitude;
            setCoords({ lat, lon });
          }
        }
        if (lat != null && lon != null) await loadWeather(lat, lon);
        await loadScheduleData();
        setLastUpdated(new Date());
      } catch (err) {
        setError(err?.response?.data?.message || 'Không thể tải dữ liệu.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (coords.lat && coords.lon) loadDayForecast(coords.lat, coords.lon, selectedDate);
  }, [coords, selectedDate, loadDayForecast]);

  useEffect(() => {
    if (coords.lat && coords.lon) loadForecastSeries(coords.lat, coords.lon, forecastStep);
  }, [coords, forecastStep, loadForecastSeries]);

  useEffect(() => {
    if (coords.lat && coords.lon) loadExtended(coords.lat, coords.lon);
  }, [coords, loadExtended]);

  useEffect(() => {
    if (coords.lat && coords.lon) loadBestTimes(coords.lat, coords.lon, selectedDate);
  }, [coords, selectedDate, loadBestTimes]);

  // Interval tự động gọi lại API theo chu kỳ người dùng chọn
  useEffect(() => {
    const ms = AUTO_UPDATE_MS[autoUpdateInterval];
    if (!ms) return undefined;

    const id = setInterval(() => {
      refreshWeatherNow();
    }, ms);

    return () => clearInterval(id);
  }, [autoUpdateInterval, refreshWeatherNow]);

  // Interval đếm ngược mỗi giây (chỉ để hiển thị, không gọi API)
  useEffect(() => {
    const ms = AUTO_UPDATE_MS[autoUpdateInterval];
    if (!ms) {
      setSecondsToNext(0);
      return undefined;
    }

    setSecondsToNext(Math.floor(ms / 1000));
    const id = setInterval(() => {
      setSecondsToNext((prev) => (prev <= 1 ? Math.floor(ms / 1000) : prev - 1));
    }, 1000);

    return () => clearInterval(id);
  }, [autoUpdateInterval, lastUpdated]);

  // Xin quyền gửi thông báo trình duyệt khi app khởi động
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Nhắc lịch: khi đến giờ:phút bắt đầu, thông báo kèm đánh giá "nên làm hay không, vì sao"
  const notifiedRef = useRef(new Set());
  useEffect(() => {
    const id = setInterval(async () => {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const nowTotal = now.getHours() * 60 + now.getMinutes();

      for (const s of schedules) {
        if (s.status === 'done') continue;
        const key = `${s.id}-${s.date}`;
        if (s.date !== todayStr) continue;

        const schedTotal = Number(s.start_hour) * 60 + Number(s.start_minute || 0);
        if (nowTotal < schedTotal || nowTotal > schedTotal + 1) continue; // đúng phút, trễ tối đa 1 phút
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.add(key);

        let body = `Đã đến giờ "${s.activity_type}" (${formatHour(s.start_hour, s.start_minute)} - ${formatHour(s.end_hour, s.end_minute)}).`;

        try {
          const res = await axios.get(
            `${API_BASE}/schedule/check?lat=${coords.lat}&lon=${coords.lon}&start_hour=${s.start_hour}&end_hour=${s.end_hour}`
          );
          const check = res.data?.data;
          if (check) {
            body += check.suitable
              ? ` ✅ Thời tiết thuận lợi (khả năng mưa ${check.max_rain_chance}%), bạn nên ${s.activity_type} như dự định.`
              : ` ⚠️ ${check.message}`;
          }
        } catch {
          // Không lấy được đánh giá thời tiết -> vẫn báo giờ, chỉ bỏ qua phần lý do
        }

        new Notification('⏰ Đến giờ rồi!', { body, icon: '/vite.svg' });
      }
    }, 30 * 1000);

    return () => clearInterval(id);
  }, [schedules, coords]);

  // Chart data from history records
  const chartData = useMemo(() => {
    return [...history].reverse().map((item) => ({
      label: new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      temperature: Number(item.temperature || 0)
    }));
  }, [history]);

  return (
    <div className="min-h-screen bg-transparent px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* ── Header ── */}
        <header className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-sky-300">Weather Dashboard</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Dự báo thời tiết hiện đại</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300 sm:text-base">
                Theo dõi thời tiết, dự báo mốc thời gian, lên lịch thông minh và nhận cảnh báo tự động.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Alerts button */}
              <div className="relative">
                <button
                  onClick={() => setAlerts([])}
                  className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/90 text-slate-300 hover:text-white transition"
                  title="Cảnh báo"
                >
                  <Bell className="h-5 w-5" />
                  <AlertBadge count={alerts.length} />
                </button>
              </div>
              <button
                onClick={async () => {
                  try {
                    const geo = await getDeviceLocation();
                    setCoords({ lat: geo.lat, lon: geo.lon });
                    const res = await axios.get(`${API_BASE}/weather/current?lat=${geo.lat}&lon=${geo.lon}`);
                    if (res.data?.data) { setWeather(res.data.data); setCity(res.data.data.city || city); }
                    await loadWeather(geo.lat, geo.lon);
                    setLastUpdated(new Date());
                  } catch {
                    alert('Không thể lấy vị trí thiết bị. Hãy cấp quyền định vị cho trình duyệt.');
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-700 bg-slate-800/90 text-slate-300 hover:text-white transition"
                title="Dùng vị trí hiện tại"
              >
                <MapPin className="h-5 w-5" />
              </button>
              {/* Search */}
              <form onSubmit={handleSearch} className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/90 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  id="city-search"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-40 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Tìm thành phố"
                />
                <button className="rounded-xl bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-400">
                  Tìm
                </button>
              </form>
            </div>
          </div>
        </header>

        {/* ── Error ── */}
        {error && (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-slate-900/70 p-16 backdrop-blur">
            <LoaderCircle className="mr-3 h-7 w-7 animate-spin text-sky-400" />
            <span className="text-slate-200">Đang tải dữ liệu...</span>
          </div>
        ) : (
          <>
            {/* ── Alerts panel ── */}
            {alerts.length > 0 && (
              <AlertsPanel alerts={alerts} onMarkRead={handleMarkAlertsRead} />
            )}

            {/* ── Row 1: Current weather + Chart ── */}
            <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Current weather card */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Thời tiết hiện tại</p>
                    <h2 className="mt-2 text-2xl font-semibold">{weather?.city || city}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={autoUpdateInterval}
                      onChange={(e) => setAutoUpdateInterval(e.target.value)}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500"
                    >
                      <option value="5 phút">5 phút</option>
                      <option value="15 phút">15 phút</option>
                      <option value="30 phút">30 phút</option>
                      <option value="1 giờ">1 giờ</option>
                      <option value="Tắt tự động cập nhật">Tắt tự động cập nhật</option>
                    </select>
                    <div className="rounded-2xl bg-sky-500/15 p-3 text-sky-300">
                      <SunMedium className="h-8 w-8" />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <RefreshCw className="h-3 w-3" />
                  {lastUpdated && <span>Cập nhật lần cuối: {lastUpdated.toLocaleTimeString('vi-VN')}</span>}
                  {autoUpdateInterval !== 'Tắt tự động cập nhật' && secondsToNext > 0 && (
                    <span className="ml-2">
                      · Cập nhật tiếp theo sau: {Math.floor(secondsToNext / 60)}p {secondsToNext % 60}s
                    </span>
                  )}
                </div>
                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-5xl font-semibold text-white">{weather?.temperature ?? '—'}°C</div>
                    <p className="mt-2 text-slate-300 capitalize">{weather?.description || 'Đang cập nhật...'}</p>
                    <p className="mt-1 text-sm text-slate-400">
                      Cập nhật: {weather?.time ? formatDate(weather.time * 1000) : '—'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <MetricCard icon={<Droplets className="h-5 w-5" />} label="Độ ẩm" value={`${weather?.humidity ?? '—'}%`} />
                    <MetricCard icon={<Gauge className="h-5 w-5" />} label="Áp suất" value={`${extended?.pressure ?? weather?.pressure ?? '—'} hPa`} />
                    <MetricCard icon={<Wind className="h-5 w-5" />} label="Gió" value={`${extended?.windSpeed ?? weather?.windSpeed ?? '—'} m/s`} />
                    <MetricCard icon={<Sun className="h-5 w-5" />} label={`Chỉ số UV${extended?.uvLevel ? ` (${extended.uvLevel})` : ''}`} value={extended?.uvIndex != null ? extended.uvIndex : '—'} />
                    <MetricCard icon={<Eye className="h-5 w-5" />} label="Tầm nhìn" value={`${extended?.visibility ?? '—'} km`} />
                  </div>
                </div>
              </div>

              {/* Temperature chart */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
                <div className="flex items-center gap-2 text-slate-200 mb-4">
                  <Activity className="h-5 w-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold">Biểu đồ nhiệt độ</h3>
                </div>
                {chartData.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="temperature" stroke="#38bdf8" strokeWidth={3} dot={{ r: 3, fill: '#38bdf8' }} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center text-slate-500 text-sm">
                    Chưa có dữ liệu lịch sử nhiệt độ
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <CalendarDays className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-lg font-semibold">Xem dự báo theo ngày</h3>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: 5 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() + i);
                    const dStr = d.toISOString().split('T')[0];
                    const label = i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                    return (
                      <button
                        key={dStr}
                        onClick={() => setSelectedDate(dStr)}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                          selectedDate === dStr ? 'bg-indigo-500 border-indigo-400 text-white' : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {dayForecast?.summary ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <MetricCard icon={<SunMedium className="h-5 w-5" />} label="Cao nhất" value={`${dayForecast.summary.maxTemp}°C`} />
                    <MetricCard icon={<SunMedium className="h-5 w-5" />} label="Thấp nhất" value={`${dayForecast.summary.minTemp}°C`} />
                    <MetricCard icon={<Droplets className="h-5 w-5" />} label="Độ ẩm TB" value={`${dayForecast.summary.avgHumidity}%`} />
                    <MetricCard icon={<CloudRain className="h-5 w-5" />} label="Khả năng mưa" value={`${dayForecast.summary.maxRainChance}%`} />
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {dayForecast.points.map((p) => (
                      <div key={p.time} className="shrink-0 rounded-xl border border-slate-700/50 bg-slate-800/40 p-3 text-center w-24">
                        <p className="text-[10px] text-slate-400">{formatHour(p.hour)}</p>
                        <p className="text-sm font-semibold text-white mt-1">{p.temperature}°C</p>
                        <p className="text-[10px] mt-1" style={{ color: rainLevelColor(p.rain_level) }}>{p.rain_chance}% mưa</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-slate-500 text-sm py-6">Không có dữ liệu cho ngày này (chỉ hỗ trợ trong 5 ngày tới).</p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
              <div className="flex items-center gap-2 text-slate-200 mb-4">
                <PersonStanding className="h-5 w-5 text-emerald-400" />
                <h3 className="text-lg font-semibold">Khung giờ đẹp trong ngày</h3>
              </div>
              {bestWindows.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-6">Chưa đủ dữ liệu để gợi ý cho ngày này.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {bestWindows.map((item) => (
                    <div key={item.activity} className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-4">
                      <p className="text-sm font-semibold text-white mb-2">{item.activity}</p>
                      {item.windows.length === 0 ? (
                        <p className="text-xs text-slate-500">Không có khung giờ phù hợp hôm nay.</p>
                      ) : (
                        <div className="space-y-2">
                          {item.windows.map((w) => (
                            <div key={w.time} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-200 font-medium">{formatHour(w.hour)}</span>
                                <span className="text-emerald-300">{w.label}</span>
                              </div>
                              <span className="text-slate-400">{w.temperature}°C · {w.rain_chance}% mưa</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Row 2: Forecast by slot + History ── */}
            <section className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
              {/* Forecast section */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
                <div className="flex items-center gap-2 text-slate-200 mb-4">
                  <Umbrella className="h-5 w-5 text-sky-400" />
                  <h3 className="text-lg font-semibold">Dự báo theo mốc thời gian</h3>
                </div>

                {/* Chọn bước dự đoán */}
                <div className="flex gap-2 flex-wrap mb-4">
                  {FORECAST_STEP_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setForecastStep(value)}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                        forecastStep === value
                          ? 'bg-sky-500 border-sky-400 text-white'
                          : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Danh sách mốc giờ thật, cuộn ngang */}
                {forecastSeries.length > 0 ? (
                  <>
                    <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                      {forecastSeries.map((s, idx) => (
                        <button
                          key={s.time}
                          onClick={() => setSelectedSeriesIndex(idx)}
                          className={`shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                            selectedSeriesIndex === idx ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/30'
                          }`}
                        >
                          <p className="text-[10px] text-slate-400 whitespace-nowrap">{formatSlotDateTime(s.time)}</p>
                          <p className="text-sm font-semibold text-white mt-0.5">{s.temperature}°C</p>
                        </button>
                      ))}
                    </div>
                    <ForecastCard slot={forecastSeries[selectedSeriesIndex]} />
                  </>
                ) : (
                  <div className="text-slate-500 text-sm text-center py-8">Không có dữ liệu dự báo</div>
                )}

                {/* All slots quick view */}
                {forecast && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {FORECAST_SLOTS.map(({ key, label }) => {
                      const s = forecast[key];
                      if (!s) return null;
                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedSlot(key)}
                          className={`rounded-xl border p-2 text-center transition ${
                            selectedSlot === key ? 'border-sky-500/50 bg-sky-500/10' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-700/30'
                          }`}
                        >
                          <p className="text-xs text-slate-400">{label}</p>
                          <p className="text-sm font-semibold text-white mt-0.5">{s.temperature}°C</p>
                          <div className="mt-1 h-1 rounded-full bg-slate-700 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${s.rain_chance}%`, backgroundColor: rainLevelColor(s.rain_level) }}
                            />
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">{s.rain_chance}% mưa</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* History section */}
              <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-slate-950/50 backdrop-blur">
                <div className="flex items-center gap-2 text-slate-200 mb-4">
                  <Activity className="h-5 w-5 text-amber-400" />
                  <h3 className="text-lg font-semibold">Lịch sử thời tiết</h3>
                </div>
                <div className="space-y-2">
                  {history.length === 0 ? (
                    <p className="text-center text-slate-500 text-sm py-8">Chưa có dữ liệu lịch sử</p>
                  ) : (
                    history.map((item, index) => (
                      <div key={`${item.created_at}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-800/60 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white text-sm">{item.city || 'Không rõ'}</p>
                          <p className="text-xs text-slate-400">{formatDate(item.created_at)}</p>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-slate-300">
                          <span>{item.temperature}°C</span>
                          <span>{item.humidity}%</span>
                          <span>{item.pressure} hPa</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* ── Row 3: Schedule list ── */}
            <ScheduleList
              schedules={schedules}
              onAddNew={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
              onEdit={handleEditSchedule}
              onDelete={handleDeleteSchedule}
            />
          </>
        )}
      </div>

      {/* ── Schedule Modal ── */}
      {showScheduleModal && (
        <ScheduleModal
          onClose={handleCloseScheduleModal}
          onSaved={loadScheduleData}
          lat={coords.lat}
          lon={coords.lon}
          editingSchedule={editingSchedule}
        />
      )}

      {/* ── Chat bubble ── */}
      <ChatBubble
        lat={coords.lat}
        lon={coords.lon}
        onScheduleCreated={loadScheduleData}
      />
    </div>
  );
}