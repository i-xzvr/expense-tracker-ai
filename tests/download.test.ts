import assert from "node:assert/strict";
import { test, TestContext } from "node:test";
import { downloadExportFile } from "../src/lib/export/download";

const file = {
  filename: "expenses-all-2026-10-06.csv",
  mimeType: "text/csv;charset=utf-8",
  content: "\uFEFFDate,Amount\r\n2026-10-01,12.50\r\n",
};

function browserHarness(t: TestContext, clickError?: Error) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let clicked = 0;
  let removed = 0;
  let appended = 0;
  let blob: Blob | undefined;
  let callback: (() => void) | undefined;
  let delay = 0;
  const revoked: string[] = [];
  const anchor = {
    href: "",
    download: "",
    style: { display: "" },
    click() {
      clicked++;
      if (clickError) throw clickError;
    },
    remove() {
      removed++;
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout(fn: () => void, milliseconds: number) {
        callback = fn;
        delay = milliseconds;
        return 1;
      },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement(name: string) {
        assert.equal(name, "a");
        return anchor;
      },
      body: {
        appendChild(value: unknown) {
          assert.equal(value, anchor);
          appended++;
        },
      },
    },
  });
  t.mock.method(URL, "createObjectURL", (value: Blob) => {
    blob = value;
    return "blob:test-export";
  });
  t.mock.method(URL, "revokeObjectURL", (value: string) => {
    revoked.push(value);
  });
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldDocument) Object.defineProperty(globalThis, "document", oldDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return {
    anchor,
    revoked,
    state: () => ({ clicked, removed, appended, blob, callback, delay }),
  };
}

test("download uses the exact Blob content and filename, then releases its URL after a delay", async (t) => {
  const harness = browserHarness(t);
  downloadExportFile(file);
  const state = harness.state();
  assert.equal(harness.anchor.download, file.filename);
  assert.equal(harness.anchor.href, "blob:test-export");
  assert.equal(state.blob?.type, file.mimeType);
  assert.equal(await state.blob?.text(), file.content.replace(/^\uFEFF/, ""));
  assert.equal(
    new Uint8Array(await state.blob!.arrayBuffer())[0],
    0xef,
    "UTF-8 BOM is present in download bytes",
  );
  assert.equal(state.clicked, 1);
  assert.equal(state.appended, 1);
  assert.equal(state.removed, 1);
  assert.deepEqual(
    harness.revoked,
    [],
    "URL must remain available when click starts",
  );
  assert.ok(state.delay >= 1_000);
  assert.ok(state.callback);
  state.callback();
  assert.deepEqual(harness.revoked, ["blob:test-export"]);
});

test("failed clicks release resources and throw a message suitable for the UI", (t) => {
  const cause = new Error("Browser download failed");
  const harness = browserHarness(t, cause);
  assert.throws(
    () => downloadExportFile(file),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /download could not start/i);
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.equal(harness.state().removed, 1);
  assert.deepEqual(harness.revoked, ["blob:test-export"]);
  assert.equal(harness.state().callback, undefined);
});

test("server-side callers get a clear browser-only error", () => {
  assert.throws(() => downloadExportFile(file), /only in a browser/i);
});
