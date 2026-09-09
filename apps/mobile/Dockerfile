FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/mobile/ ./apps/mobile/

RUN npm ci
RUN npm run build:packages

WORKDIR /app/apps/mobile
RUN npx expo export -p web

FROM nginx:alpine AS runner

COPY --from=builder /app/apps/mobile/dist /usr/share/nginx/html
COPY apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
