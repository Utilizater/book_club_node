import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../types/context';
import { User } from '../models/User';

export const userMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const from = ctx.from;
  if (!from) {
    await next();
    return;
  }

  // Upsert the user record on every interaction, keeping profile fields current
  const user = await User.findOneAndUpdate(
    { telegramId: from.id },
    {
      telegramId: from.id,
      username: from.username,
      firstName: from.first_name,
      lastName: from.last_name,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  ctx.dbUser = user!;
  await next();
}
