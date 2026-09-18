-- ==========================================================================
-- MESSAGES BETWEEN PEOPLE
--
-- The system already records what everybody DID: who filed a period, who
-- validated it, who approved it, who amended a development and why. What it
-- had nowhere to put is the conversation around all of that — a project
-- manager asking the PMO manager whether a variation is going to be approved
-- before the period closes, the administrator telling somebody their
-- assignment has changed.
--
-- Until now that happened in WhatsApp, which means the reasoning behind a
-- figure lives on somebody's phone and leaves the company when they do.
--
-- WHAT THIS IS NOT
--
-- A message is not a mutation. It does not go in the change log, it is not
-- replayed, and it does not pass the reconciliation controls — because it
-- moves no figure. Anything that moves a figure still goes through
-- /api/mutations and is still checked before it is written. Keeping the two
-- apart is deliberate: a chat that could change the position would be a way
-- around the entire workflow, and a control system whose integrity depended
-- on what somebody typed in a chat box would not be one.
--
-- WHAT IT IS
--
-- A durable, append-only record of who said what to whom, and when. Messages
-- are never edited and never deleted — the same reason an account that has
-- acted is withdrawn rather than erased. A conversation somebody can silently
-- rewrite is worth less than no record at all, and "I told you about that in
-- March" is exactly the claim this table exists to settle.
--
-- `project_id` is optional and is a REFERENCE, not a foreign key. A message
-- about a development that is later removed is still a true record of what was
-- said; the screen shows the id it names and, when that development is still
-- in the portfolio, links to it.
-- ==========================================================================

create table if not exists messages (
  id           bigserial   primary key,
  sender_id    text        not null references users (id),
  recipient_id text        not null references users (id),
  body         text        not null,
  -- Which development it is about, when it is about one. Deliberately not a
  -- foreign key: see above.
  project_id   text,
  sent_at      timestamptz not null default now(),
  -- When the RECIPIENT opened the conversation. Null means unread. The sender
  -- is never shown a read receipt; this drives the unread count and nothing
  -- else, because a read receipt is a surveillance feature dressed as a
  -- convenience.
  read_at      timestamptz,

  -- A message to yourself is a note, not a conversation, and a thread that
  -- contains one has two people in it who are the same person — which every
  -- query here would then have to special-case.
  constraint message_has_two_people check (sender_id <> recipient_id),
  constraint message_body_present   check (length(btrim(body)) > 0),
  -- Long enough for a real explanation, short enough that the column cannot
  -- become a file store.
  constraint message_body_bounded   check (length(body) <= 4000),
  constraint message_project_shape  check (project_id is null or project_id ~ '^[A-Z]{3}-[0-9]{2}$')
);

-- One conversation is every message between two people in either direction,
-- so the index that matters covers both columns and the order they are read
-- in. The unread count reads the second.
create index if not exists messages_between_idx
  on messages (sender_id, recipient_id, sent_at);
create index if not exists messages_inbox_idx
  on messages (recipient_id, read_at, sent_at desc);
