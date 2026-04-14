import { GoogleBook } from '../services/googleBooksService';

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatBookCard(book: GoogleBook): string {
  const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
  const date = book.publishedDate ?? 'Unknown';
  const lang = book.language ? `\n🌐 Language: ${escapeHtml(book.language.toUpperCase())}` : '';
  const rawDesc = book.description ?? 'No description available.';
  const desc = rawDesc.length > 300 ? rawDesc.slice(0, 300) + '…' : rawDesc;

  return (
    `📖 <b>${escapeHtml(book.title)}</b>\n` +
    `👤 ${escapeHtml(authors)}\n` +
    `📅 ${escapeHtml(date)}${lang}\n\n` +
    escapeHtml(desc)
  );
}

interface BookSummary {
  title: string;
  authors: string[];
  publishedDate?: string;
}

export function formatSearchResults(books: GoogleBook[]): string {
  return books
    .map((book, i) => {
      const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
      const date = book.publishedDate ?? '—';
      const lang = book.language ? ` · ${book.language.toUpperCase()}` : '';
      return (
        `${i + 1}. <b>${escapeHtml(book.title)}</b>\n` +
        `   👤 ${escapeHtml(authors)}\n` +
        `   📅 ${escapeHtml(date)}${lang}`
      );
    })
    .join('\n\n');
}

export function formatSavedBooksList(books: BookSummary[]): string {
  return books
    .map((book, i) => {
      const authors = book.authors.length ? book.authors.join(', ') : 'Unknown author';
      const date = book.publishedDate ?? '—';
      return (
        `${i + 1}. <b>${escapeHtml(book.title)}</b>\n` +
        `   ${escapeHtml(authors)} · ${escapeHtml(date)}`
      );
    })
    .join('\n\n');
}
