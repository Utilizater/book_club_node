import { Markup } from 'telegraf';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function buildCalendar(year: number, month: number): ReturnType<typeof Markup.inlineKeyboard> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];

  // Month + year header (non-clickable)
  rows.push([Markup.button.callback(`${MONTH_NAMES[month - 1]} ${year}`, 'cal_noop')]);

  // Weekday header row
  rows.push(DAY_NAMES.map((d) => Markup.button.callback(d, 'cal_noop')));

  // First weekday offset (0 = Mon … 6 = Sun)
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  let offset = firstDay.getDay(); // 0=Sun
  offset = offset === 0 ? 6 : offset - 1; // convert to 0=Mon

  let week: ReturnType<typeof Markup.button.callback>[] = [];

  for (let i = 0; i < offset; i++) {
    week.push(Markup.button.callback(' ', 'cal_noop'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const isPast = date < today;
    week.push(
      isPast
        ? Markup.button.callback('·', 'cal_noop')
        : Markup.button.callback(String(day), `cal_day:${year}:${month}:${day}`)
    );
    if (week.length === 7) {
      rows.push(week);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(Markup.button.callback(' ', 'cal_noop'));
    rows.push(week);
  }

  // Navigation row — hide back arrow when already on the current month
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const prevY = month === 1 ? year - 1 : year;
  const prevM = month === 1 ? 12 : month - 1;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;

  rows.push([
    isCurrentMonth
      ? Markup.button.callback(' ', 'cal_noop')
      : Markup.button.callback('◀ Prev', `cal_nav:${prevY}:${prevM}`),
    Markup.button.callback('Next ▶', `cal_nav:${nextY}:${nextM}`),
  ]);

  rows.push([Markup.button.callback('Cancel', 'cancel')]);

  return Markup.inlineKeyboard(rows);
}

export function formatCalendarHeader(year: number, month: number): string {
  return `Select a date for the meeting:\n<b>${MONTH_NAMES[month - 1]} ${year}</b>`;
}

export function formatMeetingDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
