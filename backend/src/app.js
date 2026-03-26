require('dotenv').config();

// ── Variables críticas — advertir si falta JWT_SECRET ──────────
if (!process.env.JWT_SECRET) {
  const crypto = require('crypto');
  const generated = crypto.randomBytes(64).toString('hex');
  process.env.JWT_SECRET = generated;
  console.warn('⚠️  JWT_SECRET no está definido — usando secreto temporal generado automáticamente.');
  console.warn('   Los tokens NO persistirán entre reinicios del servidor.');
  console.warn('   ➜ Configura JWT_SECRET en tus variables de entorno (Dokploy/Docker).');
  console.warn(`   ➜ Valor sugerido: ${generated}`);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const apiRoutes     = require('./routes/api');
const authRoutes    = require('./routes/auth');
const adminRoutes   = require('./routes/admin');
const chatbotRoutes = require('./routes/chatbot');
const { pool } = require('./db/connection');
const { iniciarCronSync, ejecutarSyncManual } = require('./jobs/syncCatalog');

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// MIDDLEWARE
// ============================================

// Seguridad
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos de uploads
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// ============================================
// ROUTES
// ============================================
app.use('/api/auth',    authRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api',         apiRoutes);

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    name: 'Kenya Quotation System API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      extract: 'POST /api/extract',
      search: 'POST /api/search',
      quotes: '/api/quotes',
    },
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// Multer error handling
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `El archivo excede el tamaño máximo permitido (${process.env.MAX_FILE_SIZE_MB || 10}MB)`,
    });
  }
  if (err.message && err.message.includes('Formato no soportado')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// General error handler
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    details: process.env.NODE_ENV !== 'production' ? err.message : undefined,
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname, 'db/migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort(); // 001_, 002_, ... orden alfabético

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      console.log(`✅ Migración ejecutada: ${file}`);
    }
  } catch (error) {
    // Las tablas ya podrían existir, eso no es un error
    if (error.code === '42P07') {
      console.log('ℹ️  Las tablas ya existen');
    } else {
      console.error('⚠️  Error ejecutando migraciones:', error.message);
    }
  }
}

async function startServer() {
  try {
    // Verificar conexión a la base de datos
    await pool.query('SELECT NOW()');
    console.log('✅ Conectado a PostgreSQL');

    // Ejecutar migraciones
    await runMigrations();

    // Iniciar servidor
    app.listen(PORT, '0.0.0.0', async () => {
      console.log(`[App] ✅ Servidor iniciado en puerto ${PORT}`);
      console.log(`[App] 📡 API disponible en http://localhost:${PORT}/api`);
      console.log(`[App] 🤖 AI Provider: ${process.env.AI_PROVIDER || 'openai'} (${process.env.AI_MODEL || 'gpt-4o'})`);
      console.log(`[App] 🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);

      // Iniciar cron job diario (2 AM)
      iniciarCronSync();

      // Ejecutar seeders automáticamente en entornos de desarrollo
      try {
        const runSeeds = require('../scripts/seed').runSeeders;
        const forceRun = process.env.RUN_SEEDS === 'true';

        // Si se fuerza la ejecución, correr todos los seeders
        if (forceRun) {
          console.log('[App] ⚙️  RUN_SEEDS=true — ejecutando seeders completos');
          await runSeeds(false);
          console.log('[App] ⚙️  Seeders finalizados');
        } else {
          // Verificar si hay usuarios aparte del superadmin
          try {
            const res = await pool.query("SELECT COUNT(*) AS cnt FROM users WHERE email <> 'admin@kenya.com'");
            const others = parseInt(res.rows[0].cnt || '0');
            if (others === 0) {
              console.log('[App] ⚙️  No se encontraron usuarios (salvo superadmin) — ejecutando seeders de desarrollo');
              await runSeeds(false);
              console.log('[App] ⚙️  Seeders finalizados');
            } else {
              console.log('[App] ⚙️  Usuarios existentes detectados — omitiendo seeders de desarrollo');
            }
          } catch (qerr) {
            console.error('[App] ❌ Error al comprobar usuarios antes de seeders:', qerr.message);
          }
        }
      } catch (e) {
        console.error('[App] ❌ Error ejecutando seeders automáticos:', e.message);
      }

      // Esperar 3 segundos para que la DB esté completamente lista
      await new Promise(r => setTimeout(r, 3000));

      try {
        const { Pool: PgPool } = require('pg');
        const checkPool = new PgPool({ connectionString: process.env.DATABASE_URL });
        const result = await checkPool.query('SELECT COUNT(*) as total FROM products');
        const total  = parseInt(result.rows[0]?.total || '0');
        await checkPool.end();

        if (total === 0) {
          console.log('[App] ⚠️  DB vacía — iniciando sync del catálogo PeruCompras...');
          console.log('[App] ⏳ Esto tarda ~3-5 minutos. El sistema funcionará después.');
          ejecutarSyncManual((progreso) => {
            console.log(`[App] 📦 Sync progreso: ${JSON.stringify(progreso)}`);
          })
            .then(resumen => {
              console.log(`[App] ✅ Sync completado: ${resumen?.total ?? '?'} fichas guardadas`);
            })
            .catch(e => {
              console.error('[App] ❌ Error en sync inicial:', e.message);
            });
        } else {
          console.log(`[App] ✅ Catálogo listo: ${total} fichas en DB`);
        }
      } catch (e) {
        console.error('[App] Error verificando DB:', e.message);
        console.log('[App] Reintentando sync en 10 segundos...');
        setTimeout(() => {
          ejecutarSyncManual().catch(err => console.error('[App] Reintento fallido:', err.message));
        }, 10000);
      }
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error.message);
    
    // Si no hay conexión a DB, iniciar sin ella (modo degradado)
    if (error.message.includes('connect') || error.message.includes('ECONNREFUSED')) {
      console.warn('⚠️  Iniciando en modo degradado (sin base de datos)...');
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT} (modo degradado)`);
      });
    } else {
      process.exit(1);
    }
  }
}

startServer();

module.exports = app;
