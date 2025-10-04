import mongoose from 'mongoose';

const cajaSchema = new mongoose.Schema({
  mes: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  año: {
    type: Number,
    required: true
  },
  montoInicial: {
    type: Number,
    required: true,
    min: 0
  },
  montoActual: {
    type: Number,
    required: true,
    default: function() {
      return this.montoInicial;
    }
  },
  montoAsignado: {
    type: Number,
    default: 0,
    min: 0
  },
  montoRecaudado: {
    type: Number,
    default: 0,
    min: 0
  },
  montoDevuelto: {  
    type: Number,
    default: 0,
    min: 0
  },
  montoPrestado: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['abierta', 'cerrada', 'auditoria'],
    default: 'abierta'
  },
  
  // Resumen financiero
  resumenFinanciero: {
    totalIngresos: {
      type: Number,
      default: 0
    },
    totalEgresos: {
      type: Number,
      default: 0
    },
    gananciaBruta: {
      type: Number,
      default: 0
    },
    gananciaNeta: {
      type: Number,
      default: 0
    },
    prestamosRealizados: {
      type: Number,
      default: 0
    },
    prestamosActivos: {
      type: Number,
      default: 0
    },
    morosidad: {
      type: Number,
      default: 0
    }
  },
  
  // Movimientos diarios
  movimientos: [{
    fecha: {
      type: Date,
      default: Date.now
    },
    tipo: {
      type: String,
      enum: ['ingreso', 'egreso', 'asignacion', 'devolucion', 'ajuste'],
      required: true
    },
    descripcion: {
      type: String,
      required: true
    },
    monto: {
      type: Number,
      required: true
    },
    responsable: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    trabajador: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trabajador'
    },
    balanceAnterior: Number,
    balanceNuevo: Number
  }],
  
  // Auditoría
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fechaCierre: Date,
  cerradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índice único para mes y año
cajaSchema.index({ mes: 1, año: 1 }, { unique: true });

cajaSchema.methods.registrarMovimiento = async function(tipo, monto, descripcion, trabajadorId = null, usuarioId = null) {
  const balanceAnterior = this.montoActual;
  let balanceNuevo = balanceAnterior;
  
  console.log(`📝 Registrando movimiento: ${tipo}, monto: ${monto}`);
  console.log(`📝 Balance anterior: ${balanceAnterior}`);
  
  switch(tipo) {
    case 'ingreso':
    case 'devolucion':
      balanceNuevo += monto;
      this.montoRecaudado += monto;
      this.resumenFinanciero.totalIngresos += monto;
      // ✅ AGREGAR: Actualizar montoDevuelto cuando es devolución
      if (tipo === 'devolucion') {
        this.montoDevuelto = (this.montoDevuelto || 0) + monto;
      }
      break;
    case 'egreso':
    case 'asignacion':
      balanceNuevo -= monto;
      this.resumenFinanciero.totalEgresos += monto;
      if (tipo === 'asignacion') {
        this.montoAsignado += monto;
      }
      break;
    case 'ajuste':
      balanceNuevo += monto;
      if (monto > 0) {
        this.resumenFinanciero.totalIngresos += monto;
      } else {
        this.resumenFinanciero.totalEgresos += Math.abs(monto);
      }
      break;
  }
  
  this.montoActual = balanceNuevo;
  
  console.log(`📝 Balance nuevo: ${balanceNuevo}`);
  console.log(`📝 Monto asignado: ${this.montoAsignado}`);
  console.log(`📝 Monto devuelto: ${this.montoDevuelto || 0}`); // ✅ AGREGAR log
  
  this.movimientos.push({
    tipo,
    monto,
    descripcion,
    trabajador: trabajadorId,
    responsable: usuarioId,
    balanceAnterior,
    balanceNuevo,
    fecha: new Date()
  });
  
  return await this.save();
};
// Método para registrar un préstamo (solo actualiza estadísticas)
cajaSchema.methods.registrarPrestamo = async function(monto, descripcion, trabajadorId, usuarioId) {
  this.montoPrestado += monto;
  this.resumenFinanciero.prestamosRealizados += 1;
  this.resumenFinanciero.prestamosActivos += 1;
  
  // No registrar movimiento de egreso aquí porque el dinero ya fue asignado al trabajador
  // Solo actualizar estadísticas
  return await this.save();
};

// Método para registrar cobro (actualiza estadísticas)
cajaSchema.methods.registrarCobro = async function(monto) {
  // Los cobros ya se registran en devolución, aquí solo actualizamos estadísticas si es necesario
  return await this.save();
};

