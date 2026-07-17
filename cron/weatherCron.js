const cron = require('node-cron');
const { getCurrentWeather } = require('../services/weatherService');

function startWeatherCron() {
  // Run every 15 minutes for Ho Chi Minh City
  cron.schedule('*/15 * * * *', async () => {
    try {
      await getCurrentWeather({ lat: 10.762622, lon: 106.660172 });
      console.log('Weather cron job completed successfully.');
    } catch (error) {
      console.error('Weather cron job failed:', error.message);
    }
  });

  console.log('Weather cron job started.');
}

module.exports = {
  startWeatherCron
};
