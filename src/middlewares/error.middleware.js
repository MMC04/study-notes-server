// 에러 핸들러

// 404 핸들러 — 어떤 라우트에도 안 걸린 요청을 마지막에 잡음
function notFoundHandler(req, res) {
  res.status(404).json({ message: '요청한 경로를 찾을 수 없습니다.' });
}

// 전역 에러 핸들러 — (err, req, res, next) 네 개 인자가 핵심 시그니처
function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(500).json({ message: '서버 오류' });
}

module.exports = { notFoundHandler, errorHandler };