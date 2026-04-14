# CLAUDE.md — Book Club Bot

> **Maintenance rule:** This file must be updated whenever a significant change is made to the project — new features, schema changes, architectural decisions, or removed functionality. Outdated documentation is worse than no documentation.

---

## Project concept

A Telegram bot for a book club. Members can search for books via the Google Books API, save books to a personal list, and remove books they added. The bot is personal-first: each user has their own book list. There is an `is_admin` flag on users reserved for future role-based features.

---

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict, CommonJS, ES2022 target) |
| Runtime | Node.js 18+ |
| Bot framework | Telegraf v4 |
| Database | MongoDB via Mongoose |
| Book search | Google Books API |
| Config | dotenv |

---

## Environment variables

All three are required. The bot throws on startup if any is missing.

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_KEY` | Telegraf bot token |
| `MONGO_URI` | MongoDB connection string |
| `GOOGLE_KEY` | Google Books API key |

---

## How to run

```bash
# Development (ts-node, no build step)
npm run dev

# Production
npm run build
npm start
```

---

## Project structure

```
src/
  index.ts                      Entry point — loads dotenv, connects DB, launches bot
  bot.ts                        Telegraf setup, middleware registration, all action routing
  db.ts                         Mongoose connection helper

  config/
    env.ts                      Reads and validates environment variables

  types/
    context.ts                  BotContext — extends Telegraf Context with dbUser: IUser

  models/
    User.ts                     users collection
    Book.ts                     books collection

  middleware/
    userMiddleware.ts           Upserts the Telegram user into MongoDB on every interaction
                                and attaches the document to ctx.dbUser

  handlers/
    menuHandler.ts              showMainMenu() — sends the main inline keyboard
    addBookHandler.ts           Full "Add Book" flow (search → pick → save)
    viewBooksHandler.ts         "View Books" flow + remove book action

  services/
    googleBooksService.ts       Google Books API client (search with Russian-first strategy)

  session/
    sessionManager.ts           In-memory per-chat state machine for the Add Book flow

  utils/
    formatters.ts               HTML-safe text formatters for book cards and lists
```

---

## Data models

### User (`users` collection)

| Field | Type | Notes |
|---|---|---|
| `telegramId` | Number | Unique. Telegram user ID |
| `username` | String | Optional. Telegram @handle |
| `firstName` | String | Optional |
| `lastName` | String | Optional |
| `isAdmin` | Boolean | Default `false`. Reserved for future admin features |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto. Updated on every interaction via upsert |

### Book (`books` collection)

| Field | Type | Notes |
|---|---|---|
| `externalId` | String | Google Books volume ID |
| `title` | String | Required |
| `authors` | String[] | Default `[]` |
| `publishedDate` | String | Optional |
| `language` | String | Optional |
| `description` | String | Optional |
| `thumbnail` | String | Optional. HTTPS URL to cover image |
| `rawGooglePayload` | Mixed | Full Google Books item stored for future use |
| `addedBy` | ObjectId | Ref `User`. Required |
| `createdAt` | Date | Auto |
| `updatedAt` | Date | Auto |

**Index:** compound unique on `{ externalId, addedBy }` — the same book can be added by multiple users, but one user cannot add the same volume twice.

---

## Bot flows

### Main menu
Shown on `/start` and after any completed or cancelled action.
Buttons: **Add Book**, **View Books**.

### Add Book
1. Bot asks for a title (text input).
2. Google Books is queried with `intitle:<query>` + `langRestrict=ru`. Falls back to a broader query if no results.
3. Up to 5 results shown as a formatted numbered list with author and year. Numbered buttons `[1]…[5]` for selection.
4. Selected book shown as a card (title, authors, date, language, trimmed description, cover photo if available).
5. Buttons: **Save Book**, **Back to Results**, **Cancel**.
6. On save: duplicate check per user → store with `addedBy` → success message → main menu.

### View Books
1. Loads the current user's books sorted by `createdAt` descending.
2. Shows a numbered list with title, authors, and year.
3. Each book has a `[🗑 Remove #N]` button.
4. On remove: ownership is verified server-side before deletion. After removal the list is re-rendered (or main menu shown if now empty).

---

## Session state machine

Stored in memory (Map keyed by chat ID). Resets on bot restart.

```
idle
  └─ add_book action → waiting_for_search_query
       └─ text message → showing_search_results  (queryId generated)
            └─ pick button → showing_selected_book
                 ├─ save → idle
                 ├─ back_results → showing_search_results
                 └─ cancel → idle
```

`queryId` is a short timestamp+random string embedded in callback data. Clicking a button from a previous search detects the stale `queryId` and shows an alert instead of acting on it.

---

## Callback data format

| Pattern | Handler | Notes |
|---|---|---|
| `menu` | showMainMenu | |
| `add_book` | handleAddBook | |
| `view_books` | handleViewBooks | |
| `cancel` | reset + showMainMenu | |
| `pick:<i>:<queryId>` | handlePickBook | i = 0-based result index |
| `save:<queryId>` | handleSaveBook | |
| `back_results:<queryId>` | handleBackToResults | |
| `remove_book:<bookId>` | handleRemoveBook | bookId = MongoDB _id hex |

All callback data stays well under Telegram's 64-byte limit.

---

## Error handling

- Missing env vars → throw on startup (fail fast).
- Google API non-2xx → friendly "Something went wrong" message, search state preserved.
- No search results → friendly message with Try Again / Cancel buttons.
- Duplicate book → "This book is already in your list."
- Mongo save failure → logged + friendly message.
- Stale callback query (button from old session) → Telegram alert popup, no crash.
- "Query is too old" Telegram error → silently ignored in `bot.catch()`.
- All other handler errors → caught by `bot.catch()`, user notified, bot stays alive.

---

## Known limitations / future work

- Session is in-memory — restarts clear all in-flight Add Book flows.
- No pagination on the books list.
- `is_admin` flag exists but no admin-only commands are implemented yet.
- No voting or social features yet.
- No user authentication beyond Telegram identity.
