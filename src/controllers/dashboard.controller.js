import Cliente from '../models/Cliente.js';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import Trabajador from '../models/Trabajador.js';

// Obtener estadísticas generales del dashboard
export const getEstadisticas = async (req, res) => {
  try {
    const hoy = new Date();
    const inicioHoy = new Date(hoy.setHours(0, 0, 0, 0));
    const finHoy = new Date(hoy.setHours(23, 59, 59, 999));

    // Parallelizar todas las consultas para mejor rendimiento
    const [
      totalClientes,
      clientesActivos,
      totalPrestamos,
      prestamosActivos,
      prestamosCompletados,
      totalTrabajadores,
      pagosPendientesHoy,
      pagosVencidos,
      pagosParciales,
      pagosCompletadosHoy,
      ultimosPrestamos
    ] = await Promise.all([
      // Clientes
      Cliente.countDocuments(),
      Cliente.countDocuments({ status: 'activo' }),

      // Préstamos
      Prestamo.countDocuments(),
      Prestamo.countDocuments({ status: 'activo' }),
      Prestamo.countDocuments({ status: 'pagado' }),

      // Trabajadores
      Trabajador.countDocuments(),

      // Pagos pendientes hoy
      Pago.countDocuments({
        fechaVencimiento: { $gte: inicioHoy, $lte: finHoy },
        pagado: false
      }),

      // Pagos vencidos (antes de hoy y no pagados)
      Pago.countDocuments({
        fechaVencimiento: { $lt: inicioHoy },
        pagado: false
      }),

      // Pagos parciales
      Pago.countDocuments({
        $or: [
          { estadoPago: 'parcial' },
          { $and: [{ montoAbonado: { $gt: 0 } }, { pagado: false }] }
        ]
      }),

      // Pagos completados hoy
      Pago.countDocuments({
        fechaPago: { $gte: inicioHoy, $lte: finHoy },
        pagado: true
      }),

      // ✅ CORREGIDO: Últimos 5 préstamos incluyendo status del cliente
      Prestamo.find()
        .populate('cliente', 'nombre telefono status') // ✅ Agregado 'status'
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    // Calcular clientes morosos (con pagos vencidos)
    const clientesMorosos = await Pago.aggregate([
      {
        $match: {
          fechaVencimiento: { $lt: inicioHoy },
          pagado: false
        }
      },
      {
        $lookup: {
          from: 'prestamos',
          localField: 'prestamo',
          foreignField: '_id',
          as: 'prestamo'
        }
      },
      {
        $unwind: '$prestamo'
      },
      {
        $group: {
          _id: '$prestamo.cliente'
        }
      },
      {
        $count: 'total'
      }
    ]);

    // Calcular montos
    const [montosResult] = await Pago.aggregate([
      {
        $facet: {
          pendientes: [
            {
              $match: {
                pagado: false
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$monto' },
                totalAbonado: { $sum: { $ifNull: ['$montoAbonado', 0] } },
                totalMoratorio: { $sum: { $ifNull: ['$montoMoratorio', 0] } }
              }
            }
          ],
          cobradoHoy: [
            {
              $match: {
                fechaPago: { $gte: inicioHoy, $lte: finHoy },
                pagado: true
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$monto' }
              }
            }
          ]
        }
      }
    ]);

    const montoPendiente = montosResult.pendientes[0] ? 
      (montosResult.pendientes[0].total - montosResult.pendientes[0].totalAbonado + montosResult.pendientes[0].totalMoratorio) : 0;
    
    const montoCobradoHoy = montosResult.cobradoHoy[0] ? montosResult.cobradoHoy[0].total : 0;

    // ✅ CORREGIDO: Formatear últimos préstamos incluyendo status
    const prestamosFormateados = ultimosPrestamos.map(prestamo => ({
      _id: prestamo._id,
      numeroContrato: prestamo.numeroContrato,
      cliente: prestamo.cliente.nombre,
      telefono: prestamo.cliente.telefono,
      clienteStatus: prestamo.cliente.status || 'activo', // ✅ Agregado status del cliente
      monto: prestamo.monto,
      fechaIngreso: prestamo.fechaIngreso,
      status: prestamo.status
    }));

    const estadisticas = {
      // Estadísticas principales
      totalClientes,
      clientesActivos,
      clientesMorosos: clientesMorosos[0]?.total || 0,
      
      totalPrestamos,
      prestamosActivos,
      prestamosCompletados,
      
      totalTrabajadores,
      
      // Pagos
      pagosPendientesHoy,
      pagosVencidos,
      pagosParciales,
      pagosCompletadosHoy,
      
      // Montos
      montoPendiente,
      montoCobradoHoy,
      
      // Datos adicionales
      ultimosPrestamos: prestamosFormateados,
      
      // Resumen rápido
      resumen: {
        alertas: pagosVencidos + (clientesMorosos[0]?.total || 0),
        actividad: pagosPendientesHoy + pagosCompletadosHoy,
        rendimiento: prestamosActivos > 0 ? Math.round((prestamosCompletados / totalPrestamos) * 100) : 0
      }
    };

    res.json(estadisticas);
  } catch (error) {
    console.error('Error al obtener estadísticas:', error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ CORREGIDO: Obtener actividad reciente incluyendo status del cliente
export const getActividadReciente = async (req, res) => {
  try {
    const hoy = new Date();
    const inicioSemana = new Date(hoy.getTime() - (7 * 24 * 60 * 60 * 1000));

    const [pagosRecientes, prestamosRecientes, clientesRecientes] = await Promise.all([
      // Últimos 10 pagos registrados
      Pago.find({ 
        fechaPago: { $gte: inicioSemana },
        pagado: true 
      })
        .populate({
          path: 'prestamo',
          populate: {
            path: 'cliente',
            select: 'nombre telefono status' // ✅ Agregado 'status'
          }
        })
        .populate('trabajadorCobro', 'nombreCompleto')
        .sort({ fechaPago: -1 })
        .limit(10),

      // Últimos 5 préstamos
      Prestamo.find({ fechaIngreso: { $gte: inicioSemana } })
        .populate('cliente', 'nombre telefono status') // ✅ Agregado 'status'
        .sort({ fechaIngreso: -1 })
        .limit(5),

      // Últimos 5 clientes registrados
      Cliente.find({ createdAt: { $gte: inicioSemana } })
        .populate('trabajadorAsignado', 'nombreCompleto')
        .sort({ createdAt: -1 })
        .limit(5)
    ]);

    res.json({
      pagosRecientes,
      prestamosRecientes,
      clientesRecientes
    });
  } catch (error) {
    console.error('Error al obtener actividad reciente:', error);
    res.status(500).json({ message: error.message });
  }
};