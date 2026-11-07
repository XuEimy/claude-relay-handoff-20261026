import { describe, expect, it } from "vite-plus/test";
import { unmatchedAccountHosts } from "./accountHosts";

describe("account SSH host matching", () => {
  it("matches hostname, username and default port, independently of aliases", () => {
    const host = {
      id: "1",
      label: "server",
      hostname: "example.com",
      username: "root",
      port: 22,
      authType: "password",
      source: "purchased",
    } as const;
    expect(
      unmatchedAccountHosts(
        [host],
        [{ alias: "alias", hostname: "example.com", username: "root", port: null }],
      ),
    ).toEqual([]);
    expect(
      unmatchedAccountHosts(
        [host],
        [{ alias: "example.com", hostname: "example.com", username: "alice", port: 22 }],
      ),
    ).toEqual([host]);
    expect(
      unmatchedAccountHosts(
        [host],
        [{ alias: "example.com", hostname: "example.com", username: "root", port: 2222 }],
      ),
    ).toEqual([host]);
    expect(
      unmatchedAccountHosts(
        [{ ...host, hostname: "[2001:db8::1]" }],
        [{ alias: "2001:db8::1", hostname: "2001:db8::1", username: "root", port: 22 }],
      ),
    ).toEqual([]);
  });
});
