import { Router } from 'express';
import {
  getTrabajadores,
  getTrabajadorById,
  createTrabajador,
  updateTrabajador,
  deleteTrabajador,
  permanentDeleteTrabajador,
  getClientesAsignados,
  getEstadisticasTrabajador,
  getDashboardTrabajador,  // NUEVO
  getPagosRecolectados     // NUEVO
} from '../controllers/trabajador.controller.js';


const router = Router();

// Obtener todos los trabajadores (público para el dropdown)
router.get('/', getTrabajadores);

// Obtener trabajador por ID
router.get('/:id',  getTrabajadorById);

// Crear trabajador (solo admin)
router.post('/',createTrabajador);

// Actualizar trabajador (solo admin)
router.put('/:id', updateTrabajador);

// Desactivar trabajador (solo admin)
router.delete('/:id', deleteTrabajador);

router.post('/:id/permanent-delete', permanentDeleteTrabajador);

// Obtener clientes asignados
router.get('/:id/clientes',  getClientesAsignados);

// Estadísticas del trabajador
router.get('/:id/estadisticas', getEstadisticasTrabajador);

router.get('/:id/dashboard', getDashboardTrabajador);      // NUEVO
router.get('/:id/pagos-recolectados', getPagosRecolectados); // NUEVO

export default router;