import mongoose from 'mongoose';

const trabajadorSchema = new mongoose.Schema({
  nombreCompleto: {
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
  referencias: [{
    nombre: String,
    telefono: String,
    relacion: String
  }],
  activo: {
    type: Boolean,
    default: true
  },
  zonaAsignada: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model('Trabajador', trabajadorSchema);