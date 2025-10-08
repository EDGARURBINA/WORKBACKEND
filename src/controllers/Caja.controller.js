import Caja from '../models/Caja.js';
import AsignacionDinero from '../models/AsignacionDinero.js';
import ReporteDiario from '../models/ReporteDiario.js';
import Trabajador from '../models/Trabajador.js';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import User from '../models/User.js';



// ✅ HISTORIAL MEJORADO DE CAJAS CON COMPARATIVAS
export const getHistorialCajasDetallado = async (req, res) => {
  try {
    const { año, limit = 12 } = req.query;
    
    let filtros = {};
    if (año) {
      filtros.año = parseInt(año);
    }
    
    console.log('📚 Obteniendo historial de cajas...');
    
    const cajas = await Caja.find(filtros)
      .populate('creadoPor', 'nombre email')
      .populate('cerradoPor', 'nombre email')
      .sort({ año: -1, mes: -1 })
      .limit(parseInt(limit));
    
    // Obtener estadísticas detalladas de cada caja
    const historialDetallado = await Promise.all(
      cajas.map(async (caja) => {
        const balance = caja.obtenerBalance();
        
        // Contar asignaciones de esta caja
        const asignaciones = await AsignacionDinero.find({ caja: caja._id });
        const asignacionesCompletadas = asignaciones.filter(a => a.status === 'completado');
        
        // Contar préstamos del mes
        const inicioMes = new Date(caja.año, caja.mes - 1, 1);
        const finMes = new Date(caja.año, caja.mes, 0, 23, 59, 59);
        
        const prestamosDelMes = await Prestamo.countDocuments({
          fechaIngreso: { $gte: inicioMes, $lte: finMes }
        });
        
        const pagosDelMes = await Pago.countDocuments({
          fechaPago: { $gte: inicioMes, $lte: finMes }
        });
        
        return {
          id: caja._id,
          periodo: caja.periodo,
          mes: caja.mes,
          año: caja.año,
          status: caja.status,
          
          // 💰 Información financiera
          financiero: {
            montoInicial: caja.montoInicial,
            montoFinal: caja.montoActual,
            ganancia: balance.ganancia,
            porcentajeGanancia: balance.porcentajeGanancia,
            montoAsignado: caja.montoAsignado,
            montoRecaudado: caja.montoRecaudado,
            montoPrestado: caja.montoPrestado
          },
          
          // 📊 Actividad
          actividad: {
            totalMovimientos: caja.movimientos?.length || 0,
            asignaciones: asignaciones.length,
            asignacionesCompletadas: asignacionesCompletadas.length,
            prestamosCreados: prestamosDelMes,
            pagosCobrados: pagosDelMes
          },
          
          // 📅 Fechas
          fechas: {
            creacion: caja.createdAt,
            cierre: caja.fechaCierre,
            diasOperados: caja.fechaCierre ? 
              Math.ceil((new Date(caja.fechaCierre) - new Date(caja.createdAt)) / (1000 * 60 * 60 * 24)) : 
              null
          },
          
          // 👥 Usuarios
          usuarios: {
            creadoPor: caja.creadoPor?.nombre || 'N/A',
            cerradoPor: caja.cerradoPor?.nombre || 'N/A'
          }
        };
      })
    );
    
    // 📈 COMPARATIVA ENTRE MESES
    const comparativa = [];
    for (let i = 0; i < historialDetallado.length - 1; i++) {
      const actual = historialDetallado[i];
      const anterior = historialDetallado[i + 1];
      
      comparativa.push({
        periodoActual: actual.periodo,
        periodoAnterior: anterior.periodo,
        diferencias: {
          ganancia: actual.financiero.ganancia - anterior.financiero.ganancia,
          porcentajeGanancia: actual.financiero.porcentajeGanancia - anterior.financiero.porcentajeGanancia,
          prestamos: actual.actividad.prestamosCreados - anterior.actividad.prestamosCreados,
          pagos: actual.actividad.pagosCobrados - anterior.actividad.pagosCobrados
        },
        tendencia: {
          ganancia: actual.financiero.ganancia > anterior.financiero.ganancia ? 'subida' : 'bajada',
          actividad: actual.actividad.totalMovimientos > anterior.actividad.totalMovimientos ? 'más activo' : 'menos activo'
        }
      });
    }
    
    // 📊 RESUMEN GENERAL
    const resumenGeneral = {
      totalCajas: historialDetallado.length,
      cajasAbiertas: historialDetallado.filter(c => c.status === 'abierta').length,
      cajasCerradas: historialDetallado.filter(c => c.status === 'cerrada').length,
      gananciaTotalAcumulada: historialDetallado.reduce((sum, c) => sum + c.financiero.ganancia, 0),
      promedioGananciaMensual: historialDetallado.length > 0 ? 
        historialDetallado.reduce((sum, c) => sum + c.financiero.ganancia, 0) / historialDetallado.length : 0,
      mejorMes: historialDetallado.length > 0 ? 
        historialDetallado.reduce((max, c) => c.financiero.ganancia > max.financiero.ganancia ? c : max) : null,
      peorMes: historialDetallado.length > 0 ? 
        historialDetallado.reduce((min, c) => c.financiero.ganancia < min.financiero.ganancia ? c : min) : null
    };
    
    console.log('✅ Historial generado con', historialDetallado.length, 'cajas');
    
    res.json({
      success: true,
      historial: historialDetallado,
      comparativa,
      resumen: resumenGeneral,
      filtros: { año: año || 'Todos', limit }
    });
    
  } catch (error) {
    console.error('❌ Error al obtener historial:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error al obtener historial de cajas',
      error: error.message 
    });
  }
};



// ============ NUEVO MÉTODO: CIERRE DIARIO ============

