import mongoose from "mongoose";
import { config } from "./config.js";
import { fetchHackathonSource, hackathonSources } from "./hackathon-sources.js";
import { Hackathon } from "./models/Hackathon.js";
import { HackathonSourceStatus } from "./models/HackathonSourceStatus.js";
import { User } from "./models/User.js";
import { createNotification } from "./notifications.js";

function isBlocked(message: string): boolean {
  return /HTTP (401|403|429)|redirected outside|anti-bot challenge/i.test(message);
}

function isTimeout(error: unknown, message: string): boolean {
  return (error instanceof Error && error.name === "AbortError") ||
    /operation was aborted|aborterror|timed?\s*out/i.test(message);
}

async function crawlOnce(sources = hackathonSources): Promise<void> {
  for (const source of sources) {
    const checkedAt = new Date();
    try {
      const { events } = await fetchHackathonSource(source);
      for (const event of events) {
        const { teamSize, prize, ...eventFields } = event;
        const update = {
          ...eventFields,
          ...(teamSize ? { teamSize } : {}),
          ...(prize ? { prize } : {}),
        };
        const previous = await Hackathon.findOneAndUpdate(
          { source: event.source, sourceId: event.sourceId },
          { $set: update },
          { upsert: true, returnDocument: "before", runValidators: true },
        );
        if (!previous) await notifyMatchingUsers(event);
      }
      const status = events.length > 0 ? "ok" : "empty";
      const message = events.length > 0
        ? ""
        : "The listing loaded, but no public event records could be safely extracted.";
      await HackathonSourceStatus.findOneAndUpdate(
        { source: source.id },
        { $set: { status, checkedAt, eventCount: events.length, message } },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      console.info(`[hackathon-crawler] ${source.id}: ${events.length} event(s)${message ? `; ${message}` : ""}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown source error.";
      const status = isBlocked(detail) ? "blocked" : "error";
      const message = isTimeout(error, detail)
        ? "Source timed out; try again later."
        : /anti-bot challenge/i.test(detail)
          ? "Access challenge detected; crawling stopped."
          : /HTTP (401|403|429)/i.test(detail)
            ? "Source access is restricted; the crawler will not bypass it."
            : /Local Ollama returned/i.test(detail)
              ? "Local event extraction is unavailable."
              : detail.slice(0, 240);
      await HackathonSourceStatus.findOneAndUpdate(
        { source: source.id },
        { $set: { status, checkedAt, eventCount: 0, message } },
        { upsert: true, returnDocument: "after", runValidators: true },
      );
      console.error(`[hackathon-crawler] ${source.id}: ${status}; ${message}`);
    }
  }
}

async function notifyMatchingUsers(event: {
  slug: string;
  name: string;
  description: string;
  format: string;
  categories: string[];
  city: string;
  region: string;
  country: string;
}) {
  const users = await User.find({
    $or: [
      { "hackathonNotificationFilters.formats.0": { $exists: true } },
      { "hackathonNotificationFilters.categories.0": { $exists: true } },
      { "hackathonNotificationFilters.destination": { $ne: "" } },
    ],
  }).select("_id hackathonNotificationFilters");

  const destination = [event.city, event.region, event.country].filter(Boolean).join(" ").toLowerCase();
  await Promise.all(users.flatMap((user) => {
    const filters = user.hackathonNotificationFilters;
    if (!filters) return [];
    if (filters.formats.length && !filters.formats.includes(event.format)) return [];
    if (
      filters.categories.length &&
      !filters.categories.some((category) => event.categories.some((eventCategory) =>
        eventCategory.toLowerCase().includes(category.toLowerCase()),
      ))
    ) return [];
    if (filters.destination && !destination.includes(filters.destination.toLowerCase())) return [];
    return [createNotification({
      recipientId: user._id.toString(),
      type: "hackathon",
      title: `New hackathon: ${event.name}`,
      body: event.description.slice(0, 280) || "A new event matches your saved hackathon filters.",
      href: "/hackathons",
      dedupeKey: `new-hackathon:${event.slug}`,
    })];
  }));
}

if (!config.mongoUri) {
  throw new Error("MONGODB_URI must be configured before running the hackathon crawler.");
}

const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
const selectedSourceId = sourceArgument?.slice("--source=".length);
const sources = selectedSourceId
  ? hackathonSources.filter((source) => source.id === selectedSourceId)
  : hackathonSources;
if (selectedSourceId && sources.length === 0) {
  throw new Error(`Unknown hackathon source: ${selectedSourceId}`);
}

await mongoose.connect(config.mongoUri);
const watch = process.argv.includes("--watch");
try {
  do {
    await crawlOnce(sources);
    if (watch) await new Promise((resolve) => setTimeout(resolve, 6 * 60 * 60 * 1000));
  } while (watch);
} finally {
  await mongoose.disconnect();
}
