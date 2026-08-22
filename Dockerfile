# 1. 기반 이미지 선택
FROM node:20-alpine

# 2. 작업 디렉토리 설정
WORKDIR /app

# 3. package.json, package-lock.json만 먼저 복사
COPY package*.json ./

# 4. 의존성 설치
RUN npm ci --omit=dev

# 5. 나머지 소스 코드 전체 복사
COPY . .

# 6. 포트 명시
EXPOSE 8080

# 7. 컨테이너 시작 시 실행할 명령
CMD ["node", "src/server.js"]