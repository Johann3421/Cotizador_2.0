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
    const sample = data?.text?.trim().substring(0, 120).replace(/\s+/g, ' ');
    console.log(`[aiService] pdf-parse extrajo ${len} chars, ${data?.numpages || '?'} págs — muestra: "${sample}"`);
    if (len >= 5) {
      return data.text.trim();
    }
    console.warn(`[aiService] pdf-parse: solo ${len} chars — insuficiente`);
  } catch (e) {
    console.error('[aiService] pdf-parse excepción:', e.message);
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
    const sample = texto.trim().substring(0, 120).replace(/\s+/g, ' ');
    console.log(`[aiService] pdfjs extrajo ${len} chars — muestra: "${sample}"`);
    if (len >= 5) {
      return texto.trim();
    }
    console.warn(`[aiService] pdfjs: solo ${len} chars — insuficiente`);
  } catch (err) {
    console.error('[aiService] pdfjs excepción:', err.message);
  }

  // PDF escaneado o sin texto extraíble
  console.warn('[aiService] Ambos extractores fallaron → tratando como PDF escaneado (imágenes)');
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

IMPORTANTE: Si el documento es una guía de remisión, factura u orden de compra, extrae las especificaciones de la columna de "Descripción" o "Descripción Detallada" de cada ítem que sea COMPUTADORA DE ESCRITORIO, LAPTOP o WORKSTATION. Ignora monitores, impresoras, accesorios, servicios, obras, mobiliario, alimentos y cualquier ítem que no sea una computadora completa.

════════════════════════════════════════════════════════
GLOSARIO DEL SISTEMA SIGA (PERÚ) — LEER OBLIGATORIAMENTE
════════════════════════════════════════════════════════
Los documentos del sistema logístico SIGA del Estado Peruano usan abreviaturas propias:

MEMORIA RAM:
- "ROM: XX GB DDR5" — en SIGA "ROM:" significa MEMORIA RAM (no ROM). Ej: "ROM: 32 GB DDR5 4800" = 32 GB DDR5 a 4800 MHz.
- "600 MHZ" después de la velocidad es el ancho de banda, NO la frecuencia principal. La frecuencia es el número anterior (4800).

ALMACENAMIENTO:
- "TBW.2 SSD NVMe" = "TB M.2 SSD NVMe" (la W es un artefacto de escaneo/OCR, en realidad es M).
- "GBW.2" = "GB M.2"

PROCESADOR:
- Modelos con espacio como "I7- 14700" o "I7 -13700" son UN SOLO modelo: "i7-14700", "i7-13700".
- NUNCA interpretes "I7- 14700" como "i7-11700" — lee el número completo después del guión.
- El número de generación de Intel Core i7-14700 es la 14va generación (los primeros 2 dígitos = generación).

SISTEMA OPERATIVO:
- "WINDOWS11" = Windows 11 (sin espacio ni versión Pro/Home a menos que se especifique).
- "SIST OPER: WINDOWS11" = Sistema Operativo Windows 11.

CONECTIVIDAD EN SIGA:
- "LAN: SI" = tiene LAN (Ethernet).
- "WLAN: SI" o "WLAN: STTBS" = tiene Wi-Fi (STTBS es artefacto OCR de "SÍ").
- "VGA: NO" o "VGA: NODPMT" = NO tiene VGA (NODPMT es "NO"). Ignorar el resto de la cadena.
- "DPMT: SI" = tiene DisplayPort/Thunderbolt.
- "HDMI: SI" = tiene HDMI.

SUITE OFIMÁTICA:
- "SUITE OFIMATICA: NO" = no incluye suite ofimática.
- "SUITE OFIMATICA: SI ESPAÑOL" = incluye suite ofimática en español.

CÓDIGOS QUE DEBES IGNORAR:
- Los números de código como "74689500001" o "85228335024" son CÓDIGOS DE CATÁLOGO del ítem, NO especificaciones.
- Códigos como "1073-2025" (CERTIFICACIÓN SIAE NRO.) son números de certificación, no modelos.
- "G.F: 36 MESES" = Garantía de funcionamiento 36 meses.
- "ON-SITE" = tipo de servicio de garantía, no es una especificación de hardware.

