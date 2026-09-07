CREATE TABLE IF NOT EXISTS course_chat (
  id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id),
  question TEXT NOT NULL, answer TEXT, status TEXT NOT NULL DEFAULT 'pending',
  error TEXT, created_at TEXT NOT NULL, lease_until INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_chat_per_course ON course_chat(course_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS course_chat_order ON course_chat(course_id,created_at);
