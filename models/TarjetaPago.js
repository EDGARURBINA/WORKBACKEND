import mongoose from 'mongoose';

const tarjetaPagoSchema = new mongoose.Schema({
  prestamo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prestamo',
    required: true,
    unique: true // Una tarjeta por préstamo
  },
  fechaGeneracion: {
    type: Date,
    default: Date.now
  },
  // Información del grid de pagos (15 espacios)
  gridPagos: [{
    posicion: {
      type: Number,
      required: true,
      min: 1,
      max: 15
    },
    numeroPago: {
      type: Number,
      min: 1
    },
    fechaVencimiento: Date,
    monto: {
      type: Number,
      min: 0
    },
    pagado: {
      type: Boolean,
      default: false
    },
    fechaPago: Date,
    montoAbonado: {
      type: Number,
      default: 0
    },
    estadoPago: {
      type: String,
      enum: ['pendiente', 'parcial', 'completo', 'extra'],
      default: 'pendiente'
    },
    esEspacio: {
      type: Boolean,
      default: false // true para posiciones 13, 14, 15
    }
  }],
  // Estado de la tarjeta
  impresa: {
    type: Boolean,
    default: false
  },
  fechaImpresion: Date,
  numeroImpresiones: {
    type: Number,
    default: 0
  },
  // Historial de impresiones
  historialImpresiones: [{
    fecha: {
      type: Date,
      default: Date.now
    },
    usuario: {
      type: String,
      trim: true
    },
    motivo: {
      type: String,
      trim: true
    }
  }],
  // Configuración de la tarjeta
  configuracion: {
    mostrarTelefono: {
      type: Boolean,
      default: true
    },
    mostrarDireccion: {
      type: Boolean,
      default: true
    },
    incluirQR: {
      type: Boolean,
      default: false
    },
    colorTema: {
      type: String,
      default: '#2563eb'
    }
  },
  // Estadísticas calculadas
  estadisticas: {
    pagosPagados: {
      type: Number,
      default: 0
    },
    pagosParciales: {
      type: Number,
      default: 0
    },
    totalAbonado: {
      type: Number,
      default: 0
    },
    saldoPendiente: {
      type: Number,
      default: 0
    },
    progreso: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    ultimaActualizacion: {
      type: Date,
      default: Date.now
    }
  },
  observaciones: {
    type: String,
    trim: true
  },
  activa: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

// Índices para mejor rendimiento
tarjetaPagoSchema.index({ prestamo: 1 });
tarjetaPagoSchema.index({ fechaGeneracion: -1 });
tarjetaPagoSchema.index({ impresa: 1 });

// Middleware para inicializar grid de pagos
tarjetaPagoSchema.pre('save', function(next) {
  // Si es una nueva tarjeta y no tiene grid, inicializarlo
  if (this.isNew && (!this.gridPagos || this.gridPagos.length === 0)) {
    this.gridPagos = [];
    
    // Crear las 15 posiciones del grid
    for (let i = 1; i <= 15; i++) {
      const posicion = {
        posicion: i,
        estadoPago: i <= 12 ? 'pendiente' : 'extra',
        esEspacio: i > 12
      };
      
      // Solo agregar datos de pago para las primeras 12 posiciones
      if (i <= 12) {
        posicion.numeroPago = i;
        // Los demás datos se llenarán cuando se sincronice con los pagos reales
      }
      
      this.gridPagos.push(posicion);
    }
  }
  
  next();
});

// Método para sincronizar con pagos reales
tarjetaPagoSchema.methods.sincronizarConPagos = async function(pagos) {
  try {
    // Actualizar estadísticas
    this.estadisticas.pagosPagados = pagos.filter(p => p.pagado).length;
    this.estadisticas.pagosParciales = pagos.filter(p => p.montoAbonado > 0 && !p.pagado).length;
    this.estadisticas.totalAbonado = pagos.reduce((sum, p) => sum + (p.montoAbonado || 0), 0);
    this.estadisticas.saldoPendiente = pagos.reduce((sum, p) => sum + (p.saldoPendiente || 0), 0);
    this.estadisticas.progreso = pagos.length > 0 ? (this.estadisticas.pagosPagados / 12) * 100 : 0;
    this.estadisticas.ultimaActualizacion = new Date();

    // Sincronizar grid con pagos reales
    pagos.forEach(pago => {
      if (pago.numeroPago <= 12) {
        const gridItem = this.gridPagos.find(g => g.posicion === pago.numeroPago);
        if (gridItem) {
          gridItem.numeroPago = pago.numeroPago;
          gridItem.fechaVencimiento = pago.fechaVencimiento;
          gridItem.monto = pago.monto;
          gridItem.pagado = pago.pagado;
          gridItem.fechaPago = pago.fechaPago;
          gridItem.montoAbonado = pago.montoAbonado || 0;
          
          if (pago.pagado) {
            gridItem.estadoPago = 'completo';
          } else if (pago.montoAbonado > 0) {
            gridItem.estadoPago = 'parcial';
          } else {
            gridItem.estadoPago = 'pendiente';
          }
        }
      }
    });

    await this.save();
    return this;
  } catch (error) {
    throw new Error(`Error al sincronizar tarjeta: ${error.message}`);
  }
};

// Método para marcar como impresa
tarjetaPagoSchema.methods.marcarComoImpresa = function(usuario = 'Sistema', motivo = 'Impresión manual') {
  this.impresa = true;
  this.fechaImpresion = new Date();
  this.numeroImpresiones += 1;
  
  this.historialImpresiones.push({
    fecha: new Date(),
    usuario,
    motivo
  });
  
  return this.save();
};

// Método estático para obtener tarjetas con estadísticas
tarjetaPagoSchema.statics.obtenerConEstadisticas = function(filtros = {}) {
  return this.find(filtros)
    .populate({
      path: 'prestamo',
      populate: {
        path: 'cliente',
        populate: {
          path: 'trabajadorAsignado',
          select: 'nombreCompleto telefono'
        }
      }
    })
    .sort({ fechaGeneracion: -1 });
};

// Método virtual para obtener progreso visual
tarjetaPagoSchema.virtual('progresoVisual').get(function() {
  const pagados = this.estadisticas.pagosPagados || 0;
  const parciales = this.estadisticas.pagosParciales || 0;
  const total = 12;
  
  return {
    completados: pagados,
    parciales: parciales,
    pendientes: total - pagados - parciales,
    porcentaje: Math.round((pagados / total) * 100)
  };
});

export default mongoose.model('TarjetaPago', tarjetaPagoSchema);