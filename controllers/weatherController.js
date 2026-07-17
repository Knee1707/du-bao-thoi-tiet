const {
  getCurrentWeather, getWeatherHistory, getForecast, getWeatherStats, getCityWeather, buildWeatherExportRows,
  getForecastSeries, getForecastByDate, getExtendedMetrics, suggestActivityWindows   // ➕
} = require('../services/weatherService');

async function getCurrentWeatherController(req, res, next) {
  try {
    const result = await getCurrentWeather(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getWeatherHistoryController(req, res, next) {
  try {
    const result = await getWeatherHistory(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getForecastController(req, res, next) {
  try {
    const result = await getForecast(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getCityWeatherController(req, res, next) {
  try {
    const result = await getCityWeather(req.query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getWeatherStatsController(req, res, next) {
  try {
    const history = await getWeatherHistory({ limit: 100, page: 1, sort: 'desc' });
    const result = await getWeatherStats(history.data || [], req.query.granularity || 'day');
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function exportWeatherController(req, res, next) {
  try {
    const history = await getWeatherHistory({ limit: 100, page: 1, sort: 'desc' });
    const rows = buildWeatherExportRows(history.data || []);
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'weather');
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=weather-data.xlsx');
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

async function getForecastSeriesController(req, res, next) {
  try {
    const result = await getForecastSeries(req.query);
    res.status(200).json(result);
  } catch (error) { next(error); }
}

async function getForecastByDateController(req, res, next) {
  try {
    const result = await getForecastByDate(req.query);
    res.status(200).json(result);
  } catch (error) { next(error); }
}

async function getExtendedMetricsController(req, res, next) {
  try {
    const result = await getExtendedMetrics(req.query);
    res.status(200).json(result);
  } catch (error) { next(error); }
}

async function getActivitySuggestionsController(req, res, next) {
  try {
    const result = await suggestActivityWindows(req.query);
    res.status(200).json(result);
  } catch (error) { next(error); }
}

module.exports = {
  getCurrentWeatherController,
  getWeatherHistoryController,
  getForecastController,
  getCityWeatherController,
  getWeatherStatsController,
  exportWeatherController,
  getForecastSeriesController,       
  getForecastByDateController,       
  getExtendedMetricsController,      
  getActivitySuggestionsController   
};