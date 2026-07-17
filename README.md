# Weather Forecast Backend

Backend REST API cho ứng dụng dự báo thời tiết bằng Node.js, Express, Supabase, OpenWeatherMap và Redis.

## Tính năng chính

- Weather current + forecast lookup
- Authentication bằng JWT
- Swagger UI tại /api-docs
- Rate limiting, Helmet, compression
- Redis cache cho response thời tiết
- Weather history persistence với fallback memory
- Analytics thống kê nhiệt độ theo ngày/tháng
- Export dữ liệu thời tiết sang Excel
- Docker + Docker Compose + GitHub Actions CI

## Cài đặt

1. Clone project.
2. Cài đặt dependencies:

```bash
npm install
```

3. Tạo file `.env` từ `.env.example` và điền các giá trị cần thiết.

## Chạy project

```bash
npm start
```

Hoặc dùng Docker:

```bash
docker compose up --build
```

## Cấu trúc project

```text
config/
controllers/
cron/
middlewares/
routes/
services/
utils/
```

## API chính

### Health

```bash
curl http://localhost:3000/health
```

### Current weather

```bash
curl "http://localhost:3000/api/weather/current?lat=10.762622&lon=106.660172"
```

### Forecast 5 ngày

```bash
curl "http://localhost:3000/api/weather/forecast?lat=10.762622&lon=106.660172"
```

### Search city

```bash
curl "http://localhost:3000/api/weather/search?city=ho chi minh"
```

### History

```bash
curl "http://localhost:3000/api/weather/history?limit=5&page=1&sort=desc"
```

### Auth

```bash
curl -X POST http://localhost:3000/api/auth/register -H "Content-Type: application/json" -d '{"email":"demo@example.com","password":"123456"}'
```

### Stats (requires JWT)

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/weather/stats?granularity=day
```

### Export (requires JWT)

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/weather/export -o weather.xlsx
```

## Biến môi trường

```env
OPENWEATHER_API_KEY=your_openweather_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
PORT=3000
JWT_SECRET=change-me
REDIS_URL=redis://localhost:6379
```

## Các package sử dụng

- express
- axios
- dotenv
- cors
- compression
- helmet
- express-rate-limit
- jsonwebtoken
- bcryptjs
- redis
- swagger-jsdoc
- swagger-ui-express
- xlsx
- node-cron
- @supabase/supabase-js
- nodemon