export const cerrarDiaTrabajador = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fecha, montoDevuelto, observaciones } = req.body;
    
    console.log('🔒 Iniciando cierre de día para trabajador:', trabajadorId);
    
    const fechaCierre = fecha ? new Date(fecha) : new Date();
    fechaCierre.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaCierre);
    finDia.setHours(23, 59, 59, 999);
    
    console.log('📅 Buscando asignación para cerrar:', fechaCierre.toISOString().split('T')[0]);
    
    // ⭐ PRIORIZAR ASIGNACIONES ACTIVAS (igual que en el dashboard)
    // PRIMERO: Buscar asignaciones activas (pendiente o parcial)
    let asignacion = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: fechaCierre, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] } // ⭐ SOLO ASIGNACIONES ACTIVAS
    })
    .populate('caja')
    .populate('trabajador', 'nombreCompleto')
    .sort({ createdAt: -1 }); // La más reciente primero
    
    console.log('💰 Asignación activa encontrada:', asignacion ? 'Sí' : 'No');
    
    // SEGUNDO: Si no hay activas, buscar cualquier asignación del día
    if (!asignacion) {
      console.log('🔍 No hay asignaciones activas, buscando cualquier asignación...');
      asignacion = await AsignacionDinero.findOne({
        trabajador: trabajadorId,
        fecha: { $gte: fechaCierre, $lte: finDia }
      })
      .populate('caja')
      .populate('trabajador', 'nombreCompleto')
      .sort({ createdAt: -1 }); // La más reciente primero
    }
    
    if (!asignacion) {
      console.log('❌ No se encontró ninguna asignación');
      return res.status(404).json({
        message: 'No se encontró asignación para este trabajador en la fecha especificada'
      });
    }
    
    console.log('📊 Asignación encontrada:', {
      id: asignacion._id,
      status: asignacion.status,
      montoAsignado: asignacion.montoAsignado,
      montoRecaudado: asignacion.montoRecaudado
    });
    
    if (asignacion.status === 'completado') {
      console.log('❌ Asignación ya completada');
      return res.status(400).json({
        message: 'La asignación ya fue cerrada'
      });
    }
    
    // ✅ CÁLCULO CORRECTO
    const montoDisponible = asignacion.montoAsignado - asignacion.montoUtilizado;
    const montoEsperado = montoDisponible + asignacion.montoRecaudado;
    
    
    console.log('💵 Cálculo de cierre:', {
      montoAsignado: asignacion.montoAsignado,
      montoRecaudado: asignacion.montoRecaudado,
      montoEsperado,
      montoDevuelto
    });
    
    if (!montoDevuelto) {
      return res.status(400).json({
        message: 'Debe especificar el monto devuelto'
      });
    }
    
    // Procesar devolución
    console.log('⚙️ Procesando devolución...');
    await asignacion.procesarDevolucion(
      montoDevuelto, 
      observaciones,
      req.user?.id || '507f1f77bcf86cd799439011'
    );
    
    console.log('✅ Devolución procesada, asignación cerrada');
    
    // ✅ REGISTRAR EN CAJA EL INGRESO
    const caja = await Caja.findById(asignacion.caja._id);
    if (caja) {
      try {
        await caja.registrarMovimiento(
          'devolucion',
          montoDevuelto,
          `Devolución diaria - ${asignacion.trabajador.nombreCompleto}`,
          trabajadorId,
          req.user?.id
        );
        console.log('✅ Movimiento registrado en caja');
      } catch (error) {
        console.error('⚠️ Error registrando en caja:', error.message);
        // No fallar el cierre por esto
      }
    }
    
    const resumenFinal = {
      montoAsignado: asignacion.montoAsignado,
      montoRecaudado: asignacion.montoRecaudado,
      montoEsperado,
      montoDevuelto,
      diferencia: montoDevuelto - montoEsperado,
      ganancia: montoDevuelto - asignacion.montoAsignado
    };
    
    console.log('📊 Resumen final:', resumenFinal);
    
    res.json({
      message: 'Día cerrado exitosamente',
      asignacion,
      resumen: resumenFinal,
      balanceCaja: caja?.obtenerBalance()
    });
    
  } catch (error) {
    console.error('❌ Error al cerrar día:', error);
    res.status(500).json({
      message: 'Error al cerrar día',
      error: error.message
    });
  }
};

export const registrarCobroEnAsignacion = async (req, res) => {
  try {
    const { asignacionId } = req.params;
    const { pagoId, monto, clienteId } = req.body;
    
    const asignacion = await AsignacionDinero.findById(asignacionId);
    
    if (!asignacion) {
      return res.status(404).json({ 
        message: 'Asignación no encontrada' 
      });
    }
    
    // Registrar el cobro
    await asignacion.registrarCobro(pagoId, monto, clienteId);
    
    res.json({
      message: 'Cobro registrado exitosamente',
      balance: asignacion.calcularBalance()
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al registrar cobro',
      error: error.message 
    });
  }
};



// Obtener caja por ID
export const getCajaById = async (req, res) => {
  try {
    const { cajaId } = req.params;
    
    const caja = await Caja.findById(cajaId)
      .populate('creadoPor', 'nombre email')
      .populate('movimientos.responsable', 'nombre')
      .populate('movimientos.trabajador', 'nombreCompleto');
    
    if (!caja) {
      return res.status(404).json({ 
        message: 'Caja no encontrada' 
      });
    }
    
    const balance = caja.obtenerBalance();
    
    res.json({
      caja,
      balance,
      periodo: caja.periodo
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener caja',
      error: error.message 
    });
  }
};


export const registrarPrestamoEnAsignacion = async (req, res) => {
  try {
    const { asignacionId } = req.params;
    const { prestamoId, monto, tipoPrestamo } = req.body;
    
    const asignacion = await AsignacionDinero.findById(asignacionId)
      .populate('caja')
      .populate('trabajador', 'nombreCompleto');
    
    if (!asignacion) {
      return res.status(404).json({ 
        message: 'Asignación no encontrada' 
      });
    }
    
    // Verificar que la asignación esté activa
    if (asignacion.status === 'completado') {
      return res.status(400).json({ 
        message: 'No se pueden agregar préstamos a una asignación completada' 
      });
    }
    
    // Registrar el préstamo en la asignación
    await asignacion.registrarPrestamo(prestamoId, monto, tipoPrestamo);
    
    // Actualizar estadísticas de caja
    const caja = await Caja.findById(asignacion.caja._id);
    await caja.registrarPrestamo(
      monto, 
      `Préstamo ${tipoPrestamo} - ${asignacion.trabajador.nombreCompleto}`,
      asignacion.trabajador._id,
      req.user?.id
    );
    
    res.status(201).json({
      message: 'Préstamo registrado exitosamente',
      asignacion,
      balance: asignacion.calcularBalance()
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al registrar préstamo',
      error: error.message 
    });
  }
};


export const getAsignacionesPorTrabajador = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { status } = req.query;
    
    let filtros = { trabajador: trabajadorId };
    if (status) {
      filtros.status = status;
    }
    
    const asignaciones = await AsignacionDinero.find(filtros)
      .populate('caja', 'periodo')
      .populate('asignadoPor', 'nombre')
      .sort({ fecha: -1 });
    
    res.json({
      asignaciones,
      total: asignaciones.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener asignaciones del trabajador',
      error: error.message 
    });
  }
};

export const crearCaja = async (req, res) => {
  try {
    const { mes, año, montoInicial } = req.body;
    
    // ✅ SOLUCIÓN: Manejar caso sin autenticación
    const usuarioId = req.user?.id || '507f1f77bcf86cd799439011'; // ID dummy para testing
    
    console.log('🏗️ Creando caja:', { mes, año, montoInicial, usuarioId });
    
    // Verificar si ya existe caja para ese mes
    const cajaExistente = await Caja.findOne({ mes, año });
    if (cajaExistente) {
      return res.status(400).json({
        message: 'Ya existe una caja para este período'
      });
    }
    
    // Crear nueva caja
    const nuevaCaja = new Caja({
      mes,
      año,
      montoInicial,
      montoActual: montoInicial, // ✅ ESTO ES SUFICIENTE
      creadoPor: usuarioId
    });
    
    // Guardar la caja - NO REGISTRAR MOVIMIENTO INICIAL
    await nuevaCaja.save();
    
    // ❌ ELIMINAR ESTA SECCIÓN COMPLETAMENTE:
    /*
    try {
      if (typeof nuevaCaja.registrarMovimiento === 'function') {
        await nuevaCaja.registrarMovimiento(
          'ingreso',
          montoInicial,
          'Apertura de caja mensual',
          null,
          usuarioId
        );
      }
    } catch (movError) {
      console.log('⚠️ Error registrando movimiento (opcional):', movError.message);
    }
    */
    
    console.log('✅ Caja creada sin movimiento inicial duplicado');
    
    res.status(201).json({
      message: 'Caja creada exitosamente',
      caja: nuevaCaja
    });
  } catch (error) {
    console.error('💥 Error al crear caja:', error);
    res.status(500).json({
      message: 'Error al crear caja',
      error: error.message
    });
  }
};

