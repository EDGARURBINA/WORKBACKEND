import mongoose from 'mongoose';
import Moratorio from '../models/Moratorio.js';
import Pago from '../models/Pago.js';
import Prestamo from '../models/Prestamo.js';
import Cliente from '../models/Cliente.js';

// Obtener todos los pagos con moratorios pendientes para revisión del admin
export const getPagosPendientesMoratorio = async (req, res) => {
  try {
    const hoy = new Date();
    
    // Buscar pagos vencidos no pagados
    const pagosVencidos = await Pago.find({
      pagado: false,
      fechaVencimiento: { $lt: hoy }
    })
    .populate({
      path: 'prestamo',
      populate: {
        path: 'cliente',
        select: 'nombre telefono direccion status'
      }
    })
    .populate('trabajadorCobro', 'nombreCompleto')
    .sort({ fechaVencimiento: 1 });

    // Calcular información de moratorio para cada pago
    const pagosConMoratorio = await Promise.all(
      pagosVencidos.map(async (pago) => {
        const diasAtraso = Math.floor((hoy - pago.fechaVencimiento) / (1000 * 60 * 60 * 24));
        
        // Buscar si ya existe un moratorio para este pago
        const moratorioExistente = await Moratorio.findOne({ 
          pago: pago._id,
          activo: true 
        }).populate('adminAcciones.usuario', 'nombreCompleto');

        const montoMoratorioCalculado = (pago.prestamo.monto * 0.5) / 100 * diasAtraso;

        return {
          _id: pago._id,
          numeroPago: pago.numeroPago,
          monto: pago.monto,
          montoAbonado: pago.montoAbonado || 0,
          saldoPendiente: pago.saldoPendiente,
          fechaVencimiento: pago.fechaVencimiento,
          diasAtraso,
          cliente: pago.prestamo.cliente,
          prestamo: {
            _id: pago.prestamo._id,
            numeroContrato: pago.prestamo.numeroContrato,
            monto: pago.prestamo.monto
          },
          moratorio: {
            existe: !!moratorioExistente,
            _id: moratorioExistente?._id,
            diasRegistrados: moratorioExistente?.dias || 0,
            montoRegistrado: moratorioExistente?.monto || 0,
            montoCalculado: montoMoratorioCalculado,
            activo: moratorioExistente?.activo || false,
            adminAcciones: moratorioExistente?.adminAcciones || null
          },
          trabajadorCobro: pago.trabajadorCobro
        };
      })
    );

    res.json(pagosConMoratorio);
  } catch (error) {
    console.error('Error al obtener pagos pendientes de moratorio:', error);
    res.status(500).json({ message: error.message });
  }
};

// Aplicar moratorio manualmente a un pago
export const aplicarMoratorio = async (req, res) => {
  try {
    const { pagoId, dias, porcentaje, monto, usuarioId } = req.body;

    // Validaciones
    if (!pagoId || !dias || (!porcentaje && !monto) || !usuarioId) {
      return res.status(400).json({ 
        message: 'Pago ID, días, porcentaje/monto y usuario son requeridos' 
      });
    }

    const pago = await Pago.findById(pagoId).populate('prestamo');
    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    if (pago.pagado) {
      return res.status(400).json({ message: 'No se puede aplicar moratorio a un pago ya completado' });
    }

    // Verificar si ya existe un moratorio activo
    const moratorioExistente = await Moratorio.findOne({ 
      pago: pagoId, 
      activo: true 
    });

    if (moratorioExistente) {
      return res.status(400).json({ 
        message: 'Ya existe un moratorio activo para este pago' 
      });
    }

    // Calcular monto del moratorio si no se proporciona
    let montoMoratorio = monto;
    if (!montoMoratorio) {
      montoMoratorio = (pago.prestamo.monto * (porcentaje || 50)) / 100 * dias;
    }

    // Crear nuevo moratorio
    const nuevoMoratorio = new Moratorio({
      pago: pagoId,
      prestamo: pago.prestamo._id,
      dias,
      porcentaje: porcentaje || 50,
      monto: montoMoratorio,
      activo: true,
      adminAcciones: {
        subirCargo: true,
        usuario: usuarioId,
        fecha: new Date()
      }
    });

    await nuevoMoratorio.save();

    // Actualizar el pago con la información del moratorio
    await Pago.findByIdAndUpdate(pagoId, {
      diasMoratorio: dias,
      montoMoratorio: montoMoratorio
    });

    // Obtener el moratorio completo con población
    const moratorioCompleto = await Moratorio.findById(nuevoMoratorio._id)
      .populate('pago')
      .populate('prestamo', 'numeroContrato')
      .populate('adminAcciones.usuario', 'nombreCompleto');

    res.status(201).json({
      message: 'Moratorio aplicado correctamente',
      moratorio: moratorioCompleto
    });
  } catch (error) {
    console.error('Error al aplicar moratorio:', error);
    res.status(400).json({ message: error.message });
  }
};

// Quitar/desactivar moratorio
export const quitarMoratorio = async (req, res) => {
  try {
    const { moratorioId, usuarioId, motivo } = req.body;

    if (!moratorioId || !usuarioId) {
      return res.status(400).json({ 
        message: 'Moratorio ID y usuario son requeridos' 
      });
    }

    const moratorio = await Moratorio.findById(moratorioId);
    if (!moratorio) {
      return res.status(404).json({ message: 'Moratorio no encontrado' });
    }

    // Desactivar moratorio
    moratorio.activo = false;
    moratorio.adminAcciones = {
      noCobra: true,
      usuario: usuarioId,
      fecha: new Date()
    };

    await moratorio.save();

    // Limpiar información de moratorio del pago
    await Pago.findByIdAndUpdate(moratorio.pago, {
      diasMoratorio: 0,
      montoMoratorio: 0
    });

    res.json({
      message: 'Moratorio removido correctamente',
      moratorio
    });
  } catch (error) {
    console.error('Error al quitar moratorio:', error);
    res.status(400).json({ message: error.message });
  }
};

