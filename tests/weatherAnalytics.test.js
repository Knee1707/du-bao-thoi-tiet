const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeTemperatureStats, buildWeatherExportRows } = require('../services/weatherService');

test('summarizeTemperatureStats groups temperatures by day', () => {
  const records = [
    { created_at: '2024-01-01T08:00:00.000Z', temperature: 24 },
    { created_at: '2024-01-01T20:00:00.000Z', temperature: 28 },
    { created_at: '2024-01-02T10:00:00.000Z', temperature: 30 }
  ];

  const result = summarizeTemperatureStats(records, 'day');

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { period: '2024-01-01', averageTemperature: 26, count: 2 });
  assert.deepEqual(result[1], { period: '2024-01-02', averageTemperature: 30, count: 1 });
});

test('summarizeTemperatureStats groups temperatures by month', () => {
  const records = [
    { created_at: '2024-01-01T08:00:00.000Z', temperature: 20 },
    { created_at: '2024-02-01T08:00:00.000Z', temperature: 22 },
    { created_at: '2024-02-15T08:00:00.000Z', temperature: 24 }
  ];

  const result = summarizeTemperatureStats(records, 'month');

  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { period: '2024-01', averageTemperature: 20, count: 1 });
  assert.deepEqual(result[1], { period: '2024-02', averageTemperature: 23, count: 2 });
});

test('buildWeatherExportRows includes the expected columns', () => {
  const rows = buildWeatherExportRows([{ city: 'Ho Chi Minh', temperature: 31, humidity: 70, created_at: '2024-01-01T00:00:00.000Z' }]);

  assert.deepEqual(rows[0], {
    city: 'Ho Chi Minh',
    temperature: 31,
    humidity: 70,
    created_at: '2024-01-01T00:00:00.000Z'
  });
});
