import Pago from '../models/Pago.js';
import Prestamo from '../models/Prestamo.js';
import Moratorio from '../models/Moratorio.js';
import Cliente from '../models/Cliente.js';
import AsignacionDinero from '../models/AsignacionDinero.js';
import Caja from '../models/Caja.js';

export const registrarAbono = async (req, res) => {
  try {
    const { pagoId, trabajadorId, montoAbonado, observaciones } = req.body;

    // ✅ HACER TRABAJADOR OBLIGATORIO TAMBIÉN
    if (!trabajadorId) {
      return res.status(400).json({ 
        message: 'El trabajadorId es obligatorio. Todos los cobros deben registrarse con el trabajador que los realizó.' 
      });
    }

    if (!montoAbonado || montoAbonado <= 0) {
      return res.status(400).json({ message: 'El monto del abono debe ser mayor a 0' });
    }

    const pago = await Pago.findById(pagoId).populate('prestamo');

    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    if (pago.pagado) {
      return res.status(400).json({ message: 'Este pago ya está completo' });
    }

    // Validar que el trabajador tenga asignación activa
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);

    const asignacionActiva = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: hoy, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] }
    });

    if (!asignacionActiva) {
      return res.status(400).json({ 
        message: 'El trabajador no tiene asignación de caja activa para registrar cobros.',
        accion: 'El trabajador debe tener dinero asignado del día para poder cobrar'
      });
    }

    // Tu lógica existente de moratorios...
    const moratorioAplicado = await Moratorio.findOne({ 
      pago: pagoId, 
      activo: true 
    });

    let moratorioEfectivo = 0;
    
    if (moratorioAplicado && !moratorioAplicado.adminAcciones?.noCobra) {
      moratorioEfectivo = moratorioAplicado.monto;
      pago.diasMoratorio = moratorioAplicado.dias;
      pago.montoMoratorio = moratorioAplicado.monto;
    } else {
      pago.diasMoratorio = 0;
      pago.montoMoratorio = 0;
    }

    const saldoTotal = pago.saldoPendiente + moratorioEfectivo;
    
    if (montoAbonado > saldoTotal) {
      return res.status(400).json({ 
        message: `El abono no puede ser mayor al saldo pendiente ($${saldoTotal.toFixed(2)})` 
      });
    }

    const fechaActual = new Date();

    // ✅ REGISTRAR EN CAJA (OBLIGATORIO)
    try {
      await asignacionActiva.registrarCobro(
        pagoId,
        parseFloat(montoAbonado),
        pago.prestamo.cliente
      );
      
      console.log(`💰 Cobro de $${montoAbonado} registrado en caja para trabajador ${trabajadorId}`);
    } catch (error) {
      console.error('❌ Error al registrar cobro en caja:', error);
      throw new Error('Error al procesar el cobro en la caja');
    }

    // Tu lógica existente de aplicar el abono...
    let montoRestante = montoAbonado;
    let abonoCapital = 0;
    let abonoMoratorio = 0;

    if (moratorioEfectivo > 0) {
      abonoMoratorio = Math.min(montoRestante, moratorioEfectivo);
      
      const nuevoMontoMoratorio = moratorioAplicado.monto - abonoMoratorio;
      await Moratorio.findByIdAndUpdate(moratorioAplicado._id, {
        monto: nuevoMontoMoratorio
      });
      
      pago.montoMoratorio = nuevoMontoMoratorio;
      montoRestante -= abonoMoratorio;
    }

    if (montoRestante > 0) {
      abonoCapital = Math.min(montoRestante, pago.saldoPendiente);
      pago.montoAbonado += abonoCapital;
    }

    // Agregar al historial de abonos
    pago.historialAbonos.push({
      monto: montoAbonado,
      fecha: fechaActual,
      trabajador: trabajadorId,
      observaciones: observaciones || `Abono: $${abonoCapital.toFixed(2)} capital${abonoMoratorio > 0 ? `, $${abonoMoratorio.toFixed(2)} moratorio` : ''}`
    });

    if (!pago.fechaPago || pago.estadoPago === 'pendiente') {
      pago.fechaPago = fechaActual;
    }
    pago.trabajadorCobro = trabajadorId;
    
    if (observaciones) {
      pago.observaciones = observaciones;
    }

    await pago.save();

    // Tu lógica existente de línea de crédito...
    if (pago.numeroPago >= pago.prestamo.pagoMinimoRenovacion && 
        pago.pagado && 
        !pago.prestamo.puedeRenovar) {
      
      const cliente = await Cliente.findById(pago.prestamo.cliente);
      
      if (cliente) {
        const incremento = pago.prestamo.incrementoLineaCredito || 1000;
        const nuevaLineaCredito = cliente.lineaCredito + incremento;
        
        await Cliente.findByIdAndUpdate(pago.prestamo.cliente, {
          lineaCredito: nuevaLineaCredito
        });
      }

      await Prestamo.findByIdAndUpdate(pago.prestamo._id, {
        puedeRenovar: true
      });
    }

    const response = {
      message: pago.pagado 
        ? 'Pago completado correctamente' 
        : `Abono registrado. Saldo pendiente: $${pago.saldoPendiente.toFixed(2)}`,
      pago,
      detalleAbono: {
        montoTotal: montoAbonado,
        abonoCapital,
        abonoMoratorio,
        nuevoEstado: pago.estadoPago
      },
      caja: {
        registrado: true,
        mensaje: 'Cobro registrado en tu asignación de caja',
        montoRecaudadoHoy: asignacionActiva.montoRecaudado,
        asignacionId: asignacionActiva._id
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error en registrarAbono:', error);
    res.status(400).json({ message: error.message });
  }
};
// Obtener pagos pendientes (sin cambios)
export const getPagosPendientes = async (req, res) => {
  try {
    const pagos = await Pago.find({ 
      $or: [
        { pagado: false },
        { estadoPago: 'parcial' }
      ]
    })
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          select: 'nombre telefono direccion'
        }
      })
      .populate('trabajadorCobro', 'nombreCompleto')
      .sort({ fechaVencimiento: 1 });

    res.json(pagos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Tu método getPagos sin cambios importantes
export const getPagos = async (req, res) => {
  try {
    const hoy = new Date();
    const inicioHoy = new Date(hoy.setHours(0, 0, 0, 0));
    const finHoy = new Date(hoy.setHours(23, 59, 59, 999));

    const pagosPendientes = await Pago.find({ 
      $or: [
        { pagado: false },
        { estadoPago: 'parcial' }
      ]
    })
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          select: 'nombre telefono status direccion'
        }
      })
      .populate('trabajadorCobro', 'nombreCompleto telefono')
      .populate('historialAbonos.trabajador', 'nombreCompleto')
      .sort({ fechaVencimiento: 1 });

    const pagosCompletadosHoy = await Pago.find({
      pagado: true,
      estadoPago: 'completo',
      fechaPago: {
        $gte: inicioHoy,
        $lte: finHoy
      }
    })
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          select: 'nombre telefono status direccion'
        }
      })
      .populate('trabajadorCobro', 'nombreCompleto telefono')
      .populate('historialAbonos.trabajador', 'nombreCompleto')
      .sort({ fechaPago: -1 });

    const todosPagos = [...pagosPendientes, ...pagosCompletadosHoy];

    const pagosConMoratorios = await Promise.all(
      todosPagos.map(async (pago) => {
        const moratorioAplicado = await Moratorio.findOne({ 
          pago: pago._id, 
          activo: true 
        });

        let moratorioEfectivo = 0;
        let moratorioInfo = {
          existe: false,
          activo: false,
          monto: 0,
          dias: 0,
          perdonado: false
        };

        if (moratorioAplicado) {
          const fueQuitado = moratorioAplicado.adminAcciones?.noCobra || false;
          
          moratorioInfo = {
            existe: true,
            activo: !fueQuitado,
            monto: fueQuitado ? 0 : moratorioAplicado.monto,
            dias: moratorioAplicado.dias,
            perdonado: fueQuitado,
            _id: moratorioAplicado._id
          };

          moratorioEfectivo = fueQuitado ? 0 : moratorioAplicado.monto;
        }

        return {
          ...pago.toObject(),
          moratorioInfo,
          saldoTotalConMoratorio: pago.saldoPendiente + moratorioEfectivo
        };
      })
    );

    res.json(pagosConMoratorios);
  } catch (error) {
    console.error('Error en getPagos:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getHistorialAbonos = async (req, res) => {
  try {
    const { pagoId } = req.params;
    
    const pago = await Pago.findById(pagoId)
      .populate('historialAbonos.trabajador', 'nombreCompleto')
      .populate('prestamo', 'numeroPrestamo')
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          select: 'nombre'
        }
      });

    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    const moratorio = await Moratorio.findOne({ pago: pagoId, activo: true });

    res.json({
      pago: {
        _id: pago._id,
        numeroPago: pago.numeroPago,
        monto: pago.monto,
        montoAbonado: pago.montoAbonado,
        saldoPendiente: pago.saldoPendiente,
        estadoPago: pago.estadoPago,
        cliente: pago.prestamo.cliente.nombre,
        numeroPrestamo: pago.prestamo.numeroPrestamo
      },
      moratorio: moratorio ? {
        existe: true,
        activo: !moratorio.adminAcciones?.noCobra,
        monto: moratorio.monto,
        dias: moratorio.dias,
        perdonado: moratorio.adminAcciones?.noCobra || false
      } : null,
      historial: pago.historialAbonos
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mantener el método original por compatibilidad
export const registrarPago = registrarAbono;

// ========== NUEVOS MÉTODOS PARA INTEGRACIÓN CON CAJA ==========

// Obtener resumen de cobros del día para un trabajador
export const getResumenCobrosDiaTrabajador = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fecha } = req.query;
    
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();
    const inicioDia = new Date(fechaBusqueda);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaBusqueda);
    finDia.setHours(23, 59, 59, 999);

    // Buscar todos los pagos cobrados por el trabajador hoy
    const pagosDelDia = await Pago.find({
      trabajadorCobro: trabajadorId,
      'historialAbonos.fecha': { $gte: inicioDia, $lte: finDia }
    }).populate({
      path: 'prestamo',
      populate: {
        path: 'cliente',
        select: 'nombre telefono'
      }
    });

    // Calcular total cobrado
    let totalCobrado = 0;
    const cobrosDetalle = [];

    for (const pago of pagosDelDia) {
      const abonosHoy = pago.historialAbonos.filter(abono => {
        const fechaAbono = new Date(abono.fecha);
        return fechaAbono >= inicioDia && fechaAbono <= finDia && 
               abono.trabajador?.toString() === trabajadorId;
      });

      for (const abono of abonosHoy) {
        totalCobrado += abono.monto;
        cobrosDetalle.push({
          cliente: pago.prestamo.cliente.nombre,
          numeroPago: pago.numeroPago,
          monto: abono.monto,
          hora: abono.fecha,
          tipoPrestamo: pago.tipoPago || 'semanal'
        });
      }
    }

    // Buscar asignación de caja si existe
    const asignacion = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: inicioDia, $lte: finDia }
    });

    res.json({
      fecha: fechaBusqueda,
      trabajador: trabajadorId,
      resumen: {
        totalCobrado,
        cantidadCobros: cobrosDetalle.length,
        cobrosDetalle: cobrosDetalle.sort((a, b) => new Date(b.hora) - new Date(a.hora))
      },
      caja: asignacion ? {
        tieneAsignacion: true,
        montoAsignado: asignacion.montoAsignado,
        montoRecaudado: asignacion.montoRecaudado,
        coincide: Math.abs(totalCobrado - asignacion.montoRecaudado) < 1
      } : {
        tieneAsignacion: false,
        mensaje: 'Sin asignación de caja para hoy'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener resumen de cobros',
      error: error.message 
    });
  }
};