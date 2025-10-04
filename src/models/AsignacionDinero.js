import mongoose from 'mongoose';

const asignacionDineroSchema = new mongoose.Schema({
  caja: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Caja',
    required: true
  },
  trabajador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trabajador',
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now,
    required: true
  },
  montoAsignado: {
    type: Number,
    required: true,
    min: 0
  },
  montoUtilizado: {
    type: Number,
    default: 0,
    min: 0
  },
  montoDevuelto: {
    type: Number,
    default: 0,
    min: 0
  },
  montoRecaudado: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pendiente', 'parcial', 'completado', 'cancelado'],
    default: 'pendiente'
  },
  
  // Detalle de préstamos realizados con este dinero
  prestamosRealizados: [{
    prestamo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prestamo'
    },
    monto: Number,
    fecha: Date,
    tipoPrestamo: {
      type: String,
      enum: ['semanal', 'diario']
    }
  }],
  
  // Detalle de cobros realizados
  cobrosRealizados: [{
    pago: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pago'
    },
    monto: Number,
    fecha: Date,
    cliente: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cliente'
    }
  }],
  
  // Reporte de devolución
  reporteDevolucion: {
    fechaDevolucion: Date,
    montoEsperado: Number,
    montoReal: Number,
    diferencia: Number,
    observaciones: String,
    aprobadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Control
  asignadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  notas: String
}, {
  timestamps: true,
  versionKey: false
});

// Índice compuesto para evitar duplicados
asignacionDineroSchema.index({ caja: 1, trabajador: 1, fecha: 1 });

// Método para registrar un préstamo
asignacionDineroSchema.methods.registrarPrestamo = async function(prestamoId, monto, tipoPrestamo) {
  if (this.montoUtilizado + monto > this.montoAsignado) {
    throw new Error('Monto insuficiente para realizar el préstamo');
  }
  
  this.prestamosRealizados.push({
    prestamo: prestamoId,
    monto: monto,
    fecha: new Date(),
    tipoPrestamo: tipoPrestamo
  });
  
  this.montoUtilizado += monto;
  
  if (this.status === 'pendiente') {
    this.status = 'parcial';
  }
  
  return await this.save();
};

// Método para registrar un cobro
asignacionDineroSchema.methods.registrarCobro = async function(pagoId, monto, clienteId) {
  this.cobrosRealizados.push({
    pago: pagoId,
    monto: monto,
    fecha: new Date(),
    cliente: clienteId
  });
  
  this.montoRecaudado += monto;
  
  return await this.save();
};

// Método para procesar devolución
asignacionDineroSchema.methods.procesarDevolucion = async function(montoDevuelto, observaciones, usuarioId) {
  const montoEsperado = this.montoAsignado + this.montoRecaudado;
  
  this.montoDevuelto = montoDevuelto;
  this.reporteDevolucion = {
    fechaDevolucion: new Date(),
    montoEsperado: montoEsperado,
    montoReal: montoDevuelto,
    diferencia: montoDevuelto - montoEsperado,
    observaciones: observaciones,
    aprobadoPor: usuarioId
  };
  
  this.status = 'completado';
  
  return await this.save();
};

// Método para calcular el balance
asignacionDineroSchema.methods.calcularBalance = function() {
  const montoEsperado = this.montoAsignado + this.montoRecaudado;
  const prestamosCount = this.prestamosRealizados.length;
  const cobrosCount = this.cobrosRealizados.length;
  
  return {
    montoAsignado: this.montoAsignado,
    montoUtilizado: this.montoUtilizado,
    montoDisponible: this.montoAsignado - this.montoUtilizado,
    montoRecaudado: this.montoRecaudado,
    montoDevuelto: this.montoDevuelto,
    montoEsperado: montoEsperado,
    diferencia: this.montoDevuelto - montoEsperado,
    prestamosRealizados: prestamosCount,
    cobrosRealizados: cobrosCount,
    status: this.status,
    porcentajeUtilizado: ((this.montoUtilizado / this.montoAsignado) * 100).toFixed(2),
    rendimiento: this.montoRecaudado > 0 ? ((this.montoRecaudado / this.montoUtilizado) * 100).toFixed(2) : 0
  };
};

// Virtual para verificar si está pendiente de devolución
asignacionDineroSchema.virtual('pendienteDevolucion').get(function() {
  return this.status === 'parcial' && this.montoDevuelto === 0;
});

export default mongoose.model('AsignacionDinero', asignacionDineroSchema);