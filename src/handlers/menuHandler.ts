import { Markup } from 'telegraf';
import { BotContext } from '../types/context';

export async function showMainMenu(ctx: BotContext): Promise<void> {
  const rows = [
    [Markup.button.callback('📚 Add Book', 'add_book'), Markup.button.callback('📖 View Books', 'view_books')],
    [Markup.button.callback('📆 Current Meeting', 'current_meeting')],
    [Markup.button.callback('📊 My Progress', 'my_progress'), Markup.button.callback('👥 Group Progress', 'group_progress')],
  ];

  if (ctx.dbUser?.isAdmin) {
    rows.push([Markup.button.callback('🗓 Schedule Meeting', 'schedule_meeting')]);
  }

  await ctx.reply(
    'Welcome to the Book Club Bot! Choose an action:',
    Markup.inlineKeyboard(rows)
  );
}
