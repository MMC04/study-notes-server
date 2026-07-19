// 테스트 헬퍼 함수 모음
const jwt = require('jsonwebtoken');

// 테스트용 회원 생성
async function createTestUser(pool, email = `user${Date.now()}@test.com`) {
  const { rows } = await pool.query(
    "INSERT INTO users (email, pw) VALUES ($1, 'hashed') RETURNING id",
    [email]
  );
  const id = rows[0].id;
  const token = jwt.sign({ id }, process.env.ACCESS_SECRET, { expiresIn: '15m' });
  return { id, token };
}

module.exports = { createTestUser };