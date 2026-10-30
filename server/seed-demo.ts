import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import { Connection } from "./models/Connection.js";
import { Message } from "./models/Message.js";
import { Team } from "./models/Team.js";
import { User } from "./models/User.js";

const demoUsers = [
  {
    fullName: "Maya Chen",
    email: "maya@hackconnect.test",
    username: "maya_demo",
    role: "Product designer",
    school: "Parsons School of Design",
    location: "New York",
    skills: ["UI/UX", "Figma", "Research"],
  },
  {
    fullName: "Jay Patel",
    email: "jay@hackconnect.test",
    username: "jay_demo",
    role: "Frontend developer",
    school: "University of Toronto",
    location: "Toronto",
    skills: ["React", "TypeScript", "Design systems"],
  },
  {
    fullName: "Ari Okafor",
    email: "ari@hackconnect.test",
    username: "ari_demo",
    role: "AI & data science",
    school: "Georgia Tech",
    location: "Atlanta",
    skills: ["Python", "Machine learning", "Data"],
  },
  {
    fullName: "Sofia Reyes",
    email: "sofia@hackconnect.test",
    username: "sofia_demo",
    role: "Climate researcher",
    school: "UC Berkeley",
    location: "Berkeley",
    skills: ["Climate", "Research", "Storytelling"],
  },
];

async function seedDemoUsers() {
  if (config.isProduction || !process.argv.includes("--confirm-dev-database")) {
    throw new Error(
      "Demo seeding is disabled. Re-run with --confirm-dev-database and use a development database only.",
    );
  }
  if (!config.mongoUri) {
    throw new Error("Set MONGODB_URI in your local .env before seeding demo users.");
  }

  await mongoose.connect(config.mongoUri);
  try {
    const accounts = [];
    for (const profile of demoUsers) {
      const existing = await User.findOne({ email: profile.email });
      if (existing) {
        accounts.push(existing);
        console.info(`Already exists: ${profile.email} (password unchanged)`);
        continue;
      }

      const password = randomBytes(24).toString("base64url");
      const passwordHash = await bcrypt.hash(password, 12);
      const account = await User.create({
        ...profile,
        bio: "Demo profile for testing HackConnect collaboration features.",
        passwordHash,
        authProviders: ["email"],
        emailVerified: false,
      });
      accounts.push(account);
      console.info(`Created ${profile.email} / ${password}`);
    }

    const [maya, jay, ari, sofia] = accounts;
    for (const [requesterId, recipientId] of [
      [maya._id, jay._id],
      [maya._id, ari._id],
      [jay._id, sofia._id],
    ]) {
      const pairKey = [requesterId.toString(), recipientId.toString()].sort().join(":");
      await Connection.updateOne(
        { pairKey },
        { $setOnInsert: { pairKey, requesterId, recipientId, status: "accepted" } },
        { upsert: true },
      );
    }

    let team = await Team.findOne({ name: "Air, Anywhere (Demo)", ownerId: maya._id });
    if (!team) {
      team = await Team.create({
        name: "Air, Anywhere (Demo)",
        idea: "A neighborhood map that makes local air-quality data easier to understand and act on.",
        hackathon: "Earth Forward",
        ownerId: maya._id,
        members: [
          { userId: maya._id, role: "Team lead" },
          { userId: jay._id, role: "Frontend developer" },
          { userId: ari._id, role: "AI & data science" },
          { userId: sofia._id, role: "Climate researcher" },
        ],
        tasks: [
          { title: "Map the first three neighborhoods", assigneeId: sofia._id, completed: false },
          { title: "Pick our visual direction", assigneeId: maya._id, completed: true },
          { title: "Write the two-minute project story", assigneeId: jay._id, completed: false },
        ],
      });
    }

    if (!(await Message.exists({ teamId: team._id }))) {
      await Message.insertMany([
        { teamId: team._id, senderId: maya._id, text: "How do we make the air-quality data feel more human?" },
        { teamId: team._id, senderId: jay._id, text: "Could turn it into a neighborhood map people can explore." },
        { teamId: team._id, senderId: sofia._id, text: "I can help validate the local data sources." },
      ]);
    }
    console.info("Demo connections, team, tasks, and messages are ready.");
  } finally {
    await mongoose.disconnect();
  }
}

void seedDemoUsers().catch((error: unknown) => {
  console.error("Could not seed demo users:", error);
  process.exitCode = 1;
});