export const getCajaActual = async (req, res) => {
  try {
    const fechaActual = new Date();
    const mes = fechaActual.getMonth() + 1;
    const año = fechaActual.getFullYear();
    
    console.log(`🔍 Buscando caja para: mes=${mes}, año=${año}`);
    
    const caja = await Caja.findOne({ mes, año })
      .populate('creadoPor', 'nombre email')
      .populate('movimientos.responsable', 'nombre')
      .populate('movimientos.trabajador', 'nombreCompleto');
    
    if (!caja) {
      console.log('❌ No se encontró caja para este mes');
      return res.status(404).json({ 
        success: false,
        message: 'No hay caja abierta para este mes',
        code: 'NO_CAJA_FOUND',
        data: {
          mes,
          año,
          shouldCreateCaja: true
        }
      });
    }
    
    console.log('✅ Caja encontrada:', caja._id);
    
    // Calcular balance
    let balance;
    try {
      balance = caja.obtenerBalance ? caja.obtenerBalance() : {
        montoInicial: caja.montoInicial || 0,
        montoActual: caja.montoActual || 0,
        montoAsignado: caja.montoAsignado || 0,
        montoRecaudado: caja.montoRecaudado || 0,
        montoPrestado: caja.montoPrestado || 0,
        montoDisponible: (caja.montoActual || 0) - (caja.montoAsignado || 0),
        ganancia: (caja.montoActual || 0) - (caja.montoInicial || 0),
        porcentajeGanancia: caja.montoInicial > 0 ? 
          (((caja.montoActual - caja.montoInicial) / caja.montoInicial) * 100).toFixed(2) : 0,
        totalMovimientos: caja.movimientos?.length || 0,
        status: caja.status || 'abierta'
      };
      console.log('✅ Balance calculado:', balance);
    } catch (error) {
      console.error('❌ Error calculando balance:', error);
      balance = {
        montoInicial: caja.montoInicial || 0,
        montoActual: caja.montoActual || 0,
        montoAsignado: caja.montoAsignado || 0,
        montoRecaudado: caja.montoRecaudado || 0,
        montoPrestado: caja.montoPrestado || 0,
        montoDisponible: (caja.montoActual || 0) - (caja.montoAsignado || 0),
        ganancia: (caja.montoActual || 0) - (caja.montoInicial || 0),
        porcentajeGanancia: 0,
        totalMovimientos: caja.movimientos?.length || 0,
        status: caja.status || 'abierta'
      };
    }
    
    const response = {
      success: true,
      message: 'Caja encontrada exitosamente',
      data: {
        caja: {
          _id: caja._id,
          mes: caja.mes,
          año: caja.año,
          status: caja.status,
          periodo: caja.periodo,
          montoInicial: caja.montoInicial,
          montoActual: caja.montoActual,
          montoAsignado: caja.montoAsignado,
          montoRecaudado: caja.montoRecaudado,
          createdAt: caja.createdAt,
          creadoPor: caja.creadoPor
        },
        balance,
        periodo: caja.periodo
      }
    };
    
    console.log('📤 Enviando respuesta exitosa');
    res.json(response);
    
  } catch (error) {
    console.error('💥 Error en getCajaActual:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error interno del servidor',
      code: 'SERVER_ERROR',
      error: error.message
    });
  }
};

export const asignarDinero = async (req, res) => {
  try {
    const { trabajadorId, monto, notas } = req.body;
    
    console.log('💰 Iniciando asignación de dinero:', { trabajadorId, monto });
    
    // Validaciones básicas
    if (!trabajadorId || !monto) {
      return res.status(400).json({ 
        message: 'TrabajadorId y monto son requeridos' 
      });
    }
    
    if (parseFloat(monto) <= 0) {
      return res.status(400).json({ 
        message: 'El monto debe ser mayor a 0' 
      });
    }
    
    // Verificar que el trabajador existe
    const trabajador = await Trabajador.findById(trabajadorId);
    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }
    
    if (!trabajador.activo) {
      return res.status(400).json({ message: 'El trabajador no está activo' });
    }
    
    // ⭐ OBTENER CAJA ACTUAL AUTOMÁTICAMENTE
    const hoy = new Date();
    const cajaActual = await Caja.findOne({
      mes: hoy.getMonth() + 1,
      año: hoy.getFullYear(),
      status: 'abierta'
    });
    
    if (!cajaActual) {
      return res.status(400).json({ 
        message: 'No hay una caja abierta para este mes. Crea una caja primero.',
        accion: 'Ir a Caja → Crear Caja'
      });
    }
    
    console.log('🏦 Caja actual encontrada:', cajaActual.periodo);
    
    // Verificar fondos disponibles en la caja
    const balanceCaja = cajaActual.obtenerBalance();
    if (parseFloat(monto) > balanceCaja.montoDisponible) {
      return res.status(400).json({ 
        message: 'Fondos insuficientes en la caja',
        disponible: balanceCaja.montoDisponible,
        solicitado: parseFloat(monto)
      });
    }
    
    // ⭐ BUSCAR USUARIO ADMIN REAL EN LA BASE DE DATOS
    const User = (await import('../models/User.js')).default;
    const adminUser = await User.findOne({ $or: [{ name: 'admin' }, { username: 'admin' }, { nombre: 'admin' }] }) || await User.findOne();
    
    if (!adminUser) {
      return res.status(500).json({ 
        message: 'No se encontró usuario administrador en el sistema' 
      });
    }
    
    console.log('👤 Usuario admin encontrado:', adminUser.name || adminUser.username || adminUser.nombre || 'Sin nombre', adminUser._id);
    
    // ⭐ BUSCAR O CREAR ASIGNACIÓN DEL DÍA
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    const hoyFin = new Date();
    hoyFin.setHours(23, 59, 59, 999);
    
    console.log('🔍 Buscando asignación existente del día...');
    
    let asignacionExistente = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: hoyInicio, $lte: hoyFin }
    });
    
    if (asignacionExistente) {
      console.log('📋 Asignación existente encontrada:', asignacionExistente.status);
      
      // Si la asignación está completada, crear una nueva
      if (asignacionExistente.status === 'completado') {
        console.log('✅ Asignación anterior completada, creando nueva...');
        
        // Crear nueva asignación
        const nuevaAsignacion = new AsignacionDinero({
          trabajador: trabajadorId,
          caja: cajaActual._id,
          montoAsignado: parseFloat(monto),
          fecha: new Date(),
          status: 'pendiente',
          asignadoPor: adminUser._id, // ⭐ USAR ADMIN REAL
          notas: notas || `Nueva asignación después del cierre diario`
        });
        
        await nuevaAsignacion.save();
        asignacionExistente = nuevaAsignacion;
        
        console.log('✅ Nueva asignación creada:', nuevaAsignacion._id);
        
      } else {
        // Actualizar asignación existente (sumar al monto)
        console.log('➕ Actualizando asignación existente...');
        
        asignacionExistente.montoAsignado += parseFloat(monto);
        
        // ⭐ ASEGURARSE DE QUE TENGA CAJA ASIGNADA
        if (!asignacionExistente.caja) {
          asignacionExistente.caja = cajaActual._id;
          console.log('🔧 Caja asignada a asignación existente');
        }
        
        if (notas) {
          const notaAnterior = asignacionExistente.notas || '';
          asignacionExistente.notas = notaAnterior + 
            (notaAnterior ? ' | ' : '') + 
            `Asignación adicional: $${monto} - ${notas}`;
        }
        
        await asignacionExistente.save();
        console.log('✅ Asignación actualizada');
      }
      
    } else {
      // Crear nueva asignación
      console.log('🆕 Creando nueva asignación...');
      
      asignacionExistente = new AsignacionDinero({
        trabajador: trabajadorId,
        caja: cajaActual._id,
        montoAsignado: parseFloat(monto),
        fecha: new Date(),
        status: 'pendiente',
        asignadoPor: adminUser._id, // ⭐ USAR ADMIN REAL
        notas: notas || `Asignación de caja - ${cajaActual.periodo}`
      });
      
      await asignacionExistente.save();
      console.log('✅ Nueva asignación creada:', asignacionExistente._id);
    }
    
    // Registrar movimiento en la caja
    try {
      await cajaActual.registrarMovimiento(
        'asignacion',
        parseFloat(monto),
        `Asignación a ${trabajador.nombreCompleto}`,
        trabajadorId,
        adminUser._id // Usar admin real
      );
      
      console.log('✅ Movimiento registrado en caja');
    } catch (error) {
      console.error('❌ Error al registrar en caja:', error);
      // No fallar la asignación por esto
    }
    
    // Obtener asignación completa con populate
    const asignacionCompleta = await AsignacionDinero.findById(asignacionExistente._id)
      .populate('trabajador')
      .populate('caja');
    
    const response = {
      message: 'Dinero asignado exitosamente',
      asignacion: asignacionCompleta,
      caja: {
        _id: cajaActual._id,
        periodo: cajaActual.periodo,
        balanceAnterior: balanceCaja.montoDisponible,
        balanceNuevo: balanceCaja.montoDisponible - parseFloat(monto)
      },
      trabajador: {
        _id: trabajador._id,
        nombreCompleto: trabajador.nombreCompleto
      }
    };
    
    console.log('✅ Asignación completada exitosamente');
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error al asignar dinero:', error);
    res.status(500).json({ 
      message: 'Error al asignar dinero',
      error: error.message 
    });
  }
};

