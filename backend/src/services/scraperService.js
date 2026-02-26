const Product = require('../models/Product');

// URL base del buscador de catálogos de PeruCompras
const BASE_URL = 'https://buscadorcatalogos.perucompras.gob.pe';

// Marcas priorizadas en orden de prioridad
const MARCAS_PRIORITARIAS = ['kenya', 'lenovo', 'hp'];

// Categorías de búsqueda
const CATEGORIAS_PC = {
  laptop: 'laptop',
  desktop: 'computadora personal',
  'all-in-one': 'computadora all in one',
  workstation: 'workstation',
};

// Rate limiting: tiempo de espera entre requests (ms)
const REQUEST_DELAY = 1500;
const SCRAPING_TIMEOUT = 30000;
const MAX_RETRIES = 3;

/**
 * Espera un tiempo determinado
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcula el score de coincidencia entre un producto y un requerimiento
 * Retorna un valor de 0-100
 */
function calcularScore(productSpecs, requerimiento) {
  let score = 0;
  let maxScore = 0;

  // --- Procesador: 30 puntos ---
  if (requerimiento.procesador && requerimiento.procesador.modelo) {
    maxScore += 30;
    const reqProc = (requerimiento.procesador.modelo || '').toLowerCase();
    const prodProc = (
      (productSpecs.procesador?.modelo || '') +
      ' ' +
      (productSpecs.procesador?.marca || '')
    ).toLowerCase();

    if (reqProc && prodProc) {
      // Coincidencia exacta del modelo
      if (prodProc.includes(reqProc) || reqProc.includes(prodProc.split(' ')[0])) {
        score += 30;
      } else {
        // Coincidencia parcial (misma familia)
        const families = ['i3', 'i5', 'i7', 'i9', 'ryzen 3', 'ryzen 5', 'ryzen 7', 'ryzen 9', 'core ultra'];
        for (const family of families) {
          if (reqProc.includes(family) && prodProc.includes(family)) {
            score += 20;
            break;
          }
        }
      }
    }
  }

  // --- RAM: 25 puntos ---
  if (requerimiento.memoria_ram && requerimiento.memoria_ram.capacidad_gb) {
    maxScore += 25;
    const reqRam = parseInt(requerimiento.memoria_ram.capacidad_gb) || 0;
    const prodRam = parseInt(productSpecs.memoria_ram?.capacidad_gb) || 0;

    if (prodRam >= reqRam && reqRam > 0) {
      score += 25; // cumple o supera
    } else if (prodRam > 0 && reqRam > 0 && prodRam >= reqRam * 0.5) {
      score += 12; // al menos la mitad
    }
  }

  // --- Almacenamiento: 20 puntos ---
  if (requerimiento.almacenamiento && requerimiento.almacenamiento.capacidad_gb) {
    maxScore += 20;
    const reqStorage = parseInt(requerimiento.almacenamiento.capacidad_gb) || 0;
    const prodStorage = parseInt(productSpecs.almacenamiento?.capacidad_gb) || 0;

    if (prodStorage >= reqStorage && reqStorage > 0) {
      score += 20;
    } else if (prodStorage > 0 && reqStorage > 0 && prodStorage >= reqStorage * 0.5) {
      score += 10;
    }

    // Bonus por tipo SSD
    const reqType = (requerimiento.almacenamiento.tipo || '').toLowerCase();
    const prodType = (productSpecs.almacenamiento?.tipo || '').toLowerCase();
    if (reqType.includes('ssd') && prodType.includes('ssd')) {
      score += 2;
    }
  }

  // --- Gráfica: 15 puntos ---
  if (requerimiento.grafica && requerimiento.grafica.tipo) {
    maxScore += 15;
    const reqGpu = (requerimiento.grafica.tipo || '').toLowerCase();
    const prodGpu = (productSpecs.grafica?.tipo || '').toLowerCase();

    if (reqGpu === 'dedicada' && prodGpu === 'dedicada') {
      score += 15;
      // Bonus si coincide VRAM
      if (
        requerimiento.grafica.vram_gb &&
        productSpecs.grafica?.vram_gb &&
        productSpecs.grafica.vram_gb >= requerimiento.grafica.vram_gb
      ) {
        score += 3;
      }
    } else if (reqGpu === 'integrada' && prodGpu === 'integrada') {
      score += 15;
    } else if (reqGpu === 'dedicada' && prodGpu !== 'dedicada') {
      score += 0;
    } else {
      score += 8;
    }
  }

  // --- Pantalla: 10 puntos ---
  if (requerimiento.pantalla && requerimiento.pantalla.pulgadas) {
    maxScore += 10;
    const reqScreen = parseFloat(requerimiento.pantalla.pulgadas) || 0;
    const prodScreen = parseFloat(productSpecs.pantalla?.pulgadas) || 0;

    if (prodScreen > 0 && reqScreen > 0) {
      if (Math.abs(prodScreen - reqScreen) <= 0.6) {
        score += 10;
      } else if (Math.abs(prodScreen - reqScreen) <= 2) {
        score += 5;
      }
    }
  }

  // Normalizar a 0-100
  if (maxScore === 0) return 50; // Sin specs para comparar
  return Math.min(Math.round((score / maxScore) * 100), 100);
}

