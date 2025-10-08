import PDFDocument from 'pdfkit';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import Cliente from '../models/Cliente.js';
import TarjetaPago from '../models/TarjetaPago.js';

export const generarTarjetaPagoPDF = async (req, res) => {
  try {
    const { prestamoId } = req.params;

    console.log(`📄 Generando tarjeta PDF para préstamo: ${prestamoId}`);
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

    console.log(`📋 Tipo de préstamo: ${prestamo.tipoPrestamo}`);

    
    const pagos = await Pago.find({ prestamo: prestamoId })
      .sort({ numeroPago: 1 });

    console.log(`💰 Pagos encontrados: ${pagos.length}`);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 30,
      info: {
        Title: `Tarjetas de Pagos - ${prestamo.numeroContrato}`,
        Author: 'Sistema de Préstamos',
        Subject: `Tarjetas de Control de Pagos ${prestamo.tipoPrestamo}`
      }
    });

    // Configurar headers para descarga
    const tipoArchivo = prestamo.tipoPrestamo === 'diario' ? 'diarias' : 'semanales';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="tarjetas-${tipoArchivo}-${prestamo.numeroContrato}.pdf"`);

    // Pipe del documento al response
    doc.pipe(res);

    // ✅ GENERAR TARJETAS SEGÚN EL TIPO
    if (prestamo.tipoPrestamo === 'diario') {
      console.log('📊 Generando tarjetas diarias...');
      await generarDosTarjetasDiarias(doc, prestamo, pagos);
    } else {
      console.log('📊 Generando tarjetas semanales...');
      await generarDosTarjetas(doc, prestamo, pagos);
    }

    console.log('✅ PDF generado exitosamente');

    // Finalizar el documento
    doc.end();

  } catch (error) {
    console.error('❌ Error al generar tarjeta PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: error.message });
    }
  }
};

// ✅ FUNCIÓN PARA PRÉSTAMOS DIARIOS (AMBAS CON UBICACIÓN)
async function generarDosTarjetasDiarias(doc, prestamo, pagos) {
  const pageWidth = doc.page.width;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);
  
  // PRIMERA TARJETA DIARIA
  let yInicial = 40;
  await generarTarjetaDiaria(doc, prestamo, pagos, yInicial, true, "TARJETA DIARIA COMPLETA");
  
  // LÍNEA SEPARADORA
  const ySeparador = yInicial + 380;
  doc.strokeColor('#cccccc')
     .lineWidth(1)
     .moveTo(margin, ySeparador)
     .lineTo(pageWidth - margin, ySeparador)
     .stroke();
  
  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text('- - - - - - - - - - - - - - - - - - - - - - CORTE AQUÍ - - - - - - - - - - - - - - - - - - - - - -', 
           margin, ySeparador + 5, { 
             align: 'center', 
             width: contentWidth 
           });
  
  // SEGUNDA TARJETA DIARIA (TAMBIÉN CON UBICACIÓN) ✅ Cambiado a true
  const ySegunda = ySeparador + 25;
  await generarTarjetaDiaria(doc, prestamo, pagos, ySegunda, true, "TARJETA DIARIA PARA RELLENAR");
}

/// ✅ FUNCIÓN ESPECÍFICA PARA TARJETAS DIARIAS (SOLO NÚMEROS, UBICACIÓN A LA DERECHA)
async function generarTarjetaDiaria(doc, prestamo, pagos, yInicial, conDatos, titulo) {
  const pageWidth = doc.page.width;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);

  // ENCABEZADO
  doc.fontSize(16)
     .fillColor('#16a34a')
     .font('Helvetica-Bold')
     .text('PRESTAMOS TU DIARIO', margin, yInicial, { 
       align: 'center',
       width: contentWidth
     });

  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text(titulo, margin, yInicial + 18, { 
       align: 'center',
       width: contentWidth
     });

  doc.strokeColor('#16a34a')
     .lineWidth(1.5)
     .moveTo(margin + 50, yInicial + 30)
     .lineTo(pageWidth - margin - 50, yInicial + 30)
     .stroke();

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
     .text('RENOVACIÓN A PARTIR DEL DÍA:', margin, yPos)
     .text('TEL:', margin + 350, yPos);

  yPos += 10;
  const diaRenovacion = prestamo.configuracionDiaria?.puedeRenovarEnDia || 19;
  doc.fontSize(8)
     .font('Helvetica')
     .text(diaRenovacion.toString(), margin, yPos)
     .text(prestamo.cliente.telefono, margin + 350, yPos);

  yPos += 18;

  // ✅ CUARTA FILA CON UBICACIÓN A LA DERECHA
  const yFilaContrato = yPos;

  // COLUMNA IZQUIERDA: Labels
  doc.fontSize(8)
     .font('Helvetica-Bold')
     .text('CONTRATO:', margin, yFilaContrato)
     .text('MONTO:', margin + 85, yFilaContrato)
     .text('DÍAS:', margin + 165, yFilaContrato)
     .text('DIARIO:', margin + 230, yFilaContrato);

  yPos += 10;

  // COLUMNA IZQUIERDA: Valores
  const montoDiario = prestamo.montoDiario || 0;
  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#d32f2f')
     .font('Helvetica-Bold')
     .text(prestamo.numeroContrato, margin, yPos)
     .fillColor('#000')
     .font('Helvetica')
     .text(`$ ${prestamo.monto.toLocaleString()}`, margin + 85, yPos)
     .text(prestamo.plazo.toString(), margin + 165, yPos)
     .text(`$ ${montoDiario.toFixed(2)}`, margin + 230, yPos);

  // ✅ COLUMNA DERECHA: UBICACIÓN
  const xUbicacion = margin + 305;
  const anchoUbicacion = pageWidth - margin - xUbicacion - 10;
  const alturaUbicacion = 22;

  doc.fontSize(7)
     .fillColor('#000')
     .font('Helvetica-Bold')
     .text('UBICACIÓN:', xUbicacion, yFilaContrato);

  doc.rect(xUbicacion, yFilaContrato + 9, anchoUbicacion, alturaUbicacion)
     .strokeColor('#16a34a')
     .lineWidth(0.8)
     .stroke();

  if (prestamo.cliente.ubicacion) {
    doc.fontSize(5)
       .fillColor('#15803d')
       .font('Helvetica')
       .text(prestamo.cliente.ubicacion, xUbicacion + 2, yFilaContrato + 14, {
         width: anchoUbicacion - 4,
         ellipsis: true,
         lineBreak: false
       });
  }

  yPos += 30;

  // ✅ GRID DE PAGOS DIARIOS - SOLO NÚMEROS
  const inicioGrid = yPos;
  const diasPorFila = 11;
  const anchoCelda = contentWidth / diasPorFila;
  const altoCelda = 25;

  // PRIMERA FILA (días 1-11)
  doc.rect(margin, inicioGrid, contentWidth, altoCelda)
     .strokeColor('#000')
     .stroke();

  for (let i = 1; i < diasPorFila; i++) {
    const x = margin + (i * anchoCelda);
    doc.moveTo(x, inicioGrid)
       .lineTo(x, inicioGrid + altoCelda)
       .stroke();
  }

  // ✅ SOLO NÚMEROS (sin fechas ni montos)
  for (let i = 0; i < diasPorFila; i++) {
    const numeroDia = i + 1;
    const x = margin + (i * anchoCelda);

    doc.fontSize(8)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(numeroDia.toString(), x + 2, inicioGrid + 8, {
         width: anchoCelda - 4,
         align: 'center'
       });
  }

  // SEGUNDA FILA (días 12-22)
  const ySegundaFila = inicioGrid + altoCelda + 2;
  doc.rect(margin, ySegundaFila, contentWidth, altoCelda)
     .strokeColor('#000')
     .stroke();

  for (let i = 1; i < diasPorFila; i++) {
    const x = margin + (i * anchoCelda);
    doc.moveTo(x, ySegundaFila)
       .lineTo(x, ySegundaFila + altoCelda)
       .stroke();
  }

  // ✅ SOLO NÚMEROS (días 12-22)
  for (let i = 0; i < diasPorFila; i++) {
    const numeroDia = i + 12;
    const x = margin + (i * anchoCelda);
    
    if (numeroDia <= 22) {
      doc.fontSize(8)
         .fillColor('#000')
         .font('Helvetica-Bold')
         .text(numeroDia.toString(), x + 2, ySegundaFila + 8, {
           width: anchoCelda - 4,
           align: 'center'
         });
    }
  }

  yPos = ySegundaFila + altoCelda + 12;

  // LABELS
  doc.fontSize(7)
     .font('Helvetica-Bold')
     .text('DÍAS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('FECHAS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('PAGO', margin, yPos);

  // RESUMEN (OPCIONAL)
  if (conDatos) {
    yPos += 20;
    
    const pagosPagados = pagos.filter(p => p.pagado).length;
    const totalAbonado = pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0);
    const progreso = Math.round((pagosPagados / 22) * 100);

    doc.fontSize(8)
       .fillColor('#16a34a')
       .font('Helvetica-Bold')
       .text('RESUMEN:', margin, yPos);

    yPos += 12;
    doc.fontSize(7)
       .fillColor('#000')
       .font('Helvetica')
       .text(`Días pagados: ${pagosPagados}/22`, margin, yPos)
       .text(`Abonado: $${totalAbonado.toLocaleString()}`, margin + 120, yPos)
       .text(`Progreso: ${progreso}%`, margin + 250, yPos)
       .text(`Generado: ${new Date().toLocaleDateString('es-ES')}`, margin + 350, yPos);
  }
}

// ✅ FUNCIÓN PARA PRÉSTAMOS SEMANALES (CORREGIDA)
async function generarDosTarjetas(doc, prestamo, pagos) {
  const pageWidth = doc.page.width;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);
  
  // PRIMERA TARJETA (COMPLETA)
  let yInicial = 40;
  await generarTarjeta(doc, prestamo, pagos, yInicial, true, "TARJETA COMPLETA");
  
  // LÍNEA SEPARADORA
  const ySeparador = yInicial + 320;
  doc.strokeColor('#cccccc')
     .lineWidth(1)
     .moveTo(margin, ySeparador)
     .lineTo(pageWidth - margin, ySeparador)
     .stroke();
  
  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text('- - - - - - - - - - - - - - - - - - - - - - CORTE AQUÍ - - - - - - - - - - - - - - - - - - - - - -', 
           margin, ySeparador + 5, { 
             align: 'center', 
             width: contentWidth 
           });
  
  // SEGUNDA TARJETA (TAMBIÉN CON UBICACIÓN) ✅ Cambiado de false a true
  const ySegunda = ySeparador + 25;
  await generarTarjeta(doc, prestamo, pagos, ySegunda, true, "TARJETA PARA RELLENAR");
}

// ✅ FUNCIÓN PARA TARJETA SEMANAL (SOLO NÚMEROS EN GRID)
async function generarTarjeta(doc, prestamo, pagos, yInicial, conDatos, titulo) {
  const pageWidth = doc.page.width;
  const margin = 30;
  const contentWidth = pageWidth - (margin * 2);

  // ENCABEZADO
  doc.fontSize(16)
     .fillColor('#2563eb')
     .font('Helvetica-Bold')
     .text('PRESTAMOS TU DIARIO', margin, yInicial, { 
       align: 'center',
       width: contentWidth
     });

  doc.fontSize(8)
     .fillColor('#666666')
     .font('Helvetica')
     .text(titulo, margin, yInicial + 18, { 
       align: 'center',
       width: contentWidth
     });

  doc.strokeColor('#2563eb')
     .lineWidth(1.5)
     .moveTo(margin + 50, yInicial + 30)
     .lineTo(pageWidth - margin - 50, yInicial + 30)
     .stroke();

  let yPos = yInicial + 45;
  
  // INFORMACIÓN DEL CLIENTE
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

  const yFilaContrato = yPos;

  // COLUMNA IZQUIERDA: Labels
  doc.fontSize(8)
     .fillColor('#000')
     .font('Helvetica-Bold')
     .text('CONTRATO:', margin, yFilaContrato)
     .text('MONTO:', margin + 90, yFilaContrato)
     .text('PLAZO:', margin + 180, yFilaContrato)
     .text('ABONO:', margin + 250, yFilaContrato);

  yPos += 10;

  // COLUMNA IZQUIERDA: Valores
  const montoSemanal = prestamo.montoSemanal || 0;
  doc.fontSize(8)
     .font('Helvetica')
     .fillColor('#d32f2f')
     .font('Helvetica-Bold')
     .text(prestamo.numeroContrato, margin, yPos)
     .fillColor('#000')
     .font('Helvetica')
     .text(`$ ${prestamo.monto.toLocaleString()}`, margin + 90, yPos)
     .text('12', margin + 180, yPos)
     .text(`$ ${montoSemanal.toFixed(2)}`, margin + 250, yPos);

  // ✅ COLUMNA DERECHA: UBICACIÓN
  const xUbicacion = margin + 330;
  const anchoUbicacion = pageWidth - margin - xUbicacion - 10;
  const alturaUbicacion = 22;

  doc.fontSize(7)
     .fillColor('#000')
     .font('Helvetica-Bold')
     .text('UBICACIÓN:', xUbicacion, yFilaContrato);

  doc.rect(xUbicacion, yFilaContrato + 9, anchoUbicacion, alturaUbicacion)
     .strokeColor('#2563eb')
     .lineWidth(0.8)
     .stroke();

  if (prestamo.cliente.ubicacion) {
    doc.fontSize(5)
       .fillColor('#1e40af')
       .font('Helvetica')
       .text(prestamo.cliente.ubicacion, xUbicacion + 2, yFilaContrato + 14, {
         width: anchoUbicacion - 4,
         ellipsis: true,
         lineBreak: false
       });
  }

  yPos += 30;

  // ✅ GRID DE PAGOS SEMANALES - SOLO NÚMEROS
  const inicioGrid = yPos;
  const anchoCelda = contentWidth / 13;
  const altoCelda = 30;

  // Primera fila (números 1-13)
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

  // ✅ SOLO NÚMEROS (sin fechas ni montos)
  for (let i = 0; i < 13; i++) {
    const numero = i + 1;
    const x = margin + (i * anchoCelda);

    doc.fontSize(9)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(numero.toString(), x + 2, inicioGrid + 10, {
         width: anchoCelda - 4,
         align: 'center'
       });
  }

  // Segunda fila (números 14-26)
  yPos = inicioGrid + altoCelda + 8;

  doc.rect(margin, yPos, contentWidth, altoCelda)
     .strokeColor('#000')
     .stroke();

  // Líneas verticales
  for (let i = 1; i < 13; i++) {
    const x = margin + (i * anchoCelda);
    doc.moveTo(x, yPos)
       .lineTo(x, yPos + altoCelda)
       .stroke();
  }

  // ✅ SOLO NÚMEROS (sin datos)
  for (let i = 0; i < 13; i++) {
    const numero = i + 14;
    const x = margin + (i * anchoCelda);

    doc.fontSize(9)
       .fillColor('#000')
       .font('Helvetica-Bold')
       .text(numero.toString(), x + 2, yPos + 10, {
         width: anchoCelda - 4,
         align: 'center'
       });
  }

  yPos += altoCelda + 12;

  // Labels
  doc.fontSize(7)
     .font('Helvetica-Bold')
     .text('PAGOS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('FECHAS', margin, yPos);

  yPos += 8;
  doc.fontSize(7)
     .text('ABONO', margin, yPos);

  // Resumen (solo en primera tarjeta si quieres)
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
  }
}
// Funciones existentes
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