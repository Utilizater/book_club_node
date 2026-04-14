function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const env = {
  telegramBotKey: requireEnv('TELEGRAM_BOT_KEY'),
  mongoUri: requireEnv('MONGO_URI'),
  googleKey: requireEnv('GOOGLE_KEY'),
};
