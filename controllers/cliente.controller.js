import mongoose from 'mongoose';
import Cliente from '../models/Cliente.js';
import Aval from '../models/Aval.js';
import Trabajador from '../models/Trabajador.js';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';

// NUEVO: Actualizar solo el status del cliente
export const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validar que el ID sea válido
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID de cliente inválido' });
    }

    // Validar que el status sea válido según el modelo
    const statusValidos = ['activo', 'moroso', 'bloqueado', 'renovacion'];
    if (!status || !statusValidos.includes(status)) {
      return res.status(400).json({ 
        message: `Status inválido. Debe ser uno de: ${statusValidos.join(', ')}` 
      });
    }

    // Buscar y actualizar el cliente
    const cliente = await Cliente.findByIdAndUpdate(
      id,
      { 
        status,
        updatedAt: new Date() // Actualizar fecha de modificación
      },
      { 
        new: true, // Devolver el documento actualizado
        runValidators: true // Ejecutar validaciones del modelo
      }
    )
    .populate('aval', 'nombre telefono')
    .populate('trabajadorAsignado', 'nombreCompleto');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    console.log(`✅ Status del cliente ${cliente.nombre} actualizado a: ${status}`);

    // Respuesta exitosa
    res.json({
      success: true,
      message: `Status del cliente actualizado a ${status}`,
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        status: cliente.status,
        updatedAt: cliente.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error al actualizar status del cliente:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
};

// Obtener todos los clientes
export const getClientes = async (req, res) => {
  try {
    const clientes = await Cliente.find()
      .populate('aval', 'nombre telefono')
      .populate('trabajadorAsignado', 'nombreCompleto')
      .sort({ createdAt: -1 });

    res.json(clientes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener cliente por ID
export const getClienteById = async (req, res) => {
  try {
    const cliente = await Cliente.findById(req.params.id)
      .populate('aval')
      .populate('trabajadorAsignado');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(cliente);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// NUEVO: Obtener historial completo del cliente
export const getHistorialCliente = async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener información básica del cliente
    const cliente = await Cliente.findById(id)
      .populate('aval', 'nombre telefono direccion')
      .populate('trabajadorAsignado', 'nombreCompleto telefono');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Obtener todos los préstamos del cliente
    const prestamos = await Prestamo.find({ cliente: id })
      .sort({ createdAt: -1 });

    // Obtener todos los pagos de todos los préstamos del cliente
    const prestamoIds = prestamos.map(p => p._id);
    const todosPagos = await Pago.find({ prestamo: { $in: prestamoIds } })
      .populate('trabajadorCobro', 'nombreCompleto')
      .populate('historialAbonos.trabajador', 'nombreCompleto')
      .sort({ fechaVencimiento: 1 });

    // Crear historial detallado por préstamo
    const historialPrestamos = await Promise.all(
      prestamos.map(async (prestamo) => {
        // Pagos de este préstamo específico
        const pagosPrestamo = todosPagos.filter(pago => 
          pago.prestamo.toString() === prestamo._id.toString()
        );

        // Calcular estadísticas del préstamo
        const totalPagos = pagosPrestamo.length;
        const pagosCompletos = pagosPrestamo.filter(p => p.pagado).length;
        const pagosParciales = pagosPrestamo.filter(p => p.estadoPago === 'parcial').length;
        const pagosPendientes = pagosPrestamo.filter(p => !p.pagado && p.estadoPago !== 'parcial').length;
        const pagosVencidos = pagosPrestamo.filter(p => {
          return !p.pagado && new Date() > new Date(p.fechaVencimiento);
        }).length;

        // Calcular montos
        const montoTotalAbonado = pagosPrestamo.reduce((total, pago) => {
          return total + (pago.montoAbonado || 0);
        }, 0);

        const montoTotalPrestamo = prestamo.montoSemanal * prestamo.plazo;
        const saldoPendienteTotal = pagosPrestamo.reduce((total, pago) => {
          return total + (pago.saldoPendiente || 0);
        }, 0);

        const progreso = totalPagos > 0 ? (pagosCompletos / totalPagos) * 100 : 0;

        // Calcular moratorios
        let totalMoratorios = 0;
        pagosPrestamo.forEach(pago => {
          if (!pago.pagado && new Date() > new Date(pago.fechaVencimiento)) {
            const diasAtraso = Math.floor(
              (new Date() - new Date(pago.fechaVencimiento)) / (1000 * 60 * 60 * 24)
            );
            const moratorio = (prestamo.monto * 0.5) / 100 * diasAtraso;
            totalMoratorios += moratorio;
          }
          if (pago.montoMoratorio) {
            totalMoratorios += pago.montoMoratorio;
          }
        });

        return {
          prestamo: {
            _id: prestamo._id,
            numeroContrato: prestamo.numeroContrato,
            monto: prestamo.monto,
            plazo: prestamo.plazo,
            montoSemanal: prestamo.montoSemanal,
            fechaIngreso: prestamo.fechaIngreso,
            fechaTermino: prestamo.fechaTermino,
            status: prestamo.status,
            tasaInteres: prestamo.tasaInteres,
            puedeRenovar: prestamo.puedeRenovar
          },
          estadisticas: {
            totalPagos,
            pagosCompletos,
            pagosParciales,
            pagosPendientes,
            pagosVencidos,
            progreso: Math.round(progreso * 100) / 100,
            montoTotalPrestamo,
            montoTotalAbonado,
            saldoPendienteTotal,
            totalMoratorios
          },
          pagos: pagosPrestamo.map(pago => ({
            _id: pago._id,
            numeroPago: pago.numeroPago,
            monto: pago.monto,
            montoAbonado: pago.montoAbonado || 0,
            saldoPendiente: pago.saldoPendiente || pago.monto,
            estadoPago: pago.estadoPago || (pago.pagado ? 'completo' : 'pendiente'),
            fechaVencimiento: pago.fechaVencimiento,
            fechaPago: pago.fechaPago,
            pagado: pago.pagado,
            diasMoratorio: pago.diasMoratorio || 0,
            montoMoratorio: pago.montoMoratorio || 0,
            trabajadorCobro: pago.trabajadorCobro,
            observaciones: pago.observaciones,
            historialAbonos: pago.historialAbonos || []
          }))
        };
      })
    );

    // Calcular estadísticas generales del cliente
    const estadisticasGenerales = {
      totalPrestamos: prestamos.length,
      prestamosActivos: prestamos.filter(p => p.status === 'activo').length,
      prestamosPagados: prestamos.filter(p => p.status === 'pagado').length,
      prestamosRenovados: prestamos.filter(p => p.status === 'renovado').length,
      totalPagosRealizados: todosPagos.filter(p => p.pagado).length,
      totalPagosPendientes: todosPagos.filter(p => !p.pagado).length,
      totalAbonado: todosPagos.reduce((total, pago) => total + (pago.montoAbonado || 0), 0),
      totalSaldoPendiente: todosPagos.reduce((total, pago) => total + (pago.saldoPendiente || 0), 0),
      totalMoratorios: historialPrestamos.reduce((total, hist) => total + hist.estadisticas.totalMoratorios, 0)
    };

    // Respuesta completa
    const historialCompleto = {
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        direccion: cliente.direccion,
        email: cliente.email,
        lineaCredito: cliente.lineaCredito,
        status: cliente.status,
        createdAt: cliente.createdAt,
        aval: cliente.aval,
        trabajadorAsignado: cliente.trabajadorAsignado
      },
      estadisticasGenerales,
      historialPrestamos: historialPrestamos.sort((a, b) => 
        new Date(b.prestamo.fechaIngreso) - new Date(a.prestamo.fechaIngreso)
      )
    };

    res.json(historialCompleto);
  } catch (error) {
    console.error('Error al obtener historial del cliente:', error);
    res.status(500).json({ message: error.message });
  }
};

// NUEVO: Buscar clientes (por nombre, teléfono, o ID)
export const buscarClientes = async (req, res) => {
  try {
    const { q } = req.query; // query de búsqueda
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ message: 'Término de búsqueda requerido' });
    }

    const searchRegex = new RegExp(q.trim(), 'i'); // búsqueda insensible a mayúsculas

    // Buscar por múltiples campos
    const clientes = await Cliente.find({
      $or: [
        { nombre: searchRegex },
        { telefono: searchRegex },
        { email: searchRegex },
        { _id: mongoose.Types.ObjectId.isValid(q) ? q : null } // buscar por ID si es válido
      ].filter(Boolean) // filtrar elementos null
    })
    .populate('aval', 'nombre telefono')
    .populate('trabajadorAsignado', 'nombreCompleto')
    .limit(20) // limitar resultados
    .sort({ nombre: 1 });

    // Agregar información adicional de cada cliente
    const clientesConInfo = await Promise.all(
      clientes.map(async (cliente) => {
        const totalPrestamos = await Prestamo.countDocuments({ cliente: cliente._id });
        const prestamosActivos = await Prestamo.countDocuments({ 
          cliente: cliente._id, 
          status: 'activo' 
        });

        return {
          ...cliente.toObject(),
          totalPrestamos,
          prestamosActivos
        };
      })
    );

    res.json(clientesConInfo);
  } catch (error) {
    console.error('Error en búsqueda de clientes:', error);
    res.status(500).json({ message: error.message });
  }
};

