import mongoose from 'mongoose';
import { env } from './config/env';

export async function connectDb(): Promise<void> {
  await mongoose.connect(env.mongoUri);
  console.log(`Connected to MongoDB [${env.appEnv}]`);
}
