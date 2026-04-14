import * as dotenv from 'dotenv';
dotenv.config(); // Must run before any env reads

import { connectDb } from './db';
import { createBot } from './bot';

async function main(): Promise<void> {
  await connectDb();

  const bot = createBot();
  bot.launch();
  console.log('Book Club Bot is running...');

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
