-- Tạo bảng lịch hoạt động
CREATE TABLE IF NOT EXISTS schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  activity_type TEXT NOT NULL,          -- 'xịt thuốc' | 'phơi đồ' | 'tưới cây' | 'khác'
  start_hour INTEGER NOT NULL,          -- giờ bắt đầu (0-23)
  end_hour INTEGER NOT NULL,            -- giờ kết thúc (0-23)
  date DATE NOT NULL,                   -- ngày thực hiện
  latitude DOUBLE PRECISION DEFAULT 10.762622,
  longitude DOUBLE PRECISION DEFAULT 106.660172,
  status TEXT DEFAULT 'pending',        -- 'pending' | 'alerted' | 'done'
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tạo bảng cảnh báo
CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES schedules(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  severity TEXT DEFAULT 'warning',      -- 'info' | 'warning' | 'danger'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(date);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_alerts_is_read ON alerts(is_read);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
