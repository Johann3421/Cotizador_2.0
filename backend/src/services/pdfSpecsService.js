// src/services/pdfSpecsService.js
// Extrae specs del PDF de PeruCompras usando pdfjs-dist (JavaScript puro, sin binarios)
'use strict';

const axios = require('axios');

// Cache en memoria para no re-descargar el mismo PDF
const _cache = new Map();

/**
 * Descarga y parsea el PDF de especificaciones técnicas de una ficha PeruCompras.
 * Funciona con los 3 formatos: Kenya, Lenovo y HP.
 */
const extraerSpecsDePdf = async (pdfUrl) => {
  if (!pdfUrl) return null;
  if (_cache.has(pdfUrl)) return _cache.get(pdfUrl);

  try {
    const resp = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 12000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/pdf,*/*',
      },
    });

    const texto = await extraerTextoPdf(Buffer.from(resp.data));
    if (!texto) return null;

    const specs  = parsearTextoMultimarca(texto);
    const result = { specs };

    _cache.set(pdfUrl, result);
    return result;

  } catch (err) {
    console.warn(`[PdfSpecs] ${pdfUrl.split('/').pop()}: ${err.message}`);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// EXTRACTOR DE TEXTO CON PDFJS-DIST — compatible v3 y v4
// ─────────────────────────────────────────────────────────────
const extraerTextoPdf = async (buffer) => {
  try {
    let pdfjsLib;
    try {
      pdfjsLib = require('pdfjs-dist');
    } catch (_) {
      try { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); } catch (_2) {
        console.error('[PdfSpecs] pdfjs-dist no instalado.');
        return null;
      }
    }

    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    }

    const data     = new Uint8Array(buffer);
    const loadTask = pdfjsLib.getDocument({ data, verbosity: 0 });
    const pdf      = await loadTask.promise;

    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      let lastY = null;
      for (const item of content.items) {
        if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) texto += '\n';
        texto += item.str + ' ';
        lastY = item.transform[5];
      }
      texto += '\n';
    }
    return texto.trim();
  } catch (err) {
    console.warn('[PdfSpecs] Error extrayendo texto:', err.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// PARSER MULTI-MARCA — Kenya / Lenovo / HP
// ─────────────────────────────────────────────────────────────
const parsearTextoMultimarca = (texto) => {
  const specs = {};
  const t     = texto.replace(/[ \t]+/g, ' ').trim();
  const tLow  = t.toLowerCase();

  const esKenya  = tLow.includes('kenya technology') || tLow.includes('kenya');
  const esLenovo = tLow.includes('thinkcentre') || tLow.includes('thinkpad') || tLow.includes('lenovo');
  const esHP     = tLow.includes('hp elite') || tLow.includes('hp pro') || tLow.includes('hp inc');
  specs.marca_detectada = esKenya ? 'kenya' : esLenovo ? 'lenovo' : esHP ? 'hp' : 'desconocida';

  // ── PROCESADOR ──────────────────────────────────────────────
  const procPatterns = [
    // Valor en la misma línea: "Procesador    Intel Core i9-14900K\n"
    /Procesador\s+(?:PROCESADOR:\s*)?(.+?)(?:\n|Memoria|Sistema|Chipset|Disco)/is,
    /PROCESADOR[:\s]+(.+?)(?:\n|RAM|MEMORIA|ALMACENAMIENTO)/is,
    // Valor en la línea siguiente: "PROCESADOR\n Intel Core i9-14900K"
    /(?:PROCESADOR|Procesador)\s*:?\s*\n\s*(.+)/i,
  ];
  for (const pat of procPatterns) {
    const m = t.match(pat);
    if (m) { specs.procesador_texto = m[1].replace(/\s+/g, ' ').trim(); break; }
  }
  if (specs.procesador_texto) {
    const pt = specs.procesador_texto;
    const genMatch = pt.match(/(\d{1,2})(?:°|ª|th|rd|nd|st)?\s*[Gg]eneración/i)
                  || pt.match(/[Cc]ore\s+[iI][3579]-?(\d{2})\d{3}/);
    if (genMatch) specs.procesador_generacion = parseInt(genMatch[1]);
    // modCore: acepta guión, espacio, o espacio-guión entre tier y número
    const modUltra   = pt.match(/Core\s+Ultra\s+\d+\s*\w*/i);
    const modCore    = pt.match(/Core\s+[iI][3579][\s-]*\d{4,5}\w*/i);
    const modRyzen   = pt.match(/Ryzen[™\s]+\d+\s*[\w-]+/i);
    const modCeleron = pt.match(/Celeron\s+[\w-]+/i);
    if (modUltra)        specs.procesador_modelo = modUltra[0].replace(/\s+/g, ' ').trim();
    else if (modCore)    specs.procesador_modelo = modCore[0].replace(/\s+/g, ' ').trim();
    else if (modRyzen)   specs.procesador_modelo = modRyzen[0].replace(/™/g, '').replace(/\s+/g, ' ').trim();
    else if (modCeleron) specs.procesador_modelo = modCeleron[0].trim();
    const numModelo = pt.match(/[iI][3579]-?(\d{4,5})/);
    if (numModelo) specs.procesador_numero = parseInt(numModelo[1]);
  }

  // ── MEMORIA RAM ─────────────────────────────────────────────
  const ramPatterns = [
    /Memoria\s+Ram[:\s]+(.+?)(?:\n|Almacenamiento|Disco|Sistema|Chipset)/is,
    /Memoria\s+RAM[:\s]+(.+?)(?:\n|Almacenamiento|Disco|Sistema|Chipset)/is,
    /RAM[:\s]+(\d+\s*GB\s+DDR\S+[^\n]+)/i,
  ];
  for (const pat of ramPatterns) {
    const m = t.match(pat);
    if (m) { specs.ram_texto = m[1].replace(/\s+/g, ' ').trim(); break; }
  }
  if (specs.ram_texto) {
    const rt   = specs.ram_texto;
    const gb   = rt.match(/(\d+)\s*GB/i);
    const tipo = rt.match(/(LPDDR5X?|LPDDR4X?|DDR[45])/i);
    const mhz  = rt.match(/(\d{3,5})\s*(?:MHz|mhz)/i);
    if (gb)   specs.ram_gb   = parseInt(gb[1]);
    if (tipo) specs.ram_tipo = tipo[1].toUpperCase();
    if (mhz)  specs.ram_mhz  = parseInt(mhz[1]);
  }

  // ── ALMACENAMIENTO ───────────────────────────────────────────
  const stPatterns = [
    /Almacenamiento\s+(?:ALMACENAMIENTO:\s*)?(.+?)(?:\n|Sistema|Unidad|Chipset|Sonido|Puertos)/is,
    /Disco\s*\/\s*Almacenamiento\s+(?:ALMACENAMIENTO:\s*)?(.+?)(?:\n|Puertos|Unidad|Sistema)/is,
    /ALMACENAMIENTO[:\s]+(.+?)(?:\n|SISTEMA|SUITE)/is,
  ];
  for (const pat of stPatterns) {
    const m = t.match(pat);
    if (m) { specs.almacenamiento_texto = m[1].replace(/\s+/g, ' ').trim(); break; }
  }
  if (specs.almacenamiento_texto) {
    specs.almacenamiento = [];
    const partes = specs.almacenamiento_texto.split(/[\/\+]|\s+y\s+|\s+\+\s+/i).filter(p => p.trim().length > 2);
    for (const p of partes) {
      const tb = p.match(/(\d+(?:\.\d+)?)\s*TB/i);
      const gb = p.match(/(\d+)\s*GB/i);
      if (!tb && !gb) continue;
      const cap_gb = tb ? parseFloat(tb[1]) * 1000 : parseInt(gb[1]);
      let tipo = 'HDD';
      if      (/nvme|m\.2|pcie/i.test(p))  tipo = 'NVMe SSD';
      else if (/ssd/i.test(p))             tipo = 'SSD';
      else if (/7200\s*rpm/i.test(p))      tipo = 'HDD 7200rpm';
      else if (/5400\s*rpm/i.test(p))      tipo = 'HDD 5400rpm';
      specs.almacenamiento.push({ gb: cap_gb, tipo });
    }
    if (specs.almacenamiento.length === 0) {
      const gb = specs.almacenamiento_texto.match(/(\d+)\s*(GB|TB)/i);
      if (gb) {
        const cap = parseFloat(gb[1]) * (gb[2].toUpperCase() === 'TB' ? 1000 : 1);
        specs.almacenamiento.push({ gb: cap, tipo: /ssd/i.test(specs.almacenamiento_texto) ? 'SSD' : 'HDD' });
      }
    }
  }

  // ── GRÁFICOS ★ CAMPO ÚNICO DEL PDF ─────────────────────────
  // Kenya:  "Gráficos Integrado - Intel® UHD Graphics"
  // Lenovo: "Controlador de Video Integrated"
  // HP:     "Gráficos Integrados"
  const grafPatterns = [
    /Gr[áa]ficos?\s+(.+?)(?:\n|Sonido|Lan|WLAN|Unidad|Puertos|Adicionales)/is,
    /Controlador\s+de\s+[Vv]ideo\s+(.+?)(?:\n|Sistema|Garantía|Garantia|Seguridad)/is,
    /[Vv]ideo\s*[Gg]r[áa]fico[s]?\s+(.+?)(?:\n)/is,
  ];
  for (const pat of grafPatterns) {
    const m = t.match(pat);
    if (m) { specs.grafica_texto = m[1].replace(/\s+/g, ' ').trim(); break; }
  }
  if (!specs.grafica_texto) {
    const lineas = t.split('\n');
    for (const linea of lineas) {
      if (/integrad|nvidia|geforce|radeon|rtx|gtx|arc\s+\w/i.test(linea) &&
          /gpu|graphic|gráfic|video|vga/i.test(linea)) {
        specs.grafica_texto = linea.trim(); break;
      }
    }
    if (!specs.grafica_texto && /gráficos\s+integrados/i.test(t)) {
      specs.grafica_texto = 'Integrados';
    }
  }
  if (specs.grafica_texto) {
    // Kenya PDFs usan "Dedicado - NVIDIA..." o "Dedicado NVIDIA..."
    if (/integrad/i.test(specs.grafica_texto)) {
      specs.grafica_tipo   = 'integrada';
      specs.grafica_modelo = specs.grafica_texto.replace(/integrado[-–\s]*/i,'').replace(/integrados?/i,'').trim() || 'Integrada';
    } else if (/dedicad/i.test(specs.grafica_texto) || /nvidia|geforce|radeon|rtx|gtx|arc/i.test(specs.grafica_texto)) {
      specs.grafica_tipo = 'dedicada';
      const vram = specs.grafica_texto.match(/(\d+)\s*GB/i);
      if (vram) specs.grafica_vram_gb = parseInt(vram[1]);
      const modelo = specs.grafica_texto.match(/((?:RTX|GTX|RX|Arc)\s*\d+\w*(?:\s+Ti)?)/i)
                  || specs.grafica_texto.match(/(NVIDIA\s+GeForce\s+[\w\s]+)/i)
                  || specs.grafica_texto.match(/(AMD\s+Radeon\s+[\w\s]+)/i);
      if (modelo) specs.grafica_modelo = modelo[1].trim();
    }
  }

  // ── SISTEMA OPERATIVO ────────────────────────────────────────
  const soPatterns = [
    /Sistema\s+Operativo\s+(?:SIST\.\s*OPER[:\s]+)?(.+?)(?:\n|Suite|Chipset|Sonido)/is,
    /SIST\.\s*OPER[:\s]+(.+?)(?:\n|SUITE|CHIPSET)/is,
  ];
  for (const pat of soPatterns) {
    const m = t.match(pat);
    if (m) { specs.so = m[1].replace(/\s+/g, ' ').trim(); break; }
  }

  // ── GARANTÍA ─────────────────────────────────────────────────
  const garMatch = t.match(/Garant[íi]a[²\s]+(.+?)(?:\n|Empaque|Certificaci)/is);
  if (garMatch) {
    specs.garantia_texto = garMatch[1].replace(/\s+/g, ' ').trim();
    const meses = garMatch[1].match(/(\d+)\s*[Mm]eses/);
    if (meses) specs.garantia_meses = parseInt(meses[1]);
  }

  // ── LAN / WLAN ───────────────────────────────────────────────
  specs.lan  = /lan[:\s]+si/i.test(t) || /conectividad[^:]*lan[:\s]+s[íi]/i.test(t);
  specs.wlan = /wlan[:\s]+si/i.test(t) || /wi[-\s]?fi/i.test(t);

  return specs;
};

const limpiarCache = () => _cache.clear();

module.exports = { extraerSpecsDePdf, limpiarCache };
