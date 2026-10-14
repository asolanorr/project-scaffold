import { assertTestDatabase, databaseName, ensureTestDatabase, resolveTestUrls } from "./database";

// `pnpm db:test:setup`: the explicit form of what every test run does anyway.
const { directUrl } = resolveTestUrls();
assertTestDatabase(directUrl, "the test database URL");
const { created } = await ensureTestDatabase(directUrl);
console.log(
  `${created ? "Created" : "Found"} "${databaseName(directUrl)}" and applied pending migrations.`,
);
