import mongoose from 'mongoose';

const VALID_MODULES = ['cpu', 'process', 'memory', 'disk', 'deadlock', 'filesystem'];

const savedSimulationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  module: {
    type: String,
    required: [true, 'Module name is required'],
    enum: {
      values: VALID_MODULES,
      message: '{VALUE} is not a supported simulation module'
    }
  },
  name: {
    type: String,
    required: [true, 'Simulation name is required'],
    trim: true,
    maxLength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters'],
    default: ''
  },
  inputs: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Simulation inputs are required'],
    validate: {
      validator: function (val) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
        // Limit payload size to avoid oversized persistence
        const jsonStr = JSON.stringify(val);
        return jsonStr.length <= 50000; // ~50 KB max
      },
      message: 'Simulation inputs must be a valid JSON object under 50KB'
    }
  },
  tags: {
    type: [String],
    default: []
  },
  presetName: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

savedSimulationSchema.index({ userId: 1, createdAt: -1 });

const SavedSimulation = mongoose.model('SavedSimulation', savedSimulationSchema);
export default SavedSimulation;
export { VALID_MODULES };
