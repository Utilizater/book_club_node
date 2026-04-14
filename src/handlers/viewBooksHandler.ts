import { Markup } from 'telegraf';
import { Book } from '../models/Book';
import { formatSavedBooksList } from '../utils/formatters';
import { BotContext } from '../types/context';
import { showMainMenu } from './menuHandler';

export async function handleViewBooks(ctx: BotContext): Promise<void> {
  const books = await Book.find({ addedBy: ctx.dbUser._id }).sort({ createdAt: -1 });

  if (books.length === 0) {
    await ctx.reply(
      'There are no saved books yet.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const list = formatSavedBooksList(books);

  // One remove button per book, each on its own row, then Back to Menu
  const removeButtons = books.map((book, i) => [
    Markup.button.callback(`🗑 Remove #${i + 1}`, `remove_book:${book._id}`),
  ]);
  const keyboard = Markup.inlineKeyboard([
    ...removeButtons,
    [Markup.button.callback('Back to Menu', 'menu')],
  ]);

  await ctx.reply(`📚 <b>My Books</b>\n\n${list}`, {
    parse_mode: 'HTML',
    ...keyboard,
  });
}

export async function handleRemoveBook(ctx: BotContext, bookId: string): Promise<void> {
  // Delete only if the book belongs to this user
  const deleted = await Book.findOneAndDelete({ _id: bookId, addedBy: ctx.dbUser._id });

  if (!deleted) {
    await ctx.answerCbQuery('Book not found or already removed.', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery('Book removed! ✅');

  // Re-render the updated list (or fall back to main menu if now empty)
  const remaining = await Book.countDocuments({ addedBy: ctx.dbUser._id });
  if (remaining === 0) {
    await ctx.reply('There are no saved books yet.');
    await showMainMenu(ctx);
  } else {
    await handleViewBooks(ctx);
  }
}
