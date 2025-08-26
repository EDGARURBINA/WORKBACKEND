import Pago from '../models/Pago.js';
import Prestamo from '../models/Prestamo.js';
import Moratorio from '../models/Moratorio.js';
import Cliente from '../models/Cliente.js';

export const registrarAbono = async (req, res) => {
  try {
    const { pagoId, trabajadorId, montoAbonado, observaciones } = req.body;

    // Validaciones básicas
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

    // 🔧 CORREGIDO: Consultar moratorio APLICADO manualmente (NO auto-crear)
    const moratorioAplicado = await Moratorio.findOne({ 
      pago: pagoId, 
      activo: true 
    });

    let moratorioEfectivo = 0;
    
    // Solo usar moratorio si fue aplicado por admin Y no fue quitado
    if (moratorioAplicado && !moratorioAplicado.adminAcciones?.noCobra) {
      moratorioEfectivo = moratorioAplicado.monto;
      // Sincronizar con el pago
      pago.diasMoratorio = moratorioAplicado.dias;
      pago.montoMoratorio = moratorioAplicado.monto;
    } else {
      // 🔧 CORREGIDO: Si no hay moratorio aplicado o fue quitado, limpiar el pago
      pago.diasMoratorio = 0;
      pago.montoMoratorio = 0;
    }

    // 🔧 CORREGIDO: Validar con moratorio efectivo (solo los aplicados por admin)
    const saldoTotal = pago.saldoPendiente + moratorioEfectivo;
    
    console.log(`🔍 DEBUG - Pago ID: ${pagoId}`);
    console.log(`🔍 Moratorio aplicado por admin: ${!!moratorioAplicado}`);
    console.log(`🔍 Moratorio fue quitado: ${moratorioAplicado?.adminAcciones?.noCobra || false}`);
    console.log(`🔍 Moratorio efectivo: $${moratorioEfectivo}`);
    console.log(`🔍 Saldo total: $${saldoTotal}`);
    
    if (montoAbonado > saldoTotal) {
      return res.status(400).json({ 
        message: `El abono no puede ser mayor al saldo pendiente ($${saldoTotal.toFixed(2)})` 
      });
    }

    const fechaActual = new Date(); 

    // ❌ ELIMINADO: Ya no auto-crear moratorios aquí
    // if (!pago.diasMoratorio) { ... }

    // Aplicar el abono
    let montoRestante = montoAbonado;
    let abonoCapital = 0;
    let abonoMoratorio = 0;

    // 🔧 CORREGIDO: Solo aplicar a moratorio si es efectivo (aplicado por admin)
    if (moratorioEfectivo > 0) {
      abonoMoratorio = Math.min(montoRestante, moratorioEfectivo);
      
      // Actualizar moratorio en la colección
      const nuevoMontoMoratorio = moratorioAplicado.monto - abonoMoratorio;
      await Moratorio.findByIdAndUpdate(moratorioAplicado._id, {
        monto: nuevoMontoMoratorio
      });
      
      // Sincronizar con el pago
      pago.montoMoratorio = nuevoMontoMoratorio;
      
      montoRestante -= abonoMoratorio;
    }

    // Luego aplicar al capital
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

    // Actualizar fechas y trabajador
    if (!pago.fechaPago || pago.estadoPago === 'pendiente') {
      pago.fechaPago = fechaActual;
    }
    pago.trabajadorCobro = trabajadorId;
    
    if (observaciones) {
      pago.observaciones = observaciones;
    }

    // El middleware del modelo se encarga de calcular estadoPago, pagado, etc.
    await pago.save();

    // Lógica para incrementar línea de crédito en el pago 11
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

        console.log(`✅ Línea de crédito incrementada para cliente ${cliente.nombre}: $${cliente.lineaCredito} -> $${nuevaLineaCredito}`);
      }

      await Prestamo.findByIdAndUpdate(pago.prestamo._id, {
        puedeRenovar: true
      });

      console.log(`✅ Préstamo ${pago.prestamo._id} ahora puede renovar (pago #${pago.numeroPago} completado)`);
    }

    // Respuesta detallada
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
      }
    };

    // Agregar información de línea de crédito si se incrementó
    if (pago.numeroPago >= pago.prestamo.pagoMinimoRenovacion && pago.pagado) {
      const clienteActualizado = await Cliente.findById(pago.prestamo.cliente);
      response.lineaCreditoActualizada = {
        incremento: pago.prestamo.incrementoLineaCredito || 1000,
        nuevaLineaCredito: clienteActualizado.lineaCredito,
        puedeRenovar: true
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Error en registrarAbono:', error);
    res.status(400).json({ message: error.message });
  }
};


// Obtener pagos pendientes (incluyendo parciales)
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


// 🔧 CORREGIDO: getPagos sin auto-calcular moratorios
export const getPagos = async (req, res) => {
  try {
    const hoy = new Date();
    const inicioHoy = new Date(hoy.setHours(0, 0, 0, 0));
    const finHoy = new Date(hoy.setHours(23, 59, 59, 999));

    // Obtener pagos pendientes y parciales
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

    // Obtener pagos completados HOY
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

    // Combinar ambos arrays
    const todosPagos = [...pagosPendientes, ...pagosCompletadosHoy];

    // 🔧 CORREGIDO: Solo usar moratorios aplicados por admin
    const pagosConMoratorios = await Promise.all(
      todosPagos.map(async (pago) => {
        // Consultar moratorio aplicado manualmente
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

    // 🔧 CORREGIDO: Incluir información de moratorio desde la colección
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