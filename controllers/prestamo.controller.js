import Prestamo from '../models/Prestamo.js';
import Pago from '../models/Pago.js';
import Cliente from '../models/Cliente.js';
import TarjetaPago from '../models/TarjetaPago.js';


// Obtener todos los préstamos con progreso real
export const getPrestamosConProgreso = async (req, res) => {
  try {
    const prestamos = await Prestamo.find()
      .populate('cliente', 'nombre telefono status')
      .sort({ createdAt: -1 });

    // Calcular progreso real para cada préstamo
    const prestamosConProgreso = await Promise.all(
      prestamos.map(async (prestamo) => {
        const pagosPagados = await Pago.countDocuments({
          prestamo: prestamo._id,
          pagado: true
        });

        const totalPagos = await Pago.countDocuments({
          prestamo: prestamo._id
        });

        const progreso = totalPagos > 0 ? (pagosPagados / totalPagos) * 100 : 0;

        return {
          ...prestamo.toObject(),
          pagosPagados,
          totalPagos,
          progreso: Math.round(progreso * 100) / 100
        };
      })
    );

    res.json(prestamosConProgreso);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// Obtener todos los préstamos
export const getPrestamos = async (req, res) => {
  try {
    const prestamos = await Prestamo.find()
      .populate('cliente', 'nombre telefono status')
      .sort({ createdAt: -1 });

    res.json(prestamos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear nuevo préstamo
export const createPrestamo = async (req, res) => {
  try {
    const { clienteId, monto, plazo = 12 } = req.body;

    // Verificar que el cliente existe
    const cliente = await Cliente.findById(clienteId);
    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    // Calcular fechas y montos
    const fechaIngreso = new Date();
    const fechaTermino = new Date(fechaIngreso);
    fechaTermino.setDate(fechaTermino.getDate() + (plazo * 7)); // plazo en semanas

    const montoTotal = monto * 1.5; // 50% de interés
    const montoSemanal = montoTotal / plazo;

    // Crear préstamo
    const prestamo = new Prestamo({
      cliente: clienteId,
      monto,
      plazo,
      fechaIngreso,
      fechaTermino,
      montoSemanal
    });

    await prestamo.save();

    // Crear pagos programados
    const pagos = [];
    for (let i = 1; i <= plazo; i++) {
      const fechaVencimiento = new Date(fechaIngreso);
      fechaVencimiento.setDate(fechaVencimiento.getDate() + (i * 7));

      const pago = new Pago({
        prestamo: prestamo._id,
        numeroPago: i,
        monto: montoSemanal,
        fechaVencimiento
      });

      pagos.push(pago);
    }

    await Pago.insertMany(pagos);

    // Crear tarjeta de pago
    const tarjetaPago = new TarjetaPago({
      prestamo: prestamo._id,
      pagos: pagos.map(p => ({
        numero: p.numeroPago,
        fechaVencimiento: p.fechaVencimiento,
        monto: p.monto
      }))
    });

    await tarjetaPago.save();

    const prestamoCompleto = await Prestamo.findById(prestamo._id)
      .populate('cliente');

    res.status(201).json(prestamoCompleto);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Renovar préstamo
export const renovarPrestamo = async (req, res) => {
  try {
    const prestamoId = req.params.id;
    const { nuevoMonto } = req.body;

    const prestamoAnterior = await Prestamo.findById(prestamoId)
      .populate('cliente');

    if (!prestamoAnterior) {
      return res.status(404).json({ message: 'Préstamo no encontrado' });
    }

    if (!prestamoAnterior.puedeRenovar) {
      return res.status(400).json({ message: 'El préstamo no puede ser renovado aún' });
    }

    // Marcar préstamo anterior como renovado
    await Prestamo.findByIdAndUpdate(prestamoId, { status: 'renovado' });

    // Crear nuevo préstamo con línea de crédito incrementada
    const nuevaLineaCredito = prestamoAnterior.cliente.lineaCredito + prestamoAnterior.incrementoLineaCredito;
    const montoMaximo = Math.min(nuevoMonto, nuevaLineaCredito);

    const nuevoPrestamo = await createPrestamo({
      body: {
        clienteId: prestamoAnterior.cliente._id,
        monto: montoMaximo,
        plazo: 12
      }
    }, res);

    res.status(201).json(nuevoPrestamo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


