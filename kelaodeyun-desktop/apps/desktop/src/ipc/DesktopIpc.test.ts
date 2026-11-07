import { assert, it } from "@effect/vitest";
import { DesktopSshFileOperationSchema } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Tracer from "effect/Tracer";
import { makeIpcMethod } from "./DesktopIpc.ts";

it.effect("keeps SSH operation passwords out of IPC traces and schema errors", () => {
  const secret = "synthetic-computer-password";
  const traces: unknown[] = [];
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options);
      const end = span.end.bind(span);
      span.end = (time, exit) => {
        end(time, exit);
        traces.push({
          attributes: Object.fromEntries(span.attributes),
          failure: Exit.isFailure(exit) ? Cause.pretty(exit.cause) : null,
        });
      };
      return span;
    },
  });
  const method = makeIpcMethod({
    channel: "desktop:ssh-file-operation",
    payload: DesktopSshFileOperationSchema,
    result: Schema.String,
    handler: () => Effect.succeed("ok"),
  });
  const request = {
    target: { alias: "server", hostname: "server", username: "root", port: null },
    cwd: "~",
    relativePath: "",
    operation: "computer-install-key",
    computer: { host: "peer", username: "root", label: "peer", os: "linux", password: secret },
  };
  return Effect.gen(function* () {
    assert.equal(yield* method.handler(request), "ok");
    const result = yield* Effect.result(method.handler({ ...request, cwd: 42 }));
    if (Result.isSuccess(result)) throw new Error("Expected schema failure");
    const failure = result.failure;
    assert.notInclude(String(failure), secret);
    assert.notInclude(JSON.stringify(failure), secret);
    assert.isAbove(traces.length, 0);
    assert.notInclude(JSON.stringify(traces), secret);
  }).pipe(Effect.withTracer(tracer));
});
