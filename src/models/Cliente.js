import mongoose from 'mongoose';

const clienteSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  direccion: {
    type: String,
    required: true,
    trim: true
  },
  telefono: {
    type: String,
    required: true,
    trim: true
  },
  ubicacion: {
    type : String, 
     trim: true

},

  status: {
    type: String,
    enum: ['activo', 'moroso', 'bloqueado', 'renovacion'],
    default: 'activo'
  },

  semanasConsecutivasSinPago: {
    type: Number,
    default: 0
  },
  lineaCredito: {
    type: Number,
    default: 0
  },
  // Relación con Aval
  aval: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Aval',
    required: true
  },
  // Relación con Trabajador asignado
  trabajadorAsignado: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trabajador'
  }
}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model('Cliente', clienteSchema);