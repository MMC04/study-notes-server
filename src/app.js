// 각 라우트로 이동하여 처리
const express = require("express");
const cors = require("cors");
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const articleRoutes = require('./routes/article.routes');
const authRoutes = require('./routes/auth.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? process.env.FRONTEND_URL
  : true;   // 개발 환경에서는 모든 origin 허용

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.get('/', (req, res) => res.json({ message: 'Study Notes API' })); // 연결 확인

app.use('/articles', articleRoutes);
app.use('/auth', authRoutes);       

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(notFoundHandler);   // 어떤 라우트에도 안 걸리면 여기로
app.use(errorHandler);      // 에러가 next(error)로 넘어오면 여기서 처리

module.exports = app;