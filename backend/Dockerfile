FROM node:20-slim

# Instalar dependencias del sistema operativo necesarias para Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
    ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json primero (mejor cache de Docker)
COPY package*.json ./

# Instalar dependencias de Node
RUN npm ci --only=production

# Decirle a Playwright que use el Chromium del sistema
# en vez de descargar el suyo propio
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Crear enlace por compatibilidad con distribuciones que usan /usr/bin/chromium-browser
RUN if [ -x "/usr/bin/chromium" ] && [ ! -e "/usr/bin/chromium-browser" ]; then ln -s /usr/bin/chromium /usr/bin/chromium-browser; fi || true

# Copiar el resto del código
COPY . .

EXPOSE 3001
CMD ["node", "src/app.js"]
