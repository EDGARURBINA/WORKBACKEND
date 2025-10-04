import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import Cliente from '../models/Cliente.js';
import TarjetaPago from '../models/TarjetaPago.js';
import AsignacionDinero from '../models/AsignacionDinero.js';
import Caja from '../models/Caja.js';

// Obtener todos los préstamos con progreso real
export const getPrestamosConProgreso = async (req, res) => {
  try {
    const { tipoPrestamo } = req.query;
    
    const filtro = tipoPrestamo ? { tipoPrestamo } : {};
    
    const prestamos = await Prestamo.find(filtro)
      .populate('cliente', 'nombre telefono status')
      .sort({ createdAt: -1 });

    const prestamosConProgreso = await Promise.all(
      prestamos.map(async (prestamo) => {
        const pagosPagados = await Pago.countDocuments({
          prestamo: prestamo._id,
          pagado: true
        });

        const totalPagos = await Pago.countDocuments({
          prestamo: prestamo._id
        });

        const progreso = totalPagos > 0 ? (pagosPagados / totalPagos) * 100 : 0;

        return {
          ...prestamo.toObject(),
          pagosPagados,
          totalPagos,
          progreso: Math.round(progreso * 100) / 100,
          tipoInfo: prestamo.tipoInfo
        };
      })
    );

    res.json(prestamosConProgreso);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener todos los préstamos
export const getPrestamos = async (req, res) => {
  try {
    const prestamos = await Prestamo.find()
      .populate('cliente', 'nombre telefono status')
      .sort({ createdAt: -1 });

    res.json(prestamos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============ MEJORAS EN PRESTAMO CONTROLLER ============

export const createPrestamo = async (req, res) => {
  try {
    const { 
      clienteId, 
      monto, 
      tipoPrestamo = 'semanal',
      plazo,
      configuracionDiaria,
      trabajadorId // AHORA OBLIGATORIO
    } = req.body;

    // ✅ HACER TRABAJADOR OBLIGATORIO
    if (!trabajadorId) {
      return res.status(400).json({ 
        message: 'El trabajadorId es obligatorio. Todos los préstamos deben asignarse a un trabajador con caja activa.' 
      });
    }

    console.log('📝 Creando préstamo con trabajador:', trabajadorId);

    // Verificar que el cliente existe
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // ✅ VALIDACIÓN OBLIGATORIA DE CAJA
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);

    // Buscar asignación activa del trabajador
    const asignacionActiva = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: hoy, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] }
    }).populate('caja');

    if (!asignacionActiva) {
      return res.status(400).json({ 
        message: 'El trabajador no tiene una asignación de caja activa para hoy. Debe asignársele dinero primero.',
        accion: 'Ir a Caja → Asignar Dinero al Trabajador'
      });
    }

    // Verificar fondos disponibles
    const disponible = asignacionActiva.montoAsignado - asignacionActiva.montoUtilizado;
    
    if (parseFloat(monto) > disponible) {
      return res.status(400).json({ 
        message: `Fondos insuficientes en la asignación de caja`,
        detalles: {
          disponible: disponible.toFixed(2),
          solicitado: parseFloat(monto).toFixed(2),
          faltante: (parseFloat(monto) - disponible).toFixed(2)
        }
      });
    }

    // Validaciones según tipo de préstamo
    if (tipoPrestamo === 'diario') {
      if (!plazo || plazo < 20 || plazo > 24) {
        return res.status(400).json({ 
          message: 'Para préstamos diarios el plazo debe ser entre 20 y 24 días' 
        });
      }
    } else if (tipoPrestamo === 'semanal') {
      if (plazo && plazo < 1) {
        return res.status(400).json({ 
          message: 'Para préstamos semanales el plazo debe ser mínimo 1 semana' 
        });
      }
    }

    // Calcular fechas
    const fechaIngreso = new Date();
    let fechaTermino = new Date(fechaIngreso);
    
    if (tipoPrestamo === 'diario') {
      fechaTermino.setDate(fechaTermino.getDate() + plazo);
    } else {
      const plazoFinal = plazo || 12;
      fechaTermino.setDate(fechaTermino.getDate() + (plazoFinal * 7));
    }

    // Crear configuración del préstamo
    const configuracionPrestamo = {
      cliente: clienteId,
      monto,
      tipoPrestamo,
      plazo: plazo || (tipoPrestamo === 'semanal' ? 12 : 22),
      fechaIngreso,
      fechaTermino,
      status: 'activo',
     
      origenFondos: 'caja',
      asignacionCaja: asignacionActiva._id,
      trabajadorAsignado: trabajadorId // NUEVO: Guardar quién lo creó
    };

    if (tipoPrestamo === 'diario' && configuracionDiaria) {
      configuracionPrestamo.configuracionDiaria = {
        plazoDias: plazo,
        puedeRenovarEnDia: configuracionDiaria.puedeRenovarEnDia || 19,
        porcentajeInteres: configuracionDiaria.porcentajeInteres || 20
      };
    }

    // Crear préstamo
    const prestamo = new Prestamo(configuracionPrestamo);
    
    // Calcular monto por período
    const montoPorPeriodo = prestamo.calcularMontoPeriodo();
    
    if (tipoPrestamo === 'semanal') {
      prestamo.montoSemanal = montoPorPeriodo;
    } else {
      prestamo.montoDiario = montoPorPeriodo;
    }

    await prestamo.save();

    try {
     
      await asignacionActiva.registrarPrestamo(
        prestamo._id,
        parseFloat(monto),
        tipoPrestamo
      );

      
      const caja = await Caja.findById(asignacionActiva.caja._id);
      if (caja) {
        await caja.registrarPrestamo(
          parseFloat(monto),
          `Préstamo ${tipoPrestamo} #${prestamo.numeroContrato}`,
          trabajadorId,
          req.user?.id
        );
      }

      console.log(`✅ Préstamo registrado en caja. Disponible restante: $${(disponible - parseFloat(monto)).toFixed(2)}`);
    } catch (error) {
      console.error('❌ Error al registrar en caja:', error);
      throw new Error('Error al procesar el préstamo en la caja');
    }

  
    const pagos = [];

    for (let i = 1; i <= prestamo.plazo; i++) {
      const fechaVencimiento = new Date(fechaIngreso);
      
      if (tipoPrestamo === 'semanal') {
        fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * 7));
      } else {
        fechaVencimiento.setDate(fechaVencimiento.getDate() + i);
      }

      const pago = new Pago({
        prestamo: prestamo._id,
        numeroPago: i,
        monto: montoPorPeriodo,
        fechaVencimiento,
        tipoPago: tipoPrestamo
      });

      pagos.push(pago);
    }

    await Pago.insertMany(pagos);

    // Crear tarjeta de pago
    const tarjetaPago = new TarjetaPago({
      prestamo: prestamo._id,
      tipoTarjeta: tipoPrestamo,
      configuracion: {
        tipoPrestamo,
        mostrarTelefono: true,
        mostrarDireccion: true,
        incluirQR: tipoPrestamo === 'diario',
        colorTema: tipoPrestamo === 'semanal' ? '#2563eb' : '#16a34a'
      }
    });

    await tarjetaPago.sincronizarConPagos(pagos);

    const prestamoCompleto = await Prestamo.findById(prestamo._id)
      .populate('cliente');

    res.status(201).json({
      prestamo: prestamoCompleto,
      pagosCreados: pagos.length,
      tarjetaCreada: true,
      tipoInfo: prestamo.tipoInfo,
      caja: {
        usoCaja: true,
        montoUtilizado: parseFloat(monto),
        disponibleRestante: disponible - parseFloat(monto),
        asignacionId: asignacionActiva._id
      }
    });

  } catch (error) {
    console.error('❌ Error al crear préstamo:', error);
    res.status(500).json({ 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
};
// Renovar préstamo (sin cambios)
export const renovarPrestamo = async (req, res) => {
  try {
    const prestamoId = req.params.id;
    const { nuevoMonto, nuevoPlazo, trabajadorId } = req.body; // Agregar trabajadorId si quieres usar caja

    const prestamoAnterior = await Prestamo.findById(prestamoId)
      .populate('cliente');

    if (!prestamoAnterior) {
      return res.status(404).json({ message: 'Préstamo no encontrado' });
    }

    const puedeRenovar = await prestamoAnterior.puedeRenovarPrestamo();
    
    if (!puedeRenovar) {
      const tipoMensaje = prestamoAnterior.tipoPrestamo === 'semanal' 
        ? `debe haber pagado al menos ${prestamoAnterior.pagoMinimoRenovacion} semanas`
        : `debe haber pagado al menos ${prestamoAnterior.configuracionDiaria.puedeRenovarEnDia} días`;
      
      return res.status(400).json({ 
        message: `El préstamo no puede ser renovado aún, ${tipoMensaje}` 
      });
    }

    await Prestamo.findByIdAndUpdate(prestamoId, { status: 'renovado' });

    const nuevaLineaCredito = prestamoAnterior.cliente.lineaCredito + prestamoAnterior.incrementoLineaCredito;
    const montoMaximo = Math.min(nuevoMonto || prestamoAnterior.monto, nuevaLineaCredito);

    const nuevoPrestamo = {
      clienteId: prestamoAnterior.cliente._id,
      monto: montoMaximo,
      tipoPrestamo: prestamoAnterior.tipoPrestamo,
      plazo: nuevoPlazo || prestamoAnterior.plazo,
      trabajadorId: trabajadorId // Pasar trabajadorId si quieres usar caja
    };

    if (prestamoAnterior.tipoPrestamo === 'diario') {
      nuevoPrestamo.configuracionDiaria = prestamoAnterior.configuracionDiaria;
    }

    req.body = nuevoPrestamo;
    return await createPrestamo(req, res);

  } catch (error) {
    console.error('❌ Error al renovar préstamo:', error);
    res.status(400).json({ message: error.message });
  }
};

// Los demás métodos quedan sin cambios...
export const getPagosDelDia = async (req, res) => {
  // Tu código existente sin cambios
  try {
    const { fecha, trabajadorId } = req.query;
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();

    const pagosDelDia = await Pago.obtenerPagosDelDia(fechaBusqueda, 'diario');

    let pagosFiltrados = pagosDelDia;
    if (trabajadorId) {
      pagosFiltrados = pagosDelDia.filter(pago => 
        pago.prestamo.cliente.trabajadorAsignado && 
        pago.prestamo.cliente.trabajadorAsignado._id.toString() === trabajadorId
      );
    }

    const pagosOrganizados = {
      pendientes: pagosFiltrados.filter(p => !p.pagado && p.fechaVencimiento <= fechaBusqueda),
      parciales: pagosFiltrados.filter(p => p.estadoPago === 'parcial'),
      completos: pagosFiltrados.filter(p => p.pagado),
      anticipados: pagosFiltrados.filter(p => p.metadata?.pagoAnticipado),
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
      montoRecaudado: pagosFiltrados.reduce((sum, p) => sum + p.montoAbonado, 0)
    };

    res.json({
      resumen,
      pagos: pagosOrganizados
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getEstadisticasPorTipo = async (req, res) => {
  // Tu código existente sin cambios
  try {
    const estadisticasSemanal = await obtenerEstadisticasTipo('semanal');
    const estadisticasDiario = await obtenerEstadisticasTipo('diario');

    res.json({
      semanal: estadisticasSemanal,
      diario: estadisticasDiario,
      resumenGeneral: {
        totalPrestamos: estadisticasSemanal.totalPrestamos + estadisticasDiario.totalPrestamos,
        montoTotalOtorgado: estadisticasSemanal.montoTotalOtorgado + estadisticasDiario.montoTotalOtorgado,
        montoTotalRecaudado: estadisticasSemanal.montoTotalRecaudado + estadisticasDiario.montoTotalRecaudado
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Función auxiliar sin cambios
async function obtenerEstadisticasTipo(tipoPrestamo) {
  const prestamos = await Prestamo.find({ tipoPrestamo });
  const prestamoIds = prestamos.map(p => p._id);
  
  const pagos = await Pago.find({ prestamo: { $in: prestamoIds } });
  
  const totalPrestamos = prestamos.length;
  const prestamosActivos = prestamos.filter(p => p.status === 'activo').length;
  const prestamosPagados = prestamos.filter(p => p.status === 'pagado').length;
  
  const montoTotalOtorgado = prestamos.reduce((sum, p) => sum + p.monto, 0);
  const montoTotalRecaudado = pagos.reduce((sum, p) => sum + p.montoAbonado, 0);
  
  const pagosPendientes = pagos.filter(p => !p.pagado).length;
  const pagosVencidos = pagos.filter(p => !p.pagado && p.fechaVencimiento < new Date()).length;

  return {
    tipoPrestamo,
    totalPrestamos,
    prestamosActivos,
    prestamosPagados,
    montoTotalOtorgado,
    montoTotalRecaudado,
    pagosPendientes,
    pagosVencidos,
    porcentajeRecuperacion: montoTotalOtorgado > 0 ? 
      (montoTotalRecaudado / montoTotalOtorgado) * 100 : 0
  };
}