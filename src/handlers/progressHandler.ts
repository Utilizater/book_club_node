import { Markup } from 'telegraf';
import { BotContext } from '../types/context';
import { Progress, ReadingType } from '../models/Progress';
import { Meeting } from '../models/Meeting';
import { IUser } from '../models/User';
import { IBook } from '../models/Book';
import { getSession, setSession, resetSession } from '../session/sessionManager';
import { escapeHtml } from '../utils/formatters';
import { showMainMenu } from './menuHandler';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function userName(user: IUser): string {
  if (user.firstName) {
    return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName;
  }
  return user.username ? `@${user.username}` : `User ${user.telegramId}`;
}

function rankEmoji(index: number): string {
  return ['🥇', '🥈', '🥉'][index] ?? '·';
}

function progressLine(type: ReadingType, percentage: number, currentPage?: number, totalPages?: number): string {
  if (type === 'paper' && currentPage !== undefined && totalPages !== undefined) {
    return `${currentPage} / ${totalPages} pages (${percentage}%)`;
  }
  return `${percentage}%`;
}

async function getActiveMeeting() {
  return Meeting.findOne({ isActive: true }).populate<{ book: IBook }>('book');
}

/** Persist (upsert) a progress record and confirm to the user. */
async function saveAndConfirm(
  ctx: BotContext,
  meetingId: unknown,
  data: { type: ReadingType; totalPages?: number; currentPage?: number; percentage: number }
): Promise<void> {
  const chatId = ctx.chat!.id;

  await Progress.findOneAndUpdate(
    { user: ctx.dbUser._id, meeting: meetingId },
    { ...data, user: ctx.dbUser._id, meeting: meetingId },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const line = progressLine(data.type, data.percentage, data.currentPage, data.totalPages);
  await ctx.reply(`✅ Progress saved: ${line}`);
  resetSession(chatId);
  await showMainMenu(ctx);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleMyProgress(ctx: BotContext): Promise<void> {
  const meeting = await getActiveMeeting();

  if (!meeting) {
    await ctx.reply(
      'There is no active meeting right now. Progress tracking is only available during an active meeting.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const bookTitle = meeting.book?.title ?? 'Unknown';
  const existing = await Progress.findOne({ user: ctx.dbUser._id, meeting: meeting._id });

  if (!existing) {
    await showTypeSelection(ctx, bookTitle);
    return;
  }

  // Show current progress with actions
  const line = progressLine(existing.type, existing.percentage, existing.currentPage, existing.totalPages);
  const typeLabel = existing.type === 'audio' ? '🎧 Audio Book' : '📄 Paper Book';

  await ctx.reply(
    `📊 <b>Your Reading Progress</b>\n\n` +
    `📖 ${escapeHtml(bookTitle)}\n` +
    `${typeLabel}\n` +
    `Progress: <b>${line}</b>`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Update Progress', 'update_progress')],
        [Markup.button.callback('🔄 Restart', 'restart_progress')],
        [Markup.button.callback('Back to Menu', 'menu')],
      ]),
    }
  );
}

async function showTypeSelection(ctx: BotContext, bookTitle: string): Promise<void> {
  await ctx.reply(
    `How are you reading <b>${escapeHtml(bookTitle)}</b>?`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🎧 Audio Book', 'set_progress_audio'),
          Markup.button.callback('📄 Paper Book', 'set_progress_paper'),
        ],
        [Markup.button.callback('Cancel', 'cancel')],
      ]),
    }
  );
}

// ─── Type selection callbacks ─────────────────────────────────────────────────

export async function handleSetProgressAudio(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  setSession(chatId, { state: 'setting_progress_percentage' });
  await ctx.reply(
    'What percentage have you listened to? Enter a number from 0 to 100.',
    Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
  );
  await ctx.answerCbQuery();
}

export async function handleSetProgressPaper(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  setSession(chatId, { state: 'setting_progress_total_pages' });
  await ctx.reply(
    'How many pages does the book have? Enter the total number of pages.',
    Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
  );
  await ctx.answerCbQuery();
}

// ─── Update existing progress ─────────────────────────────────────────────────

export async function handleUpdateProgress(ctx: BotContext): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const meeting = await Meeting.findOne({ isActive: true });
  if (!meeting) {
    await ctx.answerCbQuery('No active meeting.', { show_alert: true });
    return;
  }

  const existing = await Progress.findOne({ user: ctx.dbUser._id, meeting: meeting._id });
  if (!existing) {
    await ctx.answerCbQuery();
    await handleMyProgress(ctx);
    return;
  }

  if (existing.type === 'paper') {
    setSession(chatId, { state: 'setting_progress_current_page', progressTotalPages: existing.totalPages });
    await ctx.reply(
      `What page are you on now? (0 – ${existing.totalPages})`,
      Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
    );
  } else {
    setSession(chatId, { state: 'setting_progress_percentage' });
    await ctx.reply(
      'What percentage have you listened to? Enter a number from 0 to 100.',
      Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
    );
  }

  await ctx.answerCbQuery();
}

