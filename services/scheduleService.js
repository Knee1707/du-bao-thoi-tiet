const { getVietnamDateString } = require('../utils/vietnamTime');
const { supabaseClient } = require('../config/supabase');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

// ── Helper ──────────────────────────────────────────────────────────────────

function isMissingTableError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('Could not find the table') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  );
}

// ── SCHEDULE CRUD ─────────────────────────────────────────────────────────

/**
 * Tạo một lịch hoạt động mới
 */

async function createSchedule({ activity_type, start_hour, end_hour, start_minute = 0, end_minute = 0, date, latitude, longitude, note }) {
  if (!activity_type || typeof activity_type !== 'string') {
    throw new AppError('Loại hoạt động không hợp lệ.', 400, 'INVALID_ACTIVITY');
  }

  const sh = Number(start_hour);
  const eh = Number(end_hour);
  const sm = Number(start_minute) || 0;
  const em = Number(end_minute) || 0;

  if (
    start_hour == null || end_hour == null ||
    sh < 0 || sh > 23 || eh < 0 || eh > 23 ||
    sm < 0 || sm > 59 || em < 0 || em > 59
  ) {
    throw new AppError('Khung giờ không hợp lệ (giờ 0-23, phút 0-59).', 400, 'INVALID_TIME_RANGE');
  }
  if (sh * 60 + sm >= eh * 60 + em) {
    throw new AppError('Giờ bắt đầu phải trước giờ kết thúc.', 400, 'INVALID_TIME_RANGE');
  }
  if (!date) {
    throw new AppError('Ngày không hợp lệ.', 400, 'INVALID_DATE');
  }

  const payload = {
    activity_type: activity_type.trim(),
    start_hour: sh,
    start_minute: sm,     // ➕
    end_hour: eh,
    end_minute: em,       // ➕
    date,
    latitude: Number(latitude || 10.762622),
    longitude: Number(longitude || 106.660172),
    note: note?.trim() || null,
    status: 'pending'
  };

  if (!supabaseClient) {
    const record = { ...payload, id: `mem-${Date.now()}`, created_at: new Date().toISOString() };
    inMemorySchedules.push(record);
    return { success: true, data: record, storage: 'memory' };
  }

  const { data, error } = await supabaseClient.from('schedules').insert([payload]).select().single();

  if (error) {
    if (isMissingTableError(error)) {
      logger.warn('Bảng schedules chưa tạo, dùng memory fallback', { error: error.message });
      const record = { ...payload, id: `mem-${Date.now()}`, created_at: new Date().toISOString() };
      inMemorySchedules.push(record);
      return { success: true, data: record, storage: 'memory' };
    }
    throw new AppError(`Không thể lưu lịch: ${error.message}`, 500, 'SUPABASE_INSERT_ERROR');
  }

  return { success: true, data, storage: 'supabase' };
}
  
/**
 * Lấy danh sách lịch (sắp xếp theo ngày mới nhất)
 */
async function getSchedules({ limit = 20, page = 1, status } = {}) {
  if (!supabaseClient) {
    let result = [...inMemorySchedules];
    if (status) result = result.filter((s) => s.status === status);
    return { success: true, data: result.slice(0, limit), storage: 'memory' };
  }

  let query = supabaseClient.from('schedules').select('*', { count: 'exact' }).order('date', { ascending: false }).order('start_hour', { ascending: true });

  if (status) query = query.eq('status', status);

  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, data: [], storage: 'memory', total: 0 };
    }
    throw new AppError(`Không thể lấy danh sách lịch: ${error.message}`, 500, 'SUPABASE_QUERY_ERROR');
  }

  return { success: true, data: data || [], total: count || 0, storage: 'supabase' };
}

/**
 * Cập nhật trạng thái lịch
 */
