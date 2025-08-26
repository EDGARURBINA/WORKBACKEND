
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Cargar variables de entorno
dotenv.config();

const vencerPagos = async () => {
  try {
    console.log('🚀 Venciendo pagos para prueba de moratorios...');
    console.log('');

    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');

    // Importar TODOS los modelos para evitar errores de populate
    const { default: Pago } = await import('../models/Pago.js');
    const { default: Prestamo } = await import('../models/Prestamo.js');
    const { default: Cliente } = await import('../models/Cliente.js');
    
    console.log('✅ Modelos importados correctamente');

    // Buscar pagos no pagados para vencer (SIN populate por ahora)
    const pagosNoPagados = await Pago.find({ 
      pagado: false 
    }).limit(5);

    if (pagosNoPagados.length === 0) {
      console.log('❌ No hay pagos pendientes para vencer');
      console.log('   Todos tus pagos están pagados');
      await mongoose.connection.close();
      return;
    }

    console.log(`📋 Encontrados ${pagosNoPagados.length} pagos pendientes`);
    console.log('');

    // Vencer los pagos (mover fechas atrás)
    const pagosVencidos = [];
    
    for (let i = 0; i < Math.min(3, pagosNoPagados.length); i++) {
      const pago = pagosNoPagados[i];
      
      // Calcular nueva fecha vencida (3-10 días atrás)
      const diasAtraso = 3 + (i * 3); // 3, 6, 9 días
      const fechaVencida = new Date();
      fechaVencida.setDate(fechaVencida.getDate() - diasAtraso);
      
      // Guardar fecha original para backup
      const fechaOriginal = pago.fechaVencimiento;
      
      // Actualizar la fecha de vencimiento
      await Pago.findByIdAndUpdate(pago._id, {
        fechaVencimiento: fechaVencida
      });
      
      // Obtener información del préstamo y cliente por separado
      const prestamo = await Prestamo.findById(pago.prestamo);
      const cliente = prestamo ? await Cliente.findById(prestamo.cliente) : null;
      
      pagosVencidos.push({
        _id: pago._id,
        numeroPago: pago.numeroPago,
        cliente: cliente ? cliente.nombre : 'Cliente desconocido',
        diasAtraso,
        fechaOriginal,
        fechaNueva: fechaVencida
      });
      
      console.log(`✅ Pago #${pago.numeroPago} (${cliente ? cliente.nombre : 'Cliente desconocido'}) - Vencido ${diasAtraso} días`);
    }

    console.log('');
    console.log('🎉 ¡PAGOS VENCIDOS CREADOS EXITOSAMENTE!');
    console.log('');
    console.log('📋 RESUMEN:');
    pagosVencidos.forEach(pago => {
      console.log(`   📅 ${pago.cliente} - Pago #${pago.numeroPago} (${pago.diasAtraso} días vencido)`);
    });
    console.log('');
    console.log('🎯 SIGUIENTES PASOS:');
    console.log('1. Ve a /moratorios en tu frontend');
    console.log('2. Deberías ver estos pagos vencidos en la tabla');
    console.log('3. Prueba aplicar/modificar/quitar moratorios');
    console.log('');
    console.log('🔄 PARA RESTAURAR DESPUÉS:');
    console.log('   node src/scripts/vencerPagosPrueba.js restaurar');

    // Guardar IDs para restaurar después
    const idsVencidos = pagosVencidos.map(p => ({
      _id: p._id.toString(),
      fechaOriginal: p.fechaOriginal.toISOString()
    }));
    
    // Guardar en archivo temporal
    const fs = await import('fs');
    await fs.promises.writeFile(
      'pagos_vencidos_backup.json', 
      JSON.stringify(idsVencidos, null, 2)
    );
    console.log('💾 Backup guardado en: pagos_vencidos_backup.json');

  } catch (error) {
    console.error('❌ Error venciendo pagos:', error.message);
    console.error('Detalles:', error);
  }
};

// ================================
// FUNCIÓN PARA RESTAURAR FECHAS ORIGINALES
// ================================

