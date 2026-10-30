import mongoose from "mongoose";
import { Notification, type NotificationType } from "./models/Notification.js";

export async function createNotification(input: {
  recipientId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
}): Promise<void> {
  try {
    await Notification.updateOne(
      { recipientId: input.recipientId, dedupeKey: input.dedupeKey },
      {
        $setOnInsert: {
          ...input,
          recipientId: new mongoose.Types.ObjectId(input.recipientId),
          ...(input.actorId ? { actorId: new mongoose.Types.ObjectId(input.actorId) } : {}),
        },
      },
      { upsert: true, runValidators: true },
    );
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) return;
    throw error;
  }
}
