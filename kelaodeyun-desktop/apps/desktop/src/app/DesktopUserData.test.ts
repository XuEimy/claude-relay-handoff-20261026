import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Layer from "effect/Layer";
import * as NodePath from "@effect/platform-node/NodePath";

import { resolveUserDataPath } from "./DesktopUserData.ts";

it.effect.each(["kelaodeyun-v2", "kelaodeyun", "kelaodeyun (Alpha)", "t3code", "T3 Code (Alpha)"])(
  "preserves Windows credential keys from %s without copying browser databases",
  (sourceName) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-v2-profile-" });
      const source = path.join(directory, sourceName);
      const destination = path.join(directory, "agent-cloud-os");
      const state = '{"os_crypt":{"encrypted_key":"test-encrypted-key"}}';
      yield* fs.makeDirectory(path.join(directory, "kelaodeyun (Alpha)"), { recursive: true });
      yield* fs.makeDirectory(path.join(source, "IndexedDB"), { recursive: true });
      yield* fs.writeFileString(path.join(source, "Local State"), state);
      yield* fs.writeFileString(path.join(source, "IndexedDB", "LOCK"), "V1 owns this database");
      yield* resolveUserDataPath({
        appDataDirectory: directory,
        isDevelopment: false,
        platform: "win32",
      });
      if (sourceName === "t3code" || sourceName === "T3 Code (Alpha)") {
        assert.isFalse(yield* fs.exists(destination));
        assert.equal(yield* fs.readFileString(path.join(source, "Local State")), state);
        return;
      }
      assert.equal(yield* fs.readFileString(path.join(destination, "Local State")), state);
      assert.equal(yield* fs.readFileString(path.join(source, "Local State")), state);
      assert.isFalse(yield* fs.exists(path.join(destination, "IndexedDB")));
      yield* fs.writeFileString(path.join(destination, "Local State"), "existing V2 state");
      yield* resolveUserDataPath({
        appDataDirectory: directory,
        isDevelopment: false,
        platform: "win32",
      });
      assert.equal(
        yield* fs.readFileString(path.join(destination, "Local State")),
        "existing V2 state",
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect.each([
  { old: "kelaodeyun-v2", current: "agent-cloud-os", development: false },
  { old: "kelaodeyun (Alpha)", current: "agent-cloud-os", development: false },
  { old: "kelaodeyun-dev", current: "agent-cloud-os-dev", development: true },
  { old: "kelaodeyun (Dev)", current: "agent-cloud-os-dev", development: true },
])(
  "migrates $old to $current and keeps the destination on later launches",
  ({ old, current, development }) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "acos-profile-" });
      const oldPath = path.join(directory, old);
      const currentPath = path.join(directory, current);
      yield* fs.makeDirectory(oldPath, { recursive: true });
      yield* fs.writeFileString(path.join(oldPath, "marker"), "original");
      const input = {
        appDataDirectory: directory,
        isDevelopment: development,
        platform: "darwin" as const,
      };
      assert.equal(yield* resolveUserDataPath(input), currentPath);
      assert.equal(yield* fs.readFileString(path.join(currentPath, "marker")), "original");
      assert.isFalse(yield* fs.exists(oldPath));
      yield* fs.makeDirectory(oldPath, { recursive: true });
      assert.equal(yield* resolveUserDataPath(input), currentPath);
      assert.isTrue(yield* fs.exists(oldPath));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect.each([
  {
    development: false,
    first: "kelaodeyun-v2",
    second: "kelaodeyun (Alpha)",
    current: "agent-cloud-os",
  },
  {
    development: true,
    first: "kelaodeyun-dev",
    second: "kelaodeyun (Dev)",
    current: "agent-cloud-os-dev",
  },
])("prefers $first over $second", ({ development, first, second, current }) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "acos-profile-priority-" });
    for (const name of [first, second]) {
      yield* fs.makeDirectory(path.join(directory, name), { recursive: true });
      yield* fs.writeFileString(path.join(directory, name, "marker"), name);
    }
    const input = {
      appDataDirectory: directory,
      isDevelopment: development,
      platform: "darwin" as const,
    };
    assert.equal(yield* resolveUserDataPath(input), path.join(directory, current));
    assert.equal(yield* fs.readFileString(path.join(directory, current, "marker")), first);
    assert.isTrue(yield* fs.exists(path.join(directory, second)));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect.each(["kelaodeyun-dev", "kelaodeyun (Dev)"])(
  "preserves Windows development keys from %s without copying browser databases",
  (sourceName) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: "acos-windows-dev-" });
      const source = path.join(directory, sourceName);
      const destination = path.join(directory, "agent-cloud-os-dev");
      yield* fs.makeDirectory(path.join(source, "IndexedDB"), { recursive: true });
      yield* fs.writeFileString(path.join(source, "Local State"), "fixture");
      yield* fs.writeFileString(path.join(source, "IndexedDB", "LOCK"), "fixture");
      yield* resolveUserDataPath({
        appDataDirectory: directory,
        isDevelopment: true,
        platform: "win32",
      });
      assert.equal(yield* fs.readFileString(path.join(destination, "Local State")), "fixture");
      assert.isFalse(yield* fs.exists(path.join(destination, "IndexedDB")));
      assert.isTrue(yield* fs.exists(path.join(source, "Local State")));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("falls back to the old path when the rename is denied", () =>
  Effect.gen(function* () {
    assert.equal(
      yield* resolveUserDataPath({
        appDataDirectory: "/app-data",
        isDevelopment: true,
        platform: "darwin",
      }),
      "/app-data/kelaodeyun-dev",
    );
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        NodePath.layerPosix,
        FileSystem.layerNoop({
          exists: (path) => Effect.succeed(path === "/app-data/kelaodeyun-dev"),
          rename: () =>
            Effect.fail(
              new PlatformError.PlatformError(
                new PlatformError.SystemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "rename",
                }),
              ),
            ),
        }),
      ),
    ),
  ),
);
