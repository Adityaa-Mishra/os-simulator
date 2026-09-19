import mongoose from 'mongoose';

const VALID_MODULES = ['cpu', 'process', 'memory', 'disk', 'deadlock', 'filesystem'];

const learningProgressSchema = new mongoose.Schema({
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
  completed: {
    type: Boolean,
    default: false
  },
  simulationsRun: {
    type: Number,
    default: 0,
    min: [0, 'Simulations run cannot be negative']
  },
  lastVisitedAt: {
    type: Date,
    default: Date.now
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

learningProgressSchema.index({ userId: 1, module: 1 }, { unique: true });

const LearningProgress = mongoose.model('LearningProgress', learningProgressSchema);
export default LearningProgress;
export { VALID_MODULES };
