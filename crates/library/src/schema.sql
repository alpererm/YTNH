PRAGMA application_id=1498697288;
CREATE TABLE commits (
 id TEXT PRIMARY KEY, parent TEXT REFERENCES commits(id),
 device TEXT NOT NULL, generation INTEGER NOT NULL UNIQUE,
 model_hash TEXT NOT NULL
) STRICT;
CREATE TABLE library (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 id TEXT NOT NULL UNIQUE, head TEXT REFERENCES commits(id),
 import_hash TEXT
) STRICT;
CREATE TABLE items (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('Note','Todo')),
 title TEXT NOT NULL, body TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Todo','Done','Cancelled','Waiting for','On hold')),
 created TEXT NOT NULL, updated TEXT NOT NULL, archived INTEGER NOT NULL CHECK(archived IN (0,1)),
 sequence INTEGER NOT NULL, extras TEXT NOT NULL
) STRICT;
-- Retain the original placement identity across delete/undo and later imports.
CREATE TABLE placement_keys(item TEXT PRIMARY KEY, placement TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE placements (
 id TEXT PRIMARY KEY, item TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 parent TEXT REFERENCES placements(id) DEFERRABLE INITIALLY DEFERRED,
 ordering INTEGER NOT NULL CHECK(ordering>0), root_code TEXT UNIQUE,
 collapsed INTEGER NOT NULL CHECK(collapsed IN (0,1)),
 CHECK(parent IS NULL OR root_code IS NULL), CHECK(id IS NOT parent)
) STRICT;
CREATE INDEX placement_parent_order ON placements(parent,ordering);
CREATE INDEX placement_item ON placements(item);
CREATE TABLE item_values (
 item TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 field TEXT NOT NULL CHECK(field IN ('explicitTags','scheduledDates','tagExclusions','codeAliases')),
 position INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(item,field,position)
) STRICT;
CREATE INDEX item_values_lookup ON item_values(field,value,item);
CREATE TABLE occurrence_states (
 item TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, day TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Todo','Done','Cancelled','Waiting for','On hold')), PRIMARY KEY(item,day)
) STRICT;
CREATE TABLE recurrence (
 item TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
 frequency TEXT NOT NULL, interval INTEGER NOT NULL CHECK(interval>=1), start TEXT NOT NULL, pattern TEXT NOT NULL
) STRICT;
CREATE TABLE targets (
 item TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, start TEXT NOT NULL, end TEXT NOT NULL, extras TEXT NOT NULL
) STRICT;
CREATE TABLE milestones (
 item TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, week TEXT NOT NULL, extras TEXT NOT NULL
) STRICT;
CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
CREATE TABLE link_aliases(code TEXT PRIMARY KEY,item TEXT NOT NULL) STRICT;
CREATE TABLE archive_index(item TEXT PRIMARY KEY, archive TEXT NOT NULL, filename TEXT NOT NULL, position INTEGER NOT NULL, metadata TEXT NOT NULL) STRICT;
CREATE INDEX archive_lookup ON archive_index(archive);
CREATE TABLE files(id TEXT PRIMARY KEY, kind TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes>=0)) STRICT;
CREATE TABLE changes(commit_id TEXT NOT NULL REFERENCES commits(id), entity TEXT NOT NULL, id TEXT NOT NULL, deleted INTEGER NOT NULL, PRIMARY KEY(commit_id,entity,id)) STRICT;
CREATE INDEX changes_entity ON changes(entity,id);
CREATE TABLE applied_imports(operation TEXT PRIMARY KEY, origin TEXT NOT NULL, commit_id TEXT NOT NULL REFERENCES commits(id)) STRICT;
PRAGMA user_version=1;
