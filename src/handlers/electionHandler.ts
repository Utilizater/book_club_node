import { Markup } from 'telegraf';
import { Types } from 'mongoose';
import { BotContext } from '../types/context';
import { Election, IElection, IElectionBook } from '../models/Election';
import { Book } from '../models/Book';
import { escapeHtml } from '../utils/formatters';
import { showMainMenu } from './menuHandler';

// ── Vote-count helpers ────────────────────────────────────────────────────────

function computeRound1Counts(election: IElection): Map<string, number> {
  const counts = new Map<string, number>();
  for (const book of election.books) {
    counts.set(book.bookId.toString(), 0);
  }
  for (const voter of election.round1Votes) {
    for (const bookId of voter.bookIds) {
      const key = bookId.toString();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function computeRound2Counts(election: IElection): Map<string, number> {
  const counts = new Map<string, number>();
  for (const finalistId of election.finalists) {
    counts.set(finalistId.toString(), 0);
  }
  for (const vote of election.round2Votes) {
    const key = vote.bookId.toString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function computeFinalists(election: IElection): Types.ObjectId[] {
  const voteCounts = computeRound1Counts(election);

  // Only consider books that received at least one vote
  const nonZeroCounts = Array.from(voteCounts.values()).filter((c) => c > 0);
  if (nonZeroCounts.length === 0) return [];

  const distinctSorted = [...new Set(nonZeroCounts)].sort((a, b) => b - a);
  // Threshold = second-highest distinct count; if only one distinct count, use it (all tied)
  const threshold = distinctSorted.length >= 2 ? distinctSorted[1] : distinctSorted[0];

  return election.books
    .filter((b) => (voteCounts.get(b.bookId.toString()) ?? 0) >= threshold)
    .map((b) => b.bookId as Types.ObjectId);
}

function formatBookEntry(book: IElectionBook): string {
  const author = book.authors?.length ? ` — ${escapeHtml(book.authors[0])}` : '';
  const year = book.publishedDate ? ` (${book.publishedDate.slice(0, 4)})` : '';
  return `<b>${escapeHtml(book.title)}</b>${author}${year}`;
}

// ── Main entry point (all users) ──────────────────────────────────────────────

export async function handleElection(ctx: BotContext): Promise<void> {
  let election = await Election.findOne({ status: { $in: ['round1', 'round2'] } });
  if (!election) {
    election = await Election.findOne({ status: 'completed' }).sort({ createdAt: -1 });
  }

  if (!election) {
    const buttons = [[Markup.button.callback('Back to Menu', 'menu')]];
    if (ctx.dbUser?.isAdmin) {
      buttons.unshift([Markup.button.callback('🗳 Start Election', 'start_election')]);
    }
    await ctx.reply('🗳 <b>Book Election</b>\n\nNo election has been started yet.', {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons),
    });
    return;
  }

  if (election.status === 'round1') {
    await renderRound1(ctx, election, false);
  } else if (election.status === 'round2') {
    await renderRound2(ctx, election, false);
  } else {
    await renderCompleted(ctx, election);
  }
}

// ── Round 1 render ────────────────────────────────────────────────────────────

async function renderRound1(ctx: BotContext, election: IElection, edit: boolean): Promise<void> {
  const voteCounts = computeRound1Counts(election);
  const voterEntry = election.round1Votes.find((v) =>
    (v.userId as Types.ObjectId).equals(ctx.dbUser._id as Types.ObjectId)
  );
  const userVotedIds = new Set(
    (voterEntry?.bookIds ?? []).map((id) => id.toString())
  );

  const lines = election.books.map((b, i) => {
    const count = voteCounts.get(b.bookId.toString()) ?? 0;
    const voted = userVotedIds.has(b.bookId.toString()) ? ' ✅' : '';
    return `${i + 1}. ${formatBookEntry(b)}${voted}  <i>${count} vote${count !== 1 ? 's' : ''}</i>`;
  });

  const text =
    `🗳 <b>Book Election — Round 1</b>\n\n` +
    `Vote for all books you'd like to read next.\n` +
    `Tap a number to vote or remove your vote.\n\n` +
    lines.join('\n');

  // Number toggle buttons in rows of 5
  const numButtons = election.books.map((b, i) => {
    const voted = userVotedIds.has(b.bookId.toString());
    return Markup.button.callback(
      voted ? `✅${i + 1}` : String(i + 1),
      `el_toggle_r1:${b.bookId}`
    );
  });
  const buttonRows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < numButtons.length; i += 5) {
    buttonRows.push(numButtons.slice(i, i + 5));
  }
  buttonRows.push([Markup.button.callback('🔄 Refresh', 'election_refresh')]);
  buttonRows.push([Markup.button.callback('Back to Menu', 'menu')]);
  if (ctx.dbUser?.isAdmin) {
    buttonRows.push([Markup.button.callback('🔒 Close Round 1', 'election_close_r1')]);
    buttonRows.push([Markup.button.callback('❌ Cancel Election', 'election_cancel')]);
  }

  const opts = { parse_mode: 'HTML' as const, ...Markup.inlineKeyboard(buttonRows) };
  if (edit) {
    await ctx.editMessageText(text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}

// ── Admin: start election ─────────────────────────────────────────────────────

export async function handleStartElection(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  const existing = await Election.findOne({ status: { $in: ['round1', 'round2'] } });
  if (existing) {
    await ctx.answerCbQuery('An election is already running.', { show_alert: true });
    return;
  }

  // Load all books, deduplicating by externalId (same as Schedule Meeting)
  const allBooks = await Book.find().sort({ createdAt: 1 });
  const seen = new Set<string>();
  const books = allBooks.filter((b) => {
    if (seen.has(b.externalId)) return false;
    seen.add(b.externalId);
    return true;
  });

  if (books.length === 0) {
    await ctx.answerCbQuery();
    await ctx.reply(
      'There are no books in the club list yet. Add books first.',
      Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]])
    );
    return;
  }

  const snapshot: IElectionBook[] = books.map((b) => ({
    bookId: b._id as Types.ObjectId,
    externalId: b.externalId,
    title: b.title,
    authors: b.authors ?? [],
    publishedDate: b.publishedDate,
  }));

  const election = await Election.create({
    status: 'round1',
    books: snapshot,
    round1Votes: [],
    finalists: [],
    round2Votes: [],
    winners: [],
    createdBy: ctx.dbUser._id,
  });

  await ctx.answerCbQuery();
  await renderRound1(ctx, election, false);
}

// ── Round 1 toggle vote ───────────────────────────────────────────────────────

export async function handleToggleVoteR1(ctx: BotContext, bookIdStr: string): Promise<void> {
  const election = await Election.findOne({ status: 'round1' });
  if (!election) {
    await ctx.answerCbQuery('Round 1 is no longer active.', { show_alert: true });
    return;
  }

  const bookObjId = new Types.ObjectId(bookIdStr);

  // Verify book is part of this election
  const bookInElection = election.books.some((b) =>
    (b.bookId as Types.ObjectId).equals(bookObjId)
  );
  if (!bookInElection) {
    await ctx.answerCbQuery('Invalid selection.', { show_alert: true });
    return;
  }

  const voterEntry = election.round1Votes.find((v) =>
    (v.userId as Types.ObjectId).equals(ctx.dbUser._id as Types.ObjectId)
  );

  if (voterEntry) {
    const alreadyVoted = voterEntry.bookIds.some((id) =>
      (id as Types.ObjectId).equals(bookObjId)
    );
    if (alreadyVoted) {
      // Remove vote
      voterEntry.bookIds = voterEntry.bookIds.filter(
        (id) => !(id as Types.ObjectId).equals(bookObjId)
      ) as typeof voterEntry.bookIds;
    } else {
      // Add vote
      voterEntry.bookIds.push(bookObjId);
    }
  } else {
    // First vote from this user
    election.round1Votes.push({ userId: ctx.dbUser._id as Types.ObjectId, bookIds: [bookObjId] } as any);
  }

  election.markModified('round1Votes');
  await election.save();

  await renderRound1(ctx, election, true);
  await ctx.answerCbQuery();
}

// ── Refresh ───────────────────────────────────────────────────────────────────

export async function handleElectionRefresh(ctx: BotContext): Promise<void> {
  const election = await Election.findOne({ status: { $in: ['round1', 'round2'] } });
  if (!election) {
    await ctx.answerCbQuery('No active election.', { show_alert: true });
    return;
  }
  if (election.status === 'round1') {
    await renderRound1(ctx, election, true);
  } else {
    await renderRound2(ctx, election, true);
  }
  await ctx.answerCbQuery();
}

// ── Admin: close round 1 ──────────────────────────────────────────────────────

export async function handleCloseRound1(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  const election = await Election.findOne({ status: 'round1' });
  if (!election) {
    await ctx.answerCbQuery('Round 1 is no longer active.', { show_alert: true });
    return;
  }

  const finalistIds = computeFinalists(election);

  if (finalistIds.length === 0) {
    await ctx.answerCbQuery('No votes have been cast yet. Cannot close Round 1.', {
      show_alert: true,
    });
    return;
  }

  election.status = 'round2';
  election.finalists = finalistIds;
  await election.save();

  await ctx.answerCbQuery();
  await ctx.reply(
    `✅ Round 1 is closed! <b>${finalistIds.length}</b> book${finalistIds.length !== 1 ? 's' : ''} made it to Round 2.`,
    { parse_mode: 'HTML' }
  );
  await renderRound2(ctx, election, false);
}

// ── Round 2 render ────────────────────────────────────────────────────────────

async function renderRound2(ctx: BotContext, election: IElection, edit: boolean): Promise<void> {
  // Build finalist book list from snapshot, preserving finalist order
  const finalistBooks: IElectionBook[] = [];
  for (const fId of election.finalists) {
    const book = election.books.find((b) => (b.bookId as Types.ObjectId).equals(fId as Types.ObjectId));
    if (book) finalistBooks.push(book);
  }

  const userVote = election.round2Votes.find((v) =>
    (v.userId as Types.ObjectId).equals(ctx.dbUser._id as Types.ObjectId)
  );
  const userVoteBookId = userVote?.bookId?.toString() ?? null;

  const lines = finalistBooks.map((b, i) => {
    const voted = userVoteBookId === b.bookId.toString() ? ' ✅' : '';
    return `${i + 1}. ${formatBookEntry(b)}${voted}`;
  });

  const text =
    `🗳 <b>Book Election — Round 2</b>\n\n` +
    `The finalists are in! Vote for <b>ONE</b> book.\n` +
    `🔒 Votes are anonymous — results revealed when admin closes voting.\n\n` +
    lines.join('\n');

  const voteButtons = finalistBooks.map((b, i) =>
    Markup.button.callback(`Vote ${i + 1}`, `el_vote_r2:${b.bookId}`)
  );
  const buttonRows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < voteButtons.length; i += 4) {
    buttonRows.push(voteButtons.slice(i, i + 4));
  }
  buttonRows.push([Markup.button.callback('Back to Menu', 'menu')]);
  if (ctx.dbUser?.isAdmin) {
    buttonRows.push([Markup.button.callback('🔒 Close Round 2', 'election_close_r2')]);
    buttonRows.push([Markup.button.callback('❌ Cancel Election', 'election_cancel')]);
  }

  const opts = { parse_mode: 'HTML' as const, ...Markup.inlineKeyboard(buttonRows) };
  if (edit) {
    await ctx.editMessageText(text, opts);
  } else {
    await ctx.reply(text, opts);
  }
}

// ── Round 2 vote ──────────────────────────────────────────────────────────────

export async function handleVoteRound2(ctx: BotContext, bookIdStr: string): Promise<void> {
  const election = await Election.findOne({ status: 'round2' });
  if (!election) {
    await ctx.answerCbQuery('Round 2 is no longer active.', { show_alert: true });
    return;
  }

  const bookObjId = new Types.ObjectId(bookIdStr);

  // Verify book is a finalist
  const isFinalist = election.finalists.some((f) =>
    (f as Types.ObjectId).equals(bookObjId)
  );
  if (!isFinalist) {
    await ctx.answerCbQuery('Invalid selection.', { show_alert: true });
    return;
  }

  // Replace or insert round 2 vote (one per user)
  const existingIdx = election.round2Votes.findIndex((v) =>
    (v.userId as Types.ObjectId).equals(ctx.dbUser._id as Types.ObjectId)
  );
  if (existingIdx !== -1) {
    election.round2Votes[existingIdx].bookId = bookObjId;
  } else {
    election.round2Votes.push({ userId: ctx.dbUser._id as Types.ObjectId, bookId: bookObjId } as any);
  }
  election.markModified('round2Votes');
  await election.save();

  await renderRound2(ctx, election, true);
  await ctx.answerCbQuery('Vote recorded! ✅');
}

// ── Admin: close round 2 ──────────────────────────────────────────────────────

export async function handleCloseRound2(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  const election = await Election.findOne({ status: 'round2' });
  if (!election) {
    await ctx.answerCbQuery('Round 2 is no longer active.', { show_alert: true });
    return;
  }

  const voteCounts = computeRound2Counts(election);
  const maxVotes = Math.max(...Array.from(voteCounts.values()));

  if (maxVotes === 0) {
    await ctx.answerCbQuery('No votes have been cast yet. Cannot close Round 2.', {
      show_alert: true,
    });
    return;
  }

  const winnerIds = election.finalists.filter(
    (f) => (voteCounts.get(f.toString()) ?? 0) === maxVotes
  );

  election.status = 'completed';
  election.winners = winnerIds as Types.ObjectId[];
  await election.save();

  await ctx.answerCbQuery();
  await renderCompleted(ctx, election);
}

// ── Results view ──────────────────────────────────────────────────────────────

async function renderCompleted(ctx: BotContext, election: IElection): Promise<void> {
  const voteCounts = computeRound2Counts(election);
  const winnerIds = new Set(election.winners.map((w) => w.toString()));

  const finalistBooks: IElectionBook[] = [];
  for (const fId of election.finalists) {
    const book = election.books.find((b) => (b.bookId as Types.ObjectId).equals(fId as Types.ObjectId));
    if (book) finalistBooks.push(book);
  }

  // Sort by votes descending
  const sorted = [...finalistBooks].sort(
    (a, b) => (voteCounts.get(b.bookId.toString()) ?? 0) - (voteCounts.get(a.bookId.toString()) ?? 0)
  );

  const lines = sorted.map((b) => {
    const count = voteCounts.get(b.bookId.toString()) ?? 0;
    const isWinner = winnerIds.has(b.bookId.toString());
    const prefix = isWinner ? '🥇' : '·';
    return `${prefix} ${formatBookEntry(b)} — <b>${count} vote${count !== 1 ? 's' : ''}</b>`;
  });

  const winners = sorted.filter((b) => winnerIds.has(b.bookId.toString()));
  const winnerNames = winners.map((w) => `<b>${escapeHtml(w.title)}</b>`).join(' & ');
  const headline =
    winners.length > 1
      ? `🏆 <b>Book Election — It's a tie!</b>\n\nCo-winners: ${winnerNames}`
      : `🏆 <b>Book Election — We have a winner!</b>\n\n🎉 ${winnerNames}`;

  const text = `${headline}\n\n<b>Final results:</b>\n${lines.join('\n')}`;

  await ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('Back to Menu', 'menu')]]),
  });
}

// ── Admin: cancel election ────────────────────────────────────────────────────

export async function handleCancelElection(ctx: BotContext): Promise<void> {
  if (!ctx.dbUser?.isAdmin) {
    await ctx.answerCbQuery('Admins only.', { show_alert: true });
    return;
  }

  const election = await Election.findOne({ status: { $in: ['round1', 'round2'] } });
  if (!election) {
    await ctx.answerCbQuery('No active election to cancel.', { show_alert: true });
    return;
  }

  await Election.findByIdAndDelete(election._id);

  await ctx.answerCbQuery('Election cancelled.');
  await ctx.reply('The election has been cancelled.');
  await showMainMenu(ctx);
}
