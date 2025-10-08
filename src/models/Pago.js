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
  
  // ⭐ CAMPO CRÍTICO QUE TE FALTA
  tipoPago: {
    type: String,
    enum: ['semanal', 'diario'],
    required: true
  },
  
  monto: {
    type: Number,
    required: true,
    min: 0
  },
  
  // CAMPOS PARA PAGOS PARCIALES (ya los tienes)
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
  
  // CAMPOS EXISTENTES (ya los tienes)
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
  
  // ⭐ CONFIGURACIONES QUE TE FALTAN
  configuracionMoratorio: {
    porcentajeDiario: {
      type: Number,
      default: function() {
        return this.tipoPago === 'semanal' ? 0.5 : 0.3; // 0.5% semanal, 0.3% diario
      }
    },
    aplicarDesde: {
      type: Number,
      default: 1
    }
  },
  
  // ⭐ CONFIGURACIÓN ESPECÍFICA PARA DIARIOS
  configuracionDiaria: {
    esDiaHabil: {
      type: Boolean,
      default: true
    },
    permiteAtrasoPorFinDeSemana: {
      type: Boolean,
      default: true
    },
    aplicaMoratorioFinDeSemana: {
      type: Boolean,
      default: false
    }
  },
  
  // ⭐ METADATA QUE TE FALTA
  metadata: {
    esRenovacion: {
      type: Boolean,
      default: false
    },
    pagoAnticipado: {
      type: Boolean,
      default: false
    },
    pagadoFueraHorario: {
      type: Boolean,
      default: false
    },
    geolocalizacion: {
      latitud: Number,
      longitud: Number,
      precision: Number
    }
  },
  
  // HISTORIAL DE ABONOS (actualizado con más campos)
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
    observaciones: String,
    // ⭐ CAMPO QUE TE FALTA
    tipoPago: {
      type: String,
      enum: ['efectivo', 'transferencia', 'otros'],
      default: 'efectivo'
    }
  }]
}, {
  timestamps: true,
  versionKey: false
});

// ⭐ ÍNDICES QUE TE FALTAN
pagoSchema.index({ prestamo: 1, numeroPago: 1 });
pagoSchema.index({ fechaVencimiento: 1 });
pagoSchema.index({ pagado: 1 });
pagoSchema.index({ tipoPago: 1 });
pagoSchema.index({ estadoPago: 1 });



// ✅ MIDDLEWARE MEJORADO CON REDONDEO A 2 DECIMALES
pagoSchema.pre('save', function(next) {
  // ✅ REDONDEAR TODOS LOS MONTOS A 2 DECIMALES ANTES DE CUALQUIER CÁLCULO
  this.monto = Math.round(this.monto * 100) / 100;
  this.montoAbonado = Math.round(this.montoAbonado * 100) / 100;
  this.montoMoratorio = Math.round(this.montoMoratorio * 100) / 100;
  
  // Redondear abonos en historial
  if (this.historialAbonos && this.historialAbonos.length > 0) {
    this.historialAbonos.forEach(abono => {
      abono.monto = Math.round(abono.monto * 100) / 100;
    });
  }
  
  // ✅ CALCULAR SALDO CON REDONDEO
  if (this.isModified('montoAbonado') || this.isModified('monto')) {
    this.saldoPendiente = Math.round((this.monto - this.montoAbonado) * 100) / 100;
    
    // ✅ USAR TOLERANCIA DE 0.01 PARA COMPARACIONES
    if (this.montoAbonado === 0) {
      this.estadoPago = 'pendiente';
      this.pagado = false;
      this.esParcial = false;
    } else if (this.saldoPendiente > 0.01) { // ✅ Tolerancia de 1 centavo
      this.estadoPago = 'parcial';
      this.pagado = false;
      this.esParcial = true;
    } else {
      // ✅ Si saldoPendiente es menor a 0.01, considerarlo pagado completo
      this.estadoPago = 'completo';
      this.pagado = true;
      this.esParcial = false;
      this.saldoPendiente = 0; // ✅ Forzar a 0 para evitar residuos
      this.fechaPago = this.fechaPago || new Date();
    }
  }
  
  // ✅ CALCULAR MORATORIOS
  if (!this.pagado && this.fechaVencimiento < new Date()) {
    this.calcularMoratorio();
  }
  
  next();
});

// ⭐ MÉTODOS QUE TE FALTAN
// ✅ TAMBIÉN ACTUALIZAR EL MÉTODO calcularMoratorio
pagoSchema.methods.calcularMoratorio = function() {
  const ahora = new Date();
  const fechaVencimiento = new Date(this.fechaVencimiento);
  
  if (fechaVencimiento >= ahora) {
    this.diasMoratorio = 0;
    this.montoMoratorio = 0;
    return;
  }
  
  let diasAtraso = Math.floor((ahora - fechaVencimiento) / (1000 * 60 * 60 * 24));
  
  if (diasAtraso > 0) {
    this.diasMoratorio = diasAtraso;
    const porcentajeDiario = this.configuracionMoratorio?.porcentajeDiario || 0.5;
    
    // ✅ REDONDEAR MORATORIO A 2 DECIMALES
    const moratorioCalculado = this.monto * (porcentajeDiario / 100) * diasAtraso;
    this.montoMoratorio = Math.round(moratorioCalculado * 100) / 100;
  } else {
    this.diasMoratorio = 0;
    this.montoMoratorio = 0;
  }
};

// ⭐ MÉTODO PARA REGISTRAR ABONOS
pagoSchema.methods.registrarAbono = function(monto, trabajadorId, observaciones = '', tipoPago = 'efectivo') {
  const nuevoAbono = Math.min(monto, this.saldoPendiente);
  
  this.historialAbonos.push({
    monto: nuevoAbono,
    fecha: new Date(),
    trabajador: trabajadorId,
    observaciones,
    tipoPago
  });
  
  this.montoAbonado += nuevoAbono;
  return this.save();
};

// ⭐ MÉTODOS ESTÁTICOS
pagoSchema.statics.obtenerPagosVencidos = function(tipoPago = null) {
  const filtro = {
    pagado: false,
    fechaVencimiento: { $lt: new Date() }
  };
  
  if (tipoPago) {
    filtro.tipoPago = tipoPago;
  }
  
  return this.find(filtro)
    .populate('prestamo')
    .populate('trabajadorCobro')
    .sort({ fechaVencimiento: 1 });
};

pagoSchema.statics.obtenerPagosDelDia = function(fecha = new Date(), tipoPago = 'diario') {
  const inicioDia = new Date(fecha);
  inicioDia.setHours(0, 0, 0, 0);
  
  const finDia = new Date(fecha);
  finDia.setHours(23, 59, 59, 999);
  
  return this.find({
    tipoPago,
    fechaVencimiento: {
      $gte: inicioDia,
      $lte: finDia
    }
  })
  .populate({
    path: 'prestamo',
    populate: {
      path: 'cliente',
      populate: {
        path: 'trabajadorAsignado'
      }
    }
  })
  .sort({ numeroPago: 1 });
};

export default mongoose.model('Pago', pagoSchema);