MODELO DE REFERENCIA EN SIGA:
- Busca texto como "UNIDAD KENYA511" o "UNIDAD [MARCA][CÓDIGO]" — ese código es el modelo_referencia.
- Ej: "UNIDAD KENYA511PROD" → modelo_referencia: "KENYA511".

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
- IGNORAR monitores standalone (ítems que son solo una pantalla sin CPU).
- Solo registrar pantalla si el equipo es laptop o all-in-one (campo "pantalla" dentro del equipo).
- En desktops, la pantalla va en null.

CATEGORÍAS DE EQUIPO:
- "CPU", "UNIDAD CENTRAL DE PROCESO", "COMPUTADORA DE ESCRITORIO", "COMPUTADORA DE PROCESO" → tipo_equipo: "desktop"
- "LAPTOP", "COMPUTADORA PORTÁTIL", "NOTEBOOK", "COMPUTADORA PORTATIL" → tipo_equipo: "laptop"
- "ALL IN ONE", "AIO", "TODO EN UNO" → tipo_equipo: "all-in-one"
- "WORKSTATION", "ESTACIÓN DE TRABAJO", "ESTACION DE TRABAJO" → tipo_equipo: "workstation"

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
 * Extrae specs usando OpenAI. Siempre usa max_completion_tokens (compatible con
 * todos los modelos modernos: gpt-4o, gpt-4o-mini, gpt-5-mini, o1, o3, o4-mini…).
 */
