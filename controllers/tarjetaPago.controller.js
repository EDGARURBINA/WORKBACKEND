import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import Cliente from '../models/Cliente.js';
import TarjetaPago from '../models/TarjetaPago.js';

export const generarTarjetaPagoPDF = async (req, res) => {
  try {
    const { prestamoId } = req.params;

    // Obtener información completa del préstamo
    const prestamo = await Prestamo.findById(prestamoId)
      .populate({
        path: 'cliente',
        populate: {
          path: 'trabajadorAsignado',
          select: 'nombreCompleto telefono'
        }
      });

    if (!prestamo) {
      return res.status(404).json({ message: 'Préstamo no encontrado' });
    }

    // Obtener todos los pagos del préstamo
    const pagos = await Pago.find({ prestamo: prestamoId })
      .sort({ numeroPago: 1 });

    // ✅ CREAR PDF TAMAÑO A4 CON DOBLE TARJETA
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30, // Reducir margen para más espacio
      info: {
        Title: `Tarjetas de Pagos - ${prestamo.numeroContrato}`,
        Author: 'Sistema de Préstamos',
        Subject: 'Tarjetas de Control de Pagos'
      }
    });

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tarjetas-pagos-${prestamo.numeroContrato}.pdf"`);

    // Pipe del documento al response
    doc.pipe(res);

    // ✅ GENERAR AMBAS TARJETAS EN LA MISMA PÁGINA
    await generarDosTarjetas(doc, prestamo, pagos);

    // Finalizar el documento
    doc.end();

  } catch (error) {
    console.error('Error al generar tarjeta PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};

// ✅ FUNCIÓN PARA GENERAR AMBAS TARJETAS EN UNA SOLA PÁGINA
async function generarDosTarjetas(doc, prestamo, pagos) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);
  
  // ✅ PRIMERA TARJETA (COMPLETA) - PARTE SUPERIOR
  let yInicial = 40;
  await generarTarjeta(doc, prestamo, pagos, yInicial, true, "TARJETA COMPLETA");
  
  // ✅ LÍNEA SEPARADORA
  const ySeparador = yInicial + 320;
  doc.strokeColor('#cccccc')
     .lineWidth(1)
     .moveTo(margin, ySeparador)
     .lineTo(pageWidth - margin, ySeparador)
     .stroke();
  
  // Texto separador
  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text('- - - - - - - - - - - - - - - - - - - - - - CORTE AQUÍ - - - - - - - - - - - - - - - - - - - - - -', 
           margin, ySeparador + 5, { 
             align: 'center', 
             width: contentWidth 
           });
  
  // ✅ SEGUNDA TARJETA (EN BLANCO) - PARTE INFERIOR
  const ySegunda = ySeparador + 25;
  await generarTarjeta(doc, prestamo, pagos, ySegunda, false, "TARJETA PARA RELLENAR");
}

