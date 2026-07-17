require('dotenv').config();
const axios = require('axios');

const apiKey = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-flash-latest'; // model alias luôn trỏ tới bản Flash mới nhất

async function test() {
  console.log('API key có tồn tại:', !!apiKey, '| độ dài:', apiKey?.length);
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      { contents: [{ parts: [{ text: 'Xin chào' }] }] },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': apiKey   // ➕ gửi key qua header thay vì query param
        }
      }
    );
    console.log('✅ THÀNH CÔNG:');
    console.log(res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.log('❌ LỖI:');
    console.log('Status:', err.response?.status);
    console.log('Message:', err.response?.data?.error?.message || err.message);
  }
}

test();