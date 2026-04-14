import { Markup } from 'telegraf';
import { BotContext } from '../types/context';
import { Meeting } from '../models/Meeting';
import { Book, IBook } from '../models/Book';
import { Progress } from '../models/Progress';
import { getSession, setSession, resetSession, MeetingBookOption } from '../session/sessionManager';
import { buildCalendar, formatCalendarHeader, formatMeetingDate } from '../utils/calendar';
import { escapeHtml, formatSavedBooksList } from '../utils/formatters';
import { showMainMenu } from './menuHandler';

// ─── Admin: step 1 — choose book ────────────────────────────────────────────

export async function handleScheduleMeeting(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  // Load all books, deduplicating by externalId (same title added by multiple users)
  const allBooks = await Book.find().sort({ createdAt: 1 });
  const seen = new Set<string>();
  const books = allBooks.filter((b) => {
    if (seen.has(b.externalId)) return false;
    seen.add(b.externalId);
    return true;
  });

  if (books.length === 0) {
    await ctx.reply(
      'There are no books in the club list yet. Add books first.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const queryId = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const meetingBooks: MeetingBookOption[] = books.map((b) => ({
    id: String(b._id),
    title: b.title,
    authors: b.authors,
    publishedDate: b.publishedDate,
  }));

  setSession(chatId, { state: 'scheduling_meeting_book_select', meetingBooks, meetingQueryId: queryId });

  const list = formatSavedBooksList(meetingBooks);
  const numberButtons = meetingBooks.map((_, i) =>
    Markup.button.callback(`${i + 1}`, `pick_meeting_book:${i}:${queryId}`)
  );
  const keyboard = Markup.inlineKeyboard([
    numberButtons,
    [Markup.button.callback('Cancel', 'cancel')],
  ]);

  await ctx.reply(
    `<b>Select a book for the meeting</b> — tap a number:\n\n${list}`,
    { parse_mode: 'HTML', ...keyboard }
  );
}

// ─── Admin: step 2 — choose date ────────────────────────────────────────────

export async function handlePickMeetingBook(
  ctx: BotContext,
  index: number,
  queryId: string
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);

  if (session.meetingQueryId !== queryId || session.state !== 'scheduling_meeting_book_select') {
    await ctx.answerCbQuery('This selection is no longer active. Please start again.', {
      show_alert: true,
    });
    return;
  }

  const book = session.meetingBooks?.[index];
  if (!book) {
    await ctx.answerCbQuery('Invalid selection.', { show_alert: true });
    return;
  }

  setSession(chatId, {
    ...session,
    state: 'scheduling_meeting_date_select',
    meetingBookId: book.id,
  });

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  await ctx.reply(formatCalendarHeader(year, month), {
    parse_mode: 'HTML',
    ...buildCalendar(year, month),
  });

  await ctx.answerCbQuery();
}

// ─── Admin: calendar navigation ─────────────────────────────────────────────

export async function handleCalendarNav(
  ctx: BotContext,
  year: number,
  month: number
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);
  if (session.state !== 'scheduling_meeting_date_select') {
    await ctx.answerCbQuery('This calendar is no longer active.', { show_alert: true });
    return;
  }

  await ctx.editMessageText(formatCalendarHeader(year, month), {
    parse_mode: 'HTML',
    ...buildCalendar(year, month),
  });

  await ctx.answerCbQuery();
}

// ─── Admin: step 3 — save meeting ───────────────────────────────────────────

export async function handleCalendarDay(
  ctx: BotContext,
  year: number,
  month: number,
  day: number
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const session = getSession(chatId);
  if (session.state !== 'scheduling_meeting_date_select' || !session.meetingBookId) {
    await ctx.answerCbQuery('This calendar is no longer active.', { show_alert: true });
    return;
  }

  const meetingDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (meetingDate < today) {
    await ctx.answerCbQuery('Please select a future date.', { show_alert: true });
    return;
  }

  try {
    // Remove progress from the previous meeting before replacing it
    const previousMeeting = await Meeting.findOne({ isActive: true });
    if (previousMeeting) {
      await Progress.deleteMany({ meeting: previousMeeting._id });
    }

    // Deactivate any existing active meeting
    await Meeting.updateMany({ isActive: true }, { isActive: false });

    const meeting = await Meeting.create({
      book: session.meetingBookId,
      date: meetingDate,
      isActive: true,
      createdBy: ctx.dbUser._id,
    });

    // Populate book for the confirmation message
    const populated = await meeting.populate<{ book: IBook }>('book');
    const bookTitle = populated.book?.title ?? 'Unknown';

    await ctx.answerCbQuery();
    await ctx.reply(
      `✅ Meeting scheduled!\n\n📖 <b>${escapeHtml(bookTitle)}</b>\n📅 ${formatMeetingDate(meetingDate)}`,
      { parse_mode: 'HTML' }
    );

    resetSession(chatId);
    await showMainMenu(ctx);
  } catch (err) {
    console.error('Failed to save meeting:', err);
    await ctx.answerCbQuery();
    await ctx.reply('Failed to schedule the meeting. Please try again.');
  }
}

// ─── All users: view active meeting ─────────────────────────────────────────

export async function handleCurrentMeeting(ctx: BotContext): Promise<void> {
  const meeting = await Meeting.findOne({ isActive: true }).populate<{ book: IBook }>('book');

  if (!meeting) {
    await ctx.reply(
      'No upcoming meeting is scheduled yet.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const book = meeting.book;
  const authors =
    book?.authors?.length ? book.authors.join(', ') : 'Unknown author';

  const text =
    `📆 <b>Next Meeting</b>\n\n` +
    `📖 <b>${escapeHtml(book?.title ?? 'Unknown')}</b>\n` +
    `👤 ${escapeHtml(authors)}\n` +
    `📅 ${formatMeetingDate(meeting.date)}`;

  const buttons = [[Markup.button.callback('Back to Menu', 'menu')]];
  if (ctx.dbUser?.isAdmin) {
    buttons.unshift([Markup.button.callback('🗑 Remove Meeting', 'remove_meeting')]);
  }

  await ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

// ─── Admin: remove active meeting ───────────────────────────────────────────

export async function handleRemoveMeeting(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  const deleted = await Meeting.findOneAndDelete({ isActive: true });

  if (!deleted) {
    await ctx.answerCbQuery('No active meeting to remove.', { show_alert: true });
    return;
  }

  // Clean up all progress records for the removed meeting
  await Progress.deleteMany({ meeting: deleted._id });

  await ctx.answerCbQuery('Meeting removed! ✅');
  await ctx.reply('The meeting has been removed.');
  await showMainMenu(ctx);
}
