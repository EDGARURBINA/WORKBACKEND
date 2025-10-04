import { Router } from 'express';
import {
  getPrestamos,
  createPrestamo,
  getPrestamosConProgreso,
  renovarPrestamo
} from '../controllers/prestamo.controller.js';
import Prestamo from '../models/Prestamo.js';

const router = Router();

// ✅ NUEVA RUTA que estamos usando en el servicio
router.get('/con-progreso', getPrestamosConProgreso);

// Rutas existentes
router.get('/', getPrestamos);
router.get('/progreso', getPrestamosConProgreso); // Tu ruta original
router.post('/', createPrestamo);
router.post('/:id/renovar', renovarPrestamo);

// ✅ NUEVA RUTA: Obtener préstamo por ID (necesaria para validación)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const prestamo = await Prestamo.findById(id)
      .populate({
        path: 'cliente',
        populate: {
          path: 'trabajadorAsignado',
          select: 'nombreCompleto telefono'
        }
      });
    
    if (!prestamo) {
      return res.status(404).json({ message: 'Préstamo no encontrado' });
    }
    
    res.json(prestamo);
  } catch (error) {
    console.error('Error al obtener préstamo:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;