# Test Conventions

`npm test` runs Jest and only collects files named `*.test.js`.

Standalone verification scripts must use `*.manual.js`. These scripts may start servers, touch runtime data, or call `process.exit()`, so they are intentionally excluded from the default Jest run.

When adding a new automated test, make sure it uses Jest globals such as `describe()`, `test()`, or `it()` and cleans up timers, sockets, files, and mocks in `afterEach()` or `afterAll()`.
