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

# Eliminar cualquier configuración por defecto y archivos placeholder de Nginx
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copiar el build estático exportado de Expo Web
COPY --from=builder /app/apps/mobile/dist /usr/share/nginx/html

# Copiar explícitamente la configuración SPA a default.conf
COPY --from=builder /app/apps/mobile/nginx.conf /etc/nginx/conf.d/default.conf

# Validar la sintaxis de Nginx en tiempo de construcción
RUN nginx -t

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
