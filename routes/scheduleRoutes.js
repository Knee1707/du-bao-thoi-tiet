const express = require('express');
const {
  createScheduleController,
  getSchedulesController,
  updateScheduleController,
  deleteScheduleController,
  checkScheduleForecastController,
  getAlertsController,
  markAlertsReadController
} = require('../controllers/scheduleController');

const router = express.Router();

// GET  /api/schedule          — danh sách lịch đã đặt
router.get('/', getSchedulesController);

// POST /api/schedule          — tạo lịch mới
router.post('/', createScheduleController);

// PUT  /api/schedule/:id      — cập nhật lịch
router.put('/:id', updateScheduleController);

// DELETE /api/schedule/:id    — xóa lịch
router.delete('/:id', deleteScheduleController);

// GET  /api/schedule/check    — kiểm tra forecast cho khung giờ
router.get('/check', checkScheduleForecastController);

// GET  /api/schedule/alerts   — cảnh báo chưa đọc
router.get('/alerts', getAlertsController);

// PATCH /api/schedule/alerts/read — đánh dấu đã đọc
router.patch('/alerts/read', markAlertsReadController);

module.exports = router;