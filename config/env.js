const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  openWeatherApiKey: process.env.OPENWEATHER_API_KEY?.trim() || '',
  supabaseUrl: process.env.SUPABASE_URL?.trim() || '',
  supabaseKey: process.env.SUPABASE_KEY?.trim() || '',
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() || ''
};
