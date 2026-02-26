const fs = require('fs');
const path = require('path');

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
 * Extrae specs usando OpenAI (GPT-4o con visión)
 */
async function extractWithOpenAI(base64Image, mimeType) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.AI_API_KEY });

  const model = process.env.AI_MODEL || 'gpt-4o';
  // Mejor manejo de errores y timeout para evitar que la petición cuelgue
  console.log('[AI] OpenAI request starting for model', model);
  const aiPromise = client.chat.completions.create({
    model,
    max_completion_tokens: 4096,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
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
        ],
      },
    ],
  });

  // timeout wrapper (50s)
  const timeoutMs = 50000;
  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI request timed out')), timeoutMs));

  let response;
  try {
    response = await Promise.race([aiPromise, timeoutPromise]);
  } catch (err) {
    console.error('[AI] OpenAI error or timeout:', err.message);
    // Intentar fallback a Anthropic si está disponible
    try {
      console.log('[AI] Intentando fallback a Anthropic...');
      return await extractWithAnthropic(base64Image, mimeType);
    } catch (err2) {
      console.error('[AI] Fallback Anthropic falló:', err2.message);
      throw new Error(`OpenAI error: ${err.message}; Anthropic fallback: ${err2.message}`);
    }
  }

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

  // Claude acepta estos mime types para imágenes
  const supportedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const mediaType = supportedMimes.includes(mimeType) ? mimeType : 'image/jpeg';

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
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
        ],
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

  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    // Intentar encontrar JSON dentro del texto
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e2) {
        console.error('No se pudo parsear la respuesta de la AI:', cleaned.substring(0, 200));
        throw new Error('La AI no retornó un JSON válido. Intenta con otra imagen.');
      }
    }
    throw new Error('La AI no retornó un JSON válido. Intenta con otra imagen.');
  }
}

/**
 * Función principal: Extrae specs de una imagen usando la AI configurada
 */
async function extractSpecsFromImage(imagePath) {
  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  
  if (!process.env.AI_API_KEY || process.env.AI_API_KEY === 'sk-...') {
    throw new Error('AI_API_KEY no configurada. Agrega tu API key en las variables de entorno.');
  }

  const base64Image = imageToBase64(imagePath);
  const mimeType = getMimeType(imagePath);

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