// ✅ FUNCIÓN REUTILIZABLE PARA GENERAR UNA TARJETA
async function generarTarjeta(doc, prestamo, pagos, yInicial, conDatos, titulo) {
  const pageWidth = doc.page.width;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);

  // ✅ ENCABEZADO
  doc.fontSize(16)
     .fillColor('#2563eb')
     .font('Helvetica-Bold')
     .text('PRESTAMOS TU DIARIO', margin, yInicial, { 
       align: 'center',
       width: contentWidth
     });

  // Subtítulo
  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text(titulo, margin, yInicial + 18, { 
       align: 'center',
       width: contentWidth
     });

  // Línea separadora
  doc.strokeColor('#2563eb')
     .lineWidth(1.5)
     .moveTo(margin + 50, yInicial + 30)
     .lineTo(pageWidth - margin - 50, yInicial + 30)
     .stroke();

  // ✅ INFORMACIÓN DEL CLIENTE
  let yPos = yInicial + 45;
  
  // PRIMERA FILA
  doc.fontSize(8)
     .fillColor('#000')
     .font('Helvetica-Bold')
     .text('FECHA DE INGRESO:', margin, yPos)
     .text('NOMBRE:', margin + 280, yPos);

  yPos += 10;
  doc.fontSize(8)
     .font('Helvetica')
     .text(new Date(prestamo.fechaIngreso).toLocaleDateString('es-ES'), margin, yPos)
     .text(prestamo.cliente.nombre.toUpperCase(), margin + 280, yPos);

  yPos += 18;

  // SEGUNDA FILA
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .text('FECHA DE TÉRMINO:', margin, yPos)
     .text('DIRECCIÓN:', margin + 280, yPos);

  yPos += 10;
  doc.fontSize(8)
     .font('Helvetica')
     .text(new Date(prestamo.fechaTermino).toLocaleDateString('es-ES'), margin, yPos)
     .text(prestamo.cliente.direccion.toUpperCase(), margin + 280, yPos);

  yPos += 18;

  // TERCERA FILA
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .text('RENOVACIÓN APARTIR DEL PAGO:', margin, yPos)
     .text('TEL:', margin + 350, yPos);

  yPos += 10;
  doc.fontSize(8)
     .font('Helvetica')
     .text('11', margin, yPos)
     .text(prestamo.cliente.telefono, margin + 350, yPos);

  yPos += 18;

  // CUARTA FILA
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .text('CONTRATO:', margin, yPos)
     .text('MONTO:', margin + 150, yPos)
     .text('PLAZO:', margin + 270, yPos)
     .text('ABONO:', margin + 370, yPos);

  yPos += 10;
  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#d32f2f')
     .font('Helvetica-Bold')
     .text(prestamo.numeroContrato, margin, yPos)
     .fillColor('#000')
     .font('Helvetica')
     .text(`$ ${prestamo.monto.toLocaleString()}`, margin + 150, yPos)
     .text('12', margin + 270, yPos)
     .text(`$ ${prestamo.montoSemanal.toLocaleString()}`, margin + 370, yPos);

  yPos += 25;

  // ✅ GRID DE PAGOS (1-13)
  const inicioGrid = yPos;
  const anchoCelda = contentWidth / 13;
  const altoCelda = 30;

  // Dibujar grid principal
  doc.rect(margin, inicioGrid, contentWidth, altoCelda)
     .strokeColor('#000')
     .stroke();

  // Líneas verticales
  for (let i = 1; i < 13; i++) {
    const x = margin + (i * anchoCelda);
    doc.moveTo(x, inicioGrid)
       .lineTo(x, inicioGrid + altoCelda)
       .stroke();
  }

  // Llenar primera fila
  for (let i = 0; i < 13; i++) {
    const numero = i + 1;
    const x = margin + (i * anchoCelda);
    const pago = pagos.find(p => p.numeroPago === numero);

    // Colorear fondo si está pagado (solo en tarjeta completa)
    if (conDatos && numero <= 12 && pago && pago.pagado) {
      doc.rect(x + 1, inicioGrid + 1, anchoCelda - 2, altoCelda - 2)
         .fillAndStroke('#e8f5e8', '#000');
    }

    // Número del pago
    doc.fontSize(7)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(numero.toString(), x + 2, inicioGrid + 3, {
         width: anchoCelda - 4,
         align: 'center'
       });

    // ✅ MOSTRAR DATOS SOLO EN TARJETA COMPLETA
    if (conDatos && numero <= 12 && pago) {
      const fecha = new Date(pago.fechaVencimiento);
      const fechaTexto = `${fecha.getDate().toString().padStart(2, '0')}/${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
      
      doc.fontSize(6)
         .font('Helvetica')
         .text(fechaTexto, x + 2, inicioGrid + 13, {
           width: anchoCelda - 4,
           align: 'center'
         });

      doc.fontSize(6)
         .text(`$${pago.monto}`, x + 2, inicioGrid + 21, {
           width: anchoCelda - 4,
           align: 'center'
         });
    }
  }

  yPos = inicioGrid + altoCelda + 8;

  // ✅ GRID SEGUNDA FILA (14-26)
  doc.rect(margin, yPos, contentWidth, altoCelda)
     .strokeColor('#000')
     .stroke();

  // Líneas verticales para segunda fila
  for (let i = 1; i < 13; i++) {
    const x = margin + (i * anchoCelda);
    doc.moveTo(x, yPos)
       .lineTo(x, yPos + altoCelda)
       .stroke();
  }

  // Llenar segunda fila
  for (let i = 0; i < 13; i++) {
    const numero = i + 14;
    const x = margin + (i * anchoCelda);

    doc.fontSize(7)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(numero.toString(), x + 2, yPos + 10, {
         width: anchoCelda - 4,
         align: 'center'
       });
  }

  yPos += altoCelda + 12;

  // ✅ LABELS Y RESUMEN
  doc.fontSize(7)
     .font('Helvetica-Bold')
     .text('PAGOS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('FECHAS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('ABONO', margin, yPos);

  // ✅ RESUMEN (SOLO EN TARJETA COMPLETA)
  if (conDatos) {
    yPos += 20;
    
    const pagosPagados = pagos.filter(p => p.pagado).length;
    const totalAbonado = pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0);
    const progreso = Math.round((pagosPagados / 12) * 100);

    doc.fontSize(8)
       .fillColor('#2563eb')
       .font('Helvetica-Bold')
       .text('RESUMEN:', margin, yPos);

    yPos += 12;
    doc.fontSize(7)
       .fillColor('#000')
       .font('Helvetica')
       .text(`Pagos: ${pagosPagados}/12`, margin, yPos)
       .text(`Abonado: $${totalAbonado.toLocaleString()}`, margin + 120, yPos)
       .text(`Progreso: ${progreso}%`, margin + 250, yPos)
       .text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, margin + 350, yPos);
  } else {
    // En la tarjeta en blanco, solo mostrar información básica
    yPos += 20;
    doc.fontSize(7)
       .fillColor('#666666')
       .font('Helvetica')
       .text(`Contrato: ${prestamo.numeroContrato}`, margin, yPos)
       .text(`Cliente: ${prestamo.cliente.nombre}`, margin + 200, yPos)
       .text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, margin + 400, yPos);
  }
}

// Las demás funciones permanecen igual
export const getTarjetaPago = async (req, res) => {
  try {
    const { prestamoId } = req.params;

    const tarjeta = await TarjetaPago.findOne({ prestamo: prestamoId })
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          populate: {
            path: 'trabajadorAsignado',
            select: 'nombreCompleto telefono'
          }
        }
      });

    if (!tarjeta) {
      return res.status(404).json({ message: 'Tarjeta no encontrada' });
    }

    const pagos = await Pago.find({ prestamo: prestamoId })
      .sort({ numeroPago: 1 });

    res.json({
      tarjeta,
      pagos,
      estadisticas: {
        pagosPagados: pagos.filter(p => p.pagado).length,
        pagosParciales: pagos.filter(p => p.montoAbonado > 0 && !p.pagado).length,
        totalAbonado: pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0),
        saldoPendiente: pagos.reduce((sum, p) => sum + (p.saldoPendiente || 0), 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const marcarComoImpresa = async (req, res) => {
  try {
    const { tarjetaId } = req.params;
    const { observaciones } = req.body;

    const tarjeta = await TarjetaPago.findByIdAndUpdate(
      tarjetaId,
      {
        impresa: true,
        observaciones: observaciones || `Marcada como impresa el ${new Date().toLocaleDateString()}`
      },
      { new: true }
    );

    if (!tarjeta) {
      return res.status(404).json({ message: 'Tarjeta no encontrada' });
    }

    res.json({ message: 'Tarjeta marcada como impresa', tarjeta });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};