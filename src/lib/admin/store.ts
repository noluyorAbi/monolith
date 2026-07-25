import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { EMPTY_STATE, parseState, type LaunchState } from "./model";

/**
 * Where the launch board lives.
 *
 * Two backends, chosen by whether a Blob token is present rather than by
 * `NODE_ENV`, so a local run against the real store is a matter of copying one
 * variable into `.env` and needs no code path of its own.
 *
 *  - Vercel Blob, `access: "private"`. A private blob is only readable with the
 *    store's token, so the board is not one guessed URL away from being public.
 *    This is the one that matters: the board holds unpublished post copy and a
 *    channel-by-channel plan, in a repository that anyone can read.
 *  - A file under `.data/`, for local work. `.data` is already in `.gitignore`,
 *    which is what makes this safe by default rather than by remembering.
 *
 * There is no third path. Without either, a write fails loudly instead of
 * pretending to have saved and losing an evening of writing.
 */

const BLOB_PATH = "launch/state.json";
const LOCAL_PATH = path.join(process.cwd(), ".data", "launch.json");

function blobConfigured(): boolean {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return typeof token === "string" && token.length > 0;
}

/** Which backend a request will hit, so the panel can say so instead of guessing. */
export function backendName(): "blob" | "file" {
  return blobConfigured() ? "blob" : "file";
}

export async function readState(): Promise<LaunchState> {
  if (blobConfigured()) {
    // useCache: false because the panel writes and immediately re-reads. A CDN
    // hit here shows the previous version and reads as data loss.
    const found = await get(BLOB_PATH, { access: "private", useCache: false });
    if (!found || found.statusCode !== 200) return EMPTY_STATE;
    return parseState(JSON.parse(await new Response(found.stream).text()));
  }

  try {
    return parseState(JSON.parse(await fs.readFile(LOCAL_PATH, "utf8")));
  } catch (error) {
    // A missing file is an empty board, which is the correct first run. Any
    // other failure, including malformed JSON, must not be swallowed: it would
    // silently hand back an empty board that the next write then persists.
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return EMPTY_STATE;
    throw error;
  }
}

export async function writeState(state: LaunchState): Promise<LaunchState> {
  const next: LaunchState = { ...state, version: 1, updatedAt: new Date().toISOString() };
  const body = JSON.stringify(next, null, 2);

  if (blobConfigured()) {
    await put(BLOB_PATH, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
    });
    return next;
  }

  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, body, "utf8");
  return next;
}
