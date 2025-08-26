import { Router } from 'express';
import {
  registrarPago,
  getPagosPendientes,
  getPagos,
  registrarAbono,
  getHistorialAbonos
} from '../controllers/pago.controller.js';
import Pago from '../models/Pago.js';

const router = Router();

router.get('/', getPagos);
router.get('/pendientes', getPagosPendientes);
router.post('/registrar', registrarPago);
router.post('/abono', registrarAbono);
router.get('/:pagoId/historial', getHistorialAbonos);

// ✅ NUEVA RUTA: Obtener pagos por préstamo (necesaria para vista previa)
router.get('/prestamo/:prestamoId', async (req, res) => {
  try {
    const { prestamoId } = req.params;
    
    console.log(`🔍 Obteniendo pagos para préstamo: ${prestamoId}`);
    
    const pagos = await Pago.find({ prestamo: prestamoId })
      .sort({ numeroPago: 1 })
      .populate('trabajadorCobro', 'nombreCompleto');
    
    console.log(`✅ Encontrados ${pagos.length} pagos para el préstamo`);
    
    res.json(pagos);
  } catch (error) {
    console.error('❌ Error al obtener pagos del préstamo:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;