// Modificar monto del moratorio
export const modificarMontoMoratorio = async (req, res) => {
  try {
    const { moratorioId, nuevoMonto, usuarioId, accion } = req.body;

    if (!moratorioId || !nuevoMonto || !usuarioId || !accion) {
      return res.status(400).json({ 
        message: 'Moratorio ID, nuevo monto, usuario y acción son requeridos' 
      });
    }

    const moratorio = await Moratorio.findById(moratorioId);
    if (!moratorio) {
      return res.status(404).json({ message: 'Moratorio no encontrado' });
    }

    if (!moratorio.activo) {
      return res.status(400).json({ message: 'No se puede modificar un moratorio inactivo' });
    }

    const montoAnterior = moratorio.monto;
    moratorio.monto = nuevoMonto;

    // Actualizar acciones del admin
    if (accion === 'subir') {
      moratorio.adminAcciones.subirCargo = true;
      moratorio.adminAcciones.bajarCargo = false;
    } else if (accion === 'bajar') {
      moratorio.adminAcciones.bajarCargo = true;
      moratorio.adminAcciones.subirCargo = false;
    }

    moratorio.adminAcciones.usuario = usuarioId;
    moratorio.adminAcciones.fecha = new Date();

    await moratorio.save();

    // Actualizar el pago correspondiente
    await Pago.findByIdAndUpdate(moratorio.pago, {
      montoMoratorio: nuevoMonto
    });

    res.json({
      message: `Moratorio ${accion === 'subir' ? 'incrementado' : 'reducido'} correctamente`,
      montoAnterior,
      montoNuevo: nuevoMonto,
      moratorio
    });
  } catch (error) {
    console.error('Error al modificar moratorio:', error);
    res.status(400).json({ message: error.message });
  }
};

// Obtener historial de moratorios de un cliente
export const getHistorialMoratoriosCliente = async (req, res) => {
  try {
    const { clienteId } = req.params;

    // Obtener todos los préstamos del cliente
    const prestamos = await Prestamo.find({ cliente: clienteId });
    const prestamoIds = prestamos.map(p => p._id);

    // Obtener todos los moratorios de los préstamos del cliente
    const moratorios = await Moratorio.find({ 
      prestamo: { $in: prestamoIds } 
    })
    .populate('pago', 'numeroPago fechaVencimiento monto')
    .populate('prestamo', 'numeroContrato monto')
    .populate('adminAcciones.usuario', 'nombreCompleto')
    .sort({ createdAt: -1 });

    const cliente = await Cliente.findById(clienteId, 'nombre telefono');

    res.json({
      cliente,
      totalMoratorios: moratorios.length,
      moratoriosActivos: moratorios.filter(m => m.activo).length,
      moratorios
    });
  } catch (error) {
    console.error('Error al obtener historial de moratorios:', error);
    res.status(500).json({ message: error.message });
  }
};

// Obtener estadísticas generales de moratorios
export const getEstadisticasMoratorios = async (req, res) => {
  try {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    // Estadísticas generales
    const totalMoratorios = await Moratorio.countDocuments({ activo: true });
    const moratoriosEsteMes = await Moratorio.countDocuments({ 
      activo: true,
      createdAt: { $gte: inicioMes }
    });

    // Monto total de moratorios activos
    const moratoriosActivos = await Moratorio.find({ activo: true });
    const montoTotalMoratorios = moratoriosActivos.reduce((total, m) => total + m.monto, 0);

    // Moratorios por acciones del admin
    const moratoriosQuiteados = await Moratorio.countDocuments({ 
      'adminAcciones.noCobra': true 
    });
    const moratoriosModificados = await Moratorio.countDocuments({ 
      $or: [
        { 'adminAcciones.subirCargo': true },
        { 'adminAcciones.bajarCargo': true }
      ]
    });

    // Pagos vencidos sin moratorio aplicado
    const pagosVencidosSinMoratorio = await Pago.countDocuments({
      pagado: false,
      fechaVencimiento: { $lt: hoy },
      diasMoratorio: { $in: [null, 0] }
    });

    res.json({
      resumen: {
        totalMoratoriosActivos: totalMoratorios,
        moratoriosEsteMes,
        montoTotalMoratorios,
        moratoriosQuiteados,
        moratoriosModificados,
        pagosVencidosSinMoratorio
      },
      fechaConsulta: hoy
    });
  } catch (error) {
    console.error('Error al obtener estadísticas de moratorios:', error);
    res.status(500).json({ message: error.message });
  }
};

// Obtener moratorio específico
export const getMoratorioById = async (req, res) => {
  try {
    const { id } = req.params;

    const moratorio = await Moratorio.findById(id)
      .populate('pago')
      .populate('prestamo', 'numeroContrato monto')
      .populate({
        path: 'prestamo',
        populate: {
          path: 'cliente',
          select: 'nombre telefono'
        }
      })
      .populate('adminAcciones.usuario', 'nombreCompleto');

    if (!moratorio) {
      return res.status(404).json({ message: 'Moratorio no encontrado' });
    }

    res.json(moratorio);
  } catch (error) {
    console.error('Error al obtener moratorio:', error);
    res.status(500).json({ message: error.message });
  }
};