import assert from "node:assert/strict";
import test from "node:test";
import { parseDevfolioEvents, parseJsonLdEvents, parseMlhEvents } from "./hackathon-sources.js";

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

test("parses upcoming MLH events and skips ended or unsafe records", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  const html = `<script type="application/json" data-page="app">${JSON.stringify({
    props: {
      upcomingEvents: [
        {
          id: "mlh-event-1",
          slug: "build-for-good",
          name: "Build for Good",
          status: "pending",
          startsAt: "2026-11-14T09:00:00Z",
          endsAt: "2026-11-15T17:00:00Z",
          formatType: "hybrid_physical",
          websiteUrl: "https://events.example.test/build",
          location: "New York, NY",
          venueAddress: { city: "New York", state: "NY", country: "US" },
          customFields: { hackathon_focus: ["AI", "Civic tech"] },
        },
        {
          id: "mlh-event-ended",
          slug: "already-ended",
          name: "Already Ended",
          status: "ended",
          startsAt: "2026-10-30T09:00:00Z",
          endsAt: "2026-10-31T17:00:00Z",
          websiteUrl: "https://events.example.test/ended",
        },
        {
          id: "mlh-event-past",
          slug: "past-event",
          name: "Past Event",
          status: "pending",
          startsAt: "2026-10-30T09:00:00Z",
          endsAt: "2026-10-31T17:00:00Z",
          websiteUrl: "https://events.example.test/past",
        },
        {
          id: "mlh-event-unsafe",
          slug: "unsafe-link",
          name: "Unsafe Link",
          status: "pending",
          startsAt: "2026-11-14T09:00:00Z",
          endsAt: "2026-11-15T17:00:00Z",
          websiteUrl: "javascript:alert(1)",
          url: "javascript:alert(1)",
        },
      ],
    },
  })}</script>`;

  const events = parseMlhEvents(html, now);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, "Build for Good");
  assert.equal(events[0].sourceId, "mlh-event-1");
  assert.equal(events[0].format, "hybrid");
  assert.equal(events[0].registrationUrl, "https://events.example.test/build");
  assert.deepEqual(events[0].categories, ["AI", "Civic tech"]);
  assert.equal(events[0].city, "New York");
  assert.equal(events[0].country, "US");
  assert.equal(events[0].teamSize, "");
  assert.equal(events[0].prize, "");
});

test("uses a safe MLH event page when no external website is available", () => {
  const html = `<script data-page="app" type="application/json">${JSON.stringify({
    props: {
      upcomingEvents: [{
        id: "mlh-event-2",
        slug: "event-two",
        name: "Event Two",
        startsAt: "2026-11-14T09:00:00Z",
        url: "/events/event-two/prizes",
        websiteUrl: "javascript:alert(1)",
      }],
    },
  })}</script>`;

  const [event] = parseMlhEvents(html, new Date("2026-11-01T12:00:00.000Z"));
  assert.equal(event.registrationUrl, "https://www.mlh.com/events/event-two/prizes");
});

test("rejects malformed MLH event listing payloads", () => {
  assert.throws(() => parseMlhEvents("<html></html>"), /invalid event listing/i);
  assert.throws(() => parseMlhEvents(
    '<script type="application/json" data-page="app">not-json</script>',
  ), /invalid event listing data/i);
  assert.throws(() => parseMlhEvents(
    '<script type="application/json" data-page="app">{"props":{}}</script>',
  ), /invalid upcoming event list/i);
});