// Procesar devolución de trabajador
export const procesarDevolucion = async (req, res) => {
  try {
    const { asignacionId } = req.params;
    const { montoDevuelto, observaciones } = req.body;
    
    // ✅ SOLUCIÓN: Manejar caso sin autenticación
    const usuarioId = req.user?.id || '507f1f77bcf86cd799439011';
    
    // Obtener asignación
    const asignacion = await AsignacionDinero.findById(asignacionId)
      .populate('trabajador', 'nombreCompleto')
      .populate('caja');
    
    if (!asignacion) {
      return res.status(404).json({ 
        message: 'Asignación no encontrada' 
      });
    }
    
    if (asignacion.status === 'completado') {
      return res.status(400).json({ 
        message: 'Esta asignación ya fue procesada' 
      });
    }
    
    // Procesar devolución (si el método existe)
    try {
      if (typeof asignacion.procesarDevolucion === 'function') {
        await asignacion.procesarDevolucion(montoDevuelto, observaciones, usuarioId);
      } else {
        // Actualizar manualmente si no existe el método
        asignacion.montoDevuelto = montoDevuelto;
        asignacion.status = 'completado';
        asignacion.observaciones = observaciones;
        await asignacion.save();
      }
    } catch (procError) {
      console.log('⚠️ Error procesando devolución:', procError.message);
    }
    
    // Actualizar caja
    const caja = await Caja.findById(asignacion.caja._id);
    if (caja && typeof caja.registrarMovimiento === 'function') {
      try {
        await caja.registrarMovimiento(
          'devolucion',
          montoDevuelto,
          `Devolución de ${asignacion.trabajador.nombreCompleto}`,
          asignacion.trabajador._id,
          usuarioId
        );
      } catch (movError) {
        console.log('⚠️ Error registrando movimiento:', movError.message);
      }
    }
    
    const balance = asignacion.calcularBalance ? asignacion.calcularBalance() : {};
    
    res.json({
      message: 'Devolución procesada exitosamente',
      asignacion,
      balance,
      balanceCaja: caja?.obtenerBalance ? caja.obtenerBalance() : {}
    });
  } catch (error) {
    console.error('💥 Error al procesar devolución:', error);
    res.status(500).json({ 
      message: 'Error al procesar devolución',
      error: error.message 
    });
  }
};
// Obtener asignaciones del día
export const getAsignacionesDelDia = async (req, res) => {
  try {
    const { fecha } = req.query;
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();
    
    // Establecer rango del día
    const inicioDia = new Date(fechaBusqueda);
    inicioDia.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaBusqueda);
    finDia.setHours(23, 59, 59, 999);
    
    const asignaciones = await AsignacionDinero.find({
      fecha: { $gte: inicioDia, $lte: finDia }
    })
      .populate('trabajador', 'nombreCompleto telefono')
      .populate('caja', 'periodo')
      .populate('asignadoPor', 'nombre');
    
    // Calcular totales
    const totales = asignaciones.reduce((acc, asig) => {
      const balance = asig.calcularBalance();
      return {
        totalAsignado: acc.totalAsignado + asig.montoAsignado,
        totalUtilizado: acc.totalUtilizado + asig.montoUtilizado,
        totalRecaudado: acc.totalRecaudado + asig.montoRecaudado,
        totalDevuelto: acc.totalDevuelto + asig.montoDevuelto,
        prestamosRealizados: acc.prestamosRealizados + asig.prestamosRealizados.length,
        cobrosRealizados: acc.cobrosRealizados + asig.cobrosRealizados.length
      };
    }, {
      totalAsignado: 0,
      totalUtilizado: 0,
      totalRecaudado: 0,
      totalDevuelto: 0,
      prestamosRealizados: 0,
      cobrosRealizados: 0
    });
    
    res.json({
      fecha: fechaBusqueda,
      asignaciones,
      totales,
      cantidad: asignaciones.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener asignaciones',
      error: error.message 
    });
  }
};

// Obtener historial de movimientos
export const getMovimientosCaja = async (req, res) => {
  try {
    const { cajaId } = req.params;
    const { tipo, fechaInicio, fechaFin, trabajadorId } = req.query;
    
    const caja = await Caja.findById(cajaId)
      .populate('movimientos.responsable', 'nombre')
      .populate('movimientos.trabajador', 'nombreCompleto');
    
    if (!caja) {
      return res.status(404).json({ 
        message: 'Caja no encontrada' 
      });
    }
    
    let movimientos = caja.movimientos;
    
    // Filtrar por tipo
    if (tipo) {
      movimientos = movimientos.filter(m => m.tipo === tipo);
    }
    
    // Filtrar por trabajador
    if (trabajadorId) {
      movimientos = movimientos.filter(m => 
        m.trabajador && m.trabajador._id.toString() === trabajadorId
      );
    }
    
    // Filtrar por fechas
    if (fechaInicio || fechaFin) {
      const inicio = fechaInicio ? new Date(fechaInicio) : new Date('2000-01-01');
      const fin = fechaFin ? new Date(fechaFin) : new Date();
      
      movimientos = movimientos.filter(m => {
        const fechaMov = new Date(m.fecha);
        return fechaMov >= inicio && fechaMov <= fin;
      });
    }
    
    res.json({
      periodo: caja.periodo,
      movimientos,
      total: movimientos.length,
      balance: caja.obtenerBalance()
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener movimientos',
      error: error.message 
    });
  }
};

