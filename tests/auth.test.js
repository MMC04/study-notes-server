const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const pool = require('../src/config/database');

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE articles, users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

// 회원가입 테스트
describe('POST /auth/register', () => {
  test('email 또는 pw가 없으면 400을 반환한다', async () => {
    const response = await request(app).post('/auth/register').send({ email: 'test@test.com' });
    expect(response.status).toBe(400);
  });

  test('정상 요청이면 201과 accessToken을 반환한다', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({ email: 'new@test.com', pw: '1234' });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBeDefined();
  });

  test('비밀번호가 평문이 아니라 해시로 저장된다', async () => {
    await request(app).post('/auth/register').send({ email: 'hash@test.com', pw: '1234' });

    const { rows } = await pool.query("SELECT pw FROM users WHERE email = 'hash@test.com'");
    expect(rows[0].pw).not.toBe('1234');

    const isMatch = await bcrypt.compare('1234', rows[0].pw);
    expect(isMatch).toBe(true);
  });

  test('이미 존재하는 이메일이면 409를 반환하고 중복 저장되지 않는다', async () => {
    await request(app).post('/auth/register').send({ email: 'dup@test.com', pw: '1234' });

    const response = await request(app).post('/auth/register').send({ email: 'dup@test.com', pw: '5678' });
    expect(response.status).toBe(409);

    const { rows } = await pool.query("SELECT * FROM users WHERE email = 'dup@test.com'");
    expect(rows.length).toBe(1);  // 두 번째 시도로 중복 생성되지 않았는지 확인
  });

  test('회원가입 시 refreshToken 쿠키가 설정된다', async () => {
    const response = await request(app).post('/auth/register').send({ email: 'cookie@test.com', pw: '1234' });

    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie'][0]).toContain('refreshToken');
  });
});

// 로그아웃 테스트
describe('POST /auth/logout', () => {
  test('refreshToken 쿠키가 없으면 401을 반환한다', async () => {
    const response = await request(app).post('/auth/logout');

    expect(response.status).toBe(401);
  });

  test('정상적인 refreshToken 쿠키가 있으면 로그아웃되고 DB의 refresh_token이 무효화된다', async () => {
    const registerResponse = await request(app)
      .post('/auth/register')
      .send({ email: 'logout@test.com', pw: '1234' });

    const cookies = registerResponse.headers['set-cookie'];

    const response = await request(app)
      .post('/auth/logout')
      .set('Cookie', cookies);

    expect(response.status).toBe(200);

    const { rows } = await pool.query("SELECT refresh_token FROM users WHERE email = 'logout@test.com'");
    expect(rows[0].refresh_token).toBeNull();
  });
});