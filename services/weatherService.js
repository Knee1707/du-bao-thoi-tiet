const axios = require('axios');
const { supabaseClient } = require('../config/supabase');
const { openWeatherApiKey } = require('../config/env');
const { AppError } = require('../utils/appError');
const { getCached, setCached } = require('./redisService');
const { insertWeatherRecord, getWeatherRecords } = require('./weatherRepository');

const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';
const OPENWEATHER_FORECAST_URL = 'https://api.openweathermap.org/data/2.5/forecast';
const OPENWEATHER_GEOCODING_URL = 'https://api.openweathermap.org/geo/1.0/direct';
const OPENWEATHER_ONECALL_URL = 'https://api.openweathermap.org/data/3.0/onecall';
const ALLOWED_STEPS_MIN = [10, 15, 30, 60, 120, 180];
const DEFAULT_LATITUDE = 10.762622;
const DEFAULT_LONGITUDE = 106.660172;
const inMemoryWeatherHistory = [];

function validateCoordinates(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    throw new AppError('Latitude and longitude must be valid numbers.', 400, 'INVALID_COORDINATES');
  }

  if (latitude < -90 || latitude > 90) {
    throw new AppError('Latitude must be between -90 and 90.', 400, 'INVALID_LATITUDE');
  }

  if (longitude < -180 || longitude > 180) {
    throw new AppError('Longitude must be between -180 and 180.', 400, 'INVALID_LONGITUDE');
  }

  return {
    latitude,
    longitude
  };
}

function validateCityName(city) {
  if (!city || typeof city !== 'string' || city.trim().length < 2) {
    throw new AppError('City name must be a non-empty string with at least 2 characters.', 400, 'INVALID_CITY');
  }

  return city.trim();
}

function filterWeatherHistoryByDate(records = [], date) {
  if (!date) {
    return records;
  }

  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) {
    throw new AppError('Date must be a valid ISO date string.', 400, 'INVALID_DATE');
  }

  const targetDay = targetDate.toISOString().split('T')[0];

  return records.filter((record) => {
    const recordDate = new Date(record.created_at).toISOString().split('T')[0];
    return recordDate === targetDay;
  });
}

function mapWeatherResponse(weatherData, coordinates) {
  return {
    temperature: weatherData.main?.temp,
    humidity: weatherData.main?.humidity,
    pressure: weatherData.main?.pressure,
    windSpeed: weatherData.wind?.speed,
    windDeg: weatherData.wind?.deg,                                  // ➕ mới
    visibility: weatherData.visibility != null                        // ➕ mới (đổi m -> km)
      ? Math.round((weatherData.visibility / 1000) * 10) / 10
      : null,
    description: weatherData.weather?.[0]?.description || 'No description available',
    icon: weatherData.weather?.[0]?.icon || '01d',
    city: weatherData.name,
    country: weatherData.sys?.country,
    sunrise: weatherData.sys?.sunrise,
    sunset: weatherData.sys?.sunset,
    time: weatherData.dt,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude
  };
}

function isMissingTableError(error) {
  const message = error?.message || '';
  return message.includes('Could not find the table') || message.includes('relation') || message.includes('does not exist');
}

function getMemoryHistory(limit, page, sortOrder) {
  const sortedHistory = [...inMemoryWeatherHistory].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  });

  const start = (page - 1) * limit;
  const end = start + limit;

  return {
    data: sortedHistory.slice(start, end),
    total: sortedHistory.length
  };
}

async function saveWeatherRecord(weatherRecord) {
  const payload = {
    latitude: weatherRecord.latitude,
    longitude: weatherRecord.longitude,
    temperature: weatherRecord.temperature,
    humidity: weatherRecord.humidity,
    pressure: weatherRecord.pressure,
    wind_speed: weatherRecord.windSpeed,
    weather_description: weatherRecord.description,
    weather_icon: weatherRecord.icon,
    city: weatherRecord.city,
    country: weatherRecord.country,
    created_at: new Date().toISOString()
  };

  inMemoryWeatherHistory.push(payload);

  try {
    const result = await insertWeatherRecord(payload);
    return result;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    return { saved: false, storage: 'memory', warning: error.message };
  }
}

