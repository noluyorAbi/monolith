import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import {
  SESSION_MAX_AGE_S,
  adminEnabled,
  clearFailures,
  clientKey,
  issueSession,
  passwordMatches,
  recordFailure,
  sessionValid,
  throttled,
} from "@/lib/admin/auth";
import { parseState } from "@/lib/admin/model";

/**
 * The admin gate is the only authentication in this project, it guards
 * unpublished material, and it sits on a public repository where anyone can
 * read exactly how it works. These tests pin the three properties that make
 * that acceptable: no password means no panel, a session cannot be forged, and
 * rotating the password ends every session that came before it.
 */

const ORIGINAL = process.env.ADMIN_PASSWORD;

afterEach(() => {
  process.env.ADMIN_PASSWORD = ORIGINAL;
  if (ORIGINAL === undefined) delete process.env.ADMIN_PASSWORD;
  vi.useRealTimers();
});

test("without a configured password the panel does not exist", () => {
  delete process.env.ADMIN_PASSWORD;
  assert.equal(adminEnabled(), false);
  assert.equal(passwordMatches(""), false);
  // The empty password must not become a skeleton key for an unconfigured deploy.
  assert.equal(passwordMatches("anything"), false);
  assert.equal(issueSession(), null);
  assert.equal(sessionValid("whatever"), false);
});

test("an empty ADMIN_PASSWORD counts as unset, not as an empty password", () => {
  process.env.ADMIN_PASSWORD = "";
  assert.equal(adminEnabled(), false);
  assert.equal(passwordMatches(""), false);
});

test("the password compares exactly", () => {
  process.env.ADMIN_PASSWORD = "correct horse battery staple";
  assert.equal(passwordMatches("correct horse battery staple"), true);
  assert.equal(passwordMatches("correct horse battery stapl"), false);
  assert.equal(passwordMatches("Correct horse battery staple"), false);
  assert.equal(passwordMatches(""), false);
});

test("a session issued under the password validates, and a tampered one does not", () => {
  process.env.ADMIN_PASSWORD = "a-long-enough-secret";
  const token = issueSession();
  assert.ok(token);
  assert.equal(sessionValid(token), true);

  // Every mutation of the token has to fail: a flipped signature, a flipped
  // body, a truncated signature, and a token with no signature at all.
  assert.equal(sessionValid(`${token}x`), false);
  assert.equal(sessionValid(token.slice(0, -1)), false);
  assert.equal(sessionValid(token.replace(/^\d+/, String(Date.now() + 9e9))), false);
  assert.equal(sessionValid(token.slice(0, token.lastIndexOf("."))), false);
  assert.equal(sessionValid(""), false);
  assert.equal(sessionValid(undefined), false);
});

test("changing the password invalidates sessions issued under the old one", () => {
  process.env.ADMIN_PASSWORD = "first-secret-value";
  const token = issueSession();
  assert.ok(token);
  assert.equal(sessionValid(token), true);

  process.env.ADMIN_PASSWORD = "second-secret-value";
  assert.equal(sessionValid(token), false);
});

test("a session expires", () => {
  process.env.ADMIN_PASSWORD = "a-long-enough-secret";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-26T00:00:00Z"));
  const token = issueSession();
  assert.ok(token);

  vi.setSystemTime(new Date(Date.now() + (SESSION_MAX_AGE_S - 60) * 1000));
  assert.equal(sessionValid(token), true);

  vi.setSystemTime(new Date(Date.now() + 120 * 1000));
  assert.equal(sessionValid(token), false);
});

test("repeated failures throttle one client without touching another", () => {
  const mine = "203.0.113.7";
  const other = "203.0.113.8";
  clearFailures(mine);
  clearFailures(other);

  assert.equal(throttled(mine), false);
  for (let i = 0; i < 8; i++) recordFailure(mine);
  assert.equal(throttled(mine), true);
  assert.equal(throttled(other), false);

  clearFailures(mine);
  assert.equal(throttled(mine), false);
});

test("the client key reads the first hop of x-forwarded-for", () => {
  const request = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
  });
  assert.equal(clientKey(request), "203.0.113.7");
  assert.equal(clientKey(new Request("https://example.test")), "unknown");
});

test("state arriving from the browser is rebuilt rather than trusted", () => {
  const parsed = parseState({
    version: 99,
    channels: [
      { id: "keep", name: "Show HN", status: "not-a-status", wave: 17, body: 42 },
      "not an object",
    ],
    tasks: "not an array",
    metrics: [{ id: "m", at: "2026-07-29", stars: "12", visitors: 400 }],
  });

  assert.equal(parsed.version, 1);
  assert.equal(parsed.channels.length, 2);
  assert.equal(parsed.channels[0].id, "keep");
  assert.equal(parsed.channels[0].status, "todo", "an unknown status falls back rather than persisting");
  assert.equal(parsed.channels[0].wave, 1, "a wave outside the set falls back");
  assert.equal(parsed.channels[0].body, "", "a non-string body becomes an empty string");
  assert.ok(parsed.channels[1].id, "an entry that is not an object still gets an id");
  assert.deepEqual(parsed.tasks, []);
  assert.equal(parsed.metrics[0].stars, 0, "a numeric string is not a number");
  assert.equal(parsed.metrics[0].visitors, 400);
});

test("the brief survives a round trip and is bounded", () => {
  const text = "Decided MIT because PolyForm closed three channels.\n\nStill open: the hero figures.";
  assert.equal(parseState({ brief: text }).brief, text, "newlines and prose must survive");
  assert.equal(parseState({}).brief, "", "an absent brief is empty, not undefined");
  assert.equal(parseState({ brief: 42 }).brief, "", "a non-string brief becomes empty");
  // Bounded, so a paste accident cannot make the document unwritable.
  assert.equal(parseState({ brief: "x".repeat(300000) }).brief.length, 200000);
});

test("oversized fields are cut rather than stored whole", () => {
  const parsed = parseState({ channels: [{ name: "x".repeat(5000) }] });
  assert.equal(parsed.channels[0].name.length, 200);
});
