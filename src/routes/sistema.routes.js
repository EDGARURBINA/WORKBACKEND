import express from 'express';
import { validarEstadoSistema } from '../controllers/sistemaController.js';

const router = express.Router();

// Ruta para validar estado del sistema
router.get('/estado', validarEstadoSistema);

export default router;
