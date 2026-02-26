'use strict';

const axios    = require('axios');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// Worker necesario en Node.js
pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');

// Cache en memoria — no reprocesar el mismo PDF en la misma sesión
const _cache = new Map();

/**
 * Descarga el PDF de PeruCompras y extrae sus especificaciones técnicas.
 * @param {string} pdfUrl - URL del PDF (prod-pc-cdn.azureedge.net/...)
 * @returns {object|null} - { specs: { procesador_modelo, ram_gb, ... } }
 */
const extraerSpecsDePdf = async (pdfUrl) => {
  if (!pdfUrl) return null;
  if (_cache.has(pdfUrl)) return _cache.get(pdfUrl);

  try {
    // 1. Descargar el PDF
    const resp = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });

    // 2. Cargar con pdfjs-dist
    const data     = new Uint8Array(resp.data);
    const loadTask = pdfjsLib.getDocument({ data, verbosity: 0 });
    const pdf      = await loadTask.promise;

    // 3. Extraer texto de todas las páginas
    let textoCompleto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const linea   = content.items.map(item => item.str).join(' ');
      textoCompleto += linea + '\n';
    }

    // 4. Parsear el texto para extraer specs
    const specs  = parsearTexto(textoCompleto);
    const result = { specs, texto_crudo: textoCompleto.substring(0, 500) };

    _cache.set(pdfUrl, result);
    return result;

  } catch (err) {
    console.warn(`[PdfSpecs] Error en ${pdfUrl.split('/').pop()}: ${err.message}`);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// PARSER DE TEXTO DEL PDF
// Los PDFs de PeruCompras tienen formato: "Campo   Valor"
// ─────────────────────────────────────────────────────────────
const parsearTexto = (texto) => {
  const specs = {};

  // Normalizar espacios múltiples a uno solo
  const t = texto.replace(/\s{2,}/g, ' ').trim();

  // ── Procesador ──────────────────────────────────────────────
  const proc = t.match(/Procesador\s+([^\n]+)/i);
  if (proc) {
    specs.procesador_texto = proc[1].trim();

    // Generación Intel (12°, 13th, "12700" → gen 12, "13700" → gen 13)
    const genNum = proc[1].match(/(\d{1,2})(?:°|ª|th|rd|nd|st)?\s*[Gg]eneración/i);
    const genMod = proc[1].match(/[Ii]-?(\d{2})\d{3}/); // i7-13700 → gen 13
    if (genNum)      specs.procesador_generacion = parseInt(genNum[1]);
    else if (genMod) specs.procesador_generacion = parseInt(genMod[1]);

    // Modelo normalizado
    const modUltra = proc[1].match(/Core\s+Ultra\s+\d+\s*[\w]*/i);
    const modCore  = proc[1].match(/Core\s+[iI][3579]-?\s*\d{4,5}\w*/i);
    const modRyzen = proc[1].match(/Ryzen\s+[3579]\s+\d{4,5}\w*/i);
    if (modUltra)      specs.procesador_modelo = modUltra[0].trim();
    else if (modCore)  specs.procesador_modelo = modCore[0].trim();
    else if (modRyzen) specs.procesador_modelo = modRyzen[0].trim();
  }

  // ── RAM ─────────────────────────────────────────────────────
  const ram = t.match(/(?:Memoria\s+Ram|RAM|Memoria)\s+([^\n]+)/i);
  if (ram) {
    specs.ram_texto = ram[1].trim();
    const gb   = ram[1].match(/(\d+)\s*GB/i);
    const tipo = ram[1].match(/(DDR[45]|LPDDR[45]X?)/i);
    const mhz  = ram[1].match(/(\d{3,4})\s*(?:MHz|mhz)/i);
    if (gb)   specs.ram_gb   = parseInt(gb[1]);
    if (tipo) specs.ram_tipo = tipo[1].toUpperCase();
    if (mhz)  specs.ram_mhz  = parseInt(mhz[1]);
  }

  // ── Almacenamiento (puede haber SSD + HDD) ──────────────────
  const st = t.match(/Almacenamiento\s+([^\n]+)/i);
  if (st) {
    specs.almacenamiento_texto = st[1].trim();
    specs.almacenamiento = [];

    const partes = st[1].split(/[\/\+]|\s+y\s+/i);
    for (const p of partes) {
      const tb = p.match(/(\d+(?:\.\d+)?)\s*TB/i);
      const gb = p.match(/(\d+)\s*GB/i);
      if (!tb && !gb) continue;

      const capacidad_gb = tb ? parseFloat(tb[1]) * 1000 : parseInt(gb[1]);
      let tipo = 'HDD';
      if (/nvme|m\.2|pcie/i.test(p))  tipo = 'NVMe SSD';
      else if (/ssd/i.test(p))         tipo = 'SSD';
      else if (/7200\s*rpm/i.test(p))  tipo = 'HDD 7200rpm';
      else if (/5400\s*rpm/i.test(p))  tipo = 'HDD 5400rpm';

      specs.almacenamiento.push({ gb: capacidad_gb, tipo });
    }
  }

  // ── GRÁFICOS ★ (solo en el PDF, no en el HTML del card) ─────
  const graf = t.match(/Gr[áa]ficos?\s+([^\n]+)/i)
             || t.match(/(?:Tarjeta\s+de\s+)?[Vv]ideo\s+([^\n]+)/i);
  if (graf) {
    specs.grafica_texto = graf[1].trim();

    if (/integrado|integrada/i.test(graf[1])) {
      specs.grafica_tipo   = 'integrada';
      specs.grafica_modelo = graf[1].replace(/integrado[-–\s]*/i, '').trim();
      console.log(`[PdfSpecs] Gráficos extraídos: ${specs.grafica_texto}`);
    } else {
      specs.grafica_tipo = 'dedicada';
      const vram  = graf[1].match(/(\d+)\s*GB/i);
      if (vram) specs.grafica_vram_gb = parseInt(vram[1]);
      const modelo = graf[1].match(/((?:RTX|GTX|RX|Arc)\s*[\w\s]+\d+\w*)/i)
                  || graf[1].match(/((?:NVIDIA|AMD)\s+[\w\s]+)/i);
      if (modelo) specs.grafica_modelo = modelo[1].trim();
    }
  }

  // ── Sistema Operativo ────────────────────────────────────────
  const so = t.match(/(?:Sistema\s+Operativo|S\.O\.)\s+([^\n]+)/i);
  if (so) specs.so = so[1].trim();

  // ── Garantía ─────────────────────────────────────────────────
  const gar = t.match(/Garantia\s+([^\n]+)/i);
  if (gar) {
    specs.garantia_texto = gar[1].trim();
    const meses = gar[1].match(/(\d+)\s*[Mm]eses/);
    if (meses) specs.garantia_meses = parseInt(meses[1]);
  }

  // ── Certificaciones ──────────────────────────────────────────
  const cert = t.match(/Certificaciones?\s+([^\n]+)/i);
  if (cert) {
    specs.certificaciones_texto = cert[1].trim();
    specs.certificaciones = cert[1]
      .split(/[,;]/)
      .map(c => c.trim())
      .filter(Boolean);
  }

  // ── Marca / Modelo / Número de Parte ──────────────────────────
  const marca  = t.match(/Marca\s+([^\n]+)/i);
  const modelo = t.match(/Modelo\s+([^\n]+)/i);
  const parte  = t.match(/Numero\s+de\s+Parte\s+([^\n]+)/i);
  if (marca)  specs.marca        = marca[1].trim();
  if (modelo) specs.modelo       = modelo[1].trim();
  if (parte)  specs.numero_parte = parte[1].trim();

  return specs;
};

module.exports = { extraerSpecsDePdf };
