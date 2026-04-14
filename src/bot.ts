import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { env } from './config/env';
import { BotContext } from './types/context';
import { userMiddleware } from './middleware/userMiddleware';
import { showMainMenu } from './handlers/menuHandler';
import {
  handleAddBook,
  handleSearchInput,
  handlePickBook,
  handleSaveBook,
  handleBackToResults,
} from './handlers/addBookHandler';
import { handleViewBooks, handleRemoveBook } from './handlers/viewBooksHandler';
import { getSession, resetSession } from './session/sessionManager';

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(env.telegramBotKey);

  // Upsert user record on every interaction before any handler runs
  bot.use(userMiddleware);

  bot.start(async (ctx) => {
    await showMainMenu(ctx);
  });

  // Route text input to the active session handler
  bot.on(message('text'), async (ctx) => {
    const session = getSession(ctx.chat.id);
    if (session.state === 'waiting_for_search_query') {
      await handleSearchInput(ctx, ctx.message.text);
    }
  });

  // Main menu
  bot.action('menu', async (ctx) => {
    await ctx.answerCbQuery();
    await showMainMenu(ctx);
  });

  // Add Book
  bot.action('add_book', async (ctx) => {
    await ctx.answerCbQuery();
    await handleAddBook(ctx);
  });

  // View Books
  bot.action('view_books', async (ctx) => {
    await ctx.answerCbQuery();
    await handleViewBooks(ctx);
  });

  // Cancel — return to main menu and clear session
  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    resetSession(ctx.chat?.id ?? 0);
    await showMainMenu(ctx);
  });

  // Pick a search result: pick:<index>:<queryId>
  bot.action(/^pick:(\d+):(.+)$/, async (ctx) => {
    const index = parseInt(ctx.match[1], 10);
    const queryId = ctx.match[2];
    await handlePickBook(ctx, index, queryId);
  });

  // Save the selected book: save:<queryId>
  bot.action(/^save:(.+)$/, async (ctx) => {
    await handleSaveBook(ctx, ctx.match[1]);
  });

  // Back to results: back_results:<queryId>
  bot.action(/^back_results:(.+)$/, async (ctx) => {
    await handleBackToResults(ctx, ctx.match[1]);
  });

  // Remove a book from the user's list: remove_book:<bookId>
  bot.action(/^remove_book:(.+)$/, async (ctx) => {
    await handleRemoveBook(ctx, ctx.match[1]);
  });

  // Global error handler — keeps the bot alive and gives the user feedback
  bot.catch((err, ctx) => {
    const error = err as Error;
    console.error(`Error for update ${ctx.update.update_id}:`, error.message);

    // "Query is too old" means the user tapped a button from a previous bot session.
    // Silently ignore it — there is nothing useful we can send back.
    if (error.message.includes('query is too old') || error.message.includes('query ID is invalid')) {
      return;
    }

    // For everything else, try to notify the user without crashing.
    ctx.reply('Something went wrong. Please try again.').catch(() => {
      // Ignore secondary failures (e.g. bot was blocked by user)
    });
  });

  return bot;
}
