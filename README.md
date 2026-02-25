# Kenya - Sistema de Cotización Inteligente

Sistema de cotización inteligente para **Kenya** (empresa distribuidora de tecnología en Perú). Permite a los vendedores subir imágenes de requerimientos y que la IA extraiga automáticamente las especificaciones técnicas, busque fichas compatibles en PeruCompras y genere cotizaciones listas para enviar.

## 🚀 Características

- **Extracción con IA**: Sube una imagen (correo, captura, documento) y la IA extrae las specs automáticamente
- **Búsqueda en PeruCompras**: Scraping automático del portal buscadorcatalogos.perucompras.gob.pe
- **Priorización de marcas**: Kenya → Lenovo → HP (en ese orden)
- **Score de coincidencia**: Cada producto recibe un porcentaje de compatibilidad con el requerimiento
- **Generación de PDF**: Cotizaciones profesionales con numeración automática (KEN-YYYY-NNNN)
- **Historial completo**: Búsqueda, filtros y gestión de cotizaciones
- **Dual AI Provider**: Soporte para OpenAI (GPT-4o) y Anthropic (Claude)

## 📋 Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js 20 + Express |
| Base de datos | PostgreSQL 15 |
| Scraping | Playwright (headless Chromium) |
| AI Vision | OpenAI GPT-4o / Anthropic Claude |
| PDF | PDFKit |
| Deploy | Docker + Docker Compose + Dokploy |

## 📁 Estructura del Proyecto

```
├── backend/
│   ├── src/
│   │   ├── controllers/       # Controladores de la API
│   │   ├── services/          # Lógica de negocio (AI, Scraper, PDF)
│   │   ├── models/            # Modelos de datos (PostgreSQL)
│   │   ├── routes/            # Rutas de la API REST
│   │   ├── middleware/        # Upload (Multer)
│   │   ├── db/                # Conexión y migraciones
│   │   └── app.js             # Entry point
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/        # Componentes React
│   │   ├── pages/             # Páginas (Home, NewQuote, History)
│   │   ├── services/          # Cliente API (Axios)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── dokploy.yml
└── .env.example
```

## 🔧 Instalación y Ejecución

### Requisitos Previos

- Docker y Docker Compose instalados
- Una API key de OpenAI o Anthropic

### Paso 1: Clonar el repositorio

```bash
git clone <tu-repositorio>
cd kenya-quotation-system
```

### Paso 2: Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y configura:

```env
# OBLIGATORIO: Tu API Key de AI
AI_API_KEY=sk-tu-key-aqui
AI_PROVIDER=openai          # o "anthropic"
AI_MODEL=gpt-4o             # o "claude-sonnet-4-5"

# Base de datos
DB_PASSWORD=un-password-seguro
```

### Paso 3: Iniciar con Docker Compose

```bash
docker-compose up -d
```

### Paso 4: Acceder al sistema

- **Frontend**: http://localhost
- **Backend API**: http://localhost:3001/api
- **Health check**: http://localhost:3001/api/health

## 🌐 Despliegue en Dokploy

1. Ir a Dokploy Dashboard → **"New Project"**
2. Seleccionar **"Docker Compose"**
3. Conectar tu repositorio Git (GitHub/GitLab)
4. En **"Environment Variables"**, agregar:
   - `DB_PASSWORD=tu_password`
   - `AI_API_KEY=tu_api_key`
   - `AI_PROVIDER=openai`
   - `AI_MODEL=gpt-4o`
5. En **"Domains"**, configurar tu dominio
6. Hacer clic en **"Deploy"**

## 📡 API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/extract` | Sube imagen y extrae specs con AI |
| `GET` | `/api/requirements/:id` | Obtiene requerimiento |
| `PUT` | `/api/requirements/:id` | Actualiza specs (edición manual) |
| `POST` | `/api/search` | Busca productos en PeruCompras |
| `POST` | `/api/search/refresh` | Fuerza re-scraping de marca |
| `POST` | `/api/quote` | Crea cotización |
| `GET` | `/api/quotes` | Lista cotizaciones (paginado) |
| `GET` | `/api/quotes/:id` | Detalle de cotización |
| `PUT` | `/api/quotes/:id` | Actualiza cotización |
| `DELETE` | `/api/quotes/:id` | Elimina cotización (soft) |
| `GET` | `/api/quotes/:id/pdf` | Descarga PDF |

## 🔌 Conectar tu API Key

El sistema soporta dos proveedores de AI:

### OpenAI
```env
AI_PROVIDER=openai
AI_API_KEY=sk-proj-...
AI_MODEL=gpt-4o
```

### Anthropic
```env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-5
```

## 💡 Flujo de Uso

1. **Subir imagen**: El vendedor sube una captura del correo/documento con el requerimiento
2. **Revisar extracción**: La IA extrae las specs, el usuario puede corregir
3. **Seleccionar productos**: El sistema busca fichas en PeruCompras y muestra las más compatibles
4. **Generar cotización**: Se completan datos del cliente y se genera el PDF

## 🔐 Seguridad

- Las API keys NUNCA se almacenan en el código fuente
- Todas las keys se manejan por variables de entorno
- Rate limiting en el scraper (1 req/segundo)
- Timeout de 30 segundos en el scraping
- Multer con validación de tipo de archivo y tamaño máximo
- Helmet para headers de seguridad

## 📄 Licencia

Uso interno - Kenya Distribuidora de Tecnología
