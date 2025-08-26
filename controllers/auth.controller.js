import User from "../models/User.js";
import Role from "../models/Role.js";
import jwt from "jsonwebtoken";
import config from "../config.js";

const createToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      username: user.username,
      email: user.email,
    },
    config.SECRET,
    { expiresIn: "24h" }
  );
};


export const signin = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username y password son requeridos",
      });
    }

    const userFound = await User.findOne({ username })
      .populate("roles", "name")
      .exec();

    if (!userFound) {
      return res.status(401).json({
        message: "Credenciales inválidas",
      });
    }


   
    if (!userFound.isActive) {
      return res.status(401).json({
        message: "Usuario desactivado",
      });
    }

    // Verificar password
    const matchPassword = await userFound.comparePassword(password);

    if (!matchPassword) {
      return res.status(401).json({
        message: "Credenciales inválidas",
      });
    }

    // Generar token
    const token = createToken(userFound);

    // Respuesta exitosa
    res.json({
      message: "Login exitoso",
      token,
      user: {
        id: userFound._id,
        username: userFound.username,
        email: userFound.email,
        roles: userFound.roles.map((role) => role.name),
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({
      message: "Error interno del servidor",
    });
  }
};

// Verificar token (para rutas protegidas) correcion
export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, config.SECRET);
    const user = await User.findById(decoded.id)
      .populate("roles", "name")
      .select("-password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "Token inválido",
      });
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles.map((role) => role.name),
      },
    });
  } catch (error) {
    res.status(401).json({
      message: "Token inválido",
    });
  }
};


