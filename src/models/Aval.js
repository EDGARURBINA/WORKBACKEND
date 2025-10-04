import mongoose from 'mongoose';

const avalSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  direccion: {
    type: String,
    required: true,
    trim: true
  },
  telefono: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    default: 'personal'
  },

}
, {
  timestamps: true,
  versionKey: false
});

export default mongoose.model('Aval', avalSchema);