async function extractWithOpenAI(base64Image, mimeType) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY });

  const model       = process.env.AI_MODEL || 'gpt-4o';
  const visionModel = process.env.AI_VISION_MODEL || 'gpt-4o';
  const isPdf       = mimeType === 'application/pdf';

  // ── PDFs with extracted text: use chain-of-thought + gpt-4o (same as scanned path) ──
  if (isPdf) {
    const texto = Buffer.from(base64Image, 'base64').toString('utf8');
    console.log(`[aiService] PDF-texto CoT model=${visionModel} (${texto.length} chars)`);
    const cotPrompt = [
      'Tienes el siguiente texto extraído de un documento de compra, licitación o ficha técnica.',
      'Necesitas extraer especificaciones de COMPUTADORAS DE ESCRITORIO, LAPTOPS o WORKSTATIONS.',
      'Ignora monitores, impresoras, escáneres, servicios y cualquier ítem que no sea una computadora.',
      '',
      '════ PASO 1: BÚSQUEDA EXPLÍCITA ════',
      'Recorre el texto línea por línea y copia la línea completa donde encuentres cada campo.',
      'Si no encuentras el campo, escribe exactamente: NO ENCONTRADO',
      '',
      'A) TIPO DE EQUIPO — busca: COMPUTADORA, CPU, LAPTOP, NOTEBOOK, DESKTOP, WORKSTATION, ALL IN ONE, EQUIPO DE COMPUTO, UNIDAD CENTRAL, COMPUTADORA DE PROCESO',
      '   → Línea(s) encontrada(s): [COPIA LA LÍNEA COMPLETA]',
      '',
      'B) CANTIDAD — busca columna CANT. o CANTIDAD junto al ítem de la computadora',
      '   → Valor encontrado:',
      '',
      'C) PROCESADOR — busca: PROCESADOR, PROC:, INTEL CORE, AMD RYZEN, CORE I3, CORE I5, CORE I7, CORE I9, CORE ULTRA, XEON, RYZEN 3/5/7/9',
      '   → Línea(s) encontrada(s): [COPIA LA LÍNEA COMPLETA EXACTA]',
      '   → Número de modelo (copia los dígitos carácter por carácter, ej: si dice "I7- 14700" escribe "14700"):',
      '',
      'D) MEMORIA RAM — busca: RAM:, ROM: (¡CRÍTICO! en docs SIGA "ROM: XX GB" significa RAM), MEMORIA, DDR4, DDR5, LPDDR5',
      '   → Línea(s) encontrada(s): [COPIA LA LÍNEA COMPLETA EXACTA, incluyendo "ROM: XX GB ..." si aparece]',
      '   → Capacidad en GB (número antes de "GB"):',
      '   → Tipo de memoria (DDR4/DDR5/etc):',
      '',
      'E) ALMACENAMIENTO — busca: SSD, HDD, NVMe, M.2, DISCO, TB, GB SSD, GB HDD, TBW.2, GBW.2',
      '   → Línea(s) encontrada(s):',
      '',
      'F) SISTEMA OPERATIVO — busca: WINDOWS, LINUX, SO:, SISTEMA OPERATIVO, SIST OPER, S.O.',
      '   → Línea(s) encontrada(s):',
      '',
      'G) GRÁFICA — busca: GPU, GRAFICA, TARJETA DE VIDEO, VRAM, NVIDIA, AMD RADEON, INTEGRADA, DEDICADA',
      '   → Línea(s) encontrada(s):',
      '',
      'H) CONECTIVIDAD — busca: LAN, WLAN, WIFI, HDMI, VGA, DISPLAYPORT, USB, BLUETOOTH',
      '   → Línea(s) encontrada(s):',
      '',
      '════ PASO 2: DECODIFICACIÓN ════',
      'Aplica este glosario SIGA a los valores de PASO 1:',
      '  "ROM: 32 GB DDR5 4800"       → RAM: 32 GB DDR5 @ 4800 MHz',
      '  "1 TBW.2 SSD NVMe"           → 1 TB M.2 NVMe SSD  (W = M con ruido OCR)',
      '  "512 GBW.2 SSD"              → 512 GB M.2 SSD',
      '  "I7- 14700" o "I7 14700"     → Core i7-14700  (espacio = ruido OCR)',
      '  "I5- 13400"                  → Core i5-13400',
      '  "WINDOWS11" / "WINDOWS 11"   → Windows 11',
      '  "JDR5" / "0DR5"              → DDR5',
      '  "4800 600 MHZ"               → 4800 MHz  (600 = ancho de banda, no frecuencia)',
      '  "NODPMT" / "NO"              → false',
      '  "STUBS" / "STTBS" / "SI"     → true',
      '  Códigos de 10+ dígitos       → ignorar (son códigos de catálogo SIGA)',
      '',
      '════ PASO 2.5: VERIFICACIÓN ════',
      'Antes del JSON completa esta tabla:',
      '  • Procesador hallado en PASO 1-C: ___  Dígitos del modelo copiados: ___',
      '  • RAM hallada en PASO 1-D: ___  Capacidad GB: ___  Tipo DDR: ___',
      '  • Almacenamiento hallado en PASO 1-E: ___  Tamaño: ___  Tipo: ___',
      '  • Sistema Operativo hallado en PASO 1-F: ___',
      '',
      '════ PASO 3: JSON FINAL ════',
      'REGLAS DE VINCULACIÓN ESTRICTA — cada campo DEBE derivarse de PASO 2.5:',
      '  1. procesador.modelo_principal: usa los dígitos exactos de PASO 2.5 sin cambiar ni un dígito.',
      '     ANTI-SUSTITUCIÓN: 14700 ≠ 11700 ≠ 11400. Cópialo exactamente.',
      '  2. memoria_ram.capacidad_gb: usa el número de "Capacidad GB" de PASO 2.5. "ROM: 32 GB" → 32.',
      '     memoria_ram.tipo: usa "Tipo DDR" de PASO 2.5.',
      '  3. sistema_operativo: usa PASO 2.5. "WINDOWS11" → "Windows 11".',
      '  4. Campo NO encontrado en PASO 1 → null. NUNCA inventes valores.',
      '  5. Solo monitores/impresoras sin CPU → equipos: []',
      '',
      'Responde con EL JSON SOLAMENTE.',
      '',
      '---TEXTO---',
      texto,
      '---FIN TEXTO---',
    ].join('\n');
    const cotResponse = await client.chat.completions.create({
      model: visionModel,
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: cotPrompt },
      ],
    });
    const cotRaw = cotResponse.choices[0]?.message?.content || '';
    console.log(`[aiService] PDF-texto CoT resultado (primeros 2000):\n${cotRaw.substring(0, 2000)}`);
    return parseAIResponse(cotRaw);
  }

  const userContent = [
    {
      type: 'image_url',
      image_url: { url: `data:${mimeType};base64,${base64Image}`, detail: 'high' },
    },
    {
      type: 'text',
      text: 'Analiza esta imagen y extrae todos los requerimientos técnicos de equipos de cómputo que encuentres. Responde SOLO con el JSON.',
    },
  ];

  // Para vision usar AI_VISION_MODEL (default gpt-4o) — gpt-5-mini no soporta vision
  const effectiveModel = visionModel;
  console.log(`[aiService] extractWithOpenAI model=${effectiveModel} (AI_MODEL=${model}, AI_VISION_MODEL=${process.env.AI_VISION_MODEL || 'n/a'}) isPdf=${isPdf}`);
  const response = await client.chat.completions.create({
    model: effectiveModel,
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userContent },
    ],
  });
  return parseAIResponse(response.choices[0]?.message?.content || '');
}

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

    const maxPages = Math.min(pdf.numPages, 2); // 2 págs × 2 rotaciones = 4 imágenes
    const pages    = [];
    const SCALE    = 4.0; // 4x = mejor resolución para documentos SIGA rotados/escaneados

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);

      // Orientación natural del PDF
      const vp0 = page.getViewport({ scale: SCALE });
      const { canvas: c0, context: ctx0 } = canvasFactory.create(vp0.width, vp0.height);
      await page.render({ canvasContext: ctx0, viewport: vp0, canvasFactory }).promise;
      pages.push({ base64: c0.toBuffer('image/png').toString('base64'), width: vp0.width, height: vp0.height, rotation: 0 });

      // Variante +90°: convierte landscape→portrait (cubre escaneos SIGA en horizontal)
      const vp90 = page.getViewport({ scale: SCALE, rotation: 90 });
      const { canvas: c90, context: ctx90 } = canvasFactory.create(vp90.width, vp90.height);
      await page.render({ canvasContext: ctx90, viewport: vp90, canvasFactory }).promise;
      pages.push({ base64: c90.toBuffer('image/png').toString('base64'), width: vp90.width, height: vp90.height, rotation: 90 });
    }

    console.log(`[aiService] PDF renderizado: ${pages.length} variante(s) (${maxPages} pág × 2 rotaciones)`);
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
 * Envía imágenes de páginas del PDF a OpenAI Vision usando un enfoque de 2 pasos:
 * Paso 1 — OCR puro: el modelo de visión transcribe el texto sin presión de generar JSON.
 * Paso 2 — Extracción: el modelo de texto interpreta la transcripción con el glosario SIGA.
 * Esto elimina las alucinaciones porque el modelo de texto SOLO trabaja con lo que leyó el OCR.
 */
