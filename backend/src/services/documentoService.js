const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { firmarTokenQr } = require('../utils/jwt');

const TITULO_POR_TIPO = {
  APROBACION: 'RESOLUCIÓN DE APROBACIÓN DE PERMISO',
  RECHAZO: 'RESOLUCIÓN DE RECHAZO DE SOLICITUD',
};

// Genera el PDF formal de aprobación/rechazo (Semana 5 Bloque 3): sello
// municipal simulado + QR de verificación (token firmado que resuelve al
// mismo detalle del permiso vía GET /api/permisos/qr/:token). Se genera al
// vuelo a partir del estado actual del permiso — no se persiste el PDF.
function generarDocumentoPermiso(permiso, tipo, extra = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const titulo = TITULO_POR_TIPO[tipo] || 'RESOLUCIÓN MUNICIPAL';

    doc.fontSize(18).text('VíaSegura — Municipalidad', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(14).text(titulo, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Permiso: ${permiso.id}`);
    doc.text(`RUT ejecutor: ${permiso.rut_ejecutor}`);
    doc.text(`Empresa: ${permiso.nombre_empresa_ejecutora || 'Registrada / persona natural'}`);
    doc.text(`Tipo de actividad: ${permiso.tipo_actividad}`);
    doc.text(`Ventana: ${new Date(permiso.ventana_inicio).toLocaleString('es-CL')} — ${new Date(permiso.ventana_fin).toLocaleString('es-CL')}`);
    doc.text(`Estado actual: ${permiso.estado}`);
    if (extra.motivo) doc.text(`Motivo: ${extra.motivo}`);
    doc.moveDown(1);
    doc.text(`Emitido: ${new Date().toLocaleString('es-CL')}`);

    // Sello municipal simulado (no es una firma electrónica avanzada real).
    const selloY = doc.y + 30;
    doc.save();
    doc.lineWidth(2).rect(350, selloY, 180, 90).stroke();
    doc
      .fontSize(9)
      .text('MUNICIPALIDAD', 355, selloY + 10, { width: 170, align: 'center' })
      .text('SELLO DIGITAL SIMULADO', 355, selloY + 25, { width: 170, align: 'center' })
      .text('Documento generado automáticamente', 355, selloY + 45, { width: 170, align: 'center' })
      .text('por VíaSegura', 355, selloY + 58, { width: 170, align: 'center' });
    doc.restore();

    const token = firmarTokenQr(permiso.id, 60 * 60 * 24 * 30);
    QRCode.toDataURL(token, { margin: 1 }, (err, dataUrl) => {
      if (err) {
        doc.end();
        return;
      }
      const base64 = dataUrl.split(',')[1];
      doc.image(Buffer.from(base64, 'base64'), 50, selloY, { width: 90 });
      doc.fontSize(8).text('Escanee para verificar', 50, selloY + 92, { width: 90, align: 'center' });
      doc.end();
    });
  });
}

module.exports = { generarDocumentoPermiso };
