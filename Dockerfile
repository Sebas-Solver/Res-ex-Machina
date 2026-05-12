# ============================================
# Res ex Machina — Dockerfile
# ============================================

# --- Stage: development ---
FROM node:22-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# --- Stage: build ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage: production ---
FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=build /app/dist ./dist

# Security: run as non-root user (node user exists in alpine images)
USER node

EXPOSE 3000
CMD ["node", "dist/app.js"]