async function extractScannedWithOpenAI(pages) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY });
  const visionModel = process.env.AI_VISION_MODEL || 'gpt-4o';

  // Helper: construye el array de imágenes para el mensaje de usuario
  function buildImageContent(imagePages) {
    const content = [];
    for (const p of imagePages) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${p.base64}`, detail: 'high' },
      });
    }
    return content;
  }

  // Helper: detecta si la respuesta es un rechazo del modelo
  function isRefusal(text) {
    const t = (text || '').toLowerCase();
    return (
      t.includes("i'm sorry") ||
      t.includes("i cannot") ||
      t.includes("i can't") ||
      t.includes("no puedo") ||
      t.includes("lo siento") ||
      t.length < 30
    );
  }

  // ── PASO 1: OCR — prompt completamente neutro para evitar filtros de seguridad ─
  // NUNCA mencionar "oficial", "gobierno", "peruano" — eso activa los filtros.
  const ocrContent = buildImageContent(pages);
  ocrContent.push({
    type: 'text',
    text: [
      `List every piece of text visible in ${pages.length > 1 ? 'these ' + pages.length + ' images' : 'this image'}, exactly as it appears.`,
      'Rules:',
      '- Copy every word, number, abbreviation and symbol verbatim — do not interpret or summarize.',
      '- If the image is rotated, mentally rotate it and read in natural reading order.',
      '- Preserve table structure: use | to separate columns and newlines for rows.',
      '- If a word is unreadable, write [?].',
      '- IMPORTANT: For numbers and model codes (e.g. "i7-14700", "32 GB DDR5", "512 GB NVMe"), copy each character exactly — never round or guess.',
      '- Output ONLY the transcribed text, nothing else.',
    ].join('\n'),
  });

  console.log(`[aiService] Paso 1 OCR model=${visionModel} pages=${pages.length}`);
  const ocrResponse = await client.chat.completions.create({
    model: visionModel,
    max_completion_tokens: 3000,
    messages: [{ role: 'user', content: ocrContent }],
  });
  let ocrText = ocrResponse.choices[0]?.message?.content || '';
  // Log completo — necesario para diagnosticar qué capturó el OCR
  console.log(`[aiService] OCR resultado COMPLETO (${ocrText.length} chars):\n${ocrText}`);

  // Helper: detecta si el OCR tiene contenido útil de PC (keywords mínimas)
  function hasUsefulPcContent(text) {
    const t = (text || '').toUpperCase();
    const keywords = [
      'COMPUTADORA', 'LAPTOP', 'NOTEBOOK', 'WORKSTATION',
      'PROCESADOR', 'INTEL', 'AMD', 'RYZEN', 'CORE I', 'CORE ULTRA', 'XEON',
      'DDR4', 'DDR5', 'LPDDR', 'ROM:', ' RAM',
      ' SSD', ' HDD', 'NVME', 'M.2', 'TBW.2', 'GBW.2',
      'CPU', 'UNIDAD CENTRAL', 'KENYA', 'LENOVO', 'HP PRO',
      'WINDOWS', 'LINUX',
    ];
    return keywords.some(k => t.includes(k));
  }

  // ── FALLBACK: OCR rechazado o basura → extracción directa de imágenes ────────
  const ocrUseless = isRefusal(ocrText) || !hasUsefulPcContent(ocrText);
  if (ocrUseless) {
    const reason = isRefusal(ocrText) ? 'rechazado' : 'sin keywords de PC (ilegible/basura)';
    console.warn(`[aiService] OCR inutilizable (${reason}) — extracción directa con ${visionModel}`);
    const directContent = buildImageContent(pages);
    directContent.push({
      type: 'text',
      text: [
        'This is a scanned Peruvian government procurement document (SIGA system "Orden de Compra - Guía de Internamiento").',
        'The document may be rotated 90° or 180°. Mentally rotate it to read correctly.',
        '',
        'YOUR ONLY TASK: Find the DESCRIPTION column of the items table and extract computer specs.',
        '',
        'WHERE TO LOOK:',
        '- There is a table with columns: Código | Cant. | Unid.Med. | Descripción | Precio',
        '- The "Descripción" cell contains packed specs of the computer, all in one cell.',
        '- Look for item codes like 8-digit or 10-digit numbers (e.g. 85228335024, 74689500001).',
        '- The computer item will contain words like: COMPUTADORA, CPU, UNIDAD CENTRAL DE PROCESO, KENYA, INTEL CORE, PROCESADOR.',
        '',
        'SPEC PATTERNS USED IN SIGA DOCUMENTS (decode exactly like this):',
        '  "ROM: 32 GB DDR5 4800 600 MHZ"  → RAM: 32 GB, type: DDR5, freq: 4800 MHz',
        '  "ROM: 16 GB DDR4 3200"           → RAM: 16 GB, type: DDR4, freq: 3200 MHz',
        '  "1 TBW.2 SSD NVMe"               → Storage: 1 TB M.2 NVMe SSD',
        '  "512 GBW.2 SSD" / "512GB M.2"    → Storage: 512 GB M.2 SSD',
        '  "CORE I7- 14700" / "I7 14700"    → Processor: Intel Core i7-14700 (14th gen)',
        '  "CORE I5- 13400" / "I5 13400"    → Processor: Intel Core i5-13400 (13th gen)',
        '  "CORE ULTRA 5 225A"              → Processor: Intel Core Ultra 5 225A',
        '  "WINDOWS11" / "WINDOWS 11"       → OS: Windows 11',
        '  "SUITE OFIMATICA: NO"            → no office suite',
        '  "LAN: SI" / "WLAN: SI"           → has LAN / has WiFi',
        '  "VGA: NO" / "VGA: NODPMT"        → no VGA',
        '  "G.F: 36 MESES" / "G.F: P: 36"  → warranty: 36 months',
        '  "UNIDAD KENYA..." / text "KENYA" → brand: Kenya Technology',
        '  10+ digit codes (e.g. 85228335024) → catalog code, NOT a spec, ignore',
        '',
        'RULES:',
        '1. Use ONLY values visible in the image. If a field is not visible → null.',
        '2. ANTI-HALLUCINATION: NEVER substitute a model number from memory.',
        '   - If you see "I7- 14700", the model is i7-14700 — NOT i7-11700, NOT i5-11400.',
        '   - Copy every digit in the processor model number exactly as printed.',
        '   - "ROM: 32 GB" = RAM 32 GB. Do not ignore or skip the ROM: field.',
        '3. If the only items are monitors, printers or services (no computer CPU) → equipos: []',
        '',
        'Respond with ONLY the JSON, nothing else.',
      ].join('\n'),
    });
    const directResponse = await client.chat.completions.create({
      model: visionModel,
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: directContent },
      ],
    });
    const directRaw = directResponse.choices[0]?.message?.content || '';
    console.log(`[aiService] Extracción directa JSON (primeros 2000):\n${directRaw.substring(0, 2000)}`);
    return parseAIResponse(directRaw);
  }

  // ── PASO 2: Extracción multimodal (chain-of-thought + imágenes originales) ──────
  // Se envían TODAS las variantes de imagen (distintas rotaciones) junto con el texto OCR.
  // Si el OCR perdió campos por rotación incorrecta, gpt-4o los lee directo de las imágenes.
  console.log(`[aiService] Paso 2 Extracción multimodal model=${visionModel} (${pages.length} imgs + OCR)`);
  const extractionPrompt = [
    'CONTEXTO: Recibes las IMÁGENES DEL DOCUMENTO (adjuntas arriba, en múltiples orientaciones) Y el texto OCR (al final del mensaje).',
    'El OCR puede ser PARCIAL o contener errores de rotación. Si un campo NO aparece en el OCR o parece incorrecto, BÚSCALO DIRECTAMENTE EN LAS IMÁGENES adjuntas.',
    'Objetivo: extraer especificaciones de COMPUTADORAS DE ESCRITORIO, LAPTOPS o WORKSTATIONS. Ignora monitores, impresoras, escáneres y servicios.',
    '',
    '════ PASO 1: BÚSQUEDA EXPLÍCITA ════',
    'Busca cada campo PRIMERO en el texto OCR (fin del mensaje). Si el OCR no lo contiene o dice NO ENCONTRADO, búscalo en las IMÁGENES adjuntas (una de las orientaciones tendrá el texto legible).',
    'Copia la línea exacta de donde lo encontraste (OCR o imagen). Si no está en ningún sitio: NO ENCONTRADO.',
    '',
    'A) TIPO DE EQUIPO — busca: COMPUTADORA, CPU, LAPTOP, NOTEBOOK, DESKTOP, WORKSTATION, ALL IN ONE, EQUIPO DE COMPUTO, UNIDAD CENTRAL, COMPUTADORA DE PROCESO',
    '   → Línea(s) encontrada(s):',
    '',
    'B) CANTIDAD — busca columna CANT. o CANTIDAD junto al ítem de la computadora',
    '   → Valor encontrado:',
    '',
    'C) PROCESADOR — busca: PROCESADOR, PROC:, INTEL CORE, AMD RYZEN, CORE I3, CORE I5, CORE I7, CORE I9, CORE ULTRA, XEON, RYZEN 3, RYZEN 5, RYZEN 7, RYZEN 9',
    '   → Línea(s) encontrada(s): [COPIA LA LÍNEA COMPLETA EXACTA]',
    '   → Número de modelo (copia los dígitos carácter por carácter, ej: si dice "I7- 14700" escribe "14700"):',
    '',
    'D) MEMORIA RAM — busca: RAM:, ROM: (¡CRÍTICO! en docs SIGA "ROM: XX GB" significa RAM con capacidad XX GB), MEMORIA, DDR4, DDR5, LPDDR5, GB RAM, GB DDR',
    '   → Línea(s) encontrada(s): [COPIA LA LÍNEA COMPLETA EXACTA, incluyendo "ROM: XX GB ..." si aparece]',
    '   → Capacidad en GB (el número antes de "GB"):',
    '   → Tipo de memoria (DDR4, DDR5, etc. — "JDR5" y "0DR5" = DDR5):',
    '',
    'E) ALMACENAMIENTO — busca: SSD, HDD, NVMe, M.2, DISCO, ALMACENAMIENTO, TB SSD, GB SSD, TB HDD, GB HDD, TBW.2, GBW.2',
    '   → Línea(s) encontrada(s):',
    '',
    'F) SISTEMA OPERATIVO — busca: WINDOWS, LINUX, SO:, SISTEMA OPERATIVO, SIST OPER, S.O.',
    '   → Línea(s) encontrada(s):',
    '',
    'G) GRÁFICA — busca: GPU, GRAFICA, TARJETA DE VIDEO, VRAM, NVIDIA, AMD RADEON, INTEGRADA, DEDICADA, VIDEO CARD',
    '   → Línea(s) encontrada(s):',
    '',
    'H) CONECTIVIDAD — busca: LAN, WLAN, WIFI, HDMI, VGA, DISPLAYPORT, USB, BLUETOOTH',
    '   → Línea(s) encontrada(s):',
    '',
    '════ PASO 2: DECODIFICACIÓN ════',
    'Aplica este glosario SIGA a los valores encontrados en PASO 1:',
    '  "ROM: 32 GB DDR5 4800"       → RAM: 32 GB DDR5 @ 4800 MHz',
    '  "1 TBW.2 SSD NVMe"           → 1 TB M.2 NVMe SSD  (W = M con ruido OCR)',
    '  "512 GBW.2 SSD"              → 512 GB M.2 SSD',
    '  "I7- 14700" o "I7 14700"     → Core i7-14700  (espacio = ruido OCR)',
    '  "I5- 13400" o "CORE I 5"     → Core i5-13400',
    '  "WINDOWS11" / "WINDOWS 11"   → Windows 11',
    '  "JDR5" / "0DR5"              → DDR5',
    '  "4800 600 MHZ"               → 4800 MHz  (600 = ancho de banda, no frecuencia)',
    '  "NODPMT" / "NODMT" / "NO"    → false',
    '  "STUBS" / "STTBS" / "SI"     → true',
    '  "SIST OPER:"                 → Sistema Operativo',
    '  "G.F: 36 MESES"              → garantia_min_meses: 36',
    '  Códigos de 10+ dígitos       → ignorar (son códigos de catálogo SIGA)',
    '',
    '════ PASO 2.5: VERIFICACIÓN ANTES DEL JSON ════',
    'Antes de generar el JSON, completa esta tabla:',
    '  • Procesador hallado en PASO 1-C: ___  Dígitos del modelo copiados: ___',
    '  • RAM hallada en PASO 1-D: ___  Capacidad GB: ___  Tipo DDR: ___',
    '  • Almacenamiento hallado en PASO 1-E: ___  Tamaño: ___  Tipo: ___',
    '  • Sistema Operativo hallado en PASO 1-F: ___',
    '',
    '════ PASO 3: JSON FINAL ════',
    'REGLAS DE VINCULACIÓN ESTRICTA — cada campo en el JSON DEBE derivarse de la tabla de PASO 2.5:',
    '',
    '  1. procesador.modelo_principal: toma los dígitos exactos de PASO 2.5 "Dígitos del modelo".',
    '     ANTI-SUSTITUCIÓN ABSOLUTA: 14700 ≠ 11700 ≠ 11400. Cópialo sin cambiar ni un dígito.',
    '     Ejemplo: "I7- 14700" → "Core i7-14700"  |  "I5- 13400" → "Core i5-13400"',
    '',
    '  2. memoria_ram.capacidad_gb: usa el número de "Capacidad GB" de PASO 2.5. "ROM: 32 GB" → 32.',
    '     memoria_ram.tipo: usa "Tipo DDR" de PASO 2.5. "JDR5"/"0DR5" → "DDR5".',
    '',
    '  3. sistema_operativo: usa lo decodificado de PASO 2.5. "WINDOWS11" → "Windows 11".',
    '',
    '  4. Campo NO encontrado en PASO 1 → null. NUNCA inventes ni rellenes con valores típicos.',
    '  5. Solo monitores/impresoras/servicios sin CPU → equipos: []',
    '',
    'Responde con EL JSON SOLAMENTE (no repitas los pasos ni añadas explicaciones).',
    '',
    '---TEXTO OCR---',
    ocrText,
    '---FIN TEXTO OCR---',
  ].join('\n');

  // Adjuntar imágenes (todas las rotaciones) + texto del prompt en un solo mensaje multimodal
  const extractContent = buildImageContent(pages);
  extractContent.push({ type: 'text', text: extractionPrompt });

  const extractResponse = await client.chat.completions.create({
    model: visionModel,
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: extractContent },
    ],
  });

  const rawContent = extractResponse.choices[0]?.message?.content || '';
  console.log(`[aiService] Extracción JSON (primeros 2000 chars):\n${rawContent.substring(0, 2000)}`);
  return parseAIResponse(rawContent);
}

/**
 * Envía imágenes de páginas del PDF a Anthropic Vision usando 2 pasos (OCR + extracción).
 */
async function extractScannedWithAnthropic(pages) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.AI_API_KEY });
  const model  = process.env.AI_MODEL || 'claude-sonnet-4-5-20241022';

  // Paso 1: OCR
  const ocrContent = [];
  for (const page of pages) {
    ocrContent.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: page.base64 },
    });
  }
  ocrContent.push({
    type: 'text',
    text: `Transcribe VERBATIM todo el texto visible en ${pages.length > 1 ? 'estas ' + pages.length + ' imágenes' : 'esta imagen'}.\nSi el documento está rotado, gíralo mentalmente.\nPreserva la estructura con | para columnas.\nNO interpretes ni resumas — solo transcribe exactamente.`,
  });
  const ocrResponse = await client.messages.create({
    model,
    max_tokens: 3000,
    messages: [{ role: 'user', content: ocrContent }],
  });
  const ocrText = ocrResponse.content[0]?.text || '';
  console.log(`[aiService] Anthropic OCR transcripción (primeros 1000):\n${ocrText.substring(0, 1000)}`);

  // Paso 2: Extracción con prompt robusto
  const extractionPrompt = [
    'El siguiente texto fue transcrito mediante OCR desde un documento oficial peruano (sistema SIGA o similar).',
    '',
    'TAREA: Extrae ÚNICAMENTE los equipos de CÓMPUTO (computadoras de escritorio, laptops, monitores, workstations).',
    'Ignora completamente: obras de construcción, servicios, mobiliario, alimentos, contratos, datos de proveedor, importes/totales, números de expediente, firmas, RUC, fechas, sellos.',
    '',
    'REGLAS CRÍTICAS:',
    '1. USA SOLO los valores literales del texto OCR — NUNCA inventes ni rellenes con conocimiento propio.',
    '2. Si un campo no está en el texto → null.',
    '3. Interpreta el ruido OCR: "I7- 14700"=i7-14700 | "TBW.2"=M.2 | "ROM:"=RAM | "WINDOWS11"=Windows 11.',
    '4. Si hay ítems mixtos, extrae SOLO hardware de cómputo.',
    '5. NUNCA devuelvas equipos:[] si el texto menciona alguna PC, computadora o laptop.',
    '',
    'Responde SOLO con el JSON.',
    '',
    '---TRANSCRIPCIÓN OCR---',
    ocrText,
    '---FIN TRANSCRIPCIÓN---',
  ].join('\n');

  const extractResponse = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: extractionPrompt }],
  });
  return parseAIResponse(extractResponse.content[0]?.text || '');
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
