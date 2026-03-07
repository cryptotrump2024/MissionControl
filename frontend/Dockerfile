FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (npm install works without lockfile)
COPY package.json ./
RUN npm install

# Copy source and inject build-time env vars
COPY . .
ARG VITE_API_URL=https://backend-production-a6b7.up.railway.app
ARG VITE_WS_URL=wss://backend-production-a6b7.up.railway.app
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# Production stage: serve static files via serve on $PORT
FROM node:20-alpine

WORKDIR /app
RUN npm install -g serve

COPY --from=builder /app/dist ./dist

ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "serve -s dist -p ${PORT:-8080}"]
