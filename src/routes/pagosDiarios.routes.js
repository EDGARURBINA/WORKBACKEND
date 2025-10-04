import { Router } from 'express';
import {
  obtenerRutaCobranza,
  procesarPagoDiario,
  obtenerResumenDiario,
  obtenerPagosDelDia,
  obtenerCalendario,
  obtenerPagosVencidos,
  registrarAbonoParcial,
  obtenerHistorialAbonos,
  generarReporteProductividad
} from '../controllers/pagosDiarios.controller.js';

const router = Router();

// ==========================================
// RUTAS PARA GESTIÓN DIARIA DE PAGOS
// ==========================================

// Obtener ruta de cobranza por trabajador
router.get('/ruta-cobranza/:trabajadorId', obtenerRutaCobranza);

// Procesar pago diario completo
router.post('/procesar/:pagoId', procesarPagoDiario);

// Registrar abono parcial
router.post('/abono/:pagoId', registrarAbonoParcial);

// Obtener pagos del día
router.get('/del-dia', obtenerPagosDelDia);

// Obtener resumen diario
router.get('/resumen', obtenerResumenDiario);

// Obtener pagos vencidos
router.get('/vencidos', obtenerPagosVencidos);

// ==========================================
// RUTAS PARA REPORTES Y ESTADÍSTICAS
// ==========================================

// Obtener calendario mensual
router.get('/calendario/:mes/:año', obtenerCalendario);

// Obtener historial de abonos de un pago
router.get('/historial/:pagoId', obtenerHistorialAbonos);

// Generar reporte de productividad por trabajador
router.get('/reporte-productividad/:trabajadorId', generarReporteProductividad);

export default router;