const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Extrae texto plano de un PDF.
 * Estrategia: pdf-parse primero (más fiable con PDFs gubernamentales),
 * luego pdfjs-dist como fallback.
 */
async function extractTextFromPdf(pdfBuffer) {
  // --- Estrategia 1: pdf-parse (más robusto para PDFs vectoriales) ---
  try {
    const pdfparse = require('pdf-parse');
    const data = await pdfparse(pdfBuffer);
    const len  = data?.text?.trim().length || 0;
    console.log(`[aiService] pdf-parse extrajo ${len} caracteres, ${data?.numpages || '?'} páginas`);
    if (len >= 10) {
      return data.text.trim();
    }
  } catch (e) {
    console.warn('[aiService] pdf-parse falló:', e.message);
  }

  // --- Estrategia 2: pdfjs-dist ---
  try {
    let pdfjsLib;
    try { pdfjsLib = require('pdfjs-dist'); }
    catch (_) { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
    if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const data     = new Uint8Array(pdfBuffer);
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
    const len = texto.trim().length;
    console.log(`[aiService] pdfjs extrajo ${len} caracteres`);
    if (len >= 10) {
      return texto.trim();
    }
  } catch (err) {
    console.warn('[aiService] pdfjs falló:', err.message);
  }

  // PDF escaneado o sin texto extraíble
  console.warn('[aiService] Ambos extractores devolvieron < 10 chars → tratando como PDF escaneado');
  return null;
}

/**
 * Extrae texto plano de un archivo DOCX usando mammoth.
 */
async function extractTextFromDocx(buffer) {
  try {
    const mammoth = require('mammoth');
    const result  = await mammoth.extractRawText({ buffer });
    const text    = (result.value || '').trim();
    console.log(`[aiService] DOCX extraído: ${text.length} caracteres`);
    return text.length >= 10 ? text : null;
  } catch (e) {
    console.warn('[aiService] DOCX extracción falló:', e.message);
    return null;
  }
}

/**
 * Extrae texto plano de un archivo XLSX usando xlsx (SheetJS).
 * Lee todas las hojas y convierte a texto tabulado.
 */
function extractTextFromXlsx(buffer) {
  try {
    const XLSX = require('xlsx');
    const wb   = XLSX.read(buffer, { type: 'buffer' });
    let text   = '';
    for (const sheetName of wb.SheetNames) {
      const ws  = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
      if (csv.trim()) text += `=== Hoja: ${sheetName} ===\n${csv}\n\n`;
    }
    console.log(`[aiService] XLSX extraído: ${text.trim().length} caracteres, ${wb.SheetNames.length} hoja(s)`);
    return text.trim().length >= 10 ? text.trim() : null;
  } catch (e) {
    console.warn('[aiService] XLSX extracción falló:', e.message);
    return null;
  }
}

const SYSTEM_PROMPT = `
Eres un experto en hardware de computadoras y licitaciones públicas de Perú (PeruCompras).
Tu trabajo es extraer especificaciones técnicas de equipos de cómputo desde CUALQUIER tipo de documento, incluyendo:
- Bases de licitación y TDR (Términos de Referencia)
- Fichas técnicas y especificaciones de producto
- Guías de remisión electrónica (busca en la columna "Descripción Detallada" los equipos de cómputo)
- Facturas y órdenes de compra (busca en la descripción de los ítems)
- Correos electrónicos con requerimientos
- Cualquier documento que mencione equipos de cómputo

IMPORTANTE: Si el documento es una guía de remisión, factura u orden de compra, extrae las especificaciones de la columna de "Descripción" o "Descripción Detallada" de cada ítem que sea equipo de cómputo. Ignora ítems que no sean equipos (monitores separados, accesorios, etc. a menos que formen parte del requerimiento).

════════════════════════════════════════════════════════
REGLAS DE EXTRACCIÓN — LEER ANTES DE PROCESAR
════════════════════════════════════════════════════════

PROCESADORES:
- Si hay DOS modelos aceptados (ej: "Core Ultra 5 225A O Core i7-13700"), extráelos como array en modelos_aceptados
- El modelo_principal siempre debe ser el de MAYOR generación/rendimiento
- Jerarquía Intel: Core Ultra Serie 2 > Core Ultra Serie 1 > Core i9 > Core i7 > Core i5 > Core i3
- Jerarquía AMD: Ryzen 9 > Ryzen 7 > Ryzen 5 > Ryzen 3
- Extraer siempre el número de modelo completo (ej: "i7-13700" no solo "i7")
- Si dice "O SUPERIOR" → es_minimo: true

MEMORIA RAM:
- DDR5 es SIEMPRE superior a DDR4
- Extraer capacidad en GB (número entero), tipo (DDR4/DDR5/LPDDR5), frecuencia_mhz si aparece
- Si dice "8GB O SUPERIOR" → capacidad_gb: 8, es_minimo: true

ALMACENAMIENTO — PUEDE HABER DOS UNIDADES:
- Si hay SSD + HDD, extraer ambas como array
- Tipos válidos: "NVMe SSD", "SSD", "HDD", "HDD 7200rpm", "HDD 5400rpm", "eMMC"
- 1TB = 1000GB para cálculos de comparación

TARJETA GRÁFICA:
- "TARJETA DE VIDEO: OPCIONAL" → tipo: "integrada", opcional_dedicada: true
- Sin mención de GPU → tipo: "integrada", opcional_dedicada: false
- NUNCA poner tipo: "dedicada" si el documento no especifica modelo o VRAM de GPU dedicada

MONITOR/PANTALLA:
- IGNORAR completamente si el equipo es un DESKTOP. Los monitores son categoría separada.
- Solo extraer pantalla si el tipo de equipo es laptop o all-in-one.

CATEGORÍAS DE EQUIPO:
- "CPU", "UNIDAD CENTRAL DE PROCESO", "COMPUTADORA DE ESCRITORIO" → tipo_equipo: "desktop"
- "LAPTOP", "COMPUTADORA PORTÁTIL", "NOTEBOOK" → tipo_equipo: "laptop"
- "ALL IN ONE", "AIO" → tipo_equipo: "all-in-one"
- "WORKSTATION", "ESTACIÓN DE TRABAJO" → tipo_equipo: "workstation"

CONECTIVIDAD — Valores posibles:
- true  = el documento dice "SI" o lo incluye como requerido
- false = el documento dice "NO"
- null  = el documento dice "OPCIONAL" o no lo menciona

MODELO DE REFERENCIA:
- Si el documento menciona un modelo o código de parte específico (ej: "Kenya KPC-I713700-8G-512", "ThinkCentre M70s Gen5", "HP ProDesk 400 G9"), extráelo en modelo_referencia
- Si NO hay modelo de referencia específico → null

════════════════════════════════════════════════════════
FORMATO DE RESPUESTA — JSON PURO SIN MARKDOWN
════════════════════════════════════════════════════════

{
  "equipos": [
    {
      "tipo_equipo": "desktop",
      "cantidad": 3,
      "procesador": {
        "marca": "Intel",
        "modelos_aceptados": ["Core Ultra 5 225A", "Core i7-13700"],
        "modelo_principal": "Core Ultra 5 225A",
        "generacion_principal": "Series 2 (Lunar Lake)",
        "es_minimo": true
      },
      "memoria_ram": {
        "capacidad_gb": 8,
        "tipo": "DDR4",
        "frecuencia_mhz": null,
        "es_minimo": true
      },
      "almacenamiento": [
        { "capacidad_gb": 512, "tipo": "SSD", "es_minimo": true }
      ],
      "grafica": {
        "tipo": "integrada",
        "vram_gb": null,
        "modelo": null,
        "opcional_dedicada": true
      },
      "pantalla": null,
      "sistema_operativo": "Windows 11",
      "sistema_operativo_bits": 64,
      "sistema_operativo_idioma": "Español",
      "conectividad": {
        "lan": true,
        "wlan": null,
        "hdmi": true,
        "vga": null,
        "displayport": null,
        "usb": true
      },
      "perifericos": {
        "teclado": true,
        "mouse": true,
        "unidad_optica": null,
        "combo_audio_mic": true
      },
      "suite_ofimatica": null,
      "suite_ofimatica_opcional": true,
      "certificaciones": ["ENERGY STAR", "EPEAT", "MIL-STD 810H", "RoHS", "ISO 14001", "ISO 9001"],
      "garantia_min_meses": 24,
      "garantia_max_meses": 36,
      "catalogo_electronico": true,
      "uso": "ofimática/escritorio",
      "modelo_referencia": null,
      "notas": ""
    }
  ]
}`;

/**
 * Lee una imagen y la convierte a base64
 */
function imageToBase64(imagePath) {
  const absolutePath = path.isAbsolute(imagePath) ? imagePath : path.join(__dirname, '../../uploads', imagePath);
  const imageBuffer = fs.readFileSync(absolutePath);
  return imageBuffer.toString('base64');
}

/**
 * Detecta el MIME type basado en la extensión
 */
function getMimeType(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap = {
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.webp': 'image/webp',
    '.gif':  'image/gif',
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls':  'application/vnd.ms-excel',
  };
  return mimeMap[ext] || 'image/jpeg';
}

/**
 * Devuelve true si el modelo es de la familia o-series de OpenAI (o1, o3, o4-mini…).
 * Estos modelos usan max_completion_tokens en vez de max_tokens y no soportan role:system.
 */
function isOSeriesModel(model) {
  return /^o\d/i.test(model);
}

/**
 * Extrae specs usando OpenAI (GPT-4o con visión para imágenes, texto para PDFs)
 */
async function extractWithOpenAI(base64Image, mimeType) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY });

  const model = process.env.AI_MODEL || 'gpt-4o';
  const isPdf = mimeType === 'application/pdf';

  // Para PDFs: extraer texto y enviarlo como mensaje de texto
  const userContent = isPdf ? [
    {
      type: 'text',
      text: `El siguiente texto fue extraído de un PDF con los requerimientos técnicos.\nAnaliza el texto y extrae todos los requerimientos de equipos de cómputo. Responde SOLO con el JSON.\n\n${Buffer.from(base64Image, 'base64').toString('utf8')}`,
    },
  ] : [
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64Image}`,
        detail: 'high',
      },
    },
    {
      type: 'text',
      text: 'Analiza esta imagen y extrae todos los requerimientos técnicos de equipos de cómputo que encuentres. Responde SOLO con el JSON.',
    },
  ];

  // o-series (o1/o3/o4-mini) usa max_completion_tokens y no soporta role:system
  const oSeries = isOSeriesModel(model);
  const messages = oSeries
    ? [{ role: 'user', content: isPdf
        ? [{ type: 'text', text: `${SYSTEM_PROMPT}\n\nEl siguiente texto fue extraído de un PDF con los requerimientos técnicos.\nAnaliza el texto y extrae todos los requerimientos de equipos de cómputo. Responde SOLO con el JSON.\n\n${Buffer.from(base64Image, 'base64').toString('utf8')}` }]
        : [...userContent.slice(0, -1), { type: 'text', text: `${SYSTEM_PROMPT}\n\nAnaliza esta imagen y extrae todos los requerimientos técnicos de equipos de cómputo que encuentres. Responde SOLO con el JSON.` }]
      }]
    : [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ];

  const createParams = {
    model,
    messages,
    ...(oSeries ? { max_completion_tokens: 4096 } : { max_tokens: 4096 }),
  };

  const response = await client.chat.completions.create(createParams);

 */
async function extractWithAnthropic(base64Image, mimeType) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY });

  const model = process.env.AI_MODEL || 'claude-sonnet-4-5-20241022';
  const isPdf = mimeType === 'application/pdf';

  // Claude acepta estos mime types para imágenes
  const supportedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supportedMimes.includes(mimeType) ? mimeType : 'image/jpeg';

  // Para PDFs: enviar como texto; para imágenes: enviar como imagen
  const userContent = isPdf ? [
    {
      type: 'text',
      text: `El siguiente texto fue extraído de un PDF con los requerimientos técnicos.\nAnaliza el texto y extrae todos los requerimientos de equipos de cómputo. Responde SOLO con el JSON.\n\n${Buffer.from(base64Image, 'base64').toString('utf8')}`,
    },
  ] : [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Image,
      },
    },
    {
      type: 'text',
      text: 'Analiza esta imagen y extrae todos los requerimientos técnicos de equipos de cómputo que encuentres. Responde SOLO con el JSON.',
    },
  ];

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const content = response.content[0]?.text || '';
  return parseAIResponse(content);
}

/**
 * Parsea la respuesta JSON de la AI, limpiando markdown si es necesario
 */
function parseAIResponse(content) {
  // Limpiar posibles bloques de código markdown
  let cleaned = content.trim();
  
  // Remover ```json ... ``` o ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();
  // Quitar comillas invertidas simples y encabezados tipo "JSON:" o "Respuesta:"
  cleaned = cleaned.replace(/^\s*JSON[:\s]*/i, '').replace(/^\s*Respuesta[:\s]*/i, '');
  cleaned = cleaned.replace(/^[`\-\s>]+/gm, '').trim();

  // Intentar parseo directo
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Intentar extraer el bloque JSON más grande mediante búsqueda de llaves balanceadas
    const firstBrace = cleaned.indexOf('{');
    if (firstBrace !== -1) {
      let depth = 0;
      for (let i = firstBrace; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        if (depth === 0) {
          const candidate = cleaned.slice(firstBrace, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (e2) {
            // continue searching
          }
        }
      }
    }

    // Intentar encontrar un array JSON completo
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch (e3) {
        // fallthrough
      }
    }

    // Loguear la respuesta cruda para diagnóstico
    console.error('No se pudo parsear la respuesta de la AI. Contenido (truncado 1000):', cleaned.substring(0, 1000));
    throw new Error('La AI no retornó un JSON válido. Intenta con otra imagen.');
  }
}

