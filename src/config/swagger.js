// Swagger(문서화) 설정 파일
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Study Notes API',
      version: '1.0.0',
      description: '정리노트 웹앱 백엔드 API 문서',
    },
    servers: [
      { url: 'http://localhost:8080', description: '로컬 개발 서버' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],  // 이 경로 패턴에 맞는 파일들에서 @swagger 주석을 스캔
};

module.exports = swaggerJsdoc(options);