export const cerrarCaja = async (req, res) => {
  try {
    const { cajaId } = req.params;
    
    console.log('🔒 Iniciando cierre de caja:', { cajaId });
    
    // ⭐ BUSCAR USUARIO ADMIN REAL EN LA BASE DE DATOS (igual que en asignarDinero)
    const User = (await import('../models/User.js')).default;
    const adminUser = await User.findOne({ $or: [{ name: 'admin' }, { username: 'admin' }, { nombre: 'admin' }] }) || await User.findOne();
    
    if (!adminUser) {
      return res.status(500).json({ 
        message: 'No se encontró usuario administrador en el sistema' 
      });
    }
    
    console.log('👤 Usuario admin encontrado para cierre:', adminUser.name || adminUser.username || adminUser.nombre || 'Sin nombre', adminUser._id);
    
    // Buscar caja
    console.log('📦 Buscando caja...');
    const caja = await Caja.findById(cajaId);
    if (!caja) {
      console.log('❌ Caja no encontrada:', cajaId);
      return res.status(404).json({
        message: 'Caja no encontrada'
      });
    }
    
    console.log('✅ Caja encontrada:', {
      id: caja._id,
      status: caja.status,
      periodo: `${caja.mes}/${caja.año}`
    });
    
    // Verificar que la caja esté abierta
    if (caja.status !== 'abierta') {
      console.log('❌ Caja no está abierta:', caja.status);
      return res.status(400).json({
        message: `La caja ya está ${caja.status}`
      });
    }
    
    // Verificar asignaciones pendientes
    console.log('👥 Verificando asignaciones pendientes...');
    const asignacionesPendientes = await AsignacionDinero.countDocuments({
      caja: cajaId,
      status: { $in: ['pendiente', 'parcial'] }
    });
    
    console.log('📊 Asignaciones pendientes:', asignacionesPendientes);
    
    if (asignacionesPendientes > 0) {
      const asignacionesPendientesDetalle = await AsignacionDinero.find({
        caja: cajaId,
        status: { $in: ['pendiente', 'parcial'] }
      }).populate('trabajador', 'nombreCompleto');
      
      console.log('🔍 Detalle de asignaciones pendientes:', asignacionesPendientesDetalle.map(a => ({
        trabajador: a.trabajador?.nombreCompleto,
        status: a.status,
        fecha: a.fecha,
        id: a._id
      })));
      
      return res.status(400).json({
        message: 'Hay asignaciones pendientes de devolución',
        pendientes: asignacionesPendientes
      });
    }
    
    // Intentar cerrar caja
    console.log('🔒 Cerrando caja...');
    
    try {
      // Usar el método del modelo si existe
      if (typeof caja.cerrarCaja === 'function') {
        await caja.cerrarCaja(adminUser._id); // ⭐ USAR OBJECTID REAL DEL ADMIN
      } else {
        // Cerrar manualmente
        console.log('⚠️ Método cerrarCaja no encontrado, cerrando manualmente...');
        caja.status = 'cerrada';
        caja.fechaCierre = new Date();
        caja.cerradoPor = adminUser._id; // ⭐ USAR OBJECTID REAL DEL ADMIN
        await caja.save();
      }
      
      console.log('✅ Caja cerrada exitosamente');
      
    } catch (cerrarError) {
      console.error('❌ Error al cerrar caja:', cerrarError);
      throw cerrarError;
    }
    
    // Obtener balance final
    console.log('📊 Obteniendo balance final...');
    let balanceFinal;
    
    try {
      if (typeof caja.obtenerBalance === 'function') {
        balanceFinal = caja.obtenerBalance();
      } else {
        // Calcular balance manualmente
        console.log('⚠️ Método obtenerBalance no encontrado, calculando manualmente...');
        
        const asignaciones = await AsignacionDinero.find({ caja: cajaId });
        
        const totalAsignado = asignaciones.reduce((sum, a) => sum + a.montoAsignado, 0);
        const totalRecaudado = asignaciones.reduce((sum, a) => sum + a.montoRecaudado, 0);
        const totalDevuelto = asignaciones.reduce((sum, a) => sum + a.montoDevuelto, 0);
        
        balanceFinal = {
          montoInicial: caja.montoInicial,
          montoActual: caja.montoInicial - totalAsignado + totalDevuelto + totalRecaudado,
          montoAsignado: totalAsignado,
          montoRecaudado: totalRecaudado,
          montoDevuelto: totalDevuelto,
          montoDisponible: caja.montoInicial - totalAsignado + totalDevuelto + totalRecaudado,
          ganancia: totalRecaudado,
          porcentajeGanancia: caja.montoInicial > 0 ? ((totalRecaudado / caja.montoInicial) * 100).toFixed(2) : 0
        };
      }
      
      console.log('✅ Balance calculado:', balanceFinal);
      
    } catch (balanceError) {
      console.error('❌ Error al obtener balance:', balanceError);
      balanceFinal = null;
    }
    
    // Responder
    const response = {
      message: 'Caja cerrada exitosamente',
      caja: {
        _id: caja._id,
        status: caja.status,
        fechaCierre: caja.fechaCierre,
        periodo: `${caja.mes}/${caja.año}`
      },
      balance: balanceFinal
    };
    
    console.log('✅ Respuesta enviada:', response);
    res.json(response);
    
  } catch (error) {
    console.error('💥 Error general al cerrar caja:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    res.status(500).json({
      message: 'Error al cerrar caja',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Generar reporte mensual
export const generarReporteMensual = async (req, res) => {
  try {
    const { mes, año } = req.params;
    
    const caja = await Caja.findOne({ mes: parseInt(mes), año: parseInt(año) })
      .populate('creadoPor', 'nombre')
      .populate('cerradoPor', 'nombre');
    
    if (!caja) {
      return res.status(404).json({ 
        message: 'No se encontró caja para este período' 
      });
    }
    
    // Obtener todas las asignaciones del mes
    const asignaciones = await AsignacionDinero.find({ caja: caja._id })
      .populate('trabajador', 'nombreCompleto')
      .populate('prestamosRealizados.prestamo')
      .populate('cobrosRealizados.pago');
    
    // Obtener reportes diarios
    const reportesDiarios = await ReporteDiario.find({ caja: caja._id })
      .populate('trabajador', 'nombreCompleto');
    
    // Calcular estadísticas por trabajador
    const estadisticasTrabajadores = {};
    
    for (const asig of asignaciones) {
      const trabajadorId = asig.trabajador._id.toString();
      if (!estadisticasTrabajadores[trabajadorId]) {
        estadisticasTrabajadores[trabajadorId] = {
          trabajador: asig.trabajador.nombreCompleto,
          totalAsignado: 0,
          totalUtilizado: 0,
          totalRecaudado: 0,
          totalDevuelto: 0,
          prestamosRealizados: 0,
          cobrosRealizados: 0,
          eficiencia: 0
        };
      }
      
      const stats = estadisticasTrabajadores[trabajadorId];
      stats.totalAsignado += asig.montoAsignado;
      stats.totalUtilizado += asig.montoUtilizado;
      stats.totalRecaudado += asig.montoRecaudado;
      stats.totalDevuelto += asig.montoDevuelto;
      stats.prestamosRealizados += asig.prestamosRealizados.length;
      stats.cobrosRealizados += asig.cobrosRealizados.length;
      
      if (stats.totalUtilizado > 0) {
        stats.eficiencia = ((stats.totalRecaudado / stats.totalUtilizado) * 100).toFixed(2);
      }
    }
    
    // Resumen general
    const resumen = {
      periodo: caja.periodo,
      status: caja.status,
      montoInicial: caja.montoInicial,
      montoFinal: caja.montoActual,
      totalAsignado: caja.montoAsignado,
      totalRecaudado: caja.montoRecaudado,
      totalPrestado: caja.montoPrestado,
      gananciaBruta: caja.resumenFinanciero.gananciaBruta,
      gananciaNeta: caja.resumenFinanciero.gananciaNeta,
      totalMovimientos: caja.movimientos.length,
      totalAsignaciones: asignaciones.length,
      totalReportes: reportesDiarios.length,
      estadisticasTrabajadores: Object.values(estadisticasTrabajadores)
    };
    
    res.json({
      reporte: resumen,
      caja,
      graficos: {
        movimientosDiarios: caja.movimientos.map(m => ({
          fecha: m.fecha,
          tipo: m.tipo,
          monto: m.monto,
          balance: m.balanceNuevo
        })),
        rendimientoTrabajadores: Object.values(estadisticasTrabajadores)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al generar reporte',
      error: error.message 
    });
  }
};



// Obtener estadísticas de caja
export const getEstadisticasCaja = async (req, res) => {
  try {
    const { cajaId } = req.params;
    
    const caja = await Caja.findById(cajaId);
    if (!caja) {
      return res.status(404).json({ 
        message: 'Caja no encontrada' 
      });
    }
    
    // Obtener asignaciones de esta caja
    const asignaciones = await AsignacionDinero.find({ caja: cajaId })
      .populate('trabajador', 'nombreCompleto');
    
    // Calcular estadísticas
    const estadisticas = {
      resumenGeneral: caja.obtenerBalance(),
      totalTrabajadores: asignaciones.length,
      promedioAsignacion: asignaciones.length > 0 ? 
        asignaciones.reduce((sum, a) => sum + a.montoAsignado, 0) / asignaciones.length : 0,
      eficienciaPromedio: asignaciones.length > 0 ?
        asignaciones.reduce((sum, a) => {
          const balance = a.calcularBalance();
          return sum + balance.eficiencia;
        }, 0) / asignaciones.length : 0,
      distribucionTipos: {
        asignaciones: caja.movimientos.filter(m => m.tipo === 'asignacion').length,
        devoluciones: caja.movimientos.filter(m => m.tipo === 'devolucion').length,
        ingresos: caja.movimientos.filter(m => m.tipo === 'ingreso').length,
        egresos: caja.movimientos.filter(m => m.tipo === 'egreso').length
      }
    };
    
    res.json(estadisticas);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener estadísticas',
      error: error.message 
    });
  }
};

// Obtener historial de cajas
export const getHistorialCajas = async (req, res) => {
  try {
    const { año } = req.query;
    
    let filtros = {};
    if (año) {
      filtros.año = parseInt(año);
    }
    
    const cajas = await Caja.find(filtros)
      .populate('creadoPor', 'nombre')
      .populate('cerradoPor', 'nombre')
      .sort({ año: -1, mes: -1 });
    
    const resumen = cajas.map(caja => ({
      id: caja._id,
      periodo: caja.periodo,
      status: caja.status,
      balance: caja.obtenerBalance(),
      fechaCreacion: caja.createdAt,
      fechaCierre: caja.fechaCierre,
      creadoPor: caja.creadoPor?.nombre,
      cerradoPor: caja.cerradoPor?.nombre
    }));
    
    res.json({
      cajas: resumen,
      total: cajas.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener historial',
      error: error.message 
    });
  }
};

// Comparar períodos
export const compararPeriodos = async (req, res) => {
  try {
    const { periodo1, periodo2 } = req.body;
    
    const caja1 = await Caja.findOne({ 
      mes: periodo1.mes, 
      año: periodo1.año 
    });
    
    const caja2 = await Caja.findOne({ 
      mes: periodo2.mes, 
      año: periodo2.año 
    });
    
    if (!caja1 || !caja2) {
      return res.status(404).json({ 
        message: 'Uno o ambos períodos no encontrados' 
      });
    }
    
    const balance1 = caja1.obtenerBalance();
    const balance2 = caja2.obtenerBalance();
    
    const comparacion = {
      periodo1: {
        periodo: caja1.periodo,
        balance: balance1
      },
      periodo2: {
        periodo: caja2.periodo,
        balance: balance2
      },
      diferencias: {
        montoInicial: balance2.montoInicial - balance1.montoInicial,
        ganancia: balance2.ganancia - balance1.ganancia,
        porcentajeGanancia: balance2.porcentajeGanancia - balance1.porcentajeGanancia,
        totalMovimientos: balance2.totalMovimientos - balance1.totalMovimientos
      }
    };
    
    res.json(comparacion);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al comparar períodos',
      error: error.message 
    });
  }
};

