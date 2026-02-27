# 🚀 Guía de Despliegue en Dokploy

## Requisitos Previos
- Proyecto creado en Dokploy
- PostgreSQL 13+ disponible
- Variables de entorno configuradas

## 1. Variables de Entorno (`.env` en Dokploy)

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/cotizador_db

# Server
PORT=3001
NODE_ENV=production

# JWT
JWT_SECRET=tu-super-secreto-aleatorio-muy-seguro-min-32-chars

# AI
AI_PROVIDER=openai
AI_MODEL=gpt-4o
OPENAI_API_KEY=sk-xxx

# Email (opcional para dev)
EMAIL_SERVICE=gmail
EMAIL_USER=noreply@kenya.com
EMAIL_PASSWORD=app-password

# Frontend
CORS_ORIGIN=https://cotizador.abadgroup.tech
FRONTEND_URL=https://cotizador.abadgroup.tech

# Playwright/Scraping
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
```

## 2. Configurar PostgreSQL en Dokploy

1. Ir a **Databases** → **PostgreSQL**
2. Crear nueva base de datos: `cotizador_db`
3. Guardar credenciales (usuario, contraseña, host)
4. Esperar a que esté lista
5. Usar la cadena de conexión en `DATABASE_URL`

## 3. Desplegar Backend

### Git Push
```bash
git push  # Dokploy detecta cambios automáticamente
```

### Manual en Dokploy Dashboard
1. Ir a **Applications** → **New** → **Docker/Git**
2. Seleccionar repository de GitHub
3. Branch: `main`
4. Build command: `cd backend && npm install`
5. Start command: `cd backend && npm start`
6. Ports: `3001`
7. Configure env vars (ver sección 1)
8. Deploy

## 4. CRÍTICO: Crear Superadmin en Producción

### Opción A: Auto-Seed (Recomendado - primera vez)
```bash
# En Dokploy, abrir terminal del contenedor y ejecutar:
node scripts/seed.js --prod
```

### Opción B: Manual (si falla Opción A)
```bash
# 1. Conectarse a la DB en Dokploy
psql postgresql://user:password@host:5432/cotizador_db

# 2. Ejecutar estos comandos SQL:
INSERT INTO users (nombre, email, password_hash, rol, empresa, aprobado_at)
VALUES (
  'Super Admin',
  'admin@kenya.com',
  '$2b$10$...',  -- hash bcrypt de 'Kenya2024!'
  'superadmin',
  'Kenya Technology',
  NOW()
);
```

Para generar el hash bcrypt, usar:
```bash
node -e "const bcrypt = require('bcrypt'); console.log(bcrypt.hashSync('Kenya2024!', 10));"
```

### Opción C: Crear vía API (alternativa)
```bash
# POST /api/auth/register (crear usuario pending, luego promovarlo):
curl -X POST https://cotizador.abadgroup.tech/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Admin",
    "email": "admin@kenya.com",
    "password": "Kenya2024!",
    "empresa": "Kenya",
    "telefono": "",
    "motivo_registro": "Administrador del sistema"
  }'

# Luego ejecutar en DB:
UPDATE users SET rol = 'superadmin', aprobado_at = NOW() WHERE email = 'admin@kenya.com';
```

## 5. Verificar Despliegue

```bash
# Verificar salud
curl https://cotizador.abadgroup.tech/api/health

# Intentar login
curl -X POST https://cotizador.abadgroup.tech/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@kenya.com",
    "password": "Kenya2024!"
  }'

# Verificar logs
# En Dokploy Dashboard → App → Logs
```

## 6. Troubleshooting

### Error: `401 Unauthorized` en login
**Causa:** Superadmin no existe
**Solución:** Ejecutar `node scripts/seed.js --prod` en terminal de Dokploy

### Error: `ECONNREFUSED` en seeder
**Causa:** No puede conectarse a PostgreSQL
**Solución:** Verificar `DATABASE_URL` en variables de entorno

### Error: `relation "users" does not exist`
**Causa:** Migraciones no corrieron
**Solución:** Las migraciones corren automáticamente al iniciar, pero si falla, ejecutar manualmente:
```bash
node -e "require('dotenv').config(); const {Pool}=require('pg'); new Pool({connectionString: process.env.DATABASE_URL}).query(require('fs').readFileSync('./src/db/migrations/002_auth.sql', 'utf8'))"
```

## 7. Cambiar Contraseña del Superadmin

Después del primer login, cambiar en BD:
```bash
psql postgresql://user:password@host:5432/cotizador_db

UPDATE users SET password_hash = bcrypt_hash_nueva WHERE email = 'admin@kenya.com';
```

## 8. Features de Autoseeding

- ✅ Si `NODE_ENV ≠ production`: Crea superadmin automáticamente al iniciar
- ✅ Si `NODE_ENV = production`: Aviso en logs, requiere acción manual
- ✅ Idempotente: Seguro ejecutar múltiples veces

## 9. Monitoreo

- **Logs:** Dokploy Dashboard → App → Logs
- **Database:** Conectarse con herramienta SQL (DBeaver, pgAdmin)
- **API Health:** GET `/api/health`
- **Admin Panel:** https://cotizador.abadgroup.tech/admin (después de login)

## Checklista de Despliegue

- [ ] PostgreSQL creada y conectada
- [ ] Variables de entorno configuradas en Dokploy
- [ ] Backend desplegado exitosamente
- [ ] Migraciones ejecutadas (check logs)
- [ ] Superadmin creado (login exitoso)
- [ ] Frontend desplegado
- [ ] SSL/HTTPS habilitado
- [ ] Acceso a admin panel funcionando
