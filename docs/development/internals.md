# Internals

Technical details that used to be in the in-app Help. They matter for development and troubleshooting, not for everyday use.

## Item identity and codes

- Every item has an immutable UUID. Links and embeds are stored by UUID, so renaming, moving or renumbering never breaks them.
- Items also show a visible code made of the root ID and the item's position among its siblings, for example `001.001.3.2`. The type comes from the item, not from the code.
- Root IDs run from `001.001` to `999.999`: 998,001 roots shared by Notes and Todos.
- Deleting, archiving and cold-archiving never release a root ID. Only an explicit structural release, such as demoting a root item, frees one; the lowest released ID is reused first.
- Codes from before data format 9 remain as aliases after migration.

## Archive and cold archive

- Archive is reversible and applies to a whole branch.
- The cold archive moves older archived branches out of the active library into separate archive files. The active library keeps a small index (UUID, last code, title and archive file), and cold archiving never releases a root ID.

## Grouping and recurrence details

- In Group by → Scheduled date, a recurring Todo appears once, under its next active occurrence on or after today; explicit dates are ignored for recurring Todos in this grouping only.
- Multiple explicit dates can place a non-recurring item in several date groups; multiple tags can place an item in several tag groups. Grouped display is flat, so promote and demote are disabled until Group by returns to None.
- Weekly intervals count Monday-based weeks containing the start date; dates 29–31 clamp to the last day of shorter months.
- A saved "Hide recurring" preference from older versions opens as "Non-recurring" in the Recurrence filter.

## Storage

- A library is a portable `.ytnh` file containing a verified SQLite snapshot and the images it needs. Editing happens in a local SQLite working copy; Save, and closing the app, publish a new verified snapshot to the library file.
- A successful local save doesn't prove that a cloud service has finished uploading the file.
- See [POST-MIGRATION-AUDIT.md](POST-MIGRATION-AUDIT.md) and the portable-master documents in this folder for the storage design and its verification.
