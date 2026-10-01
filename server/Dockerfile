FROM node:22-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV NODE_ENV=production \
    PORT=5050 \
    UPLOAD_DIR=/app/uploads

RUN mkdir -p /app/uploads
EXPOSE 5050

CMD ["node", "src/index.js"]
