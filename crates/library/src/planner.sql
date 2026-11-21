CREATE TABLE planner_state (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), settings TEXT NOT NULL
) STRICT;
-- Archive index entries and active items share the same logical identity.
CREATE TABLE planner_item_keys (id TEXT PRIMARY KEY) STRICT;
CREATE TABLE planner_sessions (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL,
 item TEXT GENERATED ALWAYS AS (json_extract(payload,'$.item')) STORED NOT NULL REFERENCES planner_item_keys
) STRICT;
CREATE TABLE planner_rules (
 id TEXT PRIMARY KEY, payload TEXT NOT NULL,
 item TEXT GENERATED ALWAYS AS (json_extract(payload,'$.item')) STORED NOT NULL REFERENCES planner_item_keys
) STRICT;
CREATE TABLE planner_sources (id TEXT PRIMARY KEY,payload TEXT NOT NULL) STRICT;
CREATE TABLE planner_meetings (
 id TEXT PRIMARY KEY,payload TEXT NOT NULL,
 parent TEXT GENERATED ALWAYS AS (json_extract(payload,'$.parent')) STORED REFERENCES planner_item_keys,
 source TEXT GENERATED ALWAYS AS (json_extract(payload,'$.source')) STORED REFERENCES planner_sources
) STRICT;
CREATE UNIQUE INDEX planner_import_identity ON planner_meetings(source,json_extract(payload,'$.uid')) WHERE source IS NOT NULL;
PRAGMA user_version=3;
