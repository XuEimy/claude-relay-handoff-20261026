import type { DesktopSshEnvironmentTarget } from "@t3tools/contracts";
import { runComputerOperation, type ComputerResult } from "./computerOperations";
import type { ComputerSelection } from "./computerPicker";

export type ComputerListing = {
  path: string;
  entries: string[];
};

const listingCache = new Map<string, ComputerListing>();
const listingRequests = new Map<string, Promise<ComputerResult<ComputerListing>>>();
const LISTING_CACHE_LIMIT = 200;

const listingKey = (computer: ComputerSelection, path: string) =>
  `${computer.username}@${computer.host}:${path}`;

function rememberListing(key: string, listing: ComputerListing) {
  listingCache.delete(key);
  listingCache.set(key, listing);
  if (listingCache.size > LISTING_CACHE_LIMIT) {
    const oldest = listingCache.keys().next().value;
    if (oldest !== undefined) listingCache.delete(oldest);
  }
}

export function cachedComputerListing(
  computer: ComputerSelection,
  path: string,
): ComputerListing | undefined {
  return listingCache.get(listingKey(computer, path));
}

export function loadComputerListing(
  server: DesktopSshEnvironmentTarget,
  computer: ComputerSelection,
  path: string,
): Promise<ComputerResult<ComputerListing>> {
  const key = listingKey(computer, path);
  const existing = listingRequests.get(key);
  if (existing) return existing;
  const request = runComputerOperation<ComputerListing>(
    server,
    "computer-list-dir",
    {
      host: computer.host,
      username: computer.username,
      label: computer.label,
      os: computer.os ?? "",
    },
    path,
  )
    .then((result) => {
      if (result.ok) {
        const listing = {
          path: result.path,
          entries: [...result.entries].sort((a, b) => a.localeCompare(b)),
        };
        rememberListing(key, listing);
        rememberListing(listingKey(computer, listing.path), listing);
        return { ...result, path: listing.path, entries: listing.entries };
      }
      return result;
    })
    .finally(() => {
      if (listingRequests.get(key) === request) listingRequests.delete(key);
    });
  listingRequests.set(key, request);
  return request;
}

export function prefetchComputerListing(
  server: DesktopSshEnvironmentTarget,
  computer: ComputerSelection,
  path: string,
): void {
  const key = listingKey(computer, path);
  if (listingCache.has(key) || listingRequests.has(key)) return;
  void loadComputerListing(server, computer, path).catch(() => {});
}
