import mongoose from 'mongoose';

const reporteDiarioSchema = new mongoose.Schema({
  trabajador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trabajador',
    required: true
  },
  fecha: {
    type: Date,
    required: true,
    default: Date.now
  },
  asignacion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsignacionDinero',
    required: true
  },
  caja: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caja',
    required: true
  },
  
  // Resumen del día
  resumenDia: {
    montoInicial: {
      type: Number,
      required: true,
      min: 0
    },
    prestamosRealizados: {
      cantidad: {
        type: Number,
        default: 0,
        min: 0
      },
      montoTotal: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    cobrosRealizados: {
      cantidad: {
        type: Number,
        default: 0,
        min: 0
      },
      montoTotal: {
        type: Number,
        default: 0,
        min: 0
      }
    },
    montoDevuelto: {
      type: Number,
      required: true,
      min: 0
    },
    montoFaltante: {
      type: Number,
      default: 0
    },
    montoSobrante: {
      type: Number,
      default: 0
    }
  },
  
  // Detalle de préstamos del día
  prestamosDelDia: [{
    prestamo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prestamo'
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente'
    },
    monto: Number,
    tipoPrestamo: {
      type: String,
      enum: ['semanal', 'diario']
    },
    hora: Date
  }],
  
  // Detalle de cobros del día
  cobrosDelDia: [{
    pago: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pago'
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente'
    },
    prestamo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prestamo'
    },
    montoCobrado: Number,
    tipoPago: {
      type: String,
      enum: ['completo', 'parcial', 'adelanto']
    },
    hora: Date
  }],
  
  // Incidencias y observaciones
  incidencias: [{
    tipo: {
      type: String,
      enum: ['cliente_no_encontrado', 'pago_rechazado', 'problema_cobro', 'otro']
    },
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente'
    },
    descripcion: String,
    hora: Date
  }],
  
  // Estado y validación
  status: {
    type: String,
    enum: ['borrador', 'enviado', 'revisado', 'aprobado', 'rechazado'],
    default: 'borrador'
  },
  
  validacion: {
    revisadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fechaRevision: Date,
    aprobadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fechaAprobacion: Date,
    comentarios: String,
    discrepancias: [{
      tipo: String,
      descripcion: String,
      monto: Number
    }]
  },
  
  // Notas adicionales
  notasTrabajador: String,
  notasAdministrador: String,
  
  // Métricas de rendimiento
  metricas: {
    efectividadCobro: {
      type: Number,
      default: 0
    },
    clientesVisitados: {
      type: Number,
      default: 0
    },
    clientesCobrados: {
      type: Number,
      default: 0
    },
    tiempoRuta: {
      inicio: Date,
      fin: Date,
      duracionMinutos: Number
    }
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índice único para evitar reportes duplicados
reporteDiarioSchema.index({ trabajador: 1, fecha: 1 }, { unique: true });

// Método para agregar préstamo al reporte
reporteDiarioSchema.methods.agregarPrestamo = async function(prestamoData) {
  this.prestamosDelDia.push({
    prestamo: prestamoData.prestamoId,
    cliente: prestamoData.clienteId,
    monto: prestamoData.monto,
    tipoPrestamo: prestamoData.tipoPrestamo,
    hora: new Date()
  });
  
  this.resumenDia.prestamosRealizados.cantidad += 1;
  this.resumenDia.prestamosRealizados.montoTotal += prestamoData.monto;
  
  return await this.save();
};

// Método para agregar cobro al reporte
reporteDiarioSchema.methods.agregarCobro = async function(cobroData) {
  this.cobrosDelDia.push({
    pago: cobroData.pagoId,
    cliente: cobroData.clienteId,
    prestamo: cobroData.prestamoId,
    montoCobrado: cobroData.monto,
    tipoPago: cobroData.tipoPago,
    hora: new Date()
  });
  
  this.resumenDia.cobrosRealizados.cantidad += 1;
  this.resumenDia.cobrosRealizados.montoTotal += cobroData.monto;
  
  // Actualizar métricas
  this.metricas.clientesCobrados += 1;
  
  return await this.save();
};

// Método para agregar incidencia
reporteDiarioSchema.methods.agregarIncidencia = function(tipo, clienteId, descripcion) {
  this.incidencias.push({
    tipo: tipo,
    cliente: clienteId,
    descripcion: descripcion,
    hora: new Date()
  });
  
  return this.save();
};

// Método para enviar reporte
reporteDiarioSchema.methods.enviarReporte = async function(montoDevuelto, notas) {
  if (this.status !== 'borrador') {
    throw new Error('El reporte ya fue enviado');
  }
  
  const montoEsperado = this.resumenDia.montoInicial + this.resumenDia.cobrosRealizados.montoTotal;
  const diferencia = montoDevuelto - montoEsperado;
  
  this.resumenDia.montoDevuelto = montoDevuelto;
  
  if (diferencia > 0) {
    this.resumenDia.montoSobrante = diferencia;
  } else if (diferencia < 0) {
    this.resumenDia.montoFaltante = Math.abs(diferencia);
  }
  
  this.notasTrabajador = notas;
  this.status = 'enviado';
  
  // Calcular efectividad de cobro
  if (this.metricas.clientesVisitados > 0) {
    this.metricas.efectividadCobro = (this.metricas.clientesCobrados / this.metricas.clientesVisitados * 100).toFixed(2);
  }
  
  return await this.save();
};

// Método para revisar reporte (administrador)
reporteDiarioSchema.methods.revisarReporte = async function(usuarioId, aprobado, comentarios, discrepancias = []) {
  this.validacion.revisadoPor = usuarioId;
  this.validacion.fechaRevision = new Date();
  this.validacion.comentarios = comentarios;
  
  if (discrepancias.length > 0) {
    this.validacion.discrepancias = discrepancias;
  }
  
  if (aprobado) {
    this.status = 'aprobado';
    this.validacion.aprobadoPor = usuarioId;
    this.validacion.fechaAprobacion = new Date();
  } else {
    this.status = 'rechazado';
  }
  
  return await this.save();
};

// Virtual para calcular el balance del día
reporteDiarioSchema.virtual('balanceDia').get(function() {
  const montoInicial = this.resumenDia.montoInicial;
  const prestamos = this.resumenDia.prestamosRealizados.montoTotal;
  const cobros = this.resumenDia.cobrosRealizados.montoTotal;
  const montoEsperado = montoInicial - prestamos + cobros;
  const montoDevuelto = this.resumenDia.montoDevuelto;
  
  return {
    montoInicial,
    prestamos,
    cobros,
    montoEsperado,
    montoDevuelto,
    diferencia: montoDevuelto - montoEsperado,
    balanceado: montoDevuelto === montoEsperado
  };
});

export default mongoose.model('ReporteDiario', reporteDiarioSchema);