/**
 * Parsea las especificaciones de un texto de producto en formato estructurado
 */
function parseProductSpecs(rawSpecs) {
  const specs = {
    procesador: { marca: '', modelo: '', generacion: '', nucleos: null, frecuencia: null },
    memoria_ram: { capacidad_gb: null, tipo: '', frecuencia_mhz: null },
    almacenamiento: { capacidad_gb: null, tipo: '' },
    pantalla: { pulgadas: null, resolucion: '', tipo: '' },
    grafica: { tipo: 'integrada', vram_gb: null, modelo: '' },
    sistema_operativo: '',
  };

  if (!rawSpecs || typeof rawSpecs !== 'object') return specs;

  // Si rawSpecs ya es un mapa key-value, intentar extraer datos relevantes
  const allText = JSON.stringify(rawSpecs).toLowerCase();

  // Procesador
  const procMatch = allText.match(/(?:core\s*(?:i[3579]|ultra\s*\d))[^\",]*/i) ||
                     allText.match(/(?:ryzen\s*[3579])[^\",]*/i);
  if (procMatch) {
    specs.procesador.modelo = procMatch[0].trim();
    if (allText.includes('intel')) specs.procesador.marca = 'Intel';
    if (allText.includes('amd')) specs.procesador.marca = 'AMD';
  }

  // RAM
  const ramMatch = allText.match(/(\d+)\s*gb\s*(?:ram|ddr)/i) || allText.match(/ram[:\s]*(\d+)\s*gb/i);
  if (ramMatch) specs.memoria_ram.capacidad_gb = parseInt(ramMatch[1]);
  if (allText.includes('ddr5')) specs.memoria_ram.tipo = 'DDR5';
  else if (allText.includes('ddr4')) specs.memoria_ram.tipo = 'DDR4';

  // Almacenamiento
  const storageMatch = allText.match(/(\d+)\s*(?:gb|tb)\s*(?:ssd|hdd|nvme)/i) ||
                        allText.match(/(?:ssd|hdd|nvme)[:\s]*(\d+)\s*(?:gb|tb)/i);
  if (storageMatch) {
    let capacity = parseInt(storageMatch[1]);
    if (allText.includes('tb') && capacity < 10) capacity *= 1024;
    specs.almacenamiento.capacidad_gb = capacity;
  }
  if (allText.includes('nvme')) specs.almacenamiento.tipo = 'SSD NVMe';
  else if (allText.includes('ssd')) specs.almacenamiento.tipo = 'SSD';
  else if (allText.includes('hdd')) specs.almacenamiento.tipo = 'HDD';

  // Pantalla
  const screenMatch = allText.match(/(\d+\.?\d*)\s*(?:"|pulgadas|inch)/i);
  if (screenMatch) specs.pantalla.pulgadas = parseFloat(screenMatch[1]);
  if (allText.includes('fhd') || allText.includes('1920')) specs.pantalla.resolucion = 'FHD';
  if (allText.includes('4k') || allText.includes('uhd')) specs.pantalla.resolucion = '4K UHD';

  // Gráfica
  if (allText.includes('nvidia') || allText.includes('geforce') || allText.includes('rtx') || allText.includes('gtx')) {
    specs.grafica.tipo = 'dedicada';
    const gpuMatch = allText.match(/((?:rtx|gtx)\s*\d+[^\",]*)/i);
    if (gpuMatch) specs.grafica.modelo = gpuMatch[1].trim();
  }

  // SO
  if (allText.includes('windows 11')) specs.sistema_operativo = 'Windows 11';
  else if (allText.includes('windows 10')) specs.sistema_operativo = 'Windows 10';
  else if (allText.includes('linux')) specs.sistema_operativo = 'Linux';

  return specs;
}

/**
 * Obtiene el browser de Playwright
 */
async function getBrowser() {
  const { chromium } = require('playwright');

  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };

  // En Docker/producción, usar el Chromium del sistema
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  return chromium.launch(launchOptions);
}

/**
 * Busca productos en PeruCompras con reintentos y backoff exponencial
 */
async function searchPeruCompras(searchTerm, marca, retryCount = 0) {
  let browser = null;
  let page = null;

  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
    page = await context.newPage();
    page.setDefaultTimeout(SCRAPING_TIMEOUT);

    // Navegar al buscador de catálogos
    console.log(`[Scraper] Buscando "${searchTerm}" marca "${marca}" en PeruCompras...`);
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: SCRAPING_TIMEOUT });
    await sleep(1000);

    // Componer la búsqueda: tipo_equipo + marca
    const fullSearch = marca ? `${searchTerm} ${marca}` : searchTerm;

    // Buscar el campo de búsqueda e ingresar el término
    // Intentamos varios selectores comunes para el buscador
    const searchSelectors = [
      'input[type="search"]',
      'input[type="text"]',
      '#search',
      '#txtBuscar',
      'input[placeholder*="buscar" i]',
      'input[placeholder*="search" i]',
      'input[name="search"]',
      'input[name="q"]',
      '.search-input input',
      'input.form-control',
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput) break;
      } catch (e) {
        continue;
      }
    }

    const productos = [];

    if (searchInput) {
      await searchInput.fill(fullSearch);
      await sleep(500);

      // Intentar enviar el formulario
      await searchInput.press('Enter');
      await sleep(2000);

      // Esperar a que carguen los resultados
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 });
      } catch (e) {
        // Puede que no haya cambios de red significativos
      }

      // Extraer resultados - intentar diferentes selectores de cards/tablas
      const resultSelectors = [
        '.product-card',
        '.card',
        '.resultado-item',
        '.item-catalogo',
        'table tbody tr',
        '.list-group-item',
        '[class*="product"]',
        '[class*="ficha"]',
        '[class*="catalog"]',
      ];

      for (const selector of resultSelectors) {
        try {
          const items = await page.$$(selector);
          if (items.length > 0) {
            console.log(`[Scraper] Encontrados ${items.length} resultados con selector "${selector}"`);

            for (let i = 0; i < Math.min(items.length, 10); i++) {
              try {
                const item = items[i];
                const text = await item.innerText();
                
                // Intentar extraer datos del item
                const linkEl = await item.$('a[href]');
                const link = linkEl ? await linkEl.getAttribute('href') : '';
                const fullUrl = link ? new URL(link, BASE_URL).href : '';

                // Extraer nombre/título
                const titleEl = await item.$('h3, h4, h5, .title, .nombre, strong, b');
                const title = titleEl ? await titleEl.innerText() : text.substring(0, 100);

                // Extraer precio si está disponible
                const priceMatch = text.match(/S\/\.?\s*([\d,.]+)/);
                const precio = priceMatch
                  ? parseFloat(priceMatch[1].replace(',', ''))
                  : null;

                // Generar un ID de ficha
                const fichaIdMatch = link?.match(/[?&]id=(\d+)/) || link?.match(/\/(\d+)$/);
                const fichaId = fichaIdMatch ? fichaIdMatch[1] : `PC-${Date.now()}-${i}`;

                productos.push({
                  ficha_id: fichaId,
                  marca: marca || detectarMarca(text),
                  nombre: title.trim(),
                  specs_raw: text,
                  precio_referencial: precio,
                  url_ficha: fullUrl,
                });

                await sleep(200); // micro-delay entre items
              } catch (itemErr) {
                console.error(`[Scraper] Error procesando item ${i}:`, itemErr.message);
              }
            }
            break; // ya encontramos resultados con un selector
          }
        } catch (e) {
          continue;
        }
      }
    } else {
      console.log('[Scraper] No se encontró campo de búsqueda en PeruCompras. Probando endpoints de búsqueda directos...');

      // Intentar endpoints directos comunes del buscador con el término construído
      const searchPaths = [
        `/buscar?texto=${encodeURIComponent(fullSearch)}`,
        `/buscar?q=${encodeURIComponent(fullSearch)}`,
        `/busqueda?q=${encodeURIComponent(fullSearch)}`,
        `/search?q=${encodeURIComponent(fullSearch)}`,
        `/resultados?texto=${encodeURIComponent(fullSearch)}`,
      ];

      for (const p of searchPaths) {
        try {
          const url = new URL(p, BASE_URL).href;
          console.log(`[Scraper] Intentando búsqueda directa en: ${url}`);
          await page.goto(url, { waitUntil: 'networkidle', timeout: SCRAPING_TIMEOUT });
          await sleep(1000);

          // Reintentar extracción de resultados con los mismos selectores
          for (const selector of ['.product-card','.card','.resultado-item','.item-catalogo','table tbody tr','.list-group-item','[class*="product"]','[class*="ficha"]','[class*="catalog"]']) {
            const items = await page.$$(selector);
            if (items && items.length > 0) {
              console.log(`[Scraper] Encontrados ${items.length} resultados en búsqueda directa con selector "${selector}"`);
              // procesar items como si hubiéramos usado el flow principal
              for (let i = 0; i < Math.min(items.length, 10); i++) {
                try {
                  const item = items[i];
                  const text = await item.innerText();
                  const linkEl = await item.$('a[href]');
                  const link = linkEl ? await linkEl.getAttribute('href') : '';
                  const fullUrl = link ? new URL(link, BASE_URL).href : '';
                  const titleEl = await item.$('h3, h4, h5, .title, .nombre, strong, b');
                  const title = titleEl ? await titleEl.innerText() : text.substring(0, 100);
                  const priceMatch = text.match(/S\/\.?\s*([\d,.]+)/);
                  const precio = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
                  const fichaIdMatch = link?.match(/[?&]id=(\d+)/) || link?.match(/\/(\d+)$/);
                  const fichaId = fichaIdMatch ? fichaIdMatch[1] : `PC-${Date.now()}-${i}`;

                  productos.push({
                    ficha_id: fichaId,
                    marca: marca || detectarMarca(text),
                    nombre: title.trim(),
                    specs_raw: text,
                    precio_referencial: precio,
                    url_ficha: fullUrl,
                  });
                  await sleep(200);
                } catch (itemErr) {
                  console.error(`[Scraper] Error procesando item directo ${i}:`, itemErr.message);
                }
              }
              // si encontramos resultados, rompemos los intentos de path
              break;
            }
          }
          // si ya se llenaron productos, salir del loop de paths
          if (productos.length > 0) break;
        } catch (e) {
          console.log(`[Scraper] Falla en endpoint directo ${p}: ${e.message}`);
          continue;
        }
      }

      if (productos.length === 0) {
        const pageContent = await page.content();
        console.log(`[Scraper] Página cargada (fallback): ${page.url()} - ${pageContent.length} caracteres`);
      }
    }
    }

    return productos;
  } catch (error) {
    console.error(`[Scraper] Error en búsqueda (intento ${retryCount + 1}):`, error.message);

    // Retry con backoff exponencial
    if (retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount) * 2000;
      console.log(`[Scraper] Reintentando en ${waitTime / 1000}s...`);
      await sleep(waitTime);
      return searchPeruCompras(searchTerm, marca, retryCount + 1);
    }

    return [];
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignorar error al cerrar
      }
    }
  }
}

