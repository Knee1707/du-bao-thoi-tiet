const cron = require('node-cron');
const { getPendingSchedules, updateScheduleStatus } = require('../services/scheduleService');
const { getForecast } = require('../services/weatherService');
const { createAlert } = require('../services/alertService');
const logger = require('../config/logger');

/**
 * Kiểm tra dự báo cho một lịch đang pending
 * Nếu phát hiện khả năng mưa > 40% trong khung giờ → tạo cảnh báo
 */
async function checkSchedule(schedule) {
  try {
    const forecastRes = await getForecast({
      lat: schedule.latitude,
      lon: schedule.longitude
    });

    const forecastData = forecastRes.data;
    const startH = schedule.start_hour;
    const endH = schedule.end_hour;

    // Lấy ngày của lịch
    const scheduleDate = new Date(schedule.date);
    const today = new Date();
    const isToday =
      scheduleDate.getUTCFullYear() === today.getFullYear() &&
      scheduleDate.getUTCMonth() === today.getMonth() &&
      scheduleDate.getUTCDate() === today.getDate();

    // Chỉ cảnh báo nếu lịch là hôm nay hoặc ngày mai
    const isTomorrow =
      scheduleDate.getUTCFullYear() === today.getFullYear() &&
      scheduleDate.getUTCMonth() === today.getMonth() &&
      scheduleDate.getUTCDate() === today.getDate() + 1;

    if (!isToday && !isTomorrow) return;

    // Lấy các slot forecast có giờ nằm trong khung
    const now = Date.now();
    const slots = [
      { minutesAhead: 30, data: forecastData.forecast_30min },
      { minutesAhead: 60, data: forecastData.forecast_1h },
      { minutesAhead: 180, data: forecastData.forecast_3h },
      { minutesAhead: 360, data: forecastData.forecast_6h },
      { minutesAhead: 720, data: forecastData.forecast_12h },
      { minutesAhead: 1440, data: forecastData.forecast_24h }
    ];

    const relevantSlots = slots.filter(({ minutesAhead }) => {
      const slotTime = new Date(now + minutesAhead * 60 * 1000);
      const slotHour = slotTime.getHours();
      return slotHour >= startH && slotHour < endH;
    });

    if (relevantSlots.length === 0) return;

    const maxRainChance = Math.max(...relevantSlots.map((s) => s.data.rain_chance));
    const hasHeavyRain = relevantSlots.some((s) => s.data.rain_level === 'mưa lớn');
    const hasMediumRain = relevantSlots.some((s) => s.data.rain_level === 'mưa vừa');

    if (maxRainChance < 40) return; // Không cần cảnh báo

    const severity = hasHeavyRain ? 'danger' : hasMediumRain ? 'warning' : 'info';
    const rainDesc = hasHeavyRain ? 'mưa lớn' : hasMediumRain ? 'mưa vừa' : 'mưa nhỏ';

    const message = `⚠️ Cảnh báo lịch "${schedule.activity_type}" (${startH}h-${endH}h ngày ${schedule.date}): Dự báo có ${rainDesc} với khả năng ${maxRainChance}%. Bạn nên cân nhắc đổi lịch!`;

    await createAlert({ schedule_id: schedule.id, message, severity });
    await updateScheduleStatus(schedule.id, 'alerted');

    logger.info(`Đã tạo cảnh báo cho lịch ${schedule.id}: ${message}`);
  } catch (err) {
    logger.warn(`Lỗi khi kiểm tra lịch ${schedule.id}`, { error: err.message });
  }
}

/**
 * Khởi động cron job quét lịch mỗi 10 phút
 */
function startScheduleCron() {
  cron.schedule('*/10 * * * *', async () => {
    logger.info('Bắt đầu quét lịch pending...');
    try {
      const pendingSchedules = await getPendingSchedules();
      logger.info(`Tìm thấy ${pendingSchedules.length} lịch cần kiểm tra`);

      for (const schedule of pendingSchedules) {
        await checkSchedule(schedule);
      }
    } catch (err) {
      logger.error('Lỗi cron quét lịch', { error: err.message });
    }
  });

  logger.info('Schedule cron job started (every 10 minutes).');
}

module.exports = { startScheduleCron };
