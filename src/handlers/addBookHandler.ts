import { Context, Markup } from 'telegraf';
import { searchBooks, GoogleBook } from '../services/googleBooksService';
import { getSession, setSession, resetSession } from '../session/sessionManager';
import { formatBookCard, formatSearchResults } from '../utils/formatters';
import { Book } from '../models/Book';
import { showMainMenu } from './menuHandler';
import { BotContext } from '../types/context';

function generateQueryId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

async function sendSearchResults(ctx: Context, results: GoogleBook[], queryId: string): Promise<void> {
  const text = formatSearchResults(results);
  // One numbered button per result in a single row, then Cancel below
  const numberButtons = results.map((_, i) =>
    Markup.button.callback(`${i + 1}`, `pick:${i}:${queryId}`)
  );
  const keyboard = Markup.inlineKeyboard([
    numberButtons,
    [Markup.button.callback('Cancel', 'cancel')],
  ]);
  await ctx.reply(
    `<b>Search results</b> — tap a number to select:\n\n${text}`,
    { parse_mode: 'HTML', ...keyboard }
  );
}

export async function handleAddBook(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  setSession(chatId, { state: 'waiting_for_search_query' });

  await ctx.reply(
    'Type the title of the book you want to find.',
    Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
  );
}

export async function handleSearchInput(ctx: Context, query: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  await ctx.reply('Searching…');

  let results: GoogleBook[];
  try {
    results = await searchBooks(query);
  } catch (err) {
    console.error('Google Books search failed:', err);
    await ctx.reply('Something went wrong while searching. Please try again.');
    return;
  }

  if (results.length === 0) {
    await ctx.reply(
      "I couldn't find any books for that title.",
      Markup.inlineKeyboard([
        [Markup.button.callback('Try Again', 'add_book'), Markup.button.callback('Cancel', 'cancel')],
      ])
    );
    return;
  }

  const queryId = generateQueryId();
  setSession(chatId, { state: 'showing_search_results', searchResults: results, queryId });

  await sendSearchResults(ctx, results, queryId);
}

export async function handlePickBook(ctx: Context, index: number, queryId: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);

  if (session.queryId !== queryId || session.state !== 'showing_search_results') {
    await ctx.answerCbQuery('This search is no longer active. Please start a new search.', {
      show_alert: true,
    });
    return;
  }

  const book = session.searchResults?.[index];
  if (!book) {
    await ctx.answerCbQuery('Invalid selection.', { show_alert: true });
    return;
  }

  setSession(chatId, { ...session, state: 'showing_selected_book', selectedBook: book });

  const card = formatBookCard(book);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('Save Book', `save:${queryId}`)],
    [Markup.button.callback('Back to Results', `back_results:${queryId}`)],
    [Markup.button.callback('Cancel', 'cancel')],
  ]);

  if (book.thumbnail) {
    await ctx.replyWithPhoto(book.thumbnail, {
      caption: card,
      parse_mode: 'HTML',
      ...keyboard,
    });
  } else {
    await ctx.reply(card, { parse_mode: 'HTML', ...keyboard });
  }

  await ctx.answerCbQuery();
}

export async function handleSaveBook(ctx: BotContext, queryId: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);

  if (session.queryId !== queryId || session.state !== 'showing_selected_book') {
    await ctx.answerCbQuery('This search is no longer active. Please start a new search.', {
      show_alert: true,
    });
    return;
  }

  const book = session.selectedBook;
  if (!book) {
    await ctx.answerCbQuery('No book selected.', { show_alert: true });
    return;
  }

  try {
    // Duplicate check is per-user: same user cannot add the same volume twice
    const existing = await Book.findOne({ externalId: book.id, addedBy: ctx.dbUser._id });
    if (existing) {
      await ctx.answerCbQuery();
      await ctx.reply('This book is already in your list.');
      resetSession(chatId);
      await showMainMenu(ctx);
      return;
    }

    await Book.create({
      externalId: book.id,
      title: book.title,
      authors: book.authors,
      publishedDate: book.publishedDate,
      language: book.language,
      description: book.description,
      thumbnail: book.thumbnail,
      rawGooglePayload: book,
      addedBy: ctx.dbUser._id,
    });

    await ctx.answerCbQuery();
    await ctx.reply('Book saved successfully! ✅');
    resetSession(chatId);
    await showMainMenu(ctx);
  } catch (err) {
    console.error('Failed to save book:', err);
    await ctx.answerCbQuery();
    await ctx.reply('Failed to save the book. Please try again.');
  }
}

export async function handleBackToResults(ctx: Context, queryId: string): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);

  if (session.queryId !== queryId || !session.searchResults) {
    await ctx.answerCbQuery('This search is no longer active. Please start a new search.', {
      show_alert: true,
    });
    return;
  }

  setSession(chatId, { ...session, state: 'showing_search_results', selectedBook: undefined });

  await sendSearchResults(ctx, session.searchResults, queryId);
  await ctx.answerCbQuery();
}
