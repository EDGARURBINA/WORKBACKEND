// ============ MODELO PRESTAMO MEJORADO ============
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
  
  tipoPrestamo: {
    type: String,
    enum: ['semanal', 'diario'],
    required: true,
    default: 'semanal'
  },
  
  plazo: {
    type: Number,
    default: function() {
      return this.tipoPrestamo === 'semanal' ? 12 : 22;
    },
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
    required: function() {
      return this.tipoPrestamo === 'semanal';
    },
    min: 0
  },
  
  montoDiario: {
    type: Number,
    required: function() {
      return this.tipoPrestamo === 'diario';
    },
    min: 0
  },

  // ✅ NUEVOS CAMPOS OBLIGATORIOS PARA CAJA
  origenFondos: {
    type: String,
    enum: ['caja'],  // Solo caja, eliminar 'externo'
    default: 'caja',
    required: true
  },
  
  asignacionCaja: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsignacionDinero',
    required: true // AHORA OBLIGATORIO
  },
  
  trabajadorAsignado: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trabajador',
    required: true // AHORA OBLIGATORIO
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
    default: function() {
      return this.tipoPrestamo === 'semanal' ? 11 : 19;
    }
  },
  
  incrementoLineaCredito: {
    type: Number,
    default: 1000
  },
  
  tasaInteres: {
    type: Number,
    default: function() {
      return this.tipoPrestamo === 'semanal' ? 0.50 : 0.20; // 50% semanal, 20% diario
    }
  },
  
  configuracionDiaria: {
    plazoDias: {
      type: Number,
      min: 20,
      max: 24,
      default: 22
    },
    puedeRenovarEnDia: {
      type: Number,
      default: 19
    },
    porcentajeInteres: {
      type: Number,
      default: 20
    }
  },
  
  // ✅ NUEVOS CAMPOS DE SEGUIMIENTO
  seguimientoCaja: {
    fechaCreacion: {
      type: Date,
      default: Date.now
    },
    montoOriginalCaja: Number, // Monto que se descontó de la caja
    trabajadorQueCreo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trabajador'
    },
    fechaUltimoPago: Date,
    montoTotalRecuperado: {
      type: Number,
      default: 0
    },
    statusRecuperacion: {
      type: String,
      enum: ['pendiente', 'parcial', 'completo', 'moroso'],
      default: 'pendiente'
    }
  },
  
  estadisticas: {
    totalPagos: {
      type: Number,
      default: 0
    },
    pagosCompletos: {
      type: Number,
      default: 0
    },
    pagosParciales: {
      type: Number,
      default: 0
    },
    montoTotalAbonado: {
      type: Number,
      default: 0
    },
    ultimaActualizacion: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

// ✅ MIDDLEWARE MEJORADO
prestamoSchema.pre('save', async function(next) {
  if (!this.numeroContrato) {
    const timestamp = Date.now().toString().slice(-4);
    const objectIdPart = this._id.toString().slice(-4);
    const prefix = this.tipoPrestamo === 'semanal' ? 'PREST-S' : 'PREST-D';
    this.numeroContrato = `${prefix}-${timestamp}${objectIdPart}`;
  }
  
  // Inicializar seguimiento de caja
  if (this.isNew) {
    this.seguimientoCaja.montoOriginalCaja = this.monto;
    this.seguimientoCaja.trabajadorQueCreo = this.trabajadorAsignado;
  }
  
  // Calcular fecha de término según tipo
  if (this.isNew || this.isModified('fechaIngreso') || this.isModified('plazo') || this.isModified('tipoPrestamo')) {
    const fechaTermino = new Date(this.fechaIngreso);
    
    if (this.tipoPrestamo === 'semanal') {
      fechaTermino.setDate(fechaTermino.getDate() + (this.plazo * 7));
    } else {
      fechaTermino.setDate(fechaTermino.getDate() + this.plazo);
    }
    
    this.fechaTermino = fechaTermino;
  }
  
  next();
});

// ✅ NUEVO MÉTODO: ACTUALIZAR ESTADO DE RECUPERACIÓN
prestamoSchema.methods.actualizarEstadoRecuperacion = async function() {
  const Pago = mongoose.model('Pago');
  
  const pagos = await Pago.find({ prestamo: this._id });
  const pagosCompletos = pagos.filter(p => p.pagado);
  const pagosParciales = pagos.filter(p => p.estadoPago === 'parcial');
  
  this.estadisticas.totalPagos = pagos.length;
  this.estadisticas.pagosCompletos = pagosCompletos.length;
  this.estadisticas.pagosParciales = pagosParciales.length;
  this.estadisticas.montoTotalAbonado = pagos.reduce((sum, p) => sum + p.montoAbonado, 0);
  this.estadisticas.ultimaActualizacion = new Date();
  
  // Actualizar seguimiento de caja
  this.seguimientoCaja.montoTotalRecuperado = this.estadisticas.montoTotalAbonado;
  
  if (pagosCompletos.length === pagos.length) {
    this.seguimientoCaja.statusRecuperacion = 'completo';
    this.status = 'pagado';
  } else if (pagosCompletos.length > 0 || pagosParciales.length > 0) {
    this.seguimientoCaja.statusRecuperacion = 'parcial';
  }
  
  // Verificar si hay pagos vencidos sin pagar
  const pagosVencidos = pagos.filter(p => !p.pagado && p.fechaVencimiento < new Date());
  if (pagosVencidos.length > 0) {
    this.seguimientoCaja.statusRecuperacion = 'moroso';
    this.status = 'moroso';
  }
  
  return await this.save();
};

// Método existente mejorado
prestamoSchema.methods.calcularMontoPeriodo = function() {
  if (this.tipoPrestamo === 'semanal') {
    const montoTotal = this.monto * (1 + this.tasaInteres);
    const montoPeriodo = montoTotal / this.plazo;
    return Math.round(montoPeriodo * 100) / 100;
  } else {
    const porcentajeInteres = this.configuracionDiaria?.porcentajeInteres || 20;
    const montoTotal = this.monto * (1 + (porcentajeInteres / 100));
    const montoPeriodo = montoTotal / this.plazo;
    return Math.round(montoPeriodo * 100) / 100;
  }
};

prestamoSchema.methods.puedeRenovarPrestamo = async function() {
  const Pago = mongoose.model('Pago');
  
  if (this.tipoPrestamo === 'semanal') {
    const pagosPagados = await Pago.countDocuments({
      prestamo: this._id,
      pagado: true
    });
    return pagosPagados >= this.pagoMinimoRenovacion;
  } else {
    const pagosPagados = await Pago.countDocuments({
      prestamo: this._id,
      pagado: true
    });
    return pagosPagados >= this.configuracionDiaria.puedeRenovarEnDia;
  }
};

// ✅ NUEVO VIRTUAL: INFO COMPLETA
prestamoSchema.virtual('infoCompleta').get(function() {
  const esSemanal = this.tipoPrestamo === 'semanal';
  const montoTotal = esSemanal ? 
    this.monto * (1 + this.tasaInteres) : 
    this.monto * (1 + ((this.configuracionDiaria?.porcentajeInteres || 20) / 100));
    
  return {
    // Info básica
    tipo: this.tipoPrestamo,
    periodo: esSemanal ? 'Semanal' : 'Diario',
    plazo: this.plazo,
    unidadTiempo: esSemanal ? 'semanas' : 'días',
    montoPorPeriodo: Math.round((esSemanal ? this.montoSemanal : this.montoDiario) * 100) / 100,
    tasaInteres: esSemanal ? `${(this.tasaInteres * 100)}%` : `${this.configuracionDiaria?.porcentajeInteres || 20}%`,
    montoOriginal: this.monto,
    montoTotal: Math.round(montoTotal * 100) / 100,
    montoInteres: Math.round((montoTotal - this.monto) * 100) / 100,
    
    // Info de caja
    origenFondos: this.origenFondos,
    trabajadorAsignado: this.trabajadorAsignado,
    
    // Info de recuperación
    recuperacion: {
      montoRecuperado: this.seguimientoCaja.montoTotalRecuperado,
      porcentajeRecuperado: this.monto > 0 ? 
        ((this.seguimientoCaja.montoTotalRecuperado / montoTotal) * 100).toFixed(2) : 0,
      status: this.seguimientoCaja.statusRecuperacion,
      gananciaEsperada: Math.round((montoTotal - this.monto) * 100) / 100,
      gananciaReal: Math.round((this.seguimientoCaja.montoTotalRecuperado - this.monto) * 100) / 100
    }
  };
});

prestamoSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Prestamo', prestamoSchema);