/**
 * Detecta la marca a partir de un texto
 */
function detectarMarca(text) {
  const textLower = (text || '').toLowerCase();
  if (textLower.includes('kenya')) return 'kenya';
  if (textLower.includes('lenovo')) return 'lenovo';
  if (textLower.includes('hp') || textLower.includes('hewlett')) return 'hp';
  if (textLower.includes('dell')) return 'dell';
  if (textLower.includes('asus')) return 'asus';
  if (textLower.includes('acer')) return 'acer';
  return 'otra';
}

/**
 * Busca fichas de detalle de un producto específico
 */
async function getFichaDetails(url) {
  if (!url) return {};

  let browser = null;
  try {
    browser = await getBrowser();
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(SCRAPING_TIMEOUT);

    await page.goto(url, { waitUntil: 'networkidle', timeout: SCRAPING_TIMEOUT });
    await sleep(1000);

    // Intentar extraer tabla de especificaciones
    const specs = {};

    // Buscar tablas de especificaciones
    const rows = await page.$$('table tr, .spec-row, .detail-row, dl dt, dl dd');
    for (let i = 0; i < rows.length; i++) {
      try {
        const text = await rows[i].innerText();
        const parts = text.split(/[:\t→]/);
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          const value = parts.slice(1).join(':').trim();
          if (key && value) specs[key] = value;
        }
      } catch (e) {
        continue;
      }
    }

    return specs;
  } catch (error) {
    console.error(`[Scraper] Error obteniendo ficha ${url}:`, error.message);
    return {};
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }
  }
}

