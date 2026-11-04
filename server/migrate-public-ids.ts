import "dotenv/config";
import mongoose, { type Model } from "mongoose";
import { config } from "./config.js";
import { createPublicId } from "./public-id.js";
import { Achievement } from "./models/Achievement.js";
import { Connection } from "./models/Connection.js";
import { Hackathon } from "./models/Hackathon.js";
import { Message } from "./models/Message.js";
import { Notification } from "./models/Notification.js";
import { Rating } from "./models/Rating.js";
import { Team } from "./models/Team.js";
import { User } from "./models/User.js";

async function backfillPublicIds<T extends { publicId: string }>(
  name: string,
  model: Model<T>,
): Promise<number> {
  let updatedCount = 0;
  const cursor = model.find({ publicId: { $exists: false } }).select("_id").cursor();
  for await (const document of cursor) {
    const result = await model.updateOne(
      { _id: document._id, publicId: { $exists: false } },
      { $set: { publicId: createPublicId() } },
    );
    updatedCount += result.modifiedCount;
  }
  await model.collection.createIndex({ publicId: 1 }, { unique: true, sparse: true });
  console.info(`${name}: assigned ${updatedCount} public UUID(s).`);
  return updatedCount;
}

async function backfillTaskPublicIds(): Promise<number> {
  let updatedCount = 0;
  const cursor = Team.collection.find(
    { tasks: { $elemMatch: { publicId: { $exists: false } } } },
    { projection: { _id: 1, tasks: 1 } },
  );
  for await (const team of cursor) {
    for (const task of team.tasks) {
      if (!task.publicId) {
        const result = await Team.collection.updateOne(
          {
            _id: team._id,
            tasks: { $elemMatch: { _id: task._id, publicId: { $exists: false } } },
          },
          { $set: { "tasks.$.publicId": createPublicId() } },
        );
        updatedCount += result.modifiedCount;
      }
    }
  }
  console.info(`Team tasks: assigned ${updatedCount} public UUID(s).`);
  return updatedCount;
}

if (!config.mongoUri) {
  throw new Error("MONGODB_URI is required to migrate public UUIDs.");
}

await mongoose.connect(config.mongoUri);
try {
  await backfillPublicIds("Users", User);
  await backfillPublicIds("Teams", Team);
  await backfillTaskPublicIds();
  await backfillPublicIds("Achievements", Achievement);
  await backfillPublicIds("Connections", Connection);
  await backfillPublicIds("Messages", Message);
  await backfillPublicIds("Notifications", Notification);
  await backfillPublicIds("Ratings", Rating);
  await backfillPublicIds("Hackathons", Hackathon);
} finally {
  await mongoose.disconnect();
}
