# INSTRUCCIONES: Ejecutar el proyecto localmente (Windows / WSL / Bash)

Este documento muestra pasos claros para levantar el sistema completo (backend + frontend + base de datos) en tu máquina local.

Hay dos opciones: 1) Levantar todo con Docker Compose (recomendado) o 2) Ejecutar en modo desarrollo local (sin containers para frontend/backend).

---

## Requisitos

- Git
- Node.js 20+ (recomendado)
- npm
- Docker & Docker Compose (si usarás Docker)
- (Opcional para desarrollo local) PostgreSQL local o Docker para la DB

---

## Preparar variables de entorno

Copia los ejemplos de `.env` y completa las variables mínimas.

Si vas a usar Docker Compose (más sencillo): en la raíz del repo:

```bash
cp .env.example .env
```

Edita `.env` y coloca al menos:

- `DB_PASSWORD` = contraseña para Postgres (ej: `mypassword`)
- `AI_API_KEY` = tu API key de OpenAI o Anthropic
- `AI_PROVIDER` = `openai` o `anthropic`
- `AI_MODEL` = `gpt-4o` o `claude-sonnet-4-5`

Si prefieres ejecutar backend localmente sin Docker, copia el ejemplo de backend:

```bash
cp backend/.env.example backend/.env
```

y edita `backend/.env` para que `DATABASE_URL` apunte a tu Postgres local, por ejemplo:

```
DATABASE_URL=postgresql://kenya:TU_PASSWORD@localhost:5432/kenya_quotes
AI_API_KEY=sk-... (tu key)
AI_PROVIDER=openai
AI_MODEL=gpt-4o
```

---

## Opción A — Levantar todo con Docker Compose (recomendado)

1. Desde la raíz del proyecto (donde está `docker-compose.yml`):

```bash
# Levanta los servicios (postgres, backend, frontend)
docker-compose up -d
```

2. Espera a que el servicio `postgres` esté listo. El servicio `backend` hace las migraciones iniciales automáticamente al arrancar.

3. Accede a:

- Frontend (SPA): http://localhost
- API Backend: http://localhost:3001/api
- Health check: http://localhost:3001/api/health

4. Logs (si necesitas depurar):

```bash
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f frontend
```

Notas Docker:
- Si prefieres levantar solo la DB y correr el backend localmente, puedes `docker-compose up -d postgres`.
- Asegúrate de que `.env` contenga la `DB_PASSWORD` usada por `docker-compose`.

---

## Opción B — Ejecutar en modo desarrollo (sin Docker para frontend/backend)

A continuación los pasos para ejecutar backend y frontend desde tu máquina (útil si ya hiciste `npm install` en `backend`).

### 1) Levantar la base de datos

Puedes ejecutar Postgres en Docker o usar una instalación local.

Con Docker (rápido):

```bash
# Desde la raíz del repo
docker-compose up -d postgres
```

Espera que el contenedor de Postgres esté listo (usa `docker ps` o `docker-compose logs postgres`).

### 2) Configurar `backend/.env`

Copia y edita:

```bash
cp backend/.env.example backend/.env
# Edita backend/.env -> asegúrate de DATABASE_URL y AI_API_KEY
```

Ejemplo de `DATABASE_URL` para DB en Docker (desde tu máquina):

```
DATABASE_URL=postgresql://kenya:TU_PASSWORD@localhost:5432/kenya_quotes
```

### 3) Instalar dependencias y preparar Playwright (si no lo hiciste)

```bash
cd backend
npm install
# Instala navegadores para Playwright (solo si ejecutas scraper localmente)
npx playwright install
```

> Nota: en Dockerfile del backend ya están las dependencias necesarias para Chromium. Si ejecutas `backend` en Windows, `npx playwright install` instalará navegadores compatibles.

### 4) Iniciar backend

```bash
cd backend
# Modo desarrollo (recomendado para debug)
npm run dev
# O para producción local
npm start
```

Al iniciar, el `app.js` intentará conectarse a la BD y ejecutar las migraciones automáticas (archivo `src/db/migrations/001_initial.sql`). Verifica en la consola: "Conectado a PostgreSQL" y "Migraciones ejecutadas".

### 5) Iniciar frontend (modo desarrollo)

```bash
cd frontend
npm install
npm run dev
```

Vite mostrará la URL (por defecto `http://localhost:5173`). El frontend está configurado para hacer proxy a `/api` hacia `http://localhost:3001`.

---

## Verificar flujo básico

1. Subir imagen: `New Quote` → subir JPG/PNG/PDF
2. Extraer: pulsar "Extraer con IA" (asegúrate `AI_API_KEY` configurada)
3. Buscar: revisar y editar specs → "Buscar Productos"
4. Seleccionar, generar cotización y descargar PDF

---

## Problemas comunes y soluciones

- Error de conexión a Postgres: verifica `DATABASE_URL`, que el contenedor/servicio esté en ejecución y que `DB_PASSWORD` esté correcto.

- AI no responde / error de API key: revisa `AI_API_KEY` en `backend/.env` (o en `.env` si usas Docker). Asegúrate de que la key tenga permisos y cuota.

- Playwright falla en Windows: si el scraper falla por falta de navegador, ejecuta en `backend`:

```bash
npx playwright install
```

O usa Docker para el backend (ya incluye Chromium en `backend/Dockerfile`).

- Archivos subidos no aparecen o permisos: el backend guarda uploads en `backend/uploads`. Verifica permisos y que la ruta exista.

---

## Comandos útiles (resumen)

Levantar todo con Docker Compose:

```bash
docker-compose up -d
# ver logs
docker-compose logs -f backend
```

Levantar solo Postgres con Docker (si quieres ejecutar backend local):

```bash
docker-compose up -d postgres
```

Ejecutar backend localmente (desarrollo):

```bash
cd backend
cp .env.example .env   # editar variables
npm install
npx playwright install  # opcional para scraper
npm run dev
```

Ejecutar frontend (desarrollo):

```bash
cd frontend
npm install
npm run dev
```

---

Si quieres, puedo:

- Crear `backend/.env` de ejemplo con valores de prueba (no incluirá tu API key)
- Ejecutar pasos de comprobación (p.ej. `npx playwright install`) aquí si me permites ejecutar comandos
- Generar una versión corta de estas instrucciones para pegar en issues o tickets

Dime cuál prefieres y lo hago.
