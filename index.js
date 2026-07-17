const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const weatherRoutes = require('./routes/weatherRoutes');
const authRoutes = require('./routes/authRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const chatRoutes = require('./routes/chatRoutes');
const { errorHandler } = require('./middlewares/errorHandler');
const { startWeatherCron } = require('./cron/weatherCron');
const { startScheduleCron } = require('./cron/scheduleCron');
const { supabaseClient } = require('./config/supabase');
const { port } = require('./config/env');
const { requestLogger } = require('./middlewares/requestLogger');
const limiter = require('./middlewares/rateLimiter');
const logger = require('./config/logger');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);
app.use(limiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/auth', authRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/chat', chatRoutes);
app.use(errorHandler);

startWeatherCron();
startScheduleCron();

app.listen(port, () => {
  logger.info(`Server đang chạy tại http://localhost:${port}`);
  if (supabaseClient) {
    console.log('Supabase client đã được khởi tạo');
  } else {
    console.log('Supabase client chưa được cấu hình. Hãy thêm SUPABASE_URL và SUPABASE_KEY');
  }
});
