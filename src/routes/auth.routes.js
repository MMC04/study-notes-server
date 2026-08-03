// 인증 관련 라우트
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const userAuth = require('../middlewares/auth.middleware');
const { tokenGenerator } = require('../utils/token');

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 회원 등록
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content: 
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, pw]
 *             properties:
 *               email:
 *                 type: string
 *               pw:
 *                 type: string
 *     responses:
 *       201:
 *         description: 회원 등록 성공
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *           description: refreshToken이 httpOnly 쿠키로 설정됨  
 *       400:
 *         description: 입력값이 유효하지 않음
 *       409:
 *         description: 이미 존재하는 이메일
 *       500:
 *         description: 서버 오류
 */
router.post('/register', async (req, res) => { 
  try {
    const { email, pw } = req.body;

    if (!email || !pw) {
      return res.status(400).json({message: 'email 또는 비밀번호가 입력되지 않았습니다.'})
    }
    const searchEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (searchEmail.rows.length > 0) {
      return res.status(409).json({message: '이미 존재하는 email입니다.'})
    }

    // 비밀번호 해싱 후 DB에 이메일, 비밀번호 저장
    const hashedPw = await bcrypt.hash(pw, 10);
    const { rows : newUser } = await pool.query('INSERT INTO users (email, pw) VALUES ($1, $2) RETURNING id, email', [email, hashedPw]);

    // 회원가입 완료시 자동로그인
    const { accessToken, refreshToken } = tokenGenerator(newUser[0]);

    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, newUser[0].id]);
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    })

    res.status(201).json({accessToken});
  }

  catch (error) {
    console.error(error);
    res.status(500).json({message: '서버 에러'});
  } 
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 로그인
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content: 
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, pw]
 *             properties:
 *               email:
 *                 type: string
 *               pw:
 *                 type: string
 *     responses:
 *       200:
 *         description: 로그인 성공
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *           description: refreshToken이 httpOnly 쿠키로 설정됨 
 *       401:
 *         description: 틀린 입력값
 *       500:
 *         description: 서버 오류
 */
router.post('/login', async (req, res) => { 
  try {
  const { email, pw } = req.body;
  
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  
  const user = rows[0];
  if (!user) {
    return res.status(401).json({message: '이메일 혹은 id가 잘못되었습니다.'});
  }
  
  const isMatch = await bcrypt.compare(pw, user.pw);
  if (!isMatch) {
    return res.status(401).json({message: '이메일 혹은 id가 잘못되었습니다.'});
  }

  const { accessToken, refreshToken }= tokenGenerator(user)
  await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2',[refreshToken, user.id]);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({accessToken});
  }
  catch (error) {
    console.error(error);
    res.status(500).json({message: '서버 에러'});  
  }
});

/**
 * @swagger
 * /auth/token/refresh:
 *   post:
 *     summary: Access/Refresh 토큰 재발급
 *     description: 요청 쿠키의 refreshToken을 이용해 인증합니다.
 *     tags: [Auth]
 *     parameters: 
 *       - in: cookie
 *         name: refreshToken
 *         required: true
 *         schema:
 *           type: string
 *         description: httpOnly 쿠키로 전달되는 refreshToken
 *     responses:
 *       200:
 *         description: 재발급 성공
 *       401:
 *         description: 쿠키에 refreshToken이 없음
 *       403:
 *         description: 유효하지 않거나 만료된 토큰
 *       500:
 *         description: 서버 오류 
 */
router.post('/token/refresh', async (req, res) => { 
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({message: '토큰 없음'})
  }
  const stored = await pool.query('SELECT * FROM users WHERE refresh_token = $1', [refreshToken]);
  if (!stored.rows.length) {
    return res.status(403).json({message: '유효하지 않은 토큰'})
  }
  const user = stored.rows[0];

  try {
    jwt.verify(refreshToken, process.env.REFRESH_SECRET);

    // refresh token rotation — 새 토큰 쌍을 발급
    const { accessToken, refreshToken: newRefreshToken } = tokenGenerator(user);

    // 기존 것을 새 것으로 즉시 교체 (이전 값은 더 이상 DB에 없으므로 자동 무효화됨)
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [newRefreshToken, user.id]);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken });
  }
  catch (error) {
    return res.status(403).json({message: '만료된 토큰'});
  }
});

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 로그아웃
 *     description: DB에 저장된 refreshToken을 삭제, 쿠키에 저장된 refreshToken을 비움
 *     tags: [Auth]
 *     parameters: 
 *       - in: cookie
 *         name: refreshToken
 *         required: true
 *         schema:
 *           type: string
 *         description: httpOnly 쿠키로 전달되는 refreshToken
 *     responses:
 *       200:
 *         description: 로그아웃 성공
 *       401:
 *         description: 쿠키에 refreshToken이 없음
 *       500:
 *         description: 서버 오류
 */
router.post('/logout', async (req, res) => { 
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({message : "토큰이 없습니다."});

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [null, decoded.id])
    res.clearCookie('refreshToken').json({message: "로그아웃 완료"});
  }
  catch (error) {
    console.error(error);
    res.status(500).json({message: "서버 에러"});
  }
 });

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 본인 정보 조회
 *     tags: [Auth]
 *     security: 
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 본인 정보 조회 성공
 *       404:
 *         description: 사용자를 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.get('/me', userAuth, async (req, res) => { 
  try {
    const userId = req.user.id;

    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({message: '사용자를 찾을 수 없습니다.'});
    }

    return res.json({user: rows[0]});
  
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message: '서버 에러'});
  }
});

module.exports = router;