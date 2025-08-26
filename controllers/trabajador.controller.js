import Trabajador from '../models/Trabajador.js';
import Cliente from '../models/Cliente.js';

export const getTrabajadores = async (req, res) => {
  try {
    
    const trabajadores = await Trabajador.find()
      .sort({ activo: -1, createdAt: -1 }); 

   
    const trabajadoresConClientes = await Promise.all(
      trabajadores.map(async (trabajador) => {
        const clientesAsignados = await Cliente.countDocuments({
          trabajadorAsignado: trabajador._id
        });

        return {
          ...trabajador.toObject(),
          clientesAsignados
        };
      })
    );

    res.json(trabajadoresConClientes);
  } catch (error) {
    console.error('Error al obtener trabajadores:', error);
    res.status(500).json({ message: error.message });
  }
};


// Obtener trabajador por ID
export const getTrabajadorById = async (req, res) => {
  try {
    const trabajador = await Trabajador.findById(req.params.id);

    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }

    // Obtener clientes asignados
    const clientesAsignados = await Cliente.find({
      trabajadorAsignado: req.params.id
    }).select('nombre telefono status').sort({ nombre: 1 });

    res.json({
      ...trabajador.toObject(),
      clientes: clientesAsignados
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Crear trabajador
export const createTrabajador = async (req, res) => {
  try {
    const trabajador = new Trabajador(req.body);
    await trabajador.save();
    
    res.status(201).json(trabajador);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ 
        message: 'Ya existe un trabajador con ese teléfono' 
      });
    }
    res.status(400).json({ message: error.message });
  }
};


export const updateTrabajador = async (req, res) => {
  try {
    const trabajador = await Trabajador.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }

    res.json(trabajador);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};


export const deleteTrabajador = async (req, res) => {
  try {
    const trabajadorId = req.params.id;

    const trabajador = await Trabajador.findById(trabajadorId);
    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }

    // Verificar si tiene clientes asignados
    const clientesAsignados = await Cliente.countDocuments({
      trabajadorAsignado: trabajadorId
    });

    // Desactivar el trabajador
    const trabajadorDesactivado = await Trabajador.findByIdAndUpdate(
      trabajadorId,
      { activo: false },
      { new: true }
    );

    // Desasignar de todos los clientes
    await Cliente.updateMany(
      { trabajadorAsignado: trabajadorId },
      { $unset: { trabajadorAsignado: "" } }
    );

    if (clientesAsignados > 0) {
      console.log(`⚠️ Trabajador desactivado y desasignado de ${clientesAsignados} cliente(s): ${trabajador.nombreCompleto}`);
    } else {
      console.log(`⚠️ Trabajador desactivado: ${trabajador.nombreCompleto}`);
    }

    res.json({
      message: clientesAsignados > 0 
        ? `Trabajador desactivado correctamente y desasignado de ${clientesAsignados} cliente(s)`
        : 'Trabajador desactivado correctamente',
      trabajador: trabajadorDesactivado,
      clientesDesasignados: clientesAsignados
    });
  } catch (error) {
    console.error('Error al desactivar trabajador:', error);
    res.status(500).json({ message: error.message });
  }
};
// Obtener clientes asignados a un trabajador
export const getClientesAsignados = async (req, res) => {
  try {
    const clientes = await Cliente.find({ trabajadorAsignado: req.params.id })
      .populate('aval', 'nombre telefono')
      .sort({ nombre: 1 });
    
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Estadísticas del trabajador
export const getEstadisticasTrabajador = async (req, res) => {
  try {
    const trabajadorId = req.params.id;
    
    const estadisticas = await Cliente.aggregate([
      { $match: { trabajadorAsignado: mongoose.Types.ObjectId(trabajadorId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const resumen = {
      total: 0,
      activos: 0,
      morosos: 0,
      bloqueados: 0
    };

    estadisticas.forEach(stat => {
      resumen.total += stat.count;
      resumen[stat._id] = stat.count;
    });

    res.json(resumen);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const permanentDeleteTrabajador = async (req, res) => {
  try {
    const trabajadorId = req.params.id;

    const trabajador = await Trabajador.findById(trabajadorId);
    if (!trabajador) {
      return res.status(404).json({ message: 'Trabajador no encontrado' });
    }

    // Verificar si tiene clientes asignados
    const clientesAsignados = await Cliente.countDocuments({
      trabajadorAsignado: trabajadorId
    });

    // Desasignar de todos los clientes antes de eliminar
    if (clientesAsignados > 0) {
      await Cliente.updateMany(
        { trabajadorAsignado: trabajadorId },
        { $unset: { trabajadorAsignado: "" } }
      );
    }

    // Eliminar permanentemente el trabajador
    await Trabajador.findByIdAndDelete(trabajadorId);

    console.log(`🗑️ Trabajador eliminado permanentemente: ${trabajador.nombreCompleto}`);
    if (clientesAsignados > 0) {
      console.log(`🔄 Se desasignó de ${clientesAsignados} cliente(s)`);
    }

    res.json({
      message: clientesAsignados > 0 
        ? `Trabajador eliminado permanentemente y desasignado de ${clientesAsignados} cliente(s)`
        : 'Trabajador eliminado permanentemente',
      trabajadorEliminado: {
        _id: trabajador._id,
        nombreCompleto: trabajador.nombreCompleto
      },
      clientesDesasignados: clientesAsignados
    });
  } catch (error) {
    console.error('Error al eliminar trabajador permanentemente:', error);
    res.status(500).json({ message: error.message });
  }
};
