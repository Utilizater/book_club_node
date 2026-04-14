import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IElectionBook {
  bookId: Types.ObjectId;
  externalId: string;
  title: string;
  authors: string[];
  publishedDate?: string;
}

export interface IElectionVoteR1 {
  userId: Types.ObjectId;
  bookIds: Types.ObjectId[];
}

export interface IElectionVoteR2 {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
}

export interface IElection extends Document {
  status: 'round1' | 'round2' | 'completed';
  books: Types.DocumentArray<IElectionBook & Document>;
  round1Votes: Types.DocumentArray<IElectionVoteR1 & Document>;
  finalists: Types.ObjectId[];
  round2Votes: Types.DocumentArray<IElectionVoteR2 & Document>;
  winners: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ElectionBookSchema = new Schema<IElectionBook>(
  {
    bookId: { type: Schema.Types.ObjectId, ref: 'Book', required: true },
    externalId: { type: String, required: true },
    title: { type: String, required: true },
    authors: { type: [String], default: [] },
    publishedDate: { type: String },
  },
  { _id: false }
);

const ElectionVoteR1Schema = new Schema<IElectionVoteR1>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookIds: [{ type: Schema.Types.ObjectId }],
  },
  { _id: false }
);

const ElectionVoteR2Schema = new Schema<IElectionVoteR2>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: Schema.Types.ObjectId, required: true },
  },
  { _id: false }
);

const ElectionSchema = new Schema<IElection>(
  {
    status: {
      type: String,
      enum: ['round1', 'round2', 'completed'],
      default: 'round1',
      required: true,
    },
    books: [ElectionBookSchema],
    round1Votes: [ElectionVoteR1Schema],
    finalists: [{ type: Schema.Types.ObjectId }],
    round2Votes: [ElectionVoteR2Schema],
    winners: [{ type: Schema.Types.ObjectId }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ElectionSchema.index({ status: 1 });

export const Election = mongoose.model<IElection>('Election', ElectionSchema);
