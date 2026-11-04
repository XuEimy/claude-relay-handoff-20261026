import { showBootError } from "./lib/bootError";

// Shared dev chunks need the React refresh preamble first. Catch failures before React mounts.
const startup = import("./main").then(({ startup }) => startup);
void import("./lib/welcomeSplash")
  .then(({ showWelcomeSplash }) => showWelcomeSplash(startup))
  .catch(() => document.getElementById("welcome-splash")?.remove());
void startup.catch((error: unknown) => {
  document.getElementById("welcome-splash")?.remove();
  showBootError(error);
});
