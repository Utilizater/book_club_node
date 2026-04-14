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
import {
  handleScheduleMeeting,
  handlePickMeetingBook,
  handleCalendarNav,
  handleCalendarDay,
  handleCurrentMeeting,
  handleRemoveMeeting,
} from './handlers/meetingHandler';
import {
  handleMyProgress,
  handleSetProgressAudio,
  handleSetProgressPaper,
  handleUpdateProgress,
  handleRestartProgress,
  handleGroupProgress,
  handleProgressTotalPagesInput,
  handleProgressCurrentPageInput,
  handleProgressPercentageInput,
} from './handlers/progressHandler';
import {
  handleElection,
  handleStartElection,
  handleToggleVoteR1,
  handleElectionRefresh,
  handleCloseRound1,
  handleVoteRound2,
  handleCloseRound2,
  handleCancelElection,
} from './handlers/electionHandler';
import { getSession, resetSession } from './session/sessionManager';

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(env.telegramBotKey);

  // Upsert user record on every interaction before any handler runs
  bot.use(userMiddleware);

  bot.start(async (ctx) => {
    await showMainMenu(ctx);
  });

  // Route text input based on current session state
  bot.on(message('text'), async (ctx) => {
    const session = getSession(ctx.chat.id);
    const text = ctx.message.text;

    switch (session.state) {
      case 'waiting_for_search_query':
        await handleSearchInput(ctx, text);
        break;
      case 'setting_progress_total_pages':
        await handleProgressTotalPagesInput(ctx, text);
        break;
      case 'setting_progress_current_page':
        await handleProgressCurrentPageInput(ctx, text);
        break;
      case 'setting_progress_percentage':
        await handleProgressPercentageInput(ctx, text);
        break;
    }
  });

  // ── Menu ──────────────────────────────────────────────────────────────────
  bot.action('menu', async (ctx) => {
    await ctx.answerCbQuery();
    await showMainMenu(ctx);
  });

  // ── Books ─────────────────────────────────────────────────────────────────
  bot.action('add_book', async (ctx) => {
    await ctx.answerCbQuery();
    await handleAddBook(ctx);
  });

  bot.action('view_books', async (ctx) => {
    await ctx.answerCbQuery();
    await handleViewBooks(ctx);
  });

  bot.action('cancel', async (ctx) => {
    await ctx.answerCbQuery();
    resetSession(ctx.chat?.id ?? 0);
    await showMainMenu(ctx);
  });

  // pick:<index>:<queryId>
  bot.action(/^pick:(\d+):(.+)$/, async (ctx) => {
    await handlePickBook(ctx, parseInt(ctx.match[1], 10), ctx.match[2]);
  });

  // save:<queryId>
  bot.action(/^save:(.+)$/, async (ctx) => {
    await handleSaveBook(ctx, ctx.match[1]);
  });

  // back_results:<queryId>
  bot.action(/^back_results:(.+)$/, async (ctx) => {
    await handleBackToResults(ctx, ctx.match[1]);
  });

  // remove_book:<bookId>
  bot.action(/^remove_book:(.+)$/, async (ctx) => {
    await handleRemoveBook(ctx, ctx.match[1]);
  });

  // ── Meetings ──────────────────────────────────────────────────────────────
  bot.action('schedule_meeting', async (ctx) => {
    await ctx.answerCbQuery();
    await handleScheduleMeeting(ctx);
  });

  bot.action('current_meeting', async (ctx) => {
    await ctx.answerCbQuery();
    await handleCurrentMeeting(ctx);
  });

  bot.action('remove_meeting', async (ctx) => {
    await handleRemoveMeeting(ctx);
  });

  // pick_meeting_book:<index>:<queryId>
  bot.action(/^pick_meeting_book:(\d+):(.+)$/, async (ctx) => {
    await handlePickMeetingBook(ctx, parseInt(ctx.match[1], 10), ctx.match[2]);
  });

  // cal_noop — non-clickable calendar cells (header, past days, empty slots)
  bot.action('cal_noop', async (ctx) => {
    await ctx.answerCbQuery();
  });

  // cal_nav:<year>:<month>
  bot.action(/^cal_nav:(\d+):(\d+)$/, async (ctx) => {
    await handleCalendarNav(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10));
  });

  // cal_day:<year>:<month>:<day>
  bot.action(/^cal_day:(\d+):(\d+):(\d+)$/, async (ctx) => {
    await handleCalendarDay(
      ctx,
      parseInt(ctx.match[1], 10),
      parseInt(ctx.match[2], 10),
      parseInt(ctx.match[3], 10)
    );
  });

  // ── Progress ──────────────────────────────────────────────────────────────
  bot.action('my_progress', async (ctx) => {
    await ctx.answerCbQuery();
    await handleMyProgress(ctx);
  });

  bot.action('group_progress', async (ctx) => {
    await ctx.answerCbQuery();
    await handleGroupProgress(ctx);
  });

  bot.action('set_progress_audio', async (ctx) => {
    await handleSetProgressAudio(ctx);
  });

  bot.action('set_progress_paper', async (ctx) => {
    await handleSetProgressPaper(ctx);
  });

  bot.action('update_progress', async (ctx) => {
    await handleUpdateProgress(ctx);
  });

  bot.action('restart_progress', async (ctx) => {
    await handleRestartProgress(ctx);
  });

  // ── Election ──────────────────────────────────────────────────────────────
  bot.action('election', async (ctx) => {
    await ctx.answerCbQuery();
    await handleElection(ctx);
  });

  bot.action('start_election', async (ctx) => {
    await handleStartElection(ctx);
  });

  bot.action('election_refresh', async (ctx) => {
    await handleElectionRefresh(ctx);
  });

  bot.action('election_close_r1', async (ctx) => {
    await handleCloseRound1(ctx);
  });

  bot.action('election_close_r2', async (ctx) => {
    await handleCloseRound2(ctx);
  });

  bot.action('election_cancel', async (ctx) => {
    await handleCancelElection(ctx);
  });

  // el_toggle_r1:<bookId>
  bot.action(/^el_toggle_r1:([0-9a-f]{24})$/, async (ctx) => {
    await handleToggleVoteR1(ctx, ctx.match[1]);
  });

  // el_vote_r2:<bookId>
  bot.action(/^el_vote_r2:([0-9a-f]{24})$/, async (ctx) => {
    await handleVoteRound2(ctx, ctx.match[1]);
  });

  // Global error handler — keeps the bot alive and gives the user feedback
  bot.catch((err, ctx) => {
    const error = err as Error;
    console.error(`Error for update ${ctx.update.update_id}:`, error.message);

    if (error.message.includes('query is too old') || error.message.includes('query ID is invalid')) {
      return;
    }

    ctx.reply('Something went wrong. Please try again.').catch(() => {});
  });

  return bot;
}