/**
 * Renderiza páginas de un PDF como imágenes PNG en base64 usando pdfjs-dist + canvas.
 * Retorna un array de { base64, width, height } por página (máx. 4 páginas).
 *
 * IMPORTANTE: pdfjs-dist v3 en Node.js requiere que se le pase explícitamente
 * un NodeCanvasFactory — sin él lanza "Image or Canvas expected".
 */
async function renderPdfPagesToImages(pdfBuffer) {
  try {
    let createCanvas;
    try {
      createCanvas = require('canvas').createCanvas;
    } catch (_) {
      console.warn('[aiService] paquete "canvas" no disponible → fallback');
      return null;
    }

    // NodeCanvasFactory requerida por pdfjs-dist v3 en Node.js
    class NodeCanvasFactory {
      create(width, height) {
        const canvas  = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return { canvas, context };
      }
      reset(canvasAndContext, width, height) {
        canvasAndContext.canvas.width  = width;
        canvasAndContext.canvas.height = height;
      }
      destroy(canvasAndContext) {
        canvasAndContext.canvas.width  = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas   = null;
        canvasAndContext.context  = null;
      }
    }

    let pdfjsLib;
    try { pdfjsLib = require('pdfjs-dist'); }
    catch (_) { pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js'); }
    if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = '';

    const canvasFactory = new NodeCanvasFactory();
    const data          = new Uint8Array(pdfBuffer);
    // Pasar canvasFactory a getDocument para que pdfjs pueda manejar gráficos
    const loadTask      = pdfjsLib.getDocument({ data, verbosity: 0, canvasFactory });
    const pdf           = await loadTask.promise;

    const maxPages = Math.min(pdf.numPages, 4);
    const pages    = [];
    const SCALE    = 2.0;

    for (let i = 1; i <= maxPages; i++) {
      const page     = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const { canvas, context } = canvasFactory.create(viewport.width, viewport.height);

      await page.render({
        canvasContext: context,
        viewport,
        canvasFactory,
      }).promise;

      const pngBuffer = canvas.toBuffer('image/png');
      pages.push({
        base64: pngBuffer.toString('base64'),
        width:  viewport.width,
        height: viewport.height,
      });
    }

    console.log(`[aiService] PDF renderizado: ${pages.length} página(s) como PNG`);
    return pages;
  } catch (err) {
    console.warn('[aiService] Error renderizando PDF a imágenes:', err.message);
    return null;
  }
}

/**
 * Extrae specs de un PDF escaneado enviando imágenes de sus páginas a la AI Vision.
 */
async function extractScannedPdfWithVision(pdfBuffer, provider) {
  // Intentar renderizar páginas a imágenes
  const pages = await renderPdfPagesToImages(pdfBuffer);

  if (pages && pages.length > 0) {
    console.log(`[aiService] PDF escaneado → enviando ${pages.length} página(s) como imágenes a Vision API`);

    if (provider === 'anthropic') {
      return await extractScannedWithAnthropic(pages);
    } else {
      return await extractScannedWithOpenAI(pages);
    }
  }

  // Fallback: enviar el PDF crudo como base64 a OpenAI/... (GPT-4o soporta PDFs nativamente)
  if (provider === 'openai') {
    console.log('[aiService] Fallback: enviando PDF crudo como base64 a OpenAI');
    const base64Pdf = pdfBuffer.toString('base64');
    return await extractRawPdfWithOpenAI(base64Pdf);
  }

  // Fallback final para Anthropic: enviar como documento
  if (provider === 'anthropic') {
    console.log('[aiService] Fallback: enviando PDF crudo como document a Anthropic');
    const base64Pdf = pdfBuffer.toString('base64');
    return await extractRawPdfWithAnthropic(base64Pdf);
  }

  throw new Error('No se pudo procesar el PDF escaneado. Intenta subir una captura de pantalla del documento.');
}

/**
 * Envía imágenes de páginas del PDF a OpenAI Vision.
 */
async function extractScannedWithOpenAI(pages) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY });
  const model  = process.env.AI_MODEL || 'gpt-4o';

  const content = [];
  for (let i = 0; i < pages.length; i++) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${pages[i].base64}`,
        detail: 'high',
      },
    });
  }
  content.push({
    type: 'text',
    text: `Estas ${pages.length} imagen(es) son páginas de un documento PDF escaneado con requerimientos técnicos de equipos de cómputo. Analiza TODAS las imágenes y extrae todos los requerimientos técnicos que encuentres. Responde SOLO con el JSON.`,
  });

  const oSeries = isOSeriesModel(model);
  const messages = oSeries
    ? [{ role: 'user', content }]
    : [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content }];
  if (oSeries) {
    // Prepend system prompt into the last text item
    const last = messages[0].content[messages[0].content.length - 1];
    last.text = `${SYSTEM_PROMPT}\n\n${last.text}`;
  }

  const response = await client.chat.completions.create({
    model,
    ...(oSeries ? { max_completion_tokens: 4096 } : { max_tokens: 4096 }),
    messages,
  });

  return parseAIResponse(response.choices[0]?.message?.content || '');
}

/**
 * Envía imágenes de páginas del PDF a Anthropic Vision.
 */
async function extractScannedWithAnthropic(pages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY });
  const model  = process.env.AI_MODEL || 'claude-sonnet-4-5-20241022';

  const content = [];
  for (let i = 0; i < pages.length; i++) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: pages[i].base64,
      },
    });
  }
  content.push({
    type: 'text',
    text: `Estas ${pages.length} imagen(es) son páginas de un documento PDF escaneado con requerimientos técnicos de equipos de cómputo. Analiza TODAS las imágenes y extrae todos los requerimientos técnicos que encuentres. Responde SOLO con el JSON.`,
  });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });

  return parseAIResponse(response.content[0]?.text || '');
}

/**
 * Fallback para PDF escaneado cuando canvas no está disponible y el proveedor es OpenAI.
 * GPT-4o Chat Completions NO acepta application/pdf como image_url — necesita imágenes PNG.
 * Si no podemos renderizar páginas, indicamos el error claramente.
 */
async function extractRawPdfWithOpenAI(base64Pdf) {
  // Chat Completions no acepta data:application/pdf;base64 como image_url.
  // Sin canvas no podemos convertir el PDF a imágenes — informar al usuario.
  throw new Error(
    'PDF escaneado detectado pero no es posible procesarlo sin el módulo de renderizado. ' +
    'Por favor convierte las páginas del PDF a imágenes (PNG/JPG) y vuelve a subirlas.'
  );
}

/**
 * Envía PDF crudo como document a Anthropic Claude.
 */
async function extractRawPdfWithAnthropic(base64Pdf) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY });
  const model  = process.env.AI_MODEL || 'claude-sonnet-4-5-20241022';

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64Pdf,
            },
          },
          {
            type: 'text',
            text: 'Este es un documento PDF escaneado con requerimientos técnicos de equipos de cómputo. Analiza el documento y extrae todos los requerimientos técnicos que encuentres. Responde SOLO con el JSON.',
          },
        ],
      },
    ],
  });

  return parseAIResponse(response.content[0]?.text || '');
}

/**
 * Envía texto extraído a la AI como consulta de texto.
 * Usado para PDF con texto, DOCX y XLSX.
 */
async function extractFromText(texto, tipoDoc, provider) {
  const base64Text = Buffer.from(texto, 'utf8').toString('base64');
  const mimeType   = 'application/pdf'; // trigger the isPdf branch (text mode)
  console.log(`[aiService] Extrayendo specs de ${tipoDoc} (${texto.length} chars) con ${provider}...`);
  if (provider === 'anthropic') {
    return await extractWithAnthropic(base64Text, mimeType);
  } else {
    return await extractWithOpenAI(base64Text, mimeType);
  }
}

/**
 * Función principal: Extrae specs de una imagen, PDF, DOCX o XLSX usando la AI configurada
 */
async function extractSpecsFromImage(imagePath) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'sk-...') {
    throw new Error('AI_API_KEY no configurada. Agrega tu API key en las variables de entorno.');
  }

  const mimeType  = getMimeType(imagePath);
  const isPdf     = mimeType === 'application/pdf';
  const isDocx    = mimeType.includes('wordprocessingml') || mimeType === 'application/msword';
  const isXlsx    = mimeType.includes('spreadsheetml')   || mimeType === 'application/vnd.ms-excel';
  const isOffice  = isDocx || isXlsx;

  const absolutePath = path.isAbsolute(imagePath)
    ? imagePath
    : path.join(__dirname, '../../uploads', imagePath);

  let result;

  // ── DOCX ──────────────────────────────────────────────────
  if (isDocx) {
    const buffer = fs.readFileSync(absolutePath);
    const texto  = await extractTextFromDocx(buffer);
    if (!texto) throw new Error('No se pudo extraer texto del archivo Word. Prueba guardarlo como PDF.');
    result = await extractFromText(texto, 'DOCX', provider);

  // ── XLSX ──────────────────────────────────────────────────
  } else if (isXlsx) {
    const buffer = fs.readFileSync(absolutePath);
    const texto  = extractTextFromXlsx(buffer);
    if (!texto) throw new Error('No se pudo extraer datos del archivo Excel. Prueba guardarlo como PDF.');
    result = await extractFromText(texto, 'XLSX', provider);

  // ── PDF ───────────────────────────────────────────────────
  } else if (isPdf) {
    const pdfBuffer = fs.readFileSync(absolutePath);
    
    // 1. Intentar extraer texto (pdf-parse primero, luego pdfjs)
    const texto = await extractTextFromPdf(pdfBuffer);
    
    if (texto && texto.trim().length >= 10) {
      // PDF con texto embebido → enviar como texto
      console.log(`[aiService] PDF con texto → ${texto.length} caracteres`);
      result = await extractFromText(texto, 'PDF-texto', provider);
    } else {
      // PDF escaneado (sin texto) → usar Vision API con imágenes renderizadas
      console.log(`[aiService] PDF escaneado (${texto ? texto.length : 0} chars) → Vision API`);
      result = await extractScannedPdfWithVision(pdfBuffer, provider);
    }

  // ── IMAGEN ────────────────────────────────────────────────
  } else {
    const base64Image = imageToBase64(imagePath);
    console.log(`[aiService] Imagen → ${provider} (${process.env.AI_MODEL || 'default'})`);
    if (provider === 'anthropic') {
      result = await extractWithAnthropic(base64Image, mimeType);
    } else {
      result = await extractWithOpenAI(base64Image, mimeType);
    }
  }

  // Validar estructura mínima
  if (!result.equipos || !Array.isArray(result.equipos)) {
    throw new Error('La respuesta de la AI no contiene el campo "equipos" esperado.');
  }

  return result;
}

/**
 * Extrae especificaciones técnicas desde una URL (útil para WhatsApp/Bots)
 */
async function extractSpecsFromUrl(url, token = null) {
  const provider = process.env.AI_PROVIDER || 'openai';
  const headers = {};
  if (token) headers['api_access_token'] = token;

  const response = await axios.get(url, {
    headers,
    responseType: 'arraybuffer',
    timeout: 15000
  });

  const base64Image = Buffer.from(response.data).toString('base64');
  const mimeType = response.headers['content-type'] || 'image/jpeg';

  let result;
  if (provider === 'anthropic') {
    result = await extractWithAnthropic(base64Image, mimeType);
  } else {
    result = await extractWithOpenAI(base64Image, mimeType);
  }

  if (!result.equipos || !Array.isArray(result.equipos)) {
    throw new Error('La respuesta de la AI no contiene el campo "equipos" esperado.');
  }

  return result;
}

module.exports = {
  extractSpecsFromImage,
  extractSpecsFromUrl,
  SYSTEM_PROMPT,
};
