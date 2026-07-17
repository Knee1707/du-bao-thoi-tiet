const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey } = require('./env');
const logger = require('./logger');

let supabaseClient = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    logger.info('Supabase client initialized');
  } catch (error) {
    logger.error('Failed to initialize Supabase client', { error: error.message });
  }
} else {
  logger.warn('Supabase credentials missing; database persistence will fall back to memory');
}

module.exports = {
  supabaseClient,
  supabaseUrl,
  supabaseKey
};
