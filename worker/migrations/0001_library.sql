CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY, subject TEXT NOT NULL, title TEXT NOT NULL,
  filename TEXT NOT NULL, object_key TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE,
  pages TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS sections (
  course_id TEXT NOT NULL REFERENCES courses(id), part INTEGER NOT NULL,
  input TEXT NOT NULL, result TEXT, lease TEXT, lease_until INTEGER DEFAULT 0,
  PRIMARY KEY(course_id, part)
);
CREATE TABLE IF NOT EXISTS budgets (day TEXT PRIMARY KEY, calls INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL);
