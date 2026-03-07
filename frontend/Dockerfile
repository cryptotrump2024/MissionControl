FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install

# Copy source and inject build-time env vars
COPY . .
ARG VITE_API_URL=https://backend-production-a6b7.up.railway.app
ARG VITE_WS_URL=wss://backend-production-a6b7.up.railway.app
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_WS_URL=$VITE_WS_URL

RUN npm run build

# Production stage: use http-server which has simpler port handling
FROM node:20-alpine

WORKDIR /app

# http-server is stable and uses -p PORT consistently
RUN npm install -g http-server

# Copy built assets
COPY --from=builder /app/dist ./dist

EXPOSE 8080

# http-server: -p port, -d disable directory listing, --spa for client-side routing
CMD ["sh", "-c", "http-server dist -p ${PORT:-8080} --spa -d false"]
