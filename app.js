import express from 'express';
import cors from 'cors';
import authRoutes from "./routes/auth.routes.js"
import clienteRoutes from "./routes/cliente.routes.js"
import prestamoRoutes from "./routes/prestamo.routes.js";
import pagoRoutes from "./routes/pago.routes.js";
import trabajadorRoutes from "./routes/trabajador.routes.js"
import dashboardRoutes from "./routes/dashboard.routes.js"
import moratorioRoutes from "./routes/moratorio.routes.js"
import tarjetaPagoRoutes from "./routes/tarjetaPago.routes.js"

const app = express(); 

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/clientes", clienteRoutes);
app.use("/api/prestamos", prestamoRoutes);
app.use("/api/pagos", pagoRoutes);
app.use ("/api/trabajadores", trabajadorRoutes)
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/moratorios', moratorioRoutes);
app.use('/api/tarjetas-pago', tarjetaPagoRoutes);

export default app;