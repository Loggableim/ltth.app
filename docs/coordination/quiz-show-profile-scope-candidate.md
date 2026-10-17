# Quiz Show profile scope candidate

## Scope

This candidate binds Quiz Show's plugin database to the profile captured by PluginAPI and stops startup from inspecting or copying the package legacy database and its WAL/SHM sidecars. It does not implement import, replacement, merge, backup, or recovery of legacy data. Legacy data remains available for a separate explicit import gate.

Quiz seasons and question history are stored in the Quiz Show database, now under the active profile's plugin data directory. `quiz_leaderboard_entries` remains in the active profile's main database. Importing old seasons or history does not implicitly migrate that separate leaderboard table or map season identifiers.

## Music Bot shared cache contract

The Music Bot media cache remains global across profiles by user decision. The cache may share media bytes and cache hit/prune effects across profiles. Its durable entries are media files named by a SHA-256 digest of `trackKey`; requester and profile identity must not be added to cache entries, filenames, indexes, metadata files, or logs. Queue and history records containing `requestedBy` or requester avatar data remain in the profile-bound database.

The regression suite `app/test/music-bot-global-cache-contract.test.js` verifies shared cache identity, hashed media filenames, and the absence of persisted requester/profile metadata for synthetic inputs. It does not change cache policy or inspect real cache contents.

## Verification boundary

The Quiz Show regression tests use temporary roots and synthetic profile identities. The no-auto-import case asserts that initialization does not inspect the package legacy directory, so it does not read any real legacy database or its sidecars. The separate SQLite import/replacement gate still needs its own approved owner, conflict policy, WAL-aware snapshot, recovery journal, and crash-injection tests.
