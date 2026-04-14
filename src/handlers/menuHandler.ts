import { Context, Markup } from 'telegraf';

export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📚 Add Book', 'add_book')],
  [Markup.button.callback('📖 View Books', 'view_books')],
]);

export async function showMainMenu(ctx: Context): Promise<void> {
  await ctx.reply('Welcome to the Book Club Bot! Choose an action:', mainMenuKeyboard);
}
