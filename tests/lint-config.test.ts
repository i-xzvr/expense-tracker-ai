import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";
import eslintConfig from "../eslint.config.mjs";

test("Next lint discovers pages through a root-directory glob and enforces Link navigation", async (t) => {
  // Match a real installation/monorepo layout on its own volume. Windows CI
  // checks out on D: while OS TEMP is C:, and the scoped glob adapter returns
  // paths relative to the process cwd. Keep this synthetic fixture in ignored
  // work/ so cross-volume temporary paths cannot invalidate directory lookup.
  const tempRoot = resolve("work/lint-fixtures");
  await mkdir(tempRoot, { recursive: true });
  const fixtureRoot = await mkdtemp(join(tempRoot, "expense-tracker-lint-"));
  t.after(async () => {
    // Only remove this test's direct, uniquely named temporary directory.
    assert.match(relative(tempRoot, resolve(fixtureRoot)), /^expense-tracker-lint-[^\\/]+$/);
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const pagesDirectory = join(fixtureRoot, "apps", "tracker", "pages");
  await mkdir(pagesDirectory, { recursive: true });
  await writeFile(
    join(pagesDirectory, "about.tsx"),
    "export default function About() { return <h1>About</h1>; }\n",
  );

  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: [
      ...eslintConfig,
      {
        settings: {
          react: { version: "19.3.0" },
          // A glob forces Next's directory resolver through the scoped
          // tinyglobby replacement instead of its default-cwd shortcut.
          next: { rootDir: join(fixtureRoot, "apps", "*") },
        },
      },
    ],
  });
  const filePath = join(fixtureRoot, "src", "navigation.tsx");
  const [nativeLink] = await eslint.lintText(
    'export default function Navigation() { return <a href="/about">About</a>; }',
    { filePath },
  );

  assert.equal(nativeLink.fatalErrorCount, 0);
  assert.equal(nativeLink.warningCount, 0);
  assert.deepEqual(
    nativeLink.messages.map(({ ruleId, severity }) => ({ ruleId, severity })),
    [{ ruleId: "@next/next/no-html-link-for-pages", severity: 2 }],
    "The project configuration must retain Next rules and find the globbed page",
  );
  assert.match(nativeLink.messages[0].message, /\/about/);

  const [nextLink] = await eslint.lintText(
    'import Link from "next/link"; export default function Navigation() { return <Link href="/about">About</Link>; }',
    { filePath },
  );
  assert.deepEqual(nextLink.messages, [], "Valid Next Link navigation must remain allowed");
});
