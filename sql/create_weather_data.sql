CREATE TABLE IF NOT EXISTS public.weather_data (
  id BIGSERIAL PRIMARY KEY,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  city TEXT,
  country TEXT,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  wind_speed DOUBLE PRECISION,
  weather_description TEXT,
  weather_icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_weather_data_created_at ON public.weather_data (created_at DESC);