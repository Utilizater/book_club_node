import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IMeeting extends Document {
  book: Types.ObjectId;
  date: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    book: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    date: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Meeting = mongoose.model<IMeeting>('Meeting', MeetingSchema);
