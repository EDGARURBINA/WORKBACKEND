import express from 'express';
import {
  getPagosPendientesMoratorio,
  aplicarMoratorio,
  quitarMoratorio,
  modificarMontoMoratorio,
  getHistorialMoratoriosCliente,
  getEstadisticasMoratorios,
  getMoratorioById
} from "../controllers/moratorio.controller.js"

const router = express.Router();

// Rutas principales para gestión de moratorios

// GET /api/moratorios/pendientes - Obtener pagos pendientes de revisión de moratorio
router.get('/pendientes', getPagosPendientesMoratorio);

// GET /api/moratorios/estadisticas - Obtener estadísticas generales de moratorios
router.get('/estadisticas', getEstadisticasMoratorios);

// GET /api/moratorios/cliente/:clienteId - Obtener historial de moratorios de un cliente
router.get('/cliente/:clienteId', getHistorialMoratoriosCliente);

// GET /api/moratorios/:id - Obtener moratorio específico por ID
router.get('/:id', getMoratorioById);

// POST /api/moratorios/aplicar - Aplicar moratorio manualmente a un pago
router.post('/aplicar', aplicarMoratorio);

// PUT /api/moratorios/quitar - Quitar/desactivar un moratorio
router.put('/quitar', quitarMoratorio);

// PUT /api/moratorios/modificar - Modificar monto de un moratorio existente
router.put('/modificar', modificarMontoMoratorio);

export default router;