const restaurarFechas = async () => {
  try {
    console.log('🔄 Restaurando fechas originales...');
    console.log('');
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Conectado a MongoDB');
    
    const { default: Pago } = await import('../models/Pago.js');
    const fs = await import('fs');
    
    // Verificar si existe el archivo de backup
    try {
      await fs.promises.access('pagos_vencidos_backup.json');
    } catch (error) {
      console.log('❌ No se encontró archivo de backup');
      console.log('   Es posible que no hayas vencido pagos o ya los hayas restaurado');
      return;
    }
    
    // Leer backup
    const backupContent = await fs.promises.readFile('pagos_vencidos_backup.json', 'utf8');
    const backup = JSON.parse(backupContent);
    
    console.log(`📋 Restaurando ${backup.length} pagos...`);
    
    for (const item of backup) {
      await Pago.findByIdAndUpdate(item._id, {
        fechaVencimiento: new Date(item.fechaOriginal)
      });
      console.log(`✅ Restaurado pago ${item._id}`);
    }
    
    // Eliminar backup
    await fs.promises.unlink('pagos_vencidos_backup.json');
    console.log('🗑️  Archivo de backup eliminado');
    
    console.log('');
    console.log('🎉 Fechas restauradas correctamente');
    console.log('   Los pagos volvieron a sus fechas originales');
    
  } catch (error) {
    console.error('❌ Error restaurando fechas:', error.message);
  }
};

// ================================
// FUNCIÓN PARA VERIFICAR ESTADO ACTUAL
// ================================

const verificarEstado = async () => {
  try {
    console.log('🔍 Verificando estado actual de pagos...');
    console.log('');
    
    await mongoose.connect(process.env.MONGO_URI);
    const { default: Pago } = await import('../models/Pago.js');
    
    const hoy = new Date();
    const totalPagos = await Pago.countDocuments();
    const pagosPendientes = await Pago.countDocuments({ pagado: false });
    const pagosVencidos = await Pago.countDocuments({
      pagado: false,
      fechaVencimiento: { $lt: hoy }
    });
    
    console.log(`📊 ESTADO ACTUAL:`);
    console.log(`   Total pagos: ${totalPagos}`);
    console.log(`   Pagos pendientes: ${pagosPendientes}`);
    console.log(`   Pagos vencidos: ${pagosVencidos}`);
    console.log('');
    
    if (pagosVencidos > 0) {
      console.log('✅ Tienes pagos vencidos para probar moratorios');
      console.log('   Ve a /moratorios en tu frontend');
    } else {
      console.log('⚠️  No hay pagos vencidos');
      console.log('   Ejecuta: node src/scripts/vencerPagosPrueba.js');
    }
    
  } catch (error) {
    console.error('❌ Error verificando estado:', error.message);
  }
};

// ================================
// FUNCIÓN PRINCIPAL
// ================================

const main = async () => {
  try {
    const comando = process.argv[2];
    
    if (comando === 'restaurar') {
      await restaurarFechas();
    } else if (comando === 'verificar') {
      await verificarEstado();
    } else {
      await vencerPagos();
    }
    
  } catch (error) {
    console.error('❌ Error en script principal:', error);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log('🔌 Conexión cerrada');
    }
    process.exit(0);
  }
};

// Ejecutar función principal
main();

// ================================
// INSTRUCCIONES DE USO
// ================================

/*
COMANDOS DISPONIBLES:

1. Vencer pagos para prueba:
   node src/scripts/vencerPagosPrueba.js

2. Verificar estado actual:
   node src/scripts/vencerPagosPrueba.js verificar

3. Restaurar fechas originales:
   node src/scripts/vencerPagosPrueba.js restaurar

FLUJO RECOMENDADO:
1. Verificar estado: node src/scripts/vencerPagosPrueba.js verificar
2. Vencer pagos: node src/scripts/vencerPagosPrueba.js
3. Probar moratorios en /moratorios
4. Restaurar: node src/scripts/vencerPagosPrueba.js restaurar
*/