/// IMPLEMENTAR completamente los métodos de reportes diarios
export const crearReporteDiario = async (req, res) => {
  try {
    const { 
      trabajador, 
      fecha, 
      asignacion, 
      caja,
      resumenDia,
      prestamosDelDia,
      cobrosDelDia,
      incidencias,
      metricas
    } = req.body;
    
    // Verificar si ya existe un reporte para ese día
    const fechaReporte = new Date(fecha);
    fechaReporte.setHours(0, 0, 0, 0);
    
    const reporteExistente = await ReporteDiario.findOne({
      trabajador,
      fecha: {
        $gte: fechaReporte,
        $lt: new Date(fechaReporte.getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    if (reporteExistente) {
      return res.status(400).json({ 
        message: 'Ya existe un reporte para este día' 
      });
    }
    
    const nuevoReporte = new ReporteDiario({
      trabajador,
      fecha: fechaReporte,
      asignacion,
      caja,
      resumenDia,
      prestamosDelDia,
      cobrosDelDia,
      incidencias,
      metricas,
      status: 'borrador'
    });
    
    await nuevoReporte.save();
    
    res.status(201).json({
      message: 'Reporte diario creado',
      reporte: nuevoReporte
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al crear reporte diario',
      error: error.message 
    });
  }
};


export const getReporteDiario = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fecha } = req.query;
    
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();
    fechaBusqueda.setHours(0, 0, 0, 0);
    
    const reporte = await ReporteDiario.findOne({
      trabajador: trabajadorId,
      fecha: {
        $gte: fechaBusqueda,
        $lt: new Date(fechaBusqueda.getTime() + 24 * 60 * 60 * 1000)
      }
    })
    .populate('trabajador', 'nombreCompleto')
    .populate('asignacion')
    .populate('caja', 'periodo');
    
    if (!reporte) {
      return res.status(404).json({ 
        message: 'No se encontró reporte para esta fecha' 
      });
    }
    
    res.json(reporte);
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener reporte',
      error: error.message 
    });
  }
};


