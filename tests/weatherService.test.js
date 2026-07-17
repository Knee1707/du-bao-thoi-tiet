const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCoordinates } = require('../services/weatherService');

test('validateCoordinates returns normalized coordinates for valid input', () => {
  const result = validateCoordinates('10.762622', '106.660172');
  assert.deepEqual(result, { latitude: 10.762622, longitude: 106.660172 });
});

test('validateCoordinates rejects latitude outside allowed range', () => {
  assert.throws(() => validateCoordinates('95', '106.660172'), /Latitude must be between -90 and 90/i);
});

test('validateCoordinates rejects longitude outside allowed range', () => {
  assert.throws(() => validateCoordinates('10.762622', '190'), /Longitude must be between -180 and 180/i);
});
