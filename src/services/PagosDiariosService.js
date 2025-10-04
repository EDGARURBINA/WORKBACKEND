import Pago from '../models/Pago.js';
import Prestamo from '../models/Prestamo.js';
import Cliente from '../models/Cliente.js';
import TarjetaPago from '../models/TarjetaPago.js';

class PagosDiariosService {
  
  // Obtener ruta de cobranza diaria por trabajador
  static async obtenerRutaCobranza(trabajadorId, fecha = new Date()) {
    try {
      const fechaBusqueda = new Date(fecha);
      fechaBusqueda.setHours(0, 0, 0, 0);
      
      const finDia = new Date(fechaBusqueda);
      finDia.setHours(23, 59, 59, 999);

      // Buscar todos los pagos diarios del día para clientes del trabajador
      const pagos = await Pago.find({
        tipoPago: 'diario',
        fechaVencimiento: {
          $gte: fechaBusqueda,
          $lte: finDia
        }
      })
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          match: { trabajadorAsignado: trabajadorId },
          populate: {
            path: 'trabajadorAsignado',
            select: 'nombreCompleto telefono'
          }
        }
      })
      .sort({ numeroPago: 1 });

      // Filtrar pagos que tienen cliente asignado al trabajador
      const pagosFiltrados = pagos.filter(pago => 
        pago.prestamo && pago.prestamo.cliente
      );

      // Organizar por estado y prioridad
      const ruta = {
        fecha: fechaBusqueda,
        trabajador: pagosFiltrados[0]?.prestamo?.cliente?.trabajadorAsignado,
        resumen: {
          totalClientes: new Set(pagosFiltrados.map(p => p.prestamo.cliente._id.toString())).size,
          totalPagos: pagosFiltrados.length,
          montoEsperado: pagosFiltrados.reduce((sum, p) => sum + p.monto, 0),
          montoRecaudado: pagosFiltrados.reduce((sum, p) => sum + (p.montoAbonado || 0), 0)
        },
        pagos: {
          prioritarios: pagosFiltrados.filter(p => 
            !p.pagado && p.fechaVencimiento < fechaBusqueda // Vencidos
          ),
          delDia: pagosFiltrados.filter(p => 
            !p.pagado && p.fechaVencimiento.toDateString() === fechaBusqueda.toDateString()
          ),
          parciales: pagosFiltrados.filter(p => p.estadoPago === 'parcial'),
          completados: pagosFiltrados.filter(p => p.pagado),
          proximosVencer: [] // Se puede implementar para días siguientes
        }
      };

      return ruta;
    } catch (error) {
      throw new Error(`Error al obtener ruta de cobranza: ${error.message}`);
    }
  }

  // Procesar pago diario
  static async procesarPagoDiario(pagoId, montoPagado, trabajadorId, observaciones = '') {
    try {
      const pago = await Pago.findById(pagoId)
        .populate('prestamo')
        .populate('prestamo.cliente');

      if (!pago) {
        throw new Error('Pago no encontrado');
      }

      if (pago.tipoPago !== 'diario') {
        throw new Error('Este método es solo para pagos diarios');
      }

      // Validar monto
      if (montoPagado <= 0) {
        throw new Error('El monto debe ser mayor a cero');
      }

      if (montoPagado > pago.saldoPendiente) {
        throw new Error('El monto excede el saldo pendiente');
      }

      // Registrar el abono
      await pago.registrarAbono(montoPagado, trabajadorId, observaciones);

      // Actualizar trabajador de cobro
      pago.trabajadorCobro = trabajadorId;
      await pago.save();

      // Sincronizar tarjeta de pago
      const tarjeta = await TarjetaPago.findOne({ prestamo: pago.prestamo._id });
      if (tarjeta) {
        const todosPagos = await Pago.find({ prestamo: pago.prestamo._id });
        await tarjeta.sincronizarConPagos(todosPagos);
      }

      // Verificar si el préstamo puede renovar
      const puedeRenovar = await pago.prestamo.puedeRenovarPrestamo();
      if (puedeRenovar && !pago.prestamo.puedeRenovar) {
        await Prestamo.findByIdAndUpdate(pago.prestamo._id, { puedeRenovar: true });
      }

      return {
        success: true,
        pago: await Pago.findById(pagoId).populate('prestamo').populate('trabajadorCobro'),
        puedeRenovar
      };
    } catch (error) {
      throw new Error(`Error al procesar pago diario: ${error.message}`);
    }
  }

  // Obtener resumen de cobranza del día
  static async obtenerResumenDiario(fecha = new Date(), trabajadorId = null) {
    try {
      const fechaBusqueda = new Date(fecha);
      fechaBusqueda.setHours(0, 0, 0, 0);
      
      const finDia = new Date(fechaBusqueda);
      finDia.setHours(23, 59, 59, 999);

      let filtro = {
        tipoPago: 'diario',
        fechaVencimiento: {
          $gte: fechaBusqueda,
          $lte: finDia
        }
      };

      // Si hay trabajador específico, filtrar por él
      if (trabajadorId) {
        filtro.trabajadorCobro = trabajadorId;
      }

      const pagos = await Pago.find(filtro)
        .populate('prestamo')
        .populate('trabajadorCobro', 'nombreCompleto');

      const resumen = {
        fecha: fechaBusqueda,
        totalPagos: pagos.length,
        pagosPendientes: pagos.filter(p => !p.pagado && p.estadoPago !== 'parcial').length,
        pagosCompletos: pagos.filter(p => p.pagado).length,
        pagosParciales: pagos.filter(p => p.estadoPago === 'parcial').length,
        montoEsperado: pagos.reduce((sum, p) => sum + p.monto, 0),
        montoRecaudado: pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0),
        eficienciaCobranza: 0,
        prestamosQuePuedenRenovar: 0
      };

      resumen.eficienciaCobranza = resumen.montoEsperado > 0 ? 
        (resumen.montoRecaudado / resumen.montoEsperado) * 100 : 0;

      // Contar préstamos que pueden renovar
      const prestamosUnicos = [...new Set(pagos.map(p => p.prestamo._id.toString()))];
      for (const prestamoId of prestamosUnicos) {
        const prestamo = await Prestamo.findById(prestamoId);
        if (prestamo && await prestamo.puedeRenovarPrestamo()) {
          resumen.prestamosQuePuedenRenovar++;
        }
      }

      return resumen;
    } catch (error) {
      throw new Error(`Error al obtener resumen diario: ${error.message}`);
    }
  }

  // Obtener calendario de pagos diarios
  static async obtenerCalendarioPagos(mes, año, clienteId = null) {
    try {
      const inicioMes = new Date(año, mes - 1, 1);
      const finMes = new Date(año, mes, 0);
      finMes.setHours(23, 59, 59, 999);

      let filtro = {
        tipoPago: 'diario',
        fechaVencimiento: {
          $gte: inicioMes,
          $lte: finMes
        }
      };

      if (clienteId) {
        const prestamos = await Prestamo.find({ cliente: clienteId });
        filtro.prestamo = { $in: prestamos.map(p => p._id) };
      }

      const pagos = await Pago.find(filtro)
        .populate('prestamo')
        .populate('prestamo.cliente', 'nombre telefono')
        .sort({ fechaVencimiento: 1 });

      // Agrupar por día
      const calendario = {};
      pagos.forEach(pago => {
        const fecha = pago.fechaVencimiento.toISOString().split('T')[0];
        if (!calendario[fecha]) {
          calendario[fecha] = {
            fecha: pago.fechaVencimiento,
            pagos: [],
            resumen: {
              total: 0,
              pendientes: 0,
              completos: 0,
              parciales: 0,
              montoEsperado: 0,
              montoRecaudado: 0
            }
          };
        }
        
        calendario[fecha].pagos.push(pago);
        calendario[fecha].resumen.total++;
        calendario[fecha].resumen.montoEsperado += pago.monto;
        calendario[fecha].resumen.montoRecaudado += pago.montoAbonado || 0;
        
        if (pago.pagado) {
          calendario[fecha].resumen.completos++;
        } else if (pago.estadoPago === 'parcial') {
          calendario[fecha].resumen.parciales++;
        } else {
          calendario[fecha].resumen.pendientes++;
        }
      });

      return {
        mes,
        año,
        calendario,
        resumenMensual: {
          diasConPagos: Object.keys(calendario).length,
          totalPagos: pagos.length,
          montoTotalEsperado: pagos.reduce((sum, p) => sum + p.monto, 0),
          montoTotalRecaudado: pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0)
        }
      };
    } catch (error) {
      throw new Error(`Error al obtener calendario: ${error.message}`);
    }
  }

  // Método auxiliar para obtener próximo vencimiento
  static async obtenerProximoVencimiento(prestamoId) {
    const proximoPago = await Pago.findOne({
      prestamo: prestamoId,
      pagado: false,
      fechaVencimiento: { $gte: new Date() }
    }).sort({ fechaVencimiento: 1 });

    return proximoPago ? proximoPago.fechaVencimiento : null;
  }
}

export default PagosDiariosService;