import mongoose from 'mongoose';

const prestamoSchema = new mongoose.Schema({
  numeroContrato: {
    type: String,
    unique: true,
    required: false
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  plazo: {
    type: Number,
    default: 12,
    min: 1
  },
  fechaIngreso: {
    type: Date,
    default: Date.now
  },
  fechaTermino: {
    type: Date,
    required: true
  },
  montoSemanal: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['activo', 'pagado', 'moroso', 'renovado', 'cancelado'],
    default: 'activo'
  },
  puedeRenovar: {
    type: Boolean,
    default: false
  },
  pagoMinimoRenovacion: {
    type: Number,
    default: 11
  },
  incrementoLineaCredito: {
    type: Number,
    default: 1000
  },
  tasaInteres: {
    type: Number,
    default: 0.50 // 50%
  }
}, {
  timestamps: true,
  versionKey: false
});

prestamoSchema.pre('save', async function(next) {
  if (!this.numeroContrato) {
    // Usar timestamp + parte del ObjectId para garantizar unicidad
    const timestamp = Date.now().toString().slice(-4);
    const objectIdPart = this._id.toString().slice(-4);
    this.numeroContrato = `PREST-${timestamp}${objectIdPart}`;
  }
  next();
});

export default mongoose.model('Prestamo', prestamoSchema);
