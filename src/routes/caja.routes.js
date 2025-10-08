import { Router } from 'express';
import * as cajaController from '../controllers/Caja.controller.js';

const router = Router();

// ========== RUTAS DE CAJA ==========

// Crear nueva caja (solo admin)
router.post('/',  cajaController.crearCaja);

router.get('/historial-detallado', cajaController.getHistorialCajasDetallado);

// Obtener caja actual
router.get('/actual', cajaController.getCajaActual);

// Cerrar caja (solo admin)
router.post('/:cajaId/cerrar', cajaController.cerrarCaja);

// Obtener movimientos de caja
router.get('/:cajaId/movimientos', cajaController.getMovimientosCaja);

// Obtener estadísticas de caja
router.get('/:cajaId/estadisticas', cajaController.getEstadisticasCaja);

// ========== RUTAS DE ASIGNACIONES ==========

// Asignar dinero a trabajador (solo admin)
router.post('/asignar',cajaController.asignarDinero);

// Procesar devolución
router.post('/asignacion/:asignacionId/devolucion', cajaController.procesarDevolucion);

// Obtener asignaciones del día
router.get('/asignaciones/dia', cajaController.getAsignacionesDelDia);

// Obtener asignaciones por trabajador
router.get('/asignaciones/trabajador/:trabajadorId', cajaController.getAsignacionesPorTrabajador);

// Registrar préstamo en asignación
router.post('/asignacion/:asignacionId/prestamo', cajaController.registrarPrestamoEnAsignacion);


// ========== RUTAS DE REPORTES ==========

// Generar reporte mensual
router.get('/reporte/:mes/:año', cajaController.generarReporteMensual);

// Obtener historial de cajas
router.get('/historial', cajaController.getHistorialCajas);

// Comparar períodos (solo admin)
router.post('/comparar',cajaController.compararPeriodos);

// ========== RUTAS DE REPORTES DIARIOS ==========

// Crear reporte diario
router.post('/reportes-diarios', cajaController.crearReporteDiario);

// Obtener reporte diario por trabajador
router.get('/reportes-diarios/trabajador/:trabajadorId', cajaController.getReporteDiario);

// Obtener todos los reportes del día
router.get('/reportes-diarios/dia', cajaController.getReportesPorDia);

router.post('/validar-prestamo', cajaController.validarPrestamoConCaja);
router.get('/trabajador/:trabajadorId/dashboard',cajaController.getDashboardTrabajador);
router.get('/trabajador/:trabajadorId/resumen-cierre', cajaController.getResumenCierreDiario);
router.post('/trabajador/:trabajadorId/cerrar-dia', cajaController.cerrarDiaTrabajador);

router.get('/:cajaId/reporte-consolidado', cajaController.getReporteConsolidadoCaja);




export default router;