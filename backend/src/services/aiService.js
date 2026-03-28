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
    const SCALE    = 2.5; // 2.5x = calidad suficiente sin sobrepasar límites de tiles de gpt-4o

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

  function buildImageContent(imagePages) {
    return imagePages.map(p => ({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${p.base64}`, detail: 'high' },
    }));
  }

  // ─────────────────────────────────────────────────────────────────────
  // ESTRATEGIA: dos llamadas separadas.
  //
  // CALL 1 (visión): transcripción literal de la celda Descripción del
  //   ítem COMPUTADORA — sólo esa celda, sin decodificar nada.
  //   Con foco estrecho hay menos oportunidad de que el modelo sustituya
  //   dígitos del procesador o tipo de RAM con valores de entrenamiento.
  //
  // CALL 2 (texto puro, sin imagen): decodifica el texto SIGA → JSON.
  //   Al no ver la imagen, el modelo no puede compensar con lo que "sabe"
  //   sobre Kenya PCs, y está obligado a procesar lo que el texto dice.
  // ─────────────────────────────────────────────────────────────────────

  const OCR_PROMPT = [
    'You are reading a Peruvian government SIGA procurement document (scanned, possibly rotated).',
    'Multiple orientations of the same page may be attached. Choose the one that is most legible.',
    '',
    'YOUR ONLY TASK:',
    'Find the ITEMS TABLE. Locate the row for a COMPUTER item.',
    'Computer rows contain one of: COMPUTADORA, CPU, KENYA, UNIDAD CENTRAL, LAPTOP, NOTEBOOK, WORKSTATION.',
    '',
    'Copy the ENTIRE content of the Descripción cell for that row, CHARACTER BY CHARACTER, VERBATIM.',
    'Preserve every letter, digit, colon, slash, dot, hyphen and newline exactly as printed.',
    'If the text wraps across multiple lines inside the cell, copy all of them.',
    '',
    'Also copy the number from the Cant. (quantity) column for that same row.',
    '',
    'Do NOT include: the monitor row, price columns, header text, stamps, signatures, page numbers.',
    'Do NOT interpret, decode or translate anything.',
    'Output format — two sections only:',
    'CANTIDAD: <the number>',
    'DESCRIPCION:',
    '<verbatim cell text here>',
  ].join('\n');

  const attempts = [
    { label: 'pag1', imgs: pages.slice(0, 2) },
    { label: 'allpages', imgs: pages },
  ];

  for (const { label, imgs } of attempts) {
    try {
      // ── CALL 1: targeted OCR ────────────────────────────────────────
      const ocrContent = buildImageContent(imgs);
      ocrContent.push({ type: 'text', text: OCR_PROMPT });

      console.log(`[aiService] CALL1 targeted OCR [${label}] ${imgs.length} imgs`);
      const ocrResp = await client.chat.completions.create({
        model: visionModel,
        max_completion_tokens: 800,
        messages: [{ role: 'user', content: ocrContent }],
      });
      const rawDesc = (ocrResp.choices[0]?.message?.content || '').trim();
      console.log(`[aiService] CALL1 raw:\n${rawDesc}`);

      if (!rawDesc || rawDesc.length < 20) {
        console.log(`[aiService] CALL1 [${label}] too short — next attempt`);
        continue;
      }

      // ── CALL 2: text-only decode → JSON ────────────────────────────
      const DECODE_PROMPT = [
        'Decode the SIGA procurement description below into a JSON object.',
        'Apply the decoder rules EXACTLY to the text provided. Do not use your training knowledge.',
        '',
        '════ RAW SIGA TEXT ════',
        rawDesc,
        '════ END ════',
        '',
        'SIGA DECODER:',
        '',
        '  QUANTITY:',
        '    The number on the CANTIDAD line → equipo.cantidad',
        '',
        '  PROCESSOR (look for PROCESADOR: or INTEL CORE or AMD RYZEN):',
        '    Digits after "I7-" or "I7 " or "I7- " → modelo_principal (copy all 5 digits exactly)',
        '      "I7- 14700" → "Core i7-14700"  (gen=14)',
        '      "I7- 13700" → "Core i7-13700"  (gen=13)',
        '      "I7- 12700" → "Core i7-12700"  (gen=12)',
        '      "I5- 14400" → "Core i5-14400"  (gen=14)',
        '      "I5- 13400" → "Core i5-13400"  (gen=13)',
        '      "I5- 12400" → "Core i5-12400"  (gen=12)',
        '      "I3- 14100" → "Core i3-14100"  (gen=14)',
        '      "CORE ULTRA 5 225" → "Core Ultra 5 225A"',
        '      "RYZEN 5 5600G" → "Ryzen 5 5600G"',
        '    Generation = first two digits of the 5-digit model number.',
        '',
        '  RAM (in SIGA "ROM:" = RAM — it is NOT storage):',
        '    Pattern: "ROM: <N> GB <TYPE> <FREQ> ..."',
        '      N → capacidad_gb (integer)',
        '      TYPE → tipo (copy exactly: DDR4, DDR5, LPDDR5, etc.)',
        '      FREQ → primer número tras TYPE → freq_mhz',
        '      "4800 600 MHZ" → freq_mhz=4800  (600 is bandwidth, irrelevant)',
        '    Example: "ROM: 32 GB DDR5 4800 600 MHZ" → capacidad_gb=32, tipo="DDR5", freq_mhz=4800',
        '    Example: "ROM: 16 GB DDR4 3200 MHZ"     → capacidad_gb=16, tipo="DDR4", freq_mhz=3200',
        '',
        '  STORAGE (look for TBW.2, GBW.2, SSD, HDD, NVMe, M.2):',
        '    "1 TBW.2 SSD NVMe"  → 1000 GB, "M.2 NVMe SSD"',
        '    "512 GBW.2 SSD"     → 512 GB,  "M.2 SSD"',
        '    "256 GBW.2 SSD"     → 256 GB,  "M.2 SSD"',
        '    "2 TBW.2 SSD NVMe"  → 2000 GB, "M.2 NVMe SSD"',
        '    (W.2 = M.2, OCR noise)',
        '',
        '  OS: "WINDOWS11" / "WINDOWS 11" / "SIST OPER: WINDOWS" → "Windows 11"',
        '  BRAND: "KENYA" / "UNIDAD KENYA TECHNOLOGY" → "Kenya Technology"',
        '  LAN: "LAN: SI" → true | "WLAN: SI"/"STUBS"/"STTBS" → true',
        '  VGA: "VGA: NO"/"NODPMT"/"NODMT" → false',
        '  WARRANTY: "G.F: 36 MESES" / "G.F: P: 36" → garantia_min_meses=36',
        '  10+-digit numbers (74689500001) → catalog codes, skip',
        '',
        'Output ONLY the JSON. No markdown fences. No explanation.',
      ].join('\n');

      console.log(`[aiService] CALL2 text-only decode → JSON`);
      const decResp = await client.chat.completions.create({
        model: visionModel,
        max_completion_tokens: 1500,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: DECODE_PROMPT },
        ],
      });

      const raw = decResp.choices[0]?.message?.content || '';
      console.log(`[aiService] CALL2 result (${raw.length} chars):\n${raw.substring(0, 1500)}`);
      const parsed = parseAIResponse(raw);
      if (parsed.equipos && parsed.equipos.length > 0) {
        console.log(`[aiService] ✅ [${label}]: ${parsed.equipos.length} equipo(s) extraído(s)`);
        return parsed;
      }
      console.log(`[aiService] [${label}] equipos:[] — next attempt`);
    } catch (e) {
      console.warn(`[aiService] [${label}] error: ${e.message}`);
    }
  }

  console.warn('[aiService] All vision attempts returned empty');
  return { equipos: [] };
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

    // Umbral de calidad: el texto extraído necesita keywords de HARDWARE reales,
    // no solo títulos de documentos ("COMPUTADORAS 501" NO es suficiente).
    function hasMeaningfulPcText(txt) {
      if (!txt || txt.length < 20) return false;
      const t = txt.toUpperCase();
      const hwKeywords = [
        'INTEL', 'AMD', 'RYZEN', 'CORE I', 'XEON', 'CORE ULTRA',
        'DDR4', 'DDR5', 'LPDDR', 'ROM:', 'GB RAM', 'GB DDR',
        ' SSD', ' HDD', 'NVME', 'M.2', 'TBW.2',
        'WINDOWS 11', 'WINDOWS11', 'LINUX',
        'PROCESADOR:', 'MEMORIA:', 'ALMACENAMIENTO:',
      ];
      return hwKeywords.filter(k => t.includes(k)).length >= 2;
    }

    // 1. Intentar extraer texto embebido
    const texto = await extractTextFromPdf(pdfBuffer);

    if (hasMeaningfulPcText(texto)) {
      // PDF con texto de hardware válido → CoT sobre el texto
      console.log(`[aiService] PDF con specs en texto (${texto.length} chars) → CoT`);
      result = await extractFromText(texto, 'PDF-texto', provider);
    } else {
      // PDF escaneado o sin specs en el texto → visión directa
      const txtLen = texto ? texto.length : 0;
      console.log(`[aiService] PDF sin specs en texto (${txtLen} chars) → Visión directa`);
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
