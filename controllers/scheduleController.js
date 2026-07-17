const { createSchedule, getSchedules, updateSchedule, deleteSchedule } = require('../services/scheduleService');
const { getUnreadAlerts, markAlertsRead } = require('../services/alertService');
const { getForecast } = require('../services/weatherService');

// POST /api/schedule — tạo lịch mới
async function createScheduleController(req, res, next) {
  try {
    const { activity_type, start_hour, end_hour, start_minute, end_minute, date, latitude, longitude, note } = req.body;
    const result = await createSchedule({ activity_type, start_hour, end_hour, start_minute, end_minute, date, latitude, longitude, note });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/schedule — lấy danh sách lịch
async function getSchedulesController(req, res, next) {
  try {
    const { limit = 20, page = 1, status } = req.query;
    const result = await getSchedules({ limit: Number(limit), page: Number(page), status });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// PUT /api/schedule/:id — cập nhật lịch
async function updateScheduleController(req, res, next) {
  try {
    const { id } = req.params;
    const { activity_type, start_hour, end_hour, start_minute, end_minute, date, latitude, longitude, note } = req.body;
    const result = await updateSchedule(id, { activity_type, start_hour, end_hour, start_minute, end_minute, date, latitude, longitude, note });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// DELETE /api/schedule/:id — xóa lịch
async function deleteScheduleController(req, res, next) {
  try {
    const { id } = req.params;
    const result = await deleteSchedule(id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// GET /api/schedule/check — kiểm tra forecast cho khung giờ cụ thể
async function checkScheduleForecastController(req, res, next) {
  try {
    const { lat = 10.762622, lon = 106.660172, start_hour, end_hour } = req.query;
    const forecastRes = await getForecast({ lat, lon });
    const forecastData = forecastRes.data;

    // Xác định các mốc nằm trong khung giờ
    const startH = Number(start_hour);
    const endH = Number(end_hour);
    const now = new Date();

    const relevantSlots = [];
    const slotMap = {
      30: forecastData.forecast_30min,
      60: forecastData.forecast_1h,
      180: forecastData.forecast_3h,
      360: forecastData.forecast_6h,
      720: forecastData.forecast_12h,
      1440: forecastData.forecast_24h
    };

    for (const [minutesAhead, slot] of Object.entries(slotMap)) {
      const slotTime = new Date(now.getTime() + Number(minutesAhead) * 60 * 1000);
      const slotHour = slotTime.getHours();
      if (slotHour >= startH && slotHour < endH) {
        relevantSlots.push(slot);
      }
    }

    const hasRain = relevantSlots.some((s) => s.rain_chance > 30 || s.rain_level !== 'không mưa');
    const maxRainChance = relevantSlots.length > 0 ? Math.max(...relevantSlots.map((s) => s.rain_chance)) : 0;

    res.status(200).json({
      success: true,
      data: {
        suitable: !hasRain,
        max_rain_chance: maxRainChance,
        forecast_slots: relevantSlots,
        message: hasRain
          ? `Khung giờ ${startH}h-${endH}h có nguy cơ mưa (${maxRainChance}%). Nên cân nhắc đổi giờ.`
          : `Khung giờ ${startH}h-${endH}h có vẻ thuận lợi, khả năng mưa thấp.`
      }
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/schedule/alerts — lấy cảnh báo chưa đọc
async function getAlertsController(req, res, next) {
  try {
    const { limit = 20 } = req.query;
    const result = await getUnreadAlerts({ limit: Number(limit) });
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

// PATCH /api/schedule/alerts/read — đánh dấu đã đọc
async function markAlertsReadController(req, res, next) {
  try {
    const { ids = [] } = req.body;
    const result = await markAlertsRead(ids);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createScheduleController,
  getSchedulesController,
  updateScheduleController,
  deleteScheduleController,
  checkScheduleForecastController,
  getAlertsController,
  markAlertsReadController
};