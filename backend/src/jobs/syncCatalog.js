// src/jobs/syncCatalog.js
'use strict';

const cron = require('node-cron');
const { syncCatalogoBulk } = require('../services/bulkScraperService');

let syncEnProgreso = false;

// Ejecutar todos los días a las 2:00 AM hora Perú (UTC-5 = 07:00 UTC)
const iniciarCronSync = () => {
  cron.schedule('0 7 * * *', async () => {
    if (syncEnProgreso) {
      console.log('[CronSync] Sync ya en progreso, omitiendo...');
      return;
    }
    syncEnProgreso = true;
    console.log('[CronSync] Iniciando sync automático del catálogo...');
    try {
      await syncCatalogoBulk();
    } catch (e) {
      console.error('[CronSync] Error:', e.message);
    } finally {
      syncEnProgreso = false;
    }
  });

  console.log('[CronSync] Job programado: sync diario a las 2 AM (PE)');
};

const ejecutarSyncManual = async (onProgress = null) => {
  if (syncEnProgreso) return { error: 'Sync ya en progreso' };
  syncEnProgreso = true;
  try {
    return await syncCatalogoBulk(onProgress);
  } finally {
    syncEnProgreso = false;
  }
};

const isSyncEnProgreso = () => syncEnProgreso;

module.exports = { iniciarCronSync, ejecutarSyncManual, isSyncEnProgreso };