// ─── Restart progress ─────────────────────────────────────────────────────────

export async function handleRestartProgress(ctx: BotContext): Promise<void> {
  const meeting = await Meeting.findOne({ isActive: true }).populate<{ book: IBook }>('book');

  if (!meeting) {
    await ctx.answerCbQuery('No active meeting.', { show_alert: true });
    return;
  }

  await Progress.deleteOne({ user: ctx.dbUser._id, meeting: meeting._id });
  await ctx.answerCbQuery('Progress reset.');
  await showTypeSelection(ctx, meeting.book?.title ?? 'Unknown');
}

// ─── Text input handlers ──────────────────────────────────────────────────────

export async function handleProgressTotalPagesInput(ctx: BotContext, text: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const pages = parseInt(text, 10);

  if (isNaN(pages) || pages <= 0) {
    await ctx.reply('Please enter a valid number of pages (positive whole number).');
    return;
  }

  setSession(chatId, { state: 'setting_progress_current_page', progressTotalPages: pages });
  await ctx.reply(
    `Got it — ${pages} pages total.\nWhat page are you on? (0 – ${pages})`,
    Markup.inlineKeyboard([[Markup.button.callback('Cancel', 'cancel')]])
  );
}

export async function handleProgressCurrentPageInput(ctx: BotContext, text: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const session = getSession(chatId);
  const totalPages = session.progressTotalPages;

  if (!totalPages) {
    await ctx.reply('Something went wrong. Please start again.');
    resetSession(chatId);
    await showMainMenu(ctx);
    return;
  }

  const page = parseInt(text, 10);

  if (isNaN(page) || page < 0) {
    await ctx.reply('Please enter a valid page number (0 or more).');
    return;
  }

  if (page > totalPages) {
    await ctx.reply(`Current page cannot exceed ${totalPages}. Enter a number between 0 and ${totalPages}.`);
    return;
  }

  const meeting = await Meeting.findOne({ isActive: true });
  if (!meeting) {
    await ctx.reply('The active meeting was removed. Progress could not be saved.');
    resetSession(chatId);
    await showMainMenu(ctx);
    return;
  }

  const percentage = Math.round((page / totalPages) * 100);
  await saveAndConfirm(ctx, meeting._id, { type: 'paper', totalPages, currentPage: page, percentage });
}

export async function handleProgressPercentageInput(ctx: BotContext, text: string): Promise<void> {
  const chatId = ctx.chat!.id;
  const value = parseInt(text, 10);

  if (isNaN(value) || value < 0 || value > 100) {
    await ctx.reply('Please enter a percentage between 0 and 100.');
    return;
  }

  const meeting = await Meeting.findOne({ isActive: true });
  if (!meeting) {
    await ctx.reply('The active meeting was removed. Progress could not be saved.');
    resetSession(chatId);
    await showMainMenu(ctx);
    return;
  }

  await saveAndConfirm(ctx, meeting._id, { type: 'audio', percentage: value });
}

// ─── Group progress ───────────────────────────────────────────────────────────

export async function handleGroupProgress(ctx: BotContext): Promise<void> {
  const meeting = await Meeting.findOne({ isActive: true }).populate<{ book: IBook }>('book');

  if (!meeting) {
    await ctx.reply(
      'There is no active meeting right now.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const progresses = await Progress.find({ meeting: meeting._id })
    .populate<{ user: IUser }>('user')
    .sort({ percentage: -1 });

  const bookTitle = meeting.book?.title ?? 'Unknown';

  if (progresses.length === 0) {
    await ctx.reply(
      `👥 <b>Group Progress</b>\n📖 ${escapeHtml(bookTitle)}\n\nNo one has set their progress yet.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]]) }
    );
    return;
  }

  const lines = progresses.map((p, i) => {
    const name = escapeHtml(userName(p.user));
    const line = progressLine(p.type, p.percentage, p.currentPage, p.totalPages);
    return `${rankEmoji(i)} ${name} — ${line}`;
  });

  await ctx.reply(
    `👥 <b>Group Progress</b>\n📖 ${escapeHtml(bookTitle)}\n\n${lines.join('\n')}`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]]) }
  );
}
