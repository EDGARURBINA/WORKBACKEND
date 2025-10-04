import Caja from '../models/Caja.js';
import AsignacionDinero from '../models/AsignacionDinero.js';
import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';

// Validar estado general del sistema
export const validarEstadoSistema = async (req, res) => {
  try {
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const año = hoy.getFullYear();

    console.log(`🔍 Validando estado del sistema para ${mes}/${año}`);

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

    console.log(`✅ Sistema validado - Caja: ${cajaActual.periodo}, Balance: $${balance.montoDisponible}`);

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
    console.error('💥 Error validando estado del sistema:', error);
    res.status(500).json({ 
      sistemaOperativo: false,
      mensaje: 'Error interno del servidor',
      error: error.message 
    });
  }
};