const fs = require('fs');
const path = require('path');

/**
 * Extrae texto plano de un PDF usando pdfjs-dist (sin binarios externos)
 */
async function extractTextFromPdf(pdfBuffer) {
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
    return texto.trim();
  } catch (err) {
    console.warn('[aiService] pdfjs extra failed:', err.message);
    // Intentar fallback con pdf-parse (puede extraer texto cuando pdfjs falla)
    try {
      const pdfparse = require('pdf-parse');
      const data = await pdfparse(pdfBuffer || Buffer.from(''));
      if (data && data.text && data.text.trim().length > 10) {
        return data.text.trim();
      }
    } catch (e) {
      console.warn('[aiService] pdf-parse fallback failed:', e.message);
    }

    // Si todo falla, retornar null para que el llamador pueda decidir OCR u otra acción
    return null;
  }
}

const SYSTEM_PROMPT = `
Eres un experto en hardware de computadoras y licitaciones públicas de Perú (PeruCompras).
Tu trabajo es extraer especificaciones técnicas de equipos de cómputo desde imágenes o PDFs de bases de licitación.

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
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.pdf': 'application/pdf',
  };
  return mimeMap[ext] || 'image/jpeg';
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

  const response = await client.chat.completions.create({
    model,
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
  });

  const content = response.choices[0]?.message?.content || '';
  return parseAIResponse(content);
}

/**
 * Extrae specs usando Anthropic Claude
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
 * Función principal: Extrae specs de una imagen o PDF usando la AI configurada
 */
async function extractSpecsFromImage(imagePath) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'sk-...') {
    throw new Error('AI_API_KEY no configurada. Agrega tu API key en las variables de entorno.');
  }

  const mimeType = getMimeType(imagePath);
  const isPdf    = mimeType === 'application/pdf';

  let base64Image;
  if (isPdf) {
    // PDF → extraer texto → codificarlo como base64 (se decodificará a string en extractWith*)
    const absolutePath = path.isAbsolute(imagePath)
      ? imagePath
      : path.join(__dirname, '../../uploads', imagePath);
    const pdfBuffer = fs.readFileSync(absolutePath);
    const texto = await extractTextFromPdf(pdfBuffer);
    if (!texto || texto.trim().length < 20) {
      throw new Error('No se pudo extraer texto del PDF. El archivo puede estar escaneado o protegido.');
    }
    console.log(`[aiService] PDF → ${texto.length} caracteres extraídos`);
    base64Image = Buffer.from(texto, 'utf8').toString('base64'); // texto en base64
  } else {
    base64Image = imageToBase64(imagePath);
  }

  console.log(`Extrayendo specs con ${provider} (${process.env.AI_MODEL || 'default'})...`);

  let result;
  if (provider === 'anthropic') {
    result = await extractWithAnthropic(base64Image, mimeType);
  } else {
    result = await extractWithOpenAI(base64Image, mimeType);
  }

  // Validar estructura mínima
  if (!result.equipos || !Array.isArray(result.equipos)) {
    throw new Error('La respuesta de la AI no contiene el campo "equipos" esperado.');
  }

  return result;
}

module.exports = {
  extractSpecsFromImage,
  SYSTEM_PROMPT,
};
