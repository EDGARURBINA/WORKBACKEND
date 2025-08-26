import mongoose from 'mongoose';

const moratorioSchema = new mongoose.Schema({
  pago: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pago',
    required: true
  },
  prestamo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prestamo',
    required: true
  },
  dias: {
    type: Number,
    required: true,
    min: 1
  },
  porcentaje: {
    type: Number,
    default: 50,
    min: 0
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  activo: {
    type: Boolean,
    default: true
  },
  adminAcciones: {
    noCobra: {
      type: Boolean,
      default: false
    },
    subirCargo: {
      type: Boolean,
      default: false
    },
    bajarCargo: {
      type: Boolean,
      default: false
    },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fecha: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model('Moratorio', moratorioSchema);