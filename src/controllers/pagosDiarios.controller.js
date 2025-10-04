import Pago from '../models/Pago.js';
import Prestamo from '../models/Prestamo.js';
import TarjetaPago from '../models/TarjetaPago.js';
import PagosDiariosService from "../services/PagosDiariosService.js"

// Obtener ruta de cobranza diaria por trabajador
export const obtenerRutaCobranza = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fecha } = req.query;
    
    console.log(`🚚 Obteniendo ruta de cobranza para trabajador: ${trabajadorId}`);
    
    const ruta = await PagosDiariosService.obtenerRutaCobranza(
      trabajadorId, 
      fecha ? new Date(fecha) : new Date()
    );
    
    console.log(`✅ Ruta generada con ${ruta.resumen.totalPagos} pagos`);
    
    res.json(ruta);
  } catch (error) {
    console.error('❌ Error al obtener ruta de cobranza:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Procesar pago diario
export const procesarPagoDiario = async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { montoPagado, trabajadorId, observaciones } = req.body;
    
    console.log(`💰 Procesando pago diario: ${pagoId}, monto: ${montoPagado}`);
    
    // Validaciones
    if (!montoPagado || montoPagado <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Monto inválido - debe ser mayor a cero' 
      });
    }
    
    if (!trabajadorId) {
      return res.status(400).json({ 
        success: false,
        message: 'ID del trabajador es requerido' 
      });
    }
    
    const resultado = await PagosDiariosService.procesarPagoDiario(
      pagoId,
      montoPagado,
      trabajadorId,
      observaciones || ''
    );
    
    console.log(`✅ Pago procesado exitosamente`);
    
    res.json({
      success: true,
      message: 'Pago procesado correctamente',
      data: resultado
    });
  } catch (error) {
    console.error('❌ Error al procesar pago diario:', error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Obtener resumen diario de cobranza
export const obtenerResumenDiario = async (req, res) => {
  try {
    const { fecha, trabajadorId } = req.query;
    
    console.log(`📊 Obteniendo resumen diario para fecha: ${fecha || 'hoy'}`);
    
    const resumen = await PagosDiariosService.obtenerResumenDiario(
      fecha ? new Date(fecha) : new Date(),
      trabajadorId
    );
    
    console.log(`✅ Resumen generado: ${resumen.totalPagos} pagos`);
    
    res.json({
      success: true,
      data: resumen
    });
  } catch (error) {
    console.error('❌ Error al obtener resumen diario:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Obtener pagos del día
export const obtenerPagosDelDia = async (req, res) => {
  try {
    const { fecha, trabajadorId } = req.query;
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();
    
    console.log(`📅 Obteniendo pagos diarios para: ${fechaBusqueda.toDateString()}`);
    
    // Establecer rango del día
    const inicioDia = new Date(fechaBusqueda);
    inicioDia.setHours(0, 0, 0, 0);
    
    const finDia = new Date(fechaBusqueda);
    finDia.setHours(23, 59, 59, 999);
    
    // Filtro base
    let filtro = {
      tipoPago: 'diario',
      fechaVencimiento: {
        $gte: inicioDia,
        $lte: finDia
      }
    };
    
    const pagos = await Pago.find(filtro)
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          populate: {
            path: 'trabajadorAsignado',
            select: 'nombreCompleto telefono'
          }
        }
      })
      .populate('trabajadorCobro', 'nombreCompleto')
      .sort({ numeroPago: 1 });
    
    // Filtrar por trabajador si se especifica
    let pagosFiltrados = pagos;
    if (trabajadorId) {
      pagosFiltrados = pagos.filter(pago => 
        pago.prestamo?.cliente?.trabajadorAsignado && 
        pago.prestamo.cliente.trabajadorAsignado._id.toString() === trabajadorId
      );
    }
    
    // Organizar por estado
    const pagosOrganizados = {
      pendientes: pagosFiltrados.filter(p => !p.pagado && p.fechaVencimiento <= fechaBusqueda),
      parciales: pagosFiltrados.filter(p => p.estadoPago === 'parcial'),
      completos: pagosFiltrados.filter(p => p.pagado),
      vencidos: pagosFiltrados.filter(p => !p.pagado && p.fechaVencimiento < fechaBusqueda)
    };
    
    const resumen = {
      fecha: fechaBusqueda,
      totalPagos: pagosFiltrados.length,
      pendientes: pagosOrganizados.pendientes.length,
      completos: pagosOrganizados.completos.length,
      parciales: pagosOrganizados.parciales.length,
      vencidos: pagosOrganizados.vencidos.length,
      montoEsperado: pagosFiltrados.reduce((sum, p) => sum + p.monto, 0),
      montoRecaudado: pagosFiltrados.reduce((sum, p) => sum + (p.montoAbonado || 0), 0)
    };
    
    console.log(`✅ Encontrados ${pagosFiltrados.length} pagos del día`);
    
    res.json({
      success: true,
      data: {
        resumen,
        pagos: pagosOrganizados
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener pagos del día:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Obtener calendario de pagos diarios
export const obtenerCalendario = async (req, res) => {
  try {
    const { mes, año } = req.params;
    const { clienteId } = req.query;
    
    console.log(`📅 Obteniendo calendario para: ${mes}/${año}`);
    
    const calendario = await PagosDiariosService.obtenerCalendarioPagos(
      parseInt(mes),
      parseInt(año),
      clienteId
    );
    
    console.log(`✅ Calendario generado con ${calendario.resumenMensual.diasConPagos} días con pagos`);
    
    res.json({
      success: true,
      data: calendario
    });
  } catch (error) {
    console.error('❌ Error al obtener calendario:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Obtener pagos vencidos
export const obtenerPagosVencidos = async (req, res) => {
  try {
    const { trabajadorId } = req.query;
    
    console.log(`⚠️ Obteniendo pagos vencidos diarios`);
    
    let filtro = {
      tipoPago: 'diario',
      pagado: false,
      fechaVencimiento: { $lt: new Date() }
    };
    
    const pagosVencidos = await Pago.find(filtro)
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          populate: {
            path: 'trabajadorAsignado',
            select: 'nombreCompleto telefono'
          }
        }
      })
      .sort({ fechaVencimiento: 1 });
    
    // Filtrar por trabajador si se especifica
    let pagosFiltrados = pagosVencidos;
    if (trabajadorId) {
      pagosFiltrados = pagosVencidos.filter(pago => 
        pago.prestamo?.cliente?.trabajadorAsignado && 
        pago.prestamo.cliente.trabajadorAsignado._id.toString() === trabajadorId
      );
    }
    
    // Calcular estadísticas
    const resumen = {
      totalVencidos: pagosFiltrados.length,
      montoTotalVencido: pagosFiltrados.reduce((sum, p) => sum + (p.saldoPendiente || p.monto), 0),
      clientesEnMora: new Set(pagosFiltrados.map(p => p.prestamo.cliente._id.toString())).size,
      diasPromedioAtraso: pagosFiltrados.length > 0 ? 
        pagosFiltrados.reduce((sum, p) => {
          const dias = Math.floor((new Date() - new Date(p.fechaVencimiento)) / (1000 * 60 * 60 * 24));
          return sum + dias;
        }, 0) / pagosFiltrados.length : 0
    };
    
    console.log(`✅ Encontrados ${pagosFiltrados.length} pagos vencidos`);
    
    res.json({
      success: true,
      data: {
        resumen,
        pagosVencidos: pagosFiltrados
      }
    });
  } catch (error) {
    console.error('❌ Error al obtener pagos vencidos:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Registrar abono parcial en pago diario
export const registrarAbonoParcial = async (req, res) => {
  try {
    const { pagoId } = req.params;
    const { monto, trabajadorId, observaciones, tipoAbono = 'efectivo' } = req.body;
    
    console.log(`💵 Registrando abono parcial: ${pagoId}, monto: ${monto}`);
    
    // Validaciones
    if (!monto || monto <= 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Monto de abono inválido' 
      });
    }
    
    if (!trabajadorId) {
      return res.status(400).json({ 
        success: false,
        message: 'ID del trabajador es requerido' 
      });
    }
    
    const pago = await Pago.findById(pagoId)
      .populate('prestamo')
      .populate('prestamo.cliente');
    
    if (!pago) {
      return res.status(404).json({ 
        success: false,
        message: 'Pago no encontrado' 
      });
    }
    
    if (pago.tipoPago !== 'diario') {
      return res.status(400).json({ 
        success: false,
        message: 'Este endpoint es solo para pagos diarios' 
      });
    }
    
    if (monto > pago.saldoPendiente) {
      return res.status(400).json({ 
        success: false,
        message: `El monto excede el saldo pendiente ($${pago.saldoPendiente})` 
      });
    }
    
    // Registrar el abono
    await pago.registrarAbono(monto, trabajadorId, observaciones, tipoAbono);
    
    // Actualizar trabajador de cobro si no estaba asignado
    if (!pago.trabajadorCobro) {
      pago.trabajadorCobro = trabajadorId;
      await pago.save();
    }
    
    // Recargar el pago con datos actualizados
    const pagoActualizado = await Pago.findById(pagoId)
      .populate('prestamo')
      .populate('trabajadorCobro', 'nombreCompleto')
      .populate('historialAbonos.trabajador', 'nombreCompleto');
    
    console.log(`✅ Abono registrado - Estado: ${pagoActualizado.estadoPago}`);
    
    res.json({
      success: true,
      message: 'Abono registrado correctamente',
      data: {
        pago: pagoActualizado,
        nuevoSaldo: pagoActualizado.saldoPendiente,
        estadoPago: pagoActualizado.estadoPago,
        pagado: pagoActualizado.pagado
      }
    });
  } catch (error) {
    console.error('❌ Error al registrar abono parcial:', error);
    res.status(400).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Obtener historial de abonos de un pago diario
export const obtenerHistorialAbonos = async (req, res) => {
  try {
    const { pagoId } = req.params;
    
    console.log(`📋 Obteniendo historial de abonos para pago: ${pagoId}`);
    
    const pago = await Pago.findById(pagoId)
      .populate('prestamo', 'numeroContrato monto')
      .populate('prestamo.cliente', 'nombre telefono')
      .populate('historialAbonos.trabajador', 'nombreCompleto telefono')
      .populate('trabajadorCobro', 'nombreCompleto');
    
    if (!pago) {
      return res.status(404).json({ 
        success: false,
        message: 'Pago no encontrado' 
      });
    }
    
    if (pago.tipoPago !== 'diario') {
      return res.status(400).json({ 
        success: false,
        message: 'Este endpoint es solo para pagos diarios' 
      });
    }
    
    const historial = {
      pago: {
        _id: pago._id,
        numeroPago: pago.numeroPago,
        monto: pago.monto,
        montoAbonado: pago.montoAbonado,
        saldoPendiente: pago.saldoPendiente,
        estadoPago: pago.estadoPago,
        fechaVencimiento: pago.fechaVencimiento,
        prestamo: pago.prestamo
      },
      totalAbonos: pago.historialAbonos.length,
      montoTotalAbonado: pago.montoAbonado,
      historialAbonos: pago.historialAbonos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    };
    
    console.log(`✅ Historial obtenido - ${pago.historialAbonos.length} abonos`);
    
    res.json({
      success: true,
      data: historial
    });
  } catch (error) {
    console.error('❌ Error al obtener historial de abonos:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};

// Generar reporte de productividad diaria por trabajador
export const generarReporteProductividad = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    
    const inicio = fechaInicio ? new Date(fechaInicio) : new Date(new Date().setDate(new Date().getDate() - 7));
    const fin = fechaFin ? new Date(fechaFin) : new Date();
    
    inicio.setHours(0, 0, 0, 0);
    fin.setHours(23, 59, 59, 999);
    
    console.log(`📊 Generando reporte de productividad para trabajador: ${trabajadorId}`);
    
    const pagos = await Pago.find({
      tipoPago: 'diario',
      trabajadorCobro: trabajadorId,
      fechaPago: { $gte: inicio, $lte: fin }
    })
    .populate('prestamo')
    .populate('prestamo.cliente', 'nombre telefono')
    .sort({ fechaPago: -1 });
    
    // Agrupar por día
    const reportePorDias = {};
    pagos.forEach(pago => {
      const fecha = pago.fechaPago.toISOString().split('T')[0];
      if (!reportePorDias[fecha]) {
        reportePorDias[fecha] = {
          fecha: pago.fechaPago,
          pagosCompletos: 0,
          pagosParciales: 0,
          montoRecaudado: 0,
          clientesAtendidos: new Set()
        };
      }
      
      if (pago.pagado) {
        reportePorDias[fecha].pagosCompletos++;
      } else {
        reportePorDias[fecha].pagosParciales++;
      }
      
      reportePorDias[fecha].montoRecaudado += pago.montoAbonado || 0;
      reportePorDias[fecha].clientesAtendidos.add(pago.prestamo.cliente._id.toString());
    });
    
    // Convertir Set a número
    Object.keys(reportePorDias).forEach(fecha => {
      reportePorDias[fecha].clientesAtendidos = reportePorDias[fecha].clientesAtendidos.size;
    });
    
    const resumen = {
      periodo: { inicio, fin },
      totalDiasTrabajados: Object.keys(reportePorDias).length,
      totalPagosCompletos: pagos.filter(p => p.pagado).length,
      totalPagosParciales: pagos.filter(p => !p.pagado && p.montoAbonado > 0).length,
      montoTotalRecaudado: pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0),
      promediosDiarios: {
        pagos: pagos.length / Math.max(Object.keys(reportePorDias).length, 1),
        recaudacion: pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0) / Math.max(Object.keys(reportePorDias).length, 1)
      }
    };
    
    console.log(`✅ Reporte generado - ${pagos.length} pagos en ${Object.keys(reportePorDias).length} días`);
    
    res.json({
      success: true,
      data: {
        resumen,
        reportePorDias
      }
    });
  } catch (error) {
    console.error('❌ Error al generar reporte de productividad:', error);
    res.status(500).json({ 
      success: false,
      message: error.message 
    });
  }
};