export const getReportesPorDia = async (req, res) => {
  try {
    const { fecha } = req.query;
    const fechaBusqueda = fecha ? new Date(fecha) : new Date();
    
    fechaBusqueda.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaBusqueda.getTime() + 24 * 60 * 60 * 1000);
    
    const reportes = await ReporteDiario.find({
      fecha: {
        $gte: fechaBusqueda,
        $lt: finDia
      }
    })
    .populate('trabajador', 'nombreCompleto')
    .populate('caja', 'periodo')
    .sort({ createdAt: -1 });
    
    // Calcular totales del día
    const totales = reportes.reduce((acc, reporte) => ({
      totalPrestamos: acc.totalPrestamos + reporte.resumenDia.prestamosRealizados.montoTotal,
      totalCobros: acc.totalCobros + reporte.resumenDia.cobrosRealizados.montoTotal,
      cantidadPrestamos: acc.cantidadPrestamos + reporte.resumenDia.prestamosRealizados.cantidad,
      cantidadCobros: acc.cantidadCobros + reporte.resumenDia.cobrosRealizados.cantidad,
      trabajadoresActivos: acc.trabajadoresActivos + 1
    }), {
      totalPrestamos: 0,
      totalCobros: 0,
      cantidadPrestamos: 0,
      cantidadCobros: 0,
      trabajadoresActivos: 0
    });
    
    res.json({
      fecha: fechaBusqueda,
      reportes,
      totales,
      cantidad: reportes.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error al obtener reportes del día',
      error: error.message 
    });
  }
};


// ============ NUEVOS ENDPOINTS NECESARIOS ============

// 1. VALIDAR ANTES DE CREAR PRÉSTAMO
export const validarPrestamoConCaja = async (req, res) => {
  try {
    const { trabajadorId, monto } = req.body;
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);

    const asignacion = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: hoy, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] }
    }).populate('trabajador', 'nombreCompleto').populate('caja', 'periodo');

    if (!asignacion) {
      return res.json({
        valido: false,
        mensaje: 'El trabajador no tiene asignación de caja para hoy',
        accion: 'Debe asignársele dinero primero',
        trabajador: null
      });
    }

    const disponible = asignacion.montoAsignado - asignacion.montoUtilizado;
    
    res.json({
      valido: disponible >= monto,
      mensaje: disponible >= monto ? 
        'Fondos suficientes para el préstamo' : 
        'Fondos insuficientes',
      trabajador: asignacion.trabajador,
      caja: {
        periodo: asignacion.caja.periodo,
        asignado: asignacion.montoAsignado,
        utilizado: asignacion.montoUtilizado,
        disponible: disponible,
        faltante: monto > disponible ? monto - disponible : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getDashboardTrabajador = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    
    console.log('📊 Obteniendo dashboard para trabajador:', trabajadorId);
    
    // Buscar trabajador
    const trabajador = await Trabajador.findById(trabajadorId);
    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }
    
    // Obtener fecha de hoy
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);
    
    console.log('📅 Buscando asignación activa para el día:', hoy.toISOString().split('T')[0]);
    
    // ✅ SOLO BUSCAR ASIGNACIONES ACTIVAS (NO COMPLETADAS)
    let asignacionHoy = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: hoy, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] } // ✅ SOLO ACTIVAS
    })
    .populate('caja')
    .populate('trabajador')
    .sort({ createdAt: -1 }); // La más reciente primero
    
    // ❌ ELIMINAR ESTA PARTE - NO BUSCAR COMPLETADAS
    // if (!asignacionHoy) {
    //   console.log('🔍 No hay asignaciones activas, buscando la más reciente...');
    //   asignacionHoy = await AsignacionDinero.findOne({
    //     trabajador: trabajadorId,
    //     fecha: { $gte: hoy, $lte: finDia }
    //   })
    //   .populate('caja')
    //   .populate('trabajador')
    //   .sort({ createdAt: -1 });
    // }
    
    console.log('💰 Asignación activa encontrada:', asignacionHoy ? 'Sí' : 'No');
    
    if (asignacionHoy) {
      console.log('📦 Caja asociada:', asignacionHoy.caja ? asignacionHoy.caja.periodo : 'NO TIENE CAJA');
      console.log('📊 Status asignación:', asignacionHoy.status);
    }
    
    // Obtener caja actual (para casos donde no hay asignación)
    const cajaActual = await Caja.findOne({
      mes: hoy.getMonth() + 1,
      año: hoy.getFullYear(),
      status: 'abierta'
    });
    
    // ✅ SI NO HAY ASIGNACIÓN ACTIVA, RETORNAR INMEDIATAMENTE
    if (!asignacionHoy) {
      return res.json({
        tieneAsignacion: false,
        mensaje: 'El trabajador no tiene asignación de caja activa para hoy',
        trabajador: {
          _id: trabajador._id,
          nombreCompleto: trabajador.nombreCompleto
        },
        fecha: hoy.toISOString(),
        caja: cajaActual ? {
          _id: cajaActual._id,
          periodo: cajaActual.periodo,
          status: cajaActual.status
        } : null
      });
    }
    
    // Obtener actividad del día SOLO de asignación activa
    const prestamosCreados = await Prestamo.find({
      trabajadorAsignado: trabajadorId,
      fechaIngreso: { $gte: hoy, $lte: finDia }
    });
    
    const pagosRealizados = await Pago.find({
      trabajadorCobro: trabajadorId,
      fechaPago: { $gte: hoy, $lte: finDia }
    });
    
    const totalPrestamos = prestamosCreados.reduce((sum, p) => sum + p.monto, 0);
    const totalCobros = pagosRealizados.reduce((sum, p) => sum + p.montoAbonado, 0);
    
    const cajaParaMostrar = asignacionHoy.caja || cajaActual;
    
    // ✅ RESPUESTA CON DATOS DE ASIGNACIÓN ACTIVA
    const response = {
      tieneAsignacion: true,
      trabajador: {
        _id: trabajador._id,
        nombreCompleto: trabajador.nombreCompleto
      },
      fecha: hoy.toISOString(),
      
      caja: {
        _id: cajaParaMostrar._id,
        periodo: cajaParaMostrar.periodo,
        status: cajaParaMostrar.status,
        balance: {
          montoAsignado: asignacionHoy.montoAsignado,
          montoUtilizado: asignacionHoy.montoUtilizado,
          montoDisponible: asignacionHoy.montoAsignado - asignacionHoy.montoUtilizado,
          montoRecaudado: asignacionHoy.montoRecaudado,
          porcentajeUtilizado: asignacionHoy.montoAsignado > 0 ? 
            ((asignacionHoy.montoUtilizado / asignacionHoy.montoAsignado) * 100).toFixed(2) : 0
        }
      },
      
      status: {
        puedeCrearPrestamos: asignacionHoy.status !== 'completado' && 
                            (asignacionHoy.montoAsignado - asignacionHoy.montoUtilizado) > 0,
        puedeCobrar: asignacionHoy.status !== 'completado',
        requiereCierre: asignacionHoy.status === 'pendiente' || asignacionHoy.status === 'parcial'
      },
      
      actividad: {
        prestamosCreados: {
          cantidad: prestamosCreados.length,
          montoTotal: totalPrestamos
        },
        pagosCobrados: {
          cantidad: pagosRealizados.length,
          montoTotal: totalCobros
        }
      },
      
      debug: {
        asignacionId: asignacionHoy._id,
        statusAsignacion: asignacionHoy.status,
        cajaId: cajaParaMostrar._id
      }
    };
    
    console.log('✅ Dashboard generado exitosamente');
    console.log('🔍 Status asignación:', asignacionHoy.status);
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error en getDashboardTrabajador:', error);
    res.status(500).json({ 
      tieneAsignacion: false,
      mensaje: 'Error al obtener dashboard del trabajador',
      error: error.message 
    });
  }
};

