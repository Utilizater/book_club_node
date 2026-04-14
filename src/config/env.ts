function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildMongoUri(baseUri: string, appEnv: 'dev' | 'prod'): string {
  const dbName = appEnv === 'prod' ? 'book_club_prod' : 'book_club_dev';
  // Inject the database name into the URI (handles URIs with or without query params)
  const url = new URL(baseUri);
  url.pathname = `/${dbName}`;
  return url.toString();
}

const rawAppEnv = requireEnv('ENV');
if (rawAppEnv !== 'dev' && rawAppEnv !== 'prod') {
  throw new Error(`ENV must be "dev" or "prod", got: "${rawAppEnv}"`);
}
const appEnv = rawAppEnv as 'dev' | 'prod';

export const env = {
  appEnv,
  telegramBotKey: requireEnv('TELEGRAM_BOT_KEY'),
  mongoUri: buildMongoUri(requireEnv('MONGO_URI'), appEnv),
  googleKey: requireEnv('GOOGLE_KEY'),
};
