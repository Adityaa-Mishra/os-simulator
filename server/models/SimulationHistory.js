import mongoose from 'mongoose';

const VALID_MODULES = ['cpu', 'process', 'memory', 'disk', 'deadlock', 'filesystem'];

const simulationHistorySchema = new mongoose.Schema({
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
  algorithm: {
    type: String,
    required: [true, 'Algorithm identifier is required'],
    trim: true,
    maxLength: [50, 'Algorithm identifier cannot exceed 50 characters']
  },
  inputs: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Simulation inputs are required'],
    validate: {
      validator: function (val) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
        const jsonStr = JSON.stringify(val);
        return jsonStr.length <= 50000; // ~50 KB max
      },
      message: 'Simulation inputs must be a valid JSON object under 50KB'
    }
  },
  metrics: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Simulation metrics are required'],
    validate: {
      validator: function (val) {
        if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
        // Ensure huge snapshot traces are NOT stored in metrics
        if ('snapshots' in val || 'trace' in val) return false;
        const jsonStr = JSON.stringify(val);
        return jsonStr.length <= 50000; // ~50 KB max
      },
      message: 'Metrics must be a valid summary object under 50KB without snapshot traces'
    }
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  toJSON: {
    transform(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

simulationHistorySchema.index({ userId: 1, completedAt: -1 });

const SimulationHistory = mongoose.model('SimulationHistory', simulationHistorySchema);
export default SimulationHistory;
export { VALID_MODULES };
