import jwt from 'jsonwebtoken';
import config from '../../config.js';
import User from '../models/User.js';
import Role from '../models/Role.js';

// Verificar token
export const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        message: 'Acceso denegado. No token provided.'
      });
    }

    const decoded = jwt.verify(token, config.SECRET);
    const user = await User.findById(decoded.id).populate('roles');

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: 'Token inválido'
      });
    }

    req.userId = decoded.id;
    req.user = user;
    next();

  } catch (error) {
    return res.status(401).json({
      message: 'Token inválido'
    });
  }
};

// Verificar si es admin
export const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate('roles');
    const roles = user.roles.map(role => role.name);
    
    if (roles.includes('admin')) {
      next();
      return;
    }
    
    return res.status(403).json({
      message: 'Requiere rol de administrador'
    });
    
  } catch (error) {
    return res.status(500).json({
      message: 'Error verificando permisos'
    });
  }
};

// Verificar si es moderator o admin
export const isTrabajador = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).populate('roles');
    const roles = user.roles.map(role => role.name);
    
    if (roles.includes('trabajador') || roles.includes('admin')) {
      next();
      return;
    }
    
    return res.status(403).json({
      message: 'Requiere rol de trabajador o administrador'
    });
    
  } catch (error) {
    return res.status(500).json({
      message: 'Error verificando permisos'
    });
  }
};
