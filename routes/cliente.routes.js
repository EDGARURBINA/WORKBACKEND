import { Router } from 'express';
import {
  getClientes,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  asignarTrabajador,
  getHistorialCliente,
  buscarClientes,
  updateStatus ,
  getResumenCliente
} from '../controllers/cliente.controller.js';


const router = Router();

router.get('/', getClientes);
router.get('/:id',  getClienteById);
router.get('/buscar/clientes', buscarClientes);
router.get('/:id/historial', getHistorialCliente);
router.get('/:id/resumen', getResumenCliente);
router.post('/',  createCliente);
router.put('/:id',  updateCliente);
router.delete('/:id', deleteCliente);
router.patch('/:id/asignar-trabajador', asignarTrabajador);
router.patch('/:id/status', updateStatus);

export default router;