// NUEVO: Obtener resumen rápido del cliente
export const getResumenCliente = async (req, res) => {
  try {
    const { id } = req.params;

    const cliente = await Cliente.findById(id)
      .populate('trabajadorAsignado', 'nombreCompleto');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Contar préstamos
    const totalPrestamos = await Prestamo.countDocuments({ cliente: id });
    const prestamosActivos = await Prestamo.countDocuments({ 
      cliente: id, 
      status: 'activo' 
    });

    // Contar pagos pendientes
    const prestamos = await Prestamo.find({ cliente: id });
    const prestamoIds = prestamos.map(p => p._id);
    const pagosPendientes = await Pago.countDocuments({
      prestamo: { $in: prestamoIds },
      pagado: false
    });

    const resumen = {
      cliente: {
        _id: cliente._id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        status: cliente.status,
        trabajadorAsignado: cliente.trabajadorAsignado
      },
      resumen: {
        totalPrestamos,
        prestamosActivos,
        pagosPendientes
      }
    };

    res.json(resumen);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Métodos existentes (mantener)

// Crear nuevo cliente con aval
export const createCliente = async (req, res) => {
  try {
    const { cliente, aval } = req.body;

    // Validaciones básicas
    if (!cliente.nombre || !cliente.telefono || !cliente.direccion) {
      return res.status(400).json({ 
        message: 'Nombre, teléfono y dirección del cliente son requeridos' 
      });
    }

    if (!aval.nombre || !aval.telefono || !aval.direccion) {
      return res.status(400).json({ 
        message: 'Nombre, teléfono y dirección del aval son requeridos' 
      });
    }

    // Crear el aval primero (sin referencias)
    const nuevoAval = new Aval({
      nombre: aval.nombre,
      direccion: aval.direccion,
      telefono: aval.telefono,
      tipo: aval.tipo || 'personal'
    });
    
    await nuevoAval.save();

    // Crear el cliente con el aval
    const nuevoCliente = new Cliente({
      ...cliente,
      aval: nuevoAval._id
    });

    await nuevoCliente.save();

    // Devolver cliente completo con aval poblado
    const clienteCompleto = await Cliente.findById(nuevoCliente._id)
      .populate('aval')
      .populate('trabajadorAsignado', 'nombreCompleto telefono');

    res.status(201).json(clienteCompleto);
  } catch (error) {
    console.error('Error al crear cliente:', error);
    res.status(400).json({ message: error.message });
  }
};


export const updateCliente = async (req, res) => {
  try {
    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate('aval').populate('trabajadorAsignado');

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    res.json(cliente);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteCliente = async (req, res) => {
  try {
    const clienteId = req.params.id;

    // 1. Verificar que el cliente existe
    const cliente = await Cliente.findById(clienteId).populate('aval');
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    console.log(`🗑️ Iniciando eliminación en cascada del cliente: ${cliente.nombre}`);

    // 2. Buscar todos los préstamos del cliente
    const prestamos = await Prestamo.find({ cliente: clienteId });
    console.log(`📋 Encontrados ${prestamos.length} préstamos del cliente`);

    if (prestamos.length > 0) {
      const prestamoIds = prestamos.map(p => p._id);

    
      const pagosEliminados = await Pago.deleteMany({ 
        prestamo: { $in: prestamoIds } 
      });
      console.log(`💳 Eliminados ${pagosEliminados.deletedCount} pagos`);

      // 4. Eliminar todos los préstamos del cliente
      const prestamosEliminados = await Prestamo.deleteMany({ 
        cliente: clienteId 
      });
      console.log(`🏦 Eliminados ${prestamosEliminados.deletedCount} préstamos`);
    }

    // 5. Eliminar el aval del cliente (si existe)
    if (cliente.aval) {
      await Aval.findByIdAndDelete(cliente.aval._id);
      console.log(`🤝 Eliminado aval: ${cliente.aval.nombre}`);
    }

    // 6. Finalmente eliminar el cliente
    await Cliente.findByIdAndDelete(clienteId);

    console.log(`✅ Cliente eliminado completamente: ${cliente.nombre}`);

    res.json({ 
      message: 'Cliente eliminado correctamente',
      detalles: {
        cliente: cliente.nombre,
        prestamosEliminados: prestamos.length,
        pagosEliminados: prestamos.length > 0 ? 
          (await Pago.countDocuments({ prestamo: { $in: prestamos.map(p => p._id) } })) : 0,
        avalEliminado: !!cliente.aval
      }
    });
  } catch (error) {
    console.error('❌ Error al eliminar cliente:', error);
    res.status(500).json({ message: error.message });
  }
};

export const asignarTrabajador = async (req, res) => {
  try {
    const { trabajadorId } = req.body;

    const cliente = await Cliente.findByIdAndUpdate(
      req.params.id,
      { trabajadorAsignado: trabajadorId },
      { new: true }
    ).populate('trabajadorAsignado');

    res.json(cliente);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}; 