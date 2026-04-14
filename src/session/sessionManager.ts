import { GoogleBook } from '../services/googleBooksService';

export type SessionState =
  | 'idle'
  | 'waiting_for_search_query'
  | 'showing_search_results'
  | 'showing_selected_book';

export interface Session {
  state: SessionState;
  searchResults?: GoogleBook[];
  selectedBook?: GoogleBook;
  queryId?: string;
}

const sessions = new Map<number, Session>();

export function getSession(chatId: number): Session {
  return sessions.get(chatId) ?? { state: 'idle' };
}

export function setSession(chatId: number, session: Session): void {
  sessions.set(chatId, session);
}

export function resetSession(chatId: number): void {
  sessions.set(chatId, { state: 'idle' });
}
