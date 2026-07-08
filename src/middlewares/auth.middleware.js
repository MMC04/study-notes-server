// 인증 미들웨어 (userAuth)
const jwt = require('jsonwebtoken');

function userAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({message: 'Authorization 헤더가 없습니다'});
  }
  const parts = authHeader.split(' ');
  const scheme = parts[0];
  const token = parts[1];
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({message: 'Authorization 형식 오류'});
  }
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
    req.user = {id: decoded.id};
    next();
  } catch (error) {
    return res.status(401).json({message: '유효하지 않거나 만료된 토큰'});
  }
}

module.exports = userAuth;