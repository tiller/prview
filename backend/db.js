const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'prview.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS prs (
    id TEXT PRIMARY KEY,
    number INTEGER NOT NULL,
    repo TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    author_login TEXT NOT NULL,
    author_avatar TEXT,
    category TEXT NOT NULL,
    my_review_state TEXT,
    github_updated_at TEXT NOT NULL,
    last_viewed_at TEXT,
    reviewers TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )
`);

// Migrate: add my_review_state column if it doesn't exist yet
try {
  db.exec('ALTER TABLE prs ADD COLUMN my_review_state TEXT');
} catch (_) {}

function upsertPR(pr) {
  const existing = db.prepare('SELECT last_viewed_at FROM prs WHERE id = ?').get(pr.id);
  const last_viewed_at = existing ? existing.last_viewed_at : null;

  db.prepare(`
    INSERT INTO prs (id, number, repo, title, url, author_login, author_avatar, category, my_review_state, github_updated_at, last_viewed_at, reviewers, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      my_review_state = excluded.my_review_state,
      github_updated_at = excluded.github_updated_at,
      reviewers = excluded.reviewers,
      author_avatar = excluded.author_avatar,
      repo = excluded.repo
  `).run(
    pr.id, pr.number, pr.repo, pr.title, pr.url,
    pr.author_login, pr.author_avatar, pr.category, pr.my_review_state ?? null,
    pr.github_updated_at, last_viewed_at,
    JSON.stringify(pr.reviewers), pr.created_at
  );
}

function getAllPRs() {
  const rows = db.prepare('SELECT * FROM prs ORDER BY github_updated_at DESC').all();
  return rows.map(row => ({
    ...row,
    reviewers: JSON.parse(row.reviewers),
    is_unread: !row.last_viewed_at || row.github_updated_at > row.last_viewed_at,
  }));
}

function getPR(id) {
  return db.prepare('SELECT * FROM prs WHERE id = ?').get(id) || null;
}

function markAsRead(id) {
  db.prepare('UPDATE prs SET last_viewed_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

function markAllAsRead(ids) {
  if (!ids || ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE prs SET last_viewed_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
}

function deletePRsNotIn(ids) {
  if (ids.length === 0) {
    db.exec('DELETE FROM prs');
    return;
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM prs WHERE id NOT IN (${placeholders})`).run(...ids);
}

function markAllAsRead(ids) {
  if (!ids || ids.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE prs SET last_viewed_at = ? WHERE id IN (${placeholders})`).run(now, ...ids);
}

module.exports = { upsertPR, getAllPRs, getPR, markAsRead, markAllAsRead, deletePRsNotIn };