async function updateScheduleStatus(id, status) {
  if (!supabaseClient) {
    const idx = inMemorySchedules.findIndex((s) => s.id === id);
    if (idx !== -1) inMemorySchedules[idx].status = status;
    return { success: true };
  }

  const { error } = await supabaseClient.from('schedules').update({ status }).eq('id', id);

  if (error) {
    throw new AppError(`Không thể cập nhật trạng thái: ${error.message}`, 500, 'SUPABASE_UPDATE_ERROR');
  }

  return { success: true };
}

/**
 * Lấy các lịch đang pending để cron job kiểm tra
 */
async function getPendingSchedules() {
  if (!supabaseClient) return inMemorySchedules.filter((s) => s.status === 'pending');

  const today = getVietnamDateString();

  const { data, error } = await supabaseClient
    .from('schedules')
    .select('*')
    .eq('status', 'pending')
    .gte('date', today);

  if (error) {
    logger.warn('Không thể lấy pending schedules', { error: error.message });
    return [];
  }

  return data || [];
}

// In-memory fallback
/**
 * Cập nhật thông tin một lịch hoạt động
 */
async function updateSchedule(id, updates) {
  const { activity_type, start_hour, end_hour, start_minute, end_minute, date, latitude, longitude, note } = updates;

  if (start_hour != null && end_hour != null) {
    const sm = start_minute != null ? Number(start_minute) : 0;
    const em = end_minute != null ? Number(end_minute) : 0;
    if (Number(start_hour) * 60 + sm >= Number(end_hour) * 60 + em) {
      throw new AppError('Khung giờ không hợp lệ (giờ bắt đầu phải trước giờ kết thúc).', 400, 'INVALID_TIME_RANGE');
    }
  }

  const payload = {};
  if (activity_type != null) payload.activity_type = String(activity_type).trim();
  if (start_hour != null) payload.start_hour = Number(start_hour);
  if (start_minute != null) payload.start_minute = Number(start_minute);   // ➕
  if (end_hour != null) payload.end_hour = Number(end_hour);
  if (end_minute != null) payload.end_minute = Number(end_minute);         // ➕
  if (date != null) payload.date = date;
  if (latitude != null) payload.latitude = Number(latitude);
  if (longitude != null) payload.longitude = Number(longitude);
  if (note !== undefined) payload.note = note?.trim() || null;

  if (!supabaseClient) {
    const idx = inMemorySchedules.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new AppError('Không tìm thấy lịch cần cập nhật.', 404, 'SCHEDULE_NOT_FOUND');
    }
    inMemorySchedules[idx] = { ...inMemorySchedules[idx], ...payload };
    return { success: true, data: inMemorySchedules[idx], storage: 'memory' };
  }

  const { data, error } = await supabaseClient
    .from('schedules')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new AppError(`Không thể cập nhật lịch: ${error.message}`, 500, 'SUPABASE_UPDATE_ERROR');
  }

  if (!data) {
    throw new AppError('Không tìm thấy lịch cần cập nhật.', 404, 'SCHEDULE_NOT_FOUND');
  }

  return { success: true, data, storage: 'supabase' };
}

/**
 * Xóa một lịch hoạt động (kèm các alert liên quan)
 */
async function deleteSchedule(id) {
  if (!supabaseClient) {
    const idx = inMemorySchedules.findIndex((s) => s.id === id);
    if (idx === -1) {
      throw new AppError('Không tìm thấy lịch cần xóa.', 404, 'SCHEDULE_NOT_FOUND');
    }
    inMemorySchedules.splice(idx, 1);
    return { success: true };
  }

  const { data, error } = await supabaseClient
    .from('schedules')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new AppError(`Không thể xóa lịch: ${error.message}`, 500, 'SUPABASE_DELETE_ERROR');
  }

  if (!data) {
    throw new AppError('Không tìm thấy lịch cần xóa.', 404, 'SCHEDULE_NOT_FOUND');
  }

  return { success: true };
}
const inMemorySchedules = [];

module.exports = {
  createSchedule,
  getSchedules,
  updateScheduleStatus,
  getPendingSchedules,
  updateSchedule,
  deleteSchedule
};
