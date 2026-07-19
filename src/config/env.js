// 환경변수 설정 (테스트 환경 / 개발, 배포환경 환경변수 주입 분리)
const dotenv = require('dotenv');
const path = require('path');

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });