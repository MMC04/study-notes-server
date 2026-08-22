// 환경변수 설정 (테스트 환경 / 개발, 배포환경 환경변수 주입 분리)
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
const envPath = path.resolve(process.cwd(), envFile);

// 해당 파일이 실제로 존재할 때만 dotenv를 실행 (Docker 환경처럼 파일이 없으면 건너뜀)
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}