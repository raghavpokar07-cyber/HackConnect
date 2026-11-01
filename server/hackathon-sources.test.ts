import assert from "node:assert/strict";
import test from "node:test";
import { parseDevfolioEvents, parseJsonLdEvents } from "./hackathon-sources.js";

test("parses safe JSON-LD events and keeps source data", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    identifier: "challenge-42",
    name: "Build for Good",
    description: "A student hackathon.",
    category: ["Civic tech", "AI"],
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    additionalProperty: [
      { "@type": "PropertyValue", name: "Team size", value: "2-4 members" },
      { "@type": "PropertyValue", name: "Prize pool", value: "$5,000" },
    ],
    startDate: "2026-07-12T09:00:00Z",
    endDate: "2026-07-13T17:00:00Z",
    offersValidFrom: "2026-06-01T00:00:00Z",
    url: "https://events.example.test/challenge-42",
    location: { "@type": "Place", name: "Online venue", url: "https://events.example.test/location" },
  })}</script>`;

  const [event] = parseJsonLdEvents(html, "test-source");
  assert.ok(event);
  assert.equal(event.name, "Build for Good");
  assert.equal(event.sourceId, "challenge-42");
  assert.equal(event.format, "online");
  assert.equal(event.categories.join(", "), "Civic tech, AI");
  assert.equal(event.registrationDeadline, undefined);
  assert.equal(event.registrationUrl, "https://events.example.test/challenge-42");
  assert.equal(event.teamSize, "2-4 members");
  assert.equal(event.prize, "$5,000");
});

test("does not invent team size or prize when sources omit them", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Event",
    name: "Build Something",
    url: "https://example.test/build",
  })}</script>`;
  const [event] = parseJsonLdEvents(html, "test-source");
  assert.ok(event);
  assert.equal(event.teamSize, "");
  assert.equal(event.prize, "");
});

test("does not accept unsafe registration URLs or unrelated schema objects", () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Event", name: "Unsafe", url: "javascript:alert(1)" },
    { "@type": "Person", name: "Not an event", url: "https://example.test/person" },
  ])}</script>`;
  assert.deepEqual(parseJsonLdEvents(html, "test-source"), []);
});

test("parses physical and hybrid event formats", () => {
  const html = `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Event", name: "Campus Event", url: "https://example.test/campus", location: { "@type": "Place" } },
    { "@type": "Event", name: "Hybrid Event", url: "https://example.test/hybrid", eventAttendanceMode: "https://schema.org/MixedEventAttendanceMode" },
  ])}</script>`;
  const events = parseJsonLdEvents(html, "test-source");
  assert.deepEqual(events.map((event) => event.format), ["in-person", "hybrid"]);
});

test("parses verified upcoming Devfolio events and skips stale or invalid records", () => {
  const now = new Date("2026-10-30T12:00:00.000Z");
  const events = parseDevfolioEvents({
    data: {
      hackathons: [
        {
          uuid: "event-123",
          slug: "build-for-good",
          name: "Build for Good",
          starts_at: "2026-11-14T07:30:00Z",
          ends_at: "2026-11-15T07:30:00Z",
          is_online: false,
          team_size: { min: 2, max: 5 },
          prize_pool: "$10,000",
          themes: [{ theme: { name: "AI" } }],
          settings: { reg_ends_at: "2026-11-10T12:00:00Z" },
        },
        {
          uuid: "event-started",
          slug: "already-started",
          name: "Already Started",
          starts_at: "2026-10-30T08:00:00Z",
          settings: { reg_ends_at: "2026-11-10T12:00:00Z" },
        },
        {
          uuid: "event-closed",
          slug: "registration-closed",
          name: "Registration Closed",
          starts_at: "2026-11-14T07:30:00Z",
          settings: { reg_ends_at: "2026-10-30T11:59:00Z" },
        },
      ],
    },
  }, now);

  assert.equal(events.length, 1);
  assert.equal(events[0].name, "Build for Good");
  assert.equal(events[0].sourceId, "event-123");
  assert.equal(events[0].registrationUrl, "https://build-for-good.devfolio.co/");
  assert.equal(events[0].registrationDeadline?.toISOString(), "2026-11-10T12:00:00.000Z");
  assert.equal(events[0].format, "in-person");
  assert.deepEqual(events[0].categories, ["AI"]);
  assert.equal(events[0].teamSize, "2-5");
  assert.equal(events[0].prize, "$10,000");
});

test("rejects malformed Devfolio API responses", () => {
  assert.throws(() => parseDevfolioEvents({ errors: [{ message: "Unavailable" }] }), /invalid event response/i);
  assert.throws(() => parseDevfolioEvents({ data: {} }), /invalid event list/i);
});
