import dotenv from 'dotenv';
dotenv.config();

export default {
    SECRET: process.env.JWT_SECRET || 'KeyForJWT',
    DB: {
        URI: process.env.MONGO_URI || 'mongodb://localhost:27017/prestamos',
        OPTIONS: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        }
    }
};