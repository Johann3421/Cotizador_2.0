FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Use `npm install` because `npm ci` requires package-lock.json
# `npm install` will work when package-lock.json is absent in repo
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
