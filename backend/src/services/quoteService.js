const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Quote = require('../models/Quote');

// Directorio para PDFs generados
const pdfDir = path.join(__dirname, '../../uploads/pdfs');
if (!fs.existsSync(pdfDir)) {
  fs.mkdirSync(pdfDir, { recursive: true });
}

/**
 * Formatea un número como moneda peruana
 */
function formatCurrency(amount) {
  return `S/. ${parseFloat(amount || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Genera un PDF de cotización
 */
async function generateQuotePDF(quoteId) {
  const quote = await Quote.findById(quoteId);
  if (!quote) throw new Error('Cotización no encontrada');

  const items = typeof quote.items === 'string' ? JSON.parse(quote.items) : (quote.items || []);
  const filename = `${quote.numero_cotizacion}.pdf`;
  const filepath = path.join(pdfDir, filename);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Cotización ${quote.numero_cotizacion}`,
          Author: 'Kenya - Distribuidora de Tecnología',
          Subject: 'Cotización de equipos de cómputo',
        },
      });

      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      const pageWidth = doc.page.width - 100; // margins

      // =========================================
      // HEADER
      // =========================================
      doc.fontSize(24).font('Helvetica-Bold').fillColor('#DC2626')
        .text('KENYA', 50, 50);
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
        .text('Distribuidora de Tecnología', 50, 78)
        .text('Perú', 50, 90);

      // Número de cotización (derecha)
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#1F2937')
        .text(quote.numero_cotizacion, 300, 50, { align: 'right', width: pageWidth - 250 });
      
      const fecha = new Date(quote.created_at).toLocaleDateString('es-PE', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      doc.fontSize(9).font('Helvetica').fillColor('#666666')
        .text(`Fecha: ${fecha}`, 300, 70, { align: 'right', width: pageWidth - 250 });
      
      doc.fontSize(9)
        .text(`Estado: ${(quote.estado || 'borrador').toUpperCase()}`, 300, 82, { align: 'right', width: pageWidth - 250 });

      // Línea separadora
      doc.moveTo(50, 110).lineTo(50 + pageWidth, 110).strokeColor('#DC2626').lineWidth(2).stroke();

      // =========================================
      // DATOS DEL CLIENTE
      // =========================================
      let yPos = 125;
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1F2937')
        .text('DATOS DEL CLIENTE', 50, yPos);
      yPos += 18;

      doc.fontSize(10).font('Helvetica').fillColor('#374151');
      doc.text(`Cliente: ${quote.cliente || 'Sin especificar'}`, 50, yPos);
      yPos += 14;
      if (quote.ruc) {
        doc.text(`RUC: ${quote.ruc}`, 50, yPos);
        yPos += 14;
      }

      // Línea separadora
      yPos += 8;
      doc.moveTo(50, yPos).lineTo(50 + pageWidth, yPos).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      yPos += 15;

      // =========================================
      // TABLA DE ITEMS
      // =========================================
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1F2937')
        .text('DETALLE DE LA COTIZACIÓN', 50, yPos);
      yPos += 20;

      // Header de tabla
      const colWidths = { item: 35, desc: 250, cant: 50, precio: 80, subtotal: 80 };
      const tableX = 50;

      // Fondo del header
      doc.rect(tableX, yPos, pageWidth, 22).fill('#F3F4F6');
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#374151');
      doc.text('ITEM', tableX + 5, yPos + 6, { width: colWidths.item });
      doc.text('DESCRIPCIÓN', tableX + colWidths.item + 5, yPos + 6, { width: colWidths.desc });
      doc.text('CANT.', tableX + colWidths.item + colWidths.desc + 5, yPos + 6, { width: colWidths.cant, align: 'center' });
      doc.text('P. UNIT.', tableX + colWidths.item + colWidths.desc + colWidths.cant + 5, yPos + 6, { width: colWidths.precio, align: 'right' });
      doc.text('SUBTOTAL', tableX + colWidths.item + colWidths.desc + colWidths.cant + colWidths.precio + 5, yPos + 6, { width: colWidths.subtotal, align: 'right' });
      yPos += 24;

      // Filas de items
      items.forEach((item, index) => {
        const cantidad = parseInt(item.cantidad) || 1;
        const precioUnit = parseFloat(item.precio_unitario) || 0;
        const subtotalItem = cantidad * precioUnit;

        // Verificar si necesitamos nueva página
        if (yPos > 700) {
          doc.addPage();
          yPos = 50;
        }

        // Fondo alternado
        if (index % 2 === 0) {
          doc.rect(tableX, yPos - 2, pageWidth, 40).fill('#FAFAFA');
        }

        doc.fontSize(9).font('Helvetica').fillColor('#374151');
        doc.text(`${index + 1}`, tableX + 5, yPos + 2, { width: colWidths.item });
        
        // Descripción con specs
        let descripcion = item.nombre || item.descripcion || 'Producto';
        if (item.specs_summary) {
          descripcion += `\n${item.specs_summary}`;
        } else {
          // Construir resumen de specs
          const specParts = [];
          if (item.procesador) specParts.push(`Proc: ${item.procesador}`);
          if (item.ram) specParts.push(`RAM: ${item.ram}`);
          if (item.almacenamiento) specParts.push(`Alm: ${item.almacenamiento}`);
          if (specParts.length > 0) {
            descripcion += `\n${specParts.join(' | ')}`;
          }
        }

        doc.fontSize(8).font('Helvetica').fillColor('#374151');
        doc.text(descripcion, tableX + colWidths.item + 5, yPos + 2, { width: colWidths.desc });
        doc.text(`${cantidad}`, tableX + colWidths.item + colWidths.desc + 5, yPos + 2, { width: colWidths.cant, align: 'center' });
        doc.text(formatCurrency(precioUnit), tableX + colWidths.item + colWidths.desc + colWidths.cant + 5, yPos + 2, { width: colWidths.precio, align: 'right' });
        doc.text(formatCurrency(subtotalItem), tableX + colWidths.item + colWidths.desc + colWidths.cant + colWidths.precio + 5, yPos + 2, { width: colWidths.subtotal, align: 'right' });
        
        yPos += 42;
      });

      // Línea final de tabla
      doc.moveTo(tableX, yPos).lineTo(tableX + pageWidth, yPos).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      yPos += 15;

      // =========================================
      // TOTALES
      // =========================================
      if (yPos > 680) {
        doc.addPage();
        yPos = 50;
      }

      const totalsX = tableX + pageWidth - 200;
      
      doc.fontSize(10).font('Helvetica').fillColor('#374151');
      doc.text('Subtotal:', totalsX, yPos, { width: 100 });
      doc.text(formatCurrency(quote.subtotal), totalsX + 100, yPos, { width: 100, align: 'right' });
      yPos += 16;

      doc.text('IGV (18%):', totalsX, yPos, { width: 100 });
      doc.text(formatCurrency(quote.igv), totalsX + 100, yPos, { width: 100, align: 'right' });
      yPos += 18;

      // Total con fondo
      doc.rect(totalsX - 5, yPos - 3, 210, 24).fill('#DC2626');
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#FFFFFF');
      doc.text('TOTAL:', totalsX, yPos + 2, { width: 100 });
      doc.text(formatCurrency(quote.total), totalsX + 100, yPos + 2, { width: 100, align: 'right' });
      yPos += 35;

      // =========================================
      // CONDICIONES
      // =========================================
      if (yPos > 720) {
        doc.addPage();
        yPos = 50;
      }

      doc.moveTo(50, yPos).lineTo(50 + pageWidth, yPos).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      yPos += 12;

      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
        .text('CONDICIONES:', 50, yPos);
      yPos += 14;

      doc.fontSize(8).font('Helvetica').fillColor('#6B7280');
      const condiciones = [
        '• Los precios son referenciales según catálogo de PeruCompras.',
        '• Esta cotización tiene una validez de 7 días calendario.',
        '• Precios incluyen IGV.',
        '• Disponibilidad sujeta a stock al momento de la orden de compra.',
        '• Tiempo de entrega estimado: 5-10 días hábiles.',
      ];

      condiciones.forEach((cond) => {
        doc.text(cond, 50, yPos, { width: pageWidth });
        yPos += 12;
      });

      if (quote.notas) {
        yPos += 5;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151')
          .text('NOTAS:', 50, yPos);
        yPos += 14;
        doc.fontSize(8).font('Helvetica').fillColor('#6B7280')
          .text(quote.notas, 50, yPos, { width: pageWidth });
      }

      // =========================================
      // FOOTER
      // =========================================
      doc.fontSize(7).font('Helvetica').fillColor('#9CA3AF')
        .text(
          'Kenya - Distribuidora de Tecnología | Sistema de Cotización Inteligente',
          50,
          doc.page.height - 40,
          { align: 'center', width: pageWidth }
        );

      // Finalizar
      doc.end();

      writeStream.on('finish', () => {
        resolve({
          filename,
          filepath,
          url: `/api/quotes/${quoteId}/pdf`,
        });
      });

      writeStream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Obtiene la ruta del PDF para descarga
 */
function getPDFPath(numeroCotizacion) {
  return path.join(pdfDir, `${numeroCotizacion}.pdf`);
}

module.exports = {
  generateQuotePDF,
  getPDFPath,
  formatCurrency,
};
