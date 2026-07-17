const express = require('express');
const {
  getCurrentWeatherController, getWeatherHistoryController, getForecastController, getCityWeatherController,
  getWeatherStatsController, exportWeatherController,
  getForecastSeriesController, getForecastByDateController, getExtendedMetricsController, getActivitySuggestionsController // ➕
} = require('../controllers/weatherController');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// GET /api/weather/current
router.get('/current', getCurrentWeatherController);

// GET /api/weather/forecast
router.get('/forecast', getForecastController);

// GET /api/weather/history
router.get('/history', getWeatherHistoryController);

// GET /api/weather/city
router.get('/city', getCityWeatherController);

// GET /api/weather/search (backward-compatible alias)
router.get('/search', getCityWeatherController);

// GET /api/weather/stats
router.get('/stats', authenticate, getWeatherStatsController);

// GET /api/weather/export
router.get('/export', authenticate, exportWeatherController);

// GET /api/weather/forecast/series?lat=&lon=&step=30&hours=6
router.get('/forecast/series', getForecastSeriesController);

// GET /api/weather/forecast/date?lat=&lon=&date=2026-07-17
router.get('/forecast/date', getForecastByDateController);

// GET /api/weather/extended?lat=&lon=  → uv, wind, pressure, visibility
router.get('/extended', getExtendedMetricsController);

// GET /api/weather/best-times?lat=&lon=&date=
router.get('/best-times', getActivitySuggestionsController);

module.exports = router;
