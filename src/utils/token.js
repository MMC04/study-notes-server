// 토큰 생성기
const jwt = require('jsonwebtoken');

function tokenGenerator(user) {
  const accessToken = jwt.sign({id: user.id}, process.env.ACCESS_SECRET, {expiresIn: '15m'});
  const refreshToken = jwt.sign({id: user.id}, process.env.REFRESH_SECRET, {expiresIn: '7d'});
  return { accessToken, refreshToken };
}

module.exports = { tokenGenerator };