import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcessSpawner } from "effect/process";

import * as ServerDesktop from "./ServerDesktop.ts";

const fcListPrinting = (output: string) =>
  ChildProcessSpawner.make(() =>
    Effect.succeed(
      ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode(output)),
        stderr: Stream.empty,
        all: Stream.make(new TextEncoder().encode(output)),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      }),
    ),
  );

it.layer(NodeServices.layer)("missingDesktopPackages", (it) => {
  it.effect("names the apt packages for tools off PATH and a missing CJK font", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const bin = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(bin, "Xvfb"), "");
      const missing = (fonts: string) =>
        ServerDesktop.missingDesktopPackages.pipe(
          Effect.provideService(HostProcess.Environment, { PATH: `/nonexistent:${bin}` }),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, fcListPrinting(fonts)),
        );

      const withoutFont = yield* missing("");
      expect(withoutFont).toEqual(
        expect.arrayContaining(["x11vnc", "openbox", "tint2", "pcmanfm", "fonts-noto-cjk"]),
      );
      expect(withoutFont).not.toContain("xvfb");
      expect(yield* missing("Noto Sans CJK SC\n")).not.toContain("fonts-noto-cjk");
    }).pipe(Effect.scoped),
  );
});
