import Role from "../models/Role.js";
import User from '../models/User.js';

export const createRoles = async () => {
  try {
    // Verificar si ya existen roles
    const count = await Role.estimatedDocumentCount();
    
    if (count > 0) return;

   // Creamos los roles por defecto
    const values = await Promise.all([
      new Role({ name: 'admin' }).save(),
      new Role({ name: 'trabajador' }).save(),
      new Role({ name: 'cliente' }).save()
    ]);

    console.log('✅ Roles creados:', values.map(role => role.name));
  } catch (error) {
    console.error('❌ Error creando roles:', error);
  }
};

export const createAdmin = async () => {
  try {
    
    const adminExists = await User.findOne({ username: 'admin' });
    
    if (adminExists) {
      console.log('✅ Administrador ya existe');
      return;
    }
    const adminRole = await Role.findOne({ name: 'admin' });
    
    if (!adminRole) {
      console.error('❌ Rol de admin no encontrado');
      return;
    }

    const admin = new User({
      username: 'admin',
      email: 'admin@prestamos.com',
      password: 'admin123', // Será encriptado automáticamente
      roles: [adminRole._id]
    });

    await admin.save();
    console.log('✅ Administrador creado con credenciales:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@prestamos.com');
    
  } catch (error) {
    console.error('❌ Error creando administrador:', error);
  }
};
