import express from 'express';
import {
  generarTarjetaPagoPDF,
  getTarjetaPago,
  marcarComoImpresa
} from '../controllers/tarjetaPago.controller.js';

const router = express.Router();

// Generar y descargar tarjeta de pagos en PDF
router.get('/generar-pdf/:prestamoId', generarTarjetaPagoPDF);

// Obtener información de tarjeta de pago
router.get('/:prestamoId', getTarjetaPago);

// Marcar tarjeta como impresa
router.put('/marcar-impresa/:tarjetaId', marcarComoImpresa);

export default router;