// Método para cerrar la caja del mes
cajaSchema.methods.cerrarCaja = async function(usuarioId) {
  if (this.status === 'cerrada') {
    throw new Error('La caja ya está cerrada');
  }
  
  // Verificar que no haya asignaciones pendientes
  const AsignacionDinero = mongoose.model('AsignacionDinero');
  const asignacionesPendientes = await AsignacionDinero.countDocuments({
    caja: this._id,
    status: { $in: ['pendiente', 'parcial'] }
  });
  
  if (asignacionesPendientes > 0) {
    throw new Error(`No se puede cerrar la caja. Hay ${asignacionesPendientes} asignaciones pendientes de devolución.`);
  }
  
  this.status = 'cerrada';
  this.fechaCierre = new Date();
  this.cerradoPor = usuarioId;
  
  // Calcular resumen final
  this.resumenFinanciero.gananciaBruta = this.montoRecaudado - this.montoPrestado;
  this.resumenFinanciero.gananciaNeta = this.montoActual - this.montoInicial;
  
  return await this.save();
};

// Método para obtener balance actual
cajaSchema.methods.obtenerBalance = function() {
  
  const montoDisponible = this.montoActual;
  const ganancia = this.montoActual - this.montoInicial;
  const porcentajeGanancia = this.montoInicial > 0 ? ((ganancia / this.montoInicial) * 100).toFixed(2) : 0;

  // ✅ CALCULAR DINERO EN LA CALLE CORRECTAMENTE
  const montoEnLaCalle = this.montoAsignado - (this.montoDevuelto || 0);
  
  return {
    montoInicial: this.montoInicial,
    montoActual: this.montoActual,
    montoDisponible: montoDisponible,
    ganancia: ganancia,
    porcentajeGanancia: porcentajeGanancia,
    
    // ✅ USAR LA VARIABLE CALCULADA, NO this.montoAsignado
    montoEnLaCalle: montoEnLaCalle >= 0 ? montoEnLaCalle : 0,
    
    montoAsignado: this.montoAsignado || 0,
    montoDevuelto: this.montoDevuelto || 0, // ✅ AGREGADO
    montoRecaudado: this.montoRecaudado || 0,
    montoPrestado: this.montoPrestado || 0,
    totalMovimientos: this.movimientos.length,
    status: this.status
  };
};
// Método para validar disponibilidad de fondos
cajaSchema.methods.validarFondosDisponibles = function(montoSolicitado) {
  const montoDisponible = this.montoActual - this.montoAsignado;
  return {
    suficiente: montoSolicitado <= montoDisponible,
    montoDisponible,
    montoFaltante: montoSolicitado > montoDisponible ? montoSolicitado - montoDisponible : 0
  };
};

// Método para obtener resumen del día
cajaSchema.methods.obtenerResumenDia = function(fecha = new Date()) {
  const inicioDia = new Date(fecha);
  inicioDia.setHours(0, 0, 0, 0);
  const finDia = new Date(fecha);
  finDia.setHours(23, 59, 59, 999);
  
  const movimientosDia = this.movimientos.filter(m => {
    const fechaMov = new Date(m.fecha);
    return fechaMov >= inicioDia && fechaMov <= finDia;
  });
  
  const resumen = movimientosDia.reduce((acc, mov) => {
    switch(mov.tipo) {
      case 'ingreso':
      case 'devolucion':
        acc.totalIngresos += mov.monto;
        break;
      case 'egreso':
      case 'asignacion':
        acc.totalEgresos += mov.monto;
        break;
      case 'ajuste':
        if (mov.monto > 0) {
          acc.totalIngresos += mov.monto;
        } else {
          acc.totalEgresos += Math.abs(mov.monto);
        }
        break;
    }
    return acc;
  }, {
    totalIngresos: 0,
    totalEgresos: 0,
    cantidadMovimientos: movimientosDia.length
  });
  
  resumen.balance = resumen.totalIngresos - resumen.totalEgresos;
  resumen.movimientos = movimientosDia;
  
  return resumen;
};

// Virtual para obtener el período formateado
cajaSchema.virtual('periodo').get(function() {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${meses[this.mes - 1]} ${this.año}`;
});

// Virtual para verificar si la caja puede cerrarse
cajaSchema.virtual('puedeCerrarse').get(function() {
  return this.status === 'abierta';
});

// Configurar virtuals en JSON
cajaSchema.set('toJSON', {
  virtuals: true
});

export default mongoose.model('Caja', cajaSchema);