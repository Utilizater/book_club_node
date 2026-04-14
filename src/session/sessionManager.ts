import { GoogleBook } from '../services/googleBooksService';

export type SessionState =
  | 'idle'
  | 'waiting_for_search_query'
  | 'showing_search_results'
  | 'showing_selected_book'
  | 'scheduling_meeting_book_select'
  | 'scheduling_meeting_date_select';

// Minimal book shape stored in session for meeting scheduling
export interface MeetingBookOption {
  id: string;   // MongoDB _id as string
  title: string;
  authors: string[];
  publishedDate?: string;
}

export interface Session {
  state: SessionState;
  // Book-add flow
  searchResults?: GoogleBook[];
  selectedBook?: GoogleBook;
  queryId?: string;
  // Meeting scheduling flow
  meetingBooks?: MeetingBookOption[];
  meetingBookId?: string;     // _id of the chosen book
  meetingQueryId?: string;
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
