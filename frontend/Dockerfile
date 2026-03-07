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

# Production stage: use npx serve which handles port correctly
FROM node:20-alpine

WORKDIR /app

# Copy built assets
COPY --from=builder /app/dist ./dist

# Install serve explicitly at a version that uses -p flag
RUN npm install -g serve@13

EXPOSE 8080

# serve v13 uses -p flag; -s for SPA mode (redirects 404 to index.html)
CMD ["sh", "-c", "serve -s dist -p ${PORT:-8080}"]
