# Book Club Bot — Business Requirements

This document describes what the bot does and why, written from a product perspective.
It is the single source of truth for feature scope. Update it whenever a feature is added, changed, or removed.

---

## Product overview

A Telegram bot that serves as a shared tool for a book club.
Members use it to discover books, maintain personal reading lists, and coordinate club activity — all without leaving Telegram.

The bot is personal-first: every user has their own account and their own data.
There are no anonymous interactions; every action is tied to a Telegram identity.

---

## Users and roles

### Member (default)
Any Telegram user who starts the bot becomes a member automatically.
No sign-up or approval is required.

### Admin
A flag (`is_admin`) that can be set per user in the database.
Admin-only features are not yet implemented but the role is reserved for future use.

---

## Features

### F-01 — User registration
**Status:** Implemented

Every user who interacts with the bot is automatically stored in the database on first contact.
Profile fields (name, username) are kept up to date on every subsequent interaction.

Stored per user:
- Telegram ID
- First name, last name, username
- Role (`is_admin`, default false)
- Registration timestamp

---

### F-02 — Main menu
**Status:** Implemented

When a user starts the bot or returns from any flow, they see a main menu with available actions.

Current menu items:
- Add Book
- View Books

---

### F-03 — Add Book
**Status:** Implemented

A member can search for a book and save it to their personal list.

Flow:
1. User taps **Add Book**.
2. Bot asks for a title.
3. User types a title. Bot searches Google Books and returns up to 5 results.
4. Results are shown as a readable list (title, author, year). User picks one by number.
5. Bot shows a book card: title, authors, published date, language, short description, cover image.
6. User taps **Save Book**. The book is saved to their list.
7. A user cannot save the same book (same Google volume ID) to their list more than once.
8. After saving, user is returned to the main menu.

At any point the user can tap **Cancel** to abort and return to the main menu.
From the book card the user can also tap **Back to Results** to pick a different result.

Search behaviour:
- Searches prefer Russian-language editions first.
- Falls back to a language-neutral search if no Russian results are found.

---

### F-04 — View Books
**Status:** Implemented

A member can view their personal list of saved books.

- Shows only the books saved by the current user.
- Each entry shows: title, authors, published year.
- If the list is empty, a friendly message is shown.

---

### F-05 — Remove Book
**Status:** Implemented

A member can remove a book from their own list.

- Remove buttons are shown inline next to each book in the list.
- A user can only remove books they added themselves.
- After removal the list is refreshed automatically.

---

## Out of scope (not yet implemented)

The following are planned for future iterations and must not be built until requirements are written here first.

- Voting / rating books
- Admin commands
- Shared club-wide book list
- Reading progress tracking
- Notifications / reminders
- Book recommendations
