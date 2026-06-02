PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS course (
  id                  TEXT PRIMARY KEY,
  source              TEXT NOT NULL,
  source_url          TEXT NOT NULL,
  title               TEXT NOT NULL,
  description_full    TEXT,
  description_snippet TEXT,
  provider            TEXT,
  topics              TEXT,            -- JSON array
  format              TEXT,            -- half_day|full_day|multi_day|weekly|residential|unknown
  cost_type           TEXT,            -- free|paid|unknown
  price_chf           REAL,
  age_min             INTEGER,
  age_max             INTEGER,
  language            TEXT,            -- de|en|fr|it|multi|unknown
  commune             TEXT,
  venue_name          TEXT,
  address             TEXT,
  lat                 REAL,
  lng                 REAL,
  image_url           TEXT,
  image_local_path    TEXT,
  first_seen          TEXT NOT NULL,
  last_seen           TEXT NOT NULL,
  raw                 TEXT
);

CREATE TABLE IF NOT EXISTS occasion (
  id                     TEXT PRIMARY KEY,
  course_id              TEXT NOT NULL REFERENCES course(id) ON DELETE CASCADE,
  iso_year               INTEGER,
  iso_week_start         INTEGER,
  iso_week_end           INTEGER,
  start_date             TEXT,
  end_date               TEXT,
  start_time             TEXT,
  end_time               TEXT,
  holiday_period         TEXT,
  registration_deadline  TEXT,
  spots_available        INTEGER
);

CREATE TABLE IF NOT EXISTS crawl_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at  TEXT,
  finished_at TEXT,
  source      TEXT,
  fetched     INTEGER,
  parsed      INTEGER,
  new         INTEGER,
  updated     INTEGER,
  errors      INTEGER,
  note        TEXT
);

CREATE INDEX IF NOT EXISTS idx_occ_course  ON occasion(course_id);
CREATE INDEX IF NOT EXISTS idx_occ_week    ON occasion(iso_year, iso_week_start);
CREATE INDEX IF NOT EXISTS idx_course_commune ON course(commune);
CREATE INDEX IF NOT EXISTS idx_course_source  ON course(source);
