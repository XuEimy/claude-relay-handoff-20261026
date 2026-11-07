import {
  DesktopAccountHostInputSchema,
  DesktopAccountHostSchema,
  DesktopAccountStateSchema,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DesktopAccount from "../../account/DesktopAccount.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const getAccountState = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.GET_ACCOUNT_STATE_CHANNEL,
  payload: Schema.Void,
  result: DesktopAccountStateSchema,
  handler: Effect.fn("desktop.ipc.account.state")(function* () {
    return yield* (yield* DesktopAccount.DesktopAccount).state;
  }),
});
export const signInAccount = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SIGN_IN_ACCOUNT_CHANNEL,
  payload: Schema.Void,
  result: DesktopAccountStateSchema,
  handler: Effect.fn("desktop.ipc.account.login")(function* () {
    return yield* (yield* DesktopAccount.DesktopAccount).login;
  }),
});
export const signOutAccount = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SIGN_OUT_ACCOUNT_CHANNEL,
  payload: Schema.Void,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.account.logout")(function* () {
    yield* (yield* DesktopAccount.DesktopAccount).logout;
  }),
});
export const listAccountHosts = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.LIST_ACCOUNT_HOSTS_CHANNEL,
  payload: Schema.Void,
  result: Schema.Array(DesktopAccountHostSchema),
  handler: Effect.fn("desktop.ipc.account.listHosts")(function* () {
    return yield* (yield* DesktopAccount.DesktopAccount).listHosts;
  }),
});
export const pickAccountPrivateKey = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.PICK_ACCOUNT_PRIVATE_KEY_CHANNEL,
  payload: Schema.Void,
  result: Schema.NullOr(Schema.Struct({ path: Schema.String })),
  handler: Effect.fn("desktop.ipc.account.pickPrivateKey")(function* () {
    return yield* (yield* DesktopAccount.DesktopAccount).pickPrivateKey;
  }),
});
export const saveAccountHost = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SAVE_ACCOUNT_HOST_CHANNEL,
  payload: DesktopAccountHostInputSchema,
  result: DesktopAccountHostSchema,
  handler: Effect.fn("desktop.ipc.account.saveHost")(function* (input) {
    return yield* (yield* DesktopAccount.DesktopAccount).saveHost(input);
  }),
});
export const deleteAccountHost = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.DELETE_ACCOUNT_HOST_CHANNEL,
  payload: Schema.String,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.account.deleteHost")(function* (id) {
    yield* (yield* DesktopAccount.DesktopAccount).deleteHost(id);
  }),
});
