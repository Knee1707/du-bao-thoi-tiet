const test = require('node:test');
const assert = require('node:assert/strict');
const { filterWeatherHistoryByDate } = require('../services/weatherService');

test('filterWeatherHistoryByDate returns records for a specific day', () => {
  const records = [
    { city: 'Ho Chi Minh', created_at: '2024-01-01T09:00:00.000Z' },
    { city: 'Da Nang', created_at: '2024-01-02T10:00:00.000Z' },
    { city: 'Hue', created_at: '2024-01-02T12:00:00.000Z' }
  ];

  const result = filterWeatherHistoryByDate(records, '2024-01-02');

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.city), ['Da Nang', 'Hue']);
});