export const getResumenCierreDiario = async (req, res) => {
  try {
    const { trabajadorId } = req.params;
    const { fecha } = req.query;
    
    const fechaCierre = fecha ? new Date(fecha) : new Date();
    fechaCierre.setHours(0, 0, 0, 0);
    const finDia = new Date(fechaCierre);
    finDia.setHours(23, 59, 59, 999);

    // ✅ BUSCAR SOLO ASIGNACIONES ACTIVAS
    const asignacion = await AsignacionDinero.findOne({
      trabajador: trabajadorId,
      fecha: { $gte: fechaCierre, $lte: finDia },
      status: { $in: ['pendiente', 'parcial'] } // ✅ SOLO ACTIVAS
    })
    .populate('trabajador', 'nombreCompleto')
    .sort({ createdAt: -1 }); // La más reciente

    if (!asignacion) {
      return res.status(404).json({ 
        message: 'No se encontró asignación activa para cerrar' 
      });
    }

    const balance = asignacion.calcularBalance();
    
    const montoDisponible = asignacion.montoAsignado - asignacion.montoUtilizado;
    const montoEsperado = montoDisponible + asignacion.montoRecaudado;

    res.json({
      asignacion: {
        id: asignacion._id,
        trabajador: asignacion.trabajador.nombreCompleto,
        fecha: fechaCierre,
        status: asignacion.status // ✅ AGREGAR
      },
      resumen: {
        montoAsignado: asignacion.montoAsignado,
        montoUtilizado: asignacion.montoUtilizado,
        montoDisponible: montoDisponible,
        montoRecaudado: asignacion.montoRecaudado,
        montoEsperadoDevolucion: montoEsperado,
        gananciaGenerada: asignacion.montoRecaudado,
        prestamosRealizados: balance.prestamosRealizados,
        cobrosRealizados: balance.cobrosRealizados
      },
      detalles: {
        prestamos: asignacion.prestamosRealizados,
        cobros: asignacion.cobrosRealizados
      },
      validaciones: {
        puedeCrear: asignacion.status !== 'completado',
        tieneMovimientos: balance.prestamosRealizados > 0 || balance.cobrosRealizados > 0,
        esAsignacionActiva: true // ✅ AGREGAR FLAG
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// 4. REPORTE CONSOLIDADO DE CAJA
export const getReporteConsolidadoCaja = async (req, res) => {
  try {
    const { cajaId } = req.params;
    
    const caja = await Caja.findById(cajaId).populate('creadoPor', 'nombre');
    
    if (!caja) {
      return res.status(404).json({ message: 'Caja no encontrada' });
    }

    // Obtener todas las asignaciones
    const asignaciones = await AsignacionDinero.find({ caja: cajaId })
      .populate('trabajador', 'nombreCompleto')
      .populate('prestamosRealizados.prestamo')
      .sort({ fecha: -1 });

    // Obtener todos los préstamos creados con esta caja
    const prestamos = await Prestamo.find({ 
      asignacionCaja: { $in: asignaciones.map(a => a._id) }
    }).populate('cliente', 'nombre');

    // Calcular estadísticas
    const estadisticas = {
      caja: caja.obtenerBalance(),
      asignaciones: {
        total: asignaciones.length,
        completadas: asignaciones.filter(a => a.status === 'completado').length,
        pendientes: asignaciones.filter(a => a.status !== 'completado').length,
        montoTotalAsignado: asignaciones.reduce((sum, a) => sum + a.montoAsignado, 0),
        montoTotalRecaudado: asignaciones.reduce((sum, a) => sum + a.montoRecaudado, 0)
      },
      prestamos: {
        total: prestamos.length,
        activos: prestamos.filter(p => p.status === 'activo').length,
        pagados: prestamos.filter(p => p.status === 'pagado').length,
        montoTotalPrestado: prestamos.reduce((sum, p) => sum + p.monto, 0),
        montoTotalEsperado: prestamos.reduce((sum, p) => {
          const montoTotal = p.tipoPrestamo === 'semanal' ? 
            p.monto * (1 + p.tasaInteres) : 
            p.monto * (1 + ((p.configuracionDiaria?.porcentajeInteres || 20) / 100));
          return sum + montoTotal;
        }, 0)
      }
    };

    res.json({
      caja: {
        id: caja._id,
        periodo: caja.periodo,
        status: caja.status,
        balance: caja.obtenerBalance()
      },
      estadisticas,
      asignaciones: asignaciones.map(a => ({
        ...a.toObject(),
        balance: a.calcularBalance()
      })),
      prestamos: prestamos.map(p => ({
        ...p.toObject(),
        infoCompleta: p.infoCompleta
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 5. VALIDAR ESTADO GENERAL DEL SISTEMA
export const validarEstadoSistema = async (req, res) => {
  try {
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const año = hoy.getFullYear();

    // Verificar caja del mes actual
    const cajaActual = await Caja.findOne({ mes, año });
    
    if (!cajaActual) {
      return res.json({
        sistemaOperativo: false,
        mensaje: 'No hay caja abierta para este mes',
        acciones: ['Crear caja mensual'],
        caja: null
      });
    }

    // Contar asignaciones activas hoy
    hoy.setHours(0, 0, 0, 0);
    const finDia = new Date(hoy);
    finDia.setHours(23, 59, 59, 999);

    const asignacionesHoy = await AsignacionDinero.countDocuments({
      caja: cajaActual._id,
      fecha: { $gte: hoy, $lte: finDia }
    });

    // Contar préstamos y pagos del día
    const prestamosHoy = await Prestamo.countDocuments({
      fechaIngreso: { $gte: hoy, $lte: finDia }
    });

    const pagosHoy = await Pago.countDocuments({
      'historialAbonos.fecha': { $gte: hoy, $lte: finDia }
    });

    const balance = cajaActual.obtenerBalance();

    res.json({
      sistemaOperativo: true,
      fecha: hoy,
      caja: {
        periodo: cajaActual.periodo,
        status: cajaActual.status,
        balance: balance,
        puedeOperar: balance.montoDisponible > 0
      },
      actividadHoy: {
        asignaciones: asignacionesHoy,
        prestamos: prestamosHoy,
        pagos: pagosHoy
      },
      alertas: [
        ...(balance.montoDisponible < 1000 ? ['Fondos disponibles bajos'] : []),
        ...(asignacionesHoy === 0 ? ['Sin asignaciones de trabajadores hoy'] : []),
        ...(cajaActual.status !== 'abierta' ? ['Caja no está en estado abierto'] : [])
      ]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};