/**
 * Función principal: Busca productos para un requerimiento dado
 * Prioriza: Kenya → Lenovo → HP
 * Utiliza caché de PostgreSQL
 */
async function searchProducts(specs) {
  const tipo = specs.tipo_equipo || 'laptop';
  const searchTerm = CATEGORIAS_PC[tipo] || tipo;
  const resultadosPorMarca = {};

  for (const marca of MARCAS_PRIORITARIAS) {
    console.log(`[Scraper] Buscando ${searchTerm} de ${marca.toUpperCase()}...`);

    // 1. Verificar caché primero
    const cached = await Product.findCached(marca, 24);
    let productos = [];

    if (cached.length > 0) {
      console.log(`[Scraper] Usando ${cached.length} productos en caché para ${marca}`);
      productos = cached.map((p) => ({
        ...p,
        parsed_specs: typeof p.specs === 'string' ? JSON.parse(p.specs) : p.specs,
        score: calcularScore(
          typeof p.specs === 'string' ? parseProductSpecs(JSON.parse(p.specs)) : parseProductSpecs(p.specs),
          specs
        ),
        from_cache: true,
      }));
    } else {
      // 2. Scrapear PeruCompras
      const scraped = await searchPeruCompras(searchTerm, marca);
      await sleep(REQUEST_DELAY);

      // 3. Guardar en caché y calcular scores
      for (const item of scraped) {
        const parsedSpecs = parseProductSpecs(item.specs_raw ? { raw: item.specs_raw } : {});

        try {
          const saved = await Product.create({
            ficha_id: item.ficha_id,
            marca: marca,
            nombre: item.nombre,
            specs: parsedSpecs,
            precio_referencial: item.precio_referencial,
            url_ficha: item.url_ficha,
          });

          productos.push({
            ...saved,
            parsed_specs: parsedSpecs,
            score: calcularScore(parsedSpecs, specs),
            from_cache: false,
          });
        } catch (dbError) {
          console.error(`[Scraper] Error guardando producto:`, dbError.message);
          productos.push({
            ficha_id: item.ficha_id,
            marca: marca,
            nombre: item.nombre,
            specs: parsedSpecs,
            parsed_specs: parsedSpecs,
            precio_referencial: item.precio_referencial,
            url_ficha: item.url_ficha,
            score: calcularScore(parsedSpecs, specs),
            from_cache: false,
          });
        }
      }
    }

    // 4. Ordenar por score descendente y tomar top 5
    productos.sort((a, b) => b.score - a.score);
    resultadosPorMarca[marca] = productos.slice(0, 5);
  }

  return resultadosPorMarca;
}

/**
 * Forzar re-scraping de una marca específica (ignorar caché)
 */
async function forceRefresh(marca, tipo = 'laptop') {
  const searchTerm = CATEGORIAS_PC[tipo] || tipo;
  console.log(`[Scraper] Forzando actualización de ${marca} (${searchTerm})...`);

  const scraped = await searchPeruCompras(searchTerm, marca);
  const productos = [];

  for (const item of scraped) {
    const parsedSpecs = parseProductSpecs(item.specs_raw ? { raw: item.specs_raw } : {});
    try {
      const saved = await Product.create({
        ficha_id: item.ficha_id,
        marca: marca,
        nombre: item.nombre,
        specs: parsedSpecs,
        precio_referencial: item.precio_referencial,
        url_ficha: item.url_ficha,
      });
      productos.push(saved);
    } catch (e) {
      console.error(`[Scraper] Error en refresh:`, e.message);
    }
  }

  return productos;
}

module.exports = {
  searchProducts,
  getFichaDetails,
  calcularScore,
  parseProductSpecs,
  forceRefresh,
  MARCAS_PRIORITARIAS,
  CATEGORIAS_PC,
};
