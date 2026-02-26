require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const { pool } = require('./db/connection');

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
app.use('/api', apiRoutes);

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
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 API disponible en http://localhost:${PORT}/api`);
      console.log(`🤖 AI Provider: ${process.env.AI_PROVIDER || 'openai'} (${process.env.AI_MODEL || 'gpt-4o'})`);
      console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
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
