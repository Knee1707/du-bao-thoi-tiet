const { supabaseClient } = require('../config/supabase');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

// In-memory fallback
const inMemoryAlerts = [];

function isMissingTableError(error) {
  const msg = error?.message || '';
  return (
    msg.includes('Could not find the table') ||
    msg.includes('relation') ||
    msg.includes('does not exist')
  );
}

/**
 * Tạo cảnh báo mới
 */
async function createAlert({ schedule_id, message, severity = 'warning' }) {
  const payload = {
    schedule_id,
    message,
    severity,
    is_read: false
  };

  if (!supabaseClient) {
    const record = { ...payload, id: `mem-${Date.now()}`, created_at: new Date().toISOString() };
    inMemoryAlerts.push(record);
    return { success: true, data: record, storage: 'memory' };
  }

  const { data, error } = await supabaseClient.from('alerts').insert([payload]).select().single();

  if (error) {
    if (isMissingTableError(error)) {
      logger.warn('Bảng alerts chưa tạo, dùng memory fallback', { error: error.message });
      const record = { ...payload, id: `mem-${Date.now()}`, created_at: new Date().toISOString() };
      inMemoryAlerts.push(record);
      return { success: true, data: record, storage: 'memory' };
    }
    throw new AppError(`Không thể lưu cảnh báo: ${error.message}`, 500, 'SUPABASE_INSERT_ERROR');
  }

  return { success: true, data, storage: 'supabase' };
}

/**
 * Lấy các cảnh báo chưa đọc
 */
async function getUnreadAlerts({ limit = 20 } = {}) {
  if (!supabaseClient) {
    return {
      success: true,
      data: inMemoryAlerts.filter((a) => !a.is_read).slice(0, limit),
      storage: 'memory'
    };
  }

  const { data, error } = await supabaseClient
    .from('alerts')
    .select('*, schedules(activity_type, date, start_hour, end_hour)')
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) {
      return { success: true, data: [], storage: 'memory' };
    }
    throw new AppError(`Không thể lấy cảnh báo: ${error.message}`, 500, 'SUPABASE_QUERY_ERROR');
  }

  return { success: true, data: data || [], storage: 'supabase' };
}

/**
 * Đánh dấu tất cả cảnh báo là đã đọc
 */
async function markAlertsRead(ids = []) {
  if (!supabaseClient) {
    inMemoryAlerts.forEach((a) => {
      if (ids.length === 0 || ids.includes(a.id)) a.is_read = true;
    });
    return { success: true };
  }

  let query = supabaseClient.from('alerts').update({ is_read: true });
  if (ids.length > 0) {
    query = query.in('id', ids);
  } else {
    query = query.eq('is_read', false);
  }

  const { error } = await query;
  if (error) {
    throw new AppError(`Không thể cập nhật cảnh báo: ${error.message}`, 500, 'SUPABASE_UPDATE_ERROR');
  }

  return { success: true };
}

module.exports = {
  createAlert,
  getUnreadAlerts,
  markAlertsRead
};
