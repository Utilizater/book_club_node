import mongoose, { Document, Schema, Types } from 'mongoose';

export type ReadingType = 'audio' | 'paper';

export interface IProgress extends Document {
  user: Types.ObjectId;
  meeting: Types.ObjectId;
  type: ReadingType;
  totalPages?: number;   // paper only
  currentPage?: number;  // paper only
  percentage: number;    // 0-100; set directly for audio, calculated for paper
  createdAt: Date;
  updatedAt: Date;
}

const ProgressSchema = new Schema<IProgress>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    meeting: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
    type: { type: String, enum: ['audio', 'paper'], required: true },
    totalPages: Number,
    currentPage: Number,
    percentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { timestamps: true }
);

// One progress entry per user per meeting
ProgressSchema.index({ user: 1, meeting: 1 }, { unique: true });

export const Progress = mongoose.model<IProgress>('Progress', ProgressSchema);
