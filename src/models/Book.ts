import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IBook extends Document {
  externalId: string;
  title: string;
  authors: string[];
  publishedDate?: string;
  language?: string;
  description?: string;
  thumbnail?: string;
  rawGooglePayload?: object;
  addedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookSchema = new Schema<IBook>(
  {
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    authors: { type: [String], default: [] },
    publishedDate: String,
    language: String,
    description: String,
    thumbnail: String,
    rawGooglePayload: Schema.Types.Mixed,
    addedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// A user cannot add the same Google volume twice, but different users can add the same book
BookSchema.index({ externalId: 1, addedBy: 1 }, { unique: true });

export const Book = mongoose.model<IBook>('Book', BookSchema);
