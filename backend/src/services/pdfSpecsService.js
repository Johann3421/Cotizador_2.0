'use strict';

const axios    = require('axios');
const pdfParse = require('pdf-parse').default || require('pdf-parse');

/**
 * Descarga y extrae el texto del PDF de especificaciones técnicas de una ficha.
 * El PDF está en la URL almacenada en el campo pdfUrl de la ficha.
 * Ejemplo: https://prod-pc-cdn.azureedge.net/contproveedor/Documentos/Productos/1749737.pdf
 */
const extraerSpecsDePdf = async (pdfUrl) => {
  if (!pdfUrl) return null;

  try {
    const response = await axios.get(pdfUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data   = await pdfParse(Buffer.from(response.data));
    const texto  = data.text || '';
    const specs  = parsearTextoPdf(texto);

    return { texto_crudo: texto, specs };

  } catch (err) {
    console.error(`[PdfSpecs] Error descargando ${pdfUrl}:`, err.message);
    return null;
  }
};

/**
 * Parsea el texto del PDF y extrae los campos relevantes.
 * El PDF tiene formato: "Campo    Valor" en líneas separadas.
 *
 * Ejemplo de texto real del PDF:
 * "Procesador   Intel® 12° Generación Core I7 12700"
 * "Memoria Ram  8 GB DDR4 3200 400 MHz"
 * "Almacenamiento  512 GB SSD"
 * "Gráficos     Integrado - Intel® UHD Graphics"
 */
const parsearTextoPdf = (texto) => {
  const specs = {};

  // ── Procesador ──────────────────────────────────────────────
  const procMatch = texto.match(/Procesador[\s\t]+(.+)/i);
  if (procMatch) {
    const procTexto = procMatch[1].trim();
    specs.procesador_texto = procTexto;

    // Extraer generación Intel
    const genMatch = procTexto.match(/(\d{1,2})(?:°|ª|th|rd|nd|st)\s*[Gg]eneración/i)
                  || procTexto.match(/(\d{4,5})\s*(?:\(|CPU)/);
    if (genMatch) specs.procesador_generacion = parseInt(genMatch[1]);

    // Normalizar modelo
    const modeloMatch = procTexto.match(/(Core\s+(?:Ultra\s+)?\w+\s*[\w-]+)/i)
                     || procTexto.match(/(Ryzen\s+\d+\s+[\w-]+)/i);
    if (modeloMatch) specs.procesador_modelo = modeloMatch[1].trim();
  }

  // ── RAM ─────────────────────────────────────────────────────
  const ramMatch = texto.match(/(?:Memoria\s+Ram|RAM|Memoria)[\s\t]+(.+)/i);
  if (ramMatch) {
    const ramTexto = ramMatch[1].trim();
    specs.ram_texto = ramTexto;

    const gbMatch = ramTexto.match(/(\d+)\s*GB/i);
    if (gbMatch) specs.ram_gb = parseInt(gbMatch[1]);

    const tipoMatch = ramTexto.match(/(DDR[45]|LPDDR[45]X?)/i);
    if (tipoMatch) specs.ram_tipo = tipoMatch[1].toUpperCase();

    const mhzMatch = ramTexto.match(/(\d{3,4})\s*(?:MHz|mhz)/i);
    if (mhzMatch) specs.ram_mhz = parseInt(mhzMatch[1]);
  }

  // ── Almacenamiento ───────────────────────────────────────────
  const stMatch = texto.match(/Almacenamiento[\s\t]+(.+)/i);
  if (stMatch) {
    const stTexto = stMatch[1].trim();
    specs.almacenamiento_texto = stTexto;
    specs.almacenamiento = [];

    // Buscar múltiples unidades
    const unidades = stTexto.split(/[\/\+\|]|(?:\s+y\s+)/i);
    for (const u of unidades) {
      const gbMatch = u.match(/(\d+(?:\.\d+)?)\s*(TB|GB)/i);
      if (gbMatch) {
        const val   = parseFloat(gbMatch[1]);
        const unidad = gbMatch[2].toUpperCase();
        const gb    = unidad === 'TB' ? val * 1000 : val;

        let tipo = 'HDD';
        if (/nvme|m\.2|pcie/i.test(u))  tipo = 'NVMe SSD';
        else if (/ssd/i.test(u))         tipo = 'SSD';
        else if (/7200/i.test(u))        tipo = 'HDD 7200rpm';

        specs.almacenamiento.push({ gb, tipo });
      }
    }
  }

  // ── Gráficos ─────────────────────────────────────────────────
  const grafMatch = texto.match(/Gr[áa]ficos?[\s\t]+(.+)/i)
                 || texto.match(/(?:Tarjeta\s+)?[Vv]ideo[\s\t]+(.+)/i);
  if (grafMatch) {
    const grafTexto = grafMatch[1].trim();
    specs.grafica_texto = grafTexto;

    if (/integrado|integrada/i.test(grafTexto)) {
      specs.grafica_tipo    = 'integrada';
      specs.grafica_modelo  = grafTexto.replace(/integrado\s*[-–]\s*/i, '').trim();
    } else {
      specs.grafica_tipo = 'dedicada';

      const vramMatch = grafTexto.match(/(\d+)\s*GB/i);
      if (vramMatch) specs.grafica_vram_gb = parseInt(vramMatch[1]);

      const modeloMatch = grafTexto.match(/((?:NVIDIA|AMD|Intel)\s+[\w\s]+(?:RTX|GTX|RX|Arc)\s*[\w\s]+)/i)
                        || grafTexto.match(/((?:RTX|GTX|RX)\s*\d+\w*)/i);
      if (modeloMatch) specs.grafica_modelo = modeloMatch[1].trim();
    }
  }

  // ── SO ───────────────────────────────────────────────────────
  const soMatch = texto.match(/(?:Sistema\s+Operativo|S\.O\.|SO)[\s\t]+(.+)/i);
  if (soMatch) specs.so_texto = soMatch[1].trim();

  // ── Garantía ─────────────────────────────────────────────────
  const garMatch = texto.match(/Garantia[\s\t]+(.+)/i);
  if (garMatch) {
    specs.garantia_texto = garMatch[1].trim();
    const mesesMatch = garMatch[1].match(/(\d+)\s*[Mm]eses/);
    if (mesesMatch) specs.garantia_meses = parseInt(mesesMatch[1]);
  }

  // ── Certificaciones ──────────────────────────────────────────
  const certMatch = texto.match(/Certificaciones?[\s\t]+(.+)/i);
  if (certMatch) specs.certificaciones_texto = certMatch[1].trim();

  return specs;
};

module.exports = { extraerSpecsDePdf };
