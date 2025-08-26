import express from 'express';
import { getEstadisticas, getActividadReciente } from '../controllers/dashboard.controller.js';

const router = express.Router();

// GET /api/dashboard/estadisticas - Obtener estadísticas generales
router.get('/estadisticas', getEstadisticas);

// GET /api/dashboard/actividad - Obtener actividad reciente
router.get('/actividad', getActividadReciente);

export default router;
