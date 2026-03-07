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

# Production stage: serve static files with serve@13 (stable -p PORT API)
FROM node:20-alpine

WORKDIR /app

# Pin to serve@13 which uses -p PORT (not the -l endpoint scheme of v14+)
RUN npm install -g serve@13

COPY --from=builder /app/dist ./dist

EXPOSE 8080

CMD ["sh", "-c", "serve -s dist -p ${PORT:-8080}"]
