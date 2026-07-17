const { supabaseClient } = require('../config/supabase');
const { AppError } = require('../utils/appError');
const logger = require('../config/logger');

function isMissingTableError(error) {
  const message = error?.message || '';
  return message.includes('Could not find the table') || message.includes('relation') || message.includes('does not exist');
}

async function insertWeatherRecord(payload) {
  if (!supabaseClient) {
    return { saved: false, storage: 'memory' };
  }

  try {
    const { error } = await supabaseClient.from('weather_data').insert([payload]);

    if (error) {
      if (isMissingTableError(error)) {
        logger.warn('Supabase table missing; using memory fallback', { error: error.message });
        return { saved: false, storage: 'memory', warning: error.message };
      }

      throw new AppError(`Unable to save weather data to Supabase: ${error.message}`, 500, 'SUPABASE_INSERT_ERROR');
    }

    return { saved: true, storage: 'supabase' };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isMissingTableError(error)) {
      logger.warn('Supabase table missing; using memory fallback', { error: error.message });
      return { saved: false, storage: 'memory', warning: error.message };
    }

    throw error;
  }
}

async function getWeatherRecords(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
  const page = Math.max(Number(options.page) || 1, 1);
  const sortOrder = options.sortOrder === 'asc' ? 'asc' : 'desc';
  const dateFilter = options.date;

  if (!supabaseClient) {
    return { data: [], storage: 'memory' };
  }

  try {
    let query = supabaseClient.from('weather_data').select('*', { count: 'exact' });

    if (dateFilter) {
      const targetDate = new Date(dateFilter);
      if (!Number.isNaN(targetDate.getTime())) {
        const start = new Date(targetDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(targetDate);
        end.setUTCHours(23, 59, 59, 999);
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
      }
    }

    const { data, error, count } = await query.order('created_at', { ascending: sortOrder === 'asc' }).range((page - 1) * limit, page * limit - 1);

    if (error) {
      if (isMissingTableError(error)) {
        logger.warn('Supabase table missing; using memory fallback', { error: error.message });
        return { data: [], storage: 'memory', warning: error.message };
      }

      throw new AppError(`Unable to fetch weather history from Supabase: ${error.message}`, 500, 'SUPABASE_QUERY_ERROR');
    }

    return { data: data || [], storage: 'supabase', count: count || 0 };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isMissingTableError(error)) {
      logger.warn('Supabase table missing; using memory fallback', { error: error.message });
      return { data: [], storage: 'memory', warning: error.message };
    }

    throw error;
  }
}

module.exports = {
  insertWeatherRecord,
  getWeatherRecords
};
