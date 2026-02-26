const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = `
Eres un experto en hardware de computadoras para Perú. 
Analiza la imagen proporcionada y extrae ÚNICAMENTE los requerimientos técnicos de equipos de cómputo.

REGLAS DE EXTRACCIÓN:
- Extrae solo especificaciones técnicas relevantes para cotizar PCs o laptops
- Ignora información de precios, nombres de personas, fechas, firmas
- Si hay varios equipos en el mismo requerimiento, extrae cada uno por separado
- Si una especificación no está clara, ponla como null, NO inventes datos
- Normaliza los nombres: "i7" → "Core i7", "16 ram" → "16GB RAM"
- Detecta el tipo: laptop, desktop, all-in-one, workstation

FORMATO DE RESPUESTA (JSON puro, sin markdown, sin bloques de código):
{
  "equipos": [
    {
      "tipo_equipo": "laptop|desktop|all-in-one|workstation",
      "cantidad": 1,
      "procesador": { "marca": "", "modelo": "", "generacion": "", "nucleos": null, "frecuencia": null },
      "memoria_ram": { "capacidad_gb": null, "tipo": "", "frecuencia_mhz": null },
      "almacenamiento": { "capacidad_gb": null, "tipo": "" },
      "pantalla": { "pulgadas": null, "resolucion": "", "tipo": "" },
      "grafica": { "tipo": "integrada|dedicada", "vram_gb": null, "modelo": "" },
      "sistema_operativo": "",
      "otros": [],
      "uso": "",
      "presupuesto_max": null
    }
  ],
  "notas_adicionales": ""
}
`;

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

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
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
