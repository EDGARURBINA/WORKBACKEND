import dotenv from 'dotenv';
import app from "./app.js";
import mongoose from 'mongoose';
import { createRoles, createAdmin } from './libs/inicialSetup.js';

dotenv.config();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error('❌ MONGO_URI no está definida en el archivo .env');
}

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado a MongoDB');

    // Crear los roles iniciales
    await createRoles();
    
    // Crear administrador por defecto
    await createAdmin();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
      console.log(`📝 Endpoints disponibles:`);
      console.log(`   POST /api/auth/signin - Login`);
      console.log(`   GET  /api/auth/verify - Verificar token`);
    });
  })
  .catch((error) => {
    console.error('❌ Error al conectar a MongoDB:', error);
  });