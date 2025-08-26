import mongoose from 'mongoose';

const pagoSchema = new mongoose.Schema({
  prestamo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prestamo',
    required: true
  },
  numeroPago: {
    type: Number,
    required: true,
    min: 1
  },
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  // NUEVOS CAMPOS PARA PAGOS PARCIALES
  montoAbonado: {
    type: Number,
    default: 0,
    min: 0
  },
  saldoPendiente: {
    type: Number,
    default: function() {
      return this.monto;
    },
    min: 0
  },
  esParcial: {
    type: Boolean,
    default: false
  },
  estadoPago: {
    type: String,
    enum: ['pendiente', 'parcial', 'completo'],
    default: 'pendiente'
  },
  // CAMPOS EXISTENTES
  fechaPago: {
    type: Date
  },
  fechaVencimiento: {
    type: Date,
    required: true
  },
  pagado: {
    type: Boolean,
    default: false
  },
  diasMoratorio: {
    type: Number,
    default: 0,
    min: 0
  },
  montoMoratorio: {
    type: Number,
    default: 0,
    min: 0
  },
  trabajadorCobro: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trabajador'
  },
  observaciones: {
    type: String,
    trim: true
  },
  // HISTORIAL DE ABONOS
  historialAbonos: [{
    monto: {
      type: Number,
      required: true
    },
    fecha: {
      type: Date,
      default: Date.now
    },
    trabajador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trabajador'
    },
    observaciones: String
  }]
}, {
  timestamps: true,
  versionKey: false
});

// Middleware para calcular automáticamente saldoPendiente
pagoSchema.pre('save', function(next) {
  if (this.isModified('montoAbonado') || this.isModified('monto')) {
    this.saldoPendiente = this.monto - this.montoAbonado;
    
    if (this.montoAbonado === 0) {
      this.estadoPago = 'pendiente';
      this.pagado = false;
      this.esParcial = false;
    } else if (this.saldoPendiente > 0) {
      this.estadoPago = 'parcial';
      this.pagado = false;
      this.esParcial = true;
    } else {
      this.estadoPago = 'completo';
      this.pagado = true;
      this.esParcial = false;
    }
  }
  next();
});

export default mongoose.model('Pago', pagoSchema);