async function getCurrentWeather(query = {}) {
  const coordinates = validateCoordinates(query.lat ?? DEFAULT_LATITUDE, query.lon ?? DEFAULT_LONGITUDE);
  const apiKey = openWeatherApiKey;

  if (!apiKey) {
    throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');
  }

  const cacheKey = `weather:${coordinates.latitude}:${coordinates.longitude}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    return { success: true, data: cached, cached: true };
  }

  try {
    const response = await axios.get(OPENWEATHER_BASE_URL, {
      params: {
        lat: coordinates.latitude,
        lon: coordinates.longitude,
        appid: apiKey,
        units: 'metric',
        lang: 'vi'
      }
    });

    const weatherRecord = mapWeatherResponse(response.data, coordinates);
    const saveResult = await saveWeatherRecord(weatherRecord);
    await setCached(cacheKey, weatherRecord, 300);

    return {
      success: true,
      data: weatherRecord,
      saved: saveResult.saved,
      storage: saveResult.storage,
      warning: saveResult.warning || null,
      cached: false
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        throw new AppError('OpenWeather API key is invalid or unauthorized.', 401, 'OPENWEATHER_AUTH_ERROR');
      }
      if (statusCode === 404) {
        throw new AppError('The requested location could not be found by OpenWeatherMap.', 404, 'OPENWEATHER_LOCATION_ERROR');
      }
      throw new AppError('Unable to reach OpenWeatherMap. Please try again later.', 502, 'OPENWEATHER_NETWORK_ERROR');
    }

    throw error;
  }
}

async function getWeatherHistory(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 100);
  const page = Math.max(Number(options.page) || 1, 1);
  const sortOrder = options.sort === 'asc' ? 'asc' : 'desc';
  const dateFilter = options.date;

  const records = await getWeatherRecords({
    limit,
    page,
    sortOrder,
    date: dateFilter
  });

  const baseRecords = records.storage === 'supabase' && Array.isArray(records.data) && records.data.length > 0
    ? records.data
    : [...inMemoryWeatherHistory, ...(records.data || [])];

  const filteredRecords = filterWeatherHistoryByDate(baseRecords, dateFilter);
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
  });
  const pagedRecords = sortedRecords.slice((page - 1) * limit, page * limit);

  return {
    success: true,
    data: pagedRecords,
    pagination: {
      page,
      limit,
      total: sortedRecords.length,
      totalPages: Math.ceil(sortedRecords.length / limit)
    },
    storage: records.storage === 'supabase' ? 'supabase' : 'memory'
  };
}

function summarizeTemperatureStats(records = [], granularity = 'day') {
  const buckets = new Map();

  records.forEach((record) => {
    const date = new Date(record.created_at);
    const period = granularity === 'month'
      ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
      : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

    if (!buckets.has(period)) {
      buckets.set(period, { total: 0, count: 0 });
    }

    const bucket = buckets.get(period);
    bucket.total += Number(record.temperature || 0);
    bucket.count += 1;
  });

  return Array.from(buckets.entries())
    .map(([period, value]) => ({ period, averageTemperature: Number((value.total / value.count).toFixed(2)), count: value.count }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

function buildWeatherExportRows(records = []) {
  return records.map((record) => ({
    city: record.city || '',
    temperature: record.temperature,
    humidity: record.humidity,
    created_at: record.created_at || ''
  }));
}

function classifyRain(rainLevelMmPerHour) {
  if (rainLevelMmPerHour < 0.5) return 'không mưa';
  if (rainLevelMmPerHour < 4) return 'mưa nhỏ';
  if (rainLevelMmPerHour < 16) return 'mưa vừa';
  return 'mưa lớn';
}

function interpolateWeather(t_target, points) {
  if (points.length === 0) {
    return {
      time: new Date(t_target).toISOString(),
      temperature: 0,
      humidity: 0,
      rain_chance: 0,
      rain_level: 'không mưa',
      description: 'không có dữ liệu'
    };
  }

  // Target time is before or equal to the first point
  if (t_target <= points[0].time) {
    return {
      time: new Date(t_target).toISOString(),
      temperature: Math.round(points[0].temperature * 10) / 10,
      humidity: Math.round(points[0].humidity),
      rain_chance: Math.round(points[0].rain_chance),
      rain_level: classifyRain(points[0].rain_level_mm),
      description: points[0].description
    };
  }

  // Target time is after or equal to the last point
  if (t_target >= points[points.length - 1].time) {
    const last = points[points.length - 1];
    return {
      time: new Date(t_target).toISOString(),
      temperature: Math.round(last.temperature * 10) / 10,
      humidity: Math.round(last.humidity),
      rain_chance: Math.round(last.rain_chance),
      rain_level: classifyRain(last.rain_level_mm),
      description: last.description
    };
  }

  // Find the bounding points [p1, p2]
  let p1 = points[0];
  let p2 = points[1];
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].time <= t_target && points[i + 1].time >= t_target) {
      p1 = points[i];
      p2 = points[i + 1];
      break;
    }
  }

  const denominator = p2.time - p1.time;
  const fraction = denominator === 0 ? 0 : (t_target - p1.time) / denominator;

  const temp = p1.temperature + fraction * (p2.temperature - p1.temperature);
  const hum = p1.humidity + fraction * (p2.humidity - p1.humidity);
  const rainChance = p1.rain_chance + fraction * (p2.rain_chance - p1.rain_chance);
  const rainLevelMm = p1.rain_level_mm + fraction * (p2.rain_level_mm - p1.rain_level_mm);
  const description = fraction < 0.5 ? p1.description : p2.description;

  return {
    time: new Date(t_target).toISOString(),
    temperature: Math.round(temp * 10) / 10,
    humidity: Math.round(hum),
    rain_chance: Math.round(rainChance),
    rain_level: classifyRain(rainLevelMm),
    description
  };
}

async function getForecast(query = {}) {
  const coordinates = validateCoordinates(query.lat ?? DEFAULT_LATITUDE, query.lon ?? DEFAULT_LONGITUDE);
  const apiKey = openWeatherApiKey;

  if (!apiKey) {
    throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');
  }

  try {
    const [currentRes, forecastRes] = await Promise.all([
      axios.get(OPENWEATHER_BASE_URL, {
        params: {
          lat: coordinates.latitude,
          lon: coordinates.longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'vi'
        }
      }),
      axios.get(OPENWEATHER_FORECAST_URL, {
        params: {
          lat: coordinates.latitude,
          lon: coordinates.longitude,
          appid: apiKey,
          units: 'metric',
          lang: 'vi',
          cnt: 40
        }
      })
    ]);

    const currentData = currentRes.data;
    const forecastList = forecastRes.data.list || [];

    const firstForecastPop = (forecastList[0]?.pop || 0) * 100;
    const currentRainLevel = currentData.rain?.['1h'] || (currentData.rain?.['3h'] ? currentData.rain['3h'] / 3 : 0);
    const currentRainChance = currentRainLevel > 0 ? 100 : firstForecastPop;

    const currentPoint = {
      time: currentData.dt * 1000,
      temperature: currentData.main?.temp,
      humidity: currentData.main?.humidity,
      rain_chance: currentRainChance,
      rain_level_mm: currentRainLevel,
      description: currentData.weather?.[0]?.description || 'không có mô tả'
    };

    const forecastPoints = forecastList.map((item) => {
      const rainLevel = (item.rain?.['3h'] || 0) / 3;
      return {
        time: item.dt * 1000,
        temperature: item.main?.temp,
        humidity: item.main?.humidity,
        rain_chance: (item.pop || 0) * 100,
        rain_level_mm: rainLevel,
        description: item.weather?.[0]?.description || 'không có mô tả'
      };
    });

    const allPoints = [currentPoint, ...forecastPoints].sort((a, b) => a.time - b.time);

    const now = Date.now();
    const forecast_30min = interpolateWeather(now + 30 * 60 * 1000, allPoints);
    const forecast_1h = interpolateWeather(now + 60 * 60 * 1000, allPoints);
    const forecast_3h = interpolateWeather(now + 3 * 60 * 60 * 1000, allPoints);
    const forecast_6h = interpolateWeather(now + 6 * 60 * 60 * 1000, allPoints);
    const forecast_12h = interpolateWeather(now + 12 * 60 * 60 * 1000, allPoints);
    const forecast_24h = interpolateWeather(now + 24 * 60 * 60 * 1000, allPoints);

    return {
      success: true,
      data: {
        forecast_30min,
        forecast_1h,
        forecast_3h,
        forecast_6h,
        forecast_12h,
        forecast_24h
      }
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        throw new AppError('OpenWeather API key is invalid or unauthorized.', 401, 'OPENWEATHER_AUTH_ERROR');
      }
      if (statusCode === 404) {
        throw new AppError('The requested location could not be found by OpenWeatherMap.', 404, 'OPENWEATHER_LOCATION_ERROR');
      }
      throw new AppError('Unable to reach OpenWeatherMap. Please try again later.', 502, 'OPENWEATHER_NETWORK_ERROR');
    }

    throw error;
  }
}

async function getWeatherStats(records = [], granularity = 'day') {
  const summary = summarizeTemperatureStats(records, granularity);
  return {
    success: true,
    data: summary,
    granularity
  };
}

async function getCityWeather(query = {}) {
  const city = validateCityName(query.city);
  const apiKey = openWeatherApiKey;

  if (!city) {
    throw new AppError('City name is required.', 400, 'INVALID_CITY');
  }

  if (!apiKey) {
    throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');
  }

  try {
    const response = await axios.get(OPENWEATHER_GEOCODING_URL, {
      params: {
        q: city,
        limit: 1,
        appid: apiKey
      }
    });

    const location = response.data?.[0];
    if (!location) {
      throw new AppError('The requested city could not be found.', 404, 'CITY_NOT_FOUND');
    }

    const weather = await getCurrentWeather({ lat: location.lat, lon: location.lon });
    return {
      success: true,
      data: {
        ...weather.data,
        city: location.name,
        country: location.country
      }
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      if (statusCode === 401) {
        throw new AppError('OpenWeather API key is invalid or unauthorized.', 401, 'OPENWEATHER_AUTH_ERROR');
      }
      throw new AppError('Unable to reach OpenWeatherMap. Please try again later.', 502, 'OPENWEATHER_NETWORK_ERROR');
    }

    throw error;
  }
}

function classifyUv(uvi) {
  if (uvi == null) return 'không có dữ liệu';
  if (uvi < 3) return 'thấp';
  if (uvi < 6) return 'trung bình';
  if (uvi < 8) return 'cao';
  if (uvi < 11) return 'rất cao';
  return 'cực đoan';
}

// ── Dự báo theo mốc thời gian tuỳ chỉnh (10p / 15p / 30p / 1h / 2h / 3h), trả về giờ/ngày thật ──
async function getForecastSeries(query = {}) {
  const coordinates = validateCoordinates(query.lat ?? DEFAULT_LATITUDE, query.lon ?? DEFAULT_LONGITUDE);
  const apiKey = openWeatherApiKey;
  if (!apiKey) throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');

  const step = ALLOWED_STEPS_MIN.includes(Number(query.step)) ? Number(query.step) : 30;
  const hoursAhead = Math.min(Math.max(Number(query.hours) || 6, 1), 24);

  const [currentRes, forecastRes] = await Promise.all([
    axios.get(OPENWEATHER_BASE_URL, {
      params: { lat: coordinates.latitude, lon: coordinates.longitude, appid: apiKey, units: 'metric', lang: 'vi' }
    }),
    axios.get(OPENWEATHER_FORECAST_URL, {
      params: { lat: coordinates.latitude, lon: coordinates.longitude, appid: apiKey, units: 'metric', lang: 'vi', cnt: 40 }
    })
  ]);

  const currentData = currentRes.data;
  const forecastList = forecastRes.data.list || [];
  const currentRainLevel = currentData.rain?.['1h'] || (currentData.rain?.['3h'] ? currentData.rain['3h'] / 3 : 0);
  const firstPop = (forecastList[0]?.pop || 0) * 100;

  const currentPoint = {
    time: currentData.dt * 1000,
    temperature: currentData.main?.temp,
    humidity: currentData.main?.humidity,
    rain_chance: currentRainLevel > 0 ? 100 : firstPop,
    rain_level_mm: currentRainLevel,
    description: currentData.weather?.[0]?.description || 'không có mô tả'
  };

  const forecastPoints = forecastList.map((item) => ({
    time: item.dt * 1000,
    temperature: item.main?.temp,
    humidity: item.main?.humidity,
    rain_chance: (item.pop || 0) * 100,
    rain_level_mm: (item.rain?.['3h'] || 0) / 3,
    description: item.weather?.[0]?.description || 'không có mô tả'
  }));

  const allPoints = [currentPoint, ...forecastPoints].sort((a, b) => a.time - b.time);

  const now = Date.now();
  const series = [];
  for (let m = step; m <= hoursAhead * 60; m += step) {
    series.push(interpolateWeather(now + m * 60 * 1000, allPoints)); // .time là ISO datetime thật
  }

  return { success: true, data: { step, hoursAhead, series } };
}

// ── Dự báo theo một ngày cụ thể (trong phạm vi 5 ngày tới của API free) ──
async function getForecastByDate(query = {}) {
  const coordinates = validateCoordinates(query.lat ?? DEFAULT_LATITUDE, query.lon ?? DEFAULT_LONGITUDE);
  const apiKey = openWeatherApiKey;
  if (!apiKey) throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');

  const targetDateStr = query.date;
  if (!targetDateStr) throw new AppError('Vui lòng cung cấp date (YYYY-MM-DD).', 400, 'INVALID_DATE');

  const targetDate = new Date(targetDateStr);
  if (Number.isNaN(targetDate.getTime())) throw new AppError('Ngày không hợp lệ.', 400, 'INVALID_DATE');

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 5);
  if (targetDate > maxDate) {
    throw new AppError('API miễn phí (OpenWeather 5-day) chỉ hỗ trợ dự báo tối đa 5 ngày tới.', 400, 'DATE_OUT_OF_RANGE');
  }

  const forecastRes = await axios.get(OPENWEATHER_FORECAST_URL, {
    params: { lat: coordinates.latitude, lon: coordinates.longitude, appid: apiKey, units: 'metric', lang: 'vi', cnt: 40 }
  });

  const dayPoints = (forecastRes.data.list || []).filter((item) => {
    return new Date(item.dt * 1000).toISOString().split('T')[0] === targetDateStr;
  });

  if (dayPoints.length === 0) {
    return { success: true, data: { date: targetDateStr, points: [], summary: null } };
  }

  const points = dayPoints.map((item) => {
    const rainLevel = (item.rain?.['3h'] || 0) / 3;
    return {
      time: new Date(item.dt * 1000).toISOString(),
      hour: new Date(item.dt * 1000).getHours(),
      temperature: Math.round(item.main?.temp * 10) / 10,
      humidity: item.main?.humidity,
      pressure: item.main?.pressure,
      windSpeed: item.wind?.speed,
      rain_chance: Math.round((item.pop || 0) * 100),
      rain_level: classifyRain(rainLevel),
      description: item.weather?.[0]?.description || 'không có mô tả',
      icon: item.weather?.[0]?.icon || '01d'
    };
  });

  const temps = points.map((p) => p.temperature);
  const summary = {
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps),
    avgHumidity: Math.round(points.reduce((s, p) => s + (p.humidity || 0), 0) / points.length),
    maxRainChance: Math.max(...points.map((p) => p.rain_chance))
  };

  return { success: true, data: { date: targetDateStr, points, summary } };
}

// ── UV index + gió + áp suất + tầm nhìn (visibility) ──
async function getExtendedMetrics(query = {}) {
  const coordinates = validateCoordinates(query.lat ?? DEFAULT_LATITUDE, query.lon ?? DEFAULT_LONGITUDE);
  const apiKey = openWeatherApiKey;
  if (!apiKey) throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');

  const currentRes = await axios.get(OPENWEATHER_BASE_URL, {
    params: { lat: coordinates.latitude, lon: coordinates.longitude, appid: apiKey, units: 'metric', lang: 'vi' }
  });
  const data = currentRes.data;

  let uvIndex = null;
  try {
    // One Call API 3.0 — cần bật ở tài khoản OpenWeather (có gói free 1000 calls/ngày, dùng chung API key)
    const oneCallRes = await axios.get(OPENWEATHER_ONECALL_URL, {
      params: { lat: coordinates.latitude, lon: coordinates.longitude, appid: apiKey, exclude: 'minutely,hourly,daily,alerts' }
    });
    uvIndex = oneCallRes.data?.current?.uvi ?? null;
  } catch (err) {
    uvIndex = null; // tài khoản chưa subscribe One Call 3.0 → bỏ qua, không chặn response
  }

  return {
    success: true,
    data: {
      windSpeed: data.wind?.speed ?? null,
      windDeg: data.wind?.deg ?? null,
      pressure: data.main?.pressure ?? null,
      visibility: data.visibility != null ? Math.round((data.visibility / 1000) * 10) / 10 : null,
      uvIndex,
      uvLevel: classifyUv(uvIndex)
    }
  };
}

// ── Gợi ý khung giờ đẹp trong ngày cho từng loại hoạt động ──
const ACTIVITY_PROFILES = {
  'Đi chơi / du lịch': { minTemp: 20, maxTemp: 32, maxRainChance: 30, maxWind: 8 },
  'Chạy bộ':           { minTemp: 15, maxTemp: 28, maxRainChance: 20, maxWind: 6 },
  'Đạp xe':            { minTemp: 15, maxTemp: 30, maxRainChance: 20, maxWind: 7 }
};

function scoreWindow(point, profile) {
  let score = 100;
  if (point.temperature < profile.minTemp || point.temperature > profile.maxTemp) score -= 30;
  if (point.rain_chance > profile.maxRainChance) score -= 40;
  if ((point.windSpeed || 0) > profile.maxWind) score -= 15;
  return Math.max(score, 0);
}

async function suggestActivityWindows(query = {}) {
  const dateStr = query.date || new Date().toISOString().split('T')[0];
  const dayForecast = await getForecastByDate({ ...query, date: dateStr });
  const points = dayForecast.data.points;

  if (!points.length) {
    return { success: true, data: { date: dateStr, suggestions: [] } };
  }

  const suggestions = Object.entries(ACTIVITY_PROFILES).map(([activity, profile]) => {
    const scored = points.map((p) => ({ ...p, score: scoreWindow(p, profile) }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored.slice(0, 2).filter((p) => p.score >= 60);
    return {
      activity,
      windows: best.map((p) => ({
        time: p.time,
        hour: p.hour,
        temperature: p.temperature,
        rain_chance: p.rain_chance,
        score: p.score,
        label: p.score >= 85 ? 'Rất đẹp' : p.score >= 60 ? 'Khá đẹp' : 'Tạm được'
      }))
    };
  });

  return { success: true, data: { date: dateStr, suggestions } };
}

// Tìm tọa độ theo tên địa điểm (dùng cho AI chat khi người dùng nhắc tên nơi muốn đến)
async function resolveLocation(cityName) {
  const apiKey = openWeatherApiKey;
  if (!apiKey) throw new AppError('OpenWeather API key is not configured.', 500, 'MISSING_API_KEY');

  const name = validateCityName(cityName);
  if (!name) throw new AppError('Tên địa điểm không hợp lệ.', 400, 'INVALID_CITY');

  const response = await axios.get(OPENWEATHER_GEOCODING_URL, {
    params: { q: name, limit: 1, appid: apiKey }
  });

  const location = response.data?.[0];
  if (!location) throw new AppError(`Không tìm thấy địa điểm "${cityName}".`, 404, 'CITY_NOT_FOUND');

  return { lat: location.lat, lon: location.lon, name: location.name, country: location.country };
}
module.exports = {
  validateCoordinates,
  validateCityName,
  filterWeatherHistoryByDate,
  getCurrentWeather,
  getWeatherHistory,
  getForecast,
  getWeatherStats,
  getCityWeather,
  summarizeTemperatureStats,
  buildWeatherExportRows,
  getForecastSeries,        
  getForecastByDate,        
  getExtendedMetrics,
  resolveLocation,       
  suggestActivityWindows    
};
