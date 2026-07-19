// 토큰 생성기
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function tokenGenerator(user) {
  const accessToken = jwt.sign(
    { id: user.id },
    process.env.ACCESS_SECRET,
    { expiresIn: '15m' }
  );
  const refreshToken = jwt.sign(
    { id: user.id, jti: crypto.randomUUID() },   // ← 매번 고유한 무작위 값 추가
    process.env.REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { accessToken, refreshToken };
}

module.exports = { tokenGenerator };