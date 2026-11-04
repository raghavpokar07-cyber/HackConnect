import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export type NotificationType =
  | "connection-request"
  | "connection-accepted"
  | "team-update"
  | "team-message"
  | "rating"
  | "hackathon"
  | "system";

export interface NotificationRecord {
  publicId: string;
  recipientId: Types.ObjectId;
  actorId?: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  readAt?: Date;
  createdAt?: Date;
}

const notificationSchema = new Schema<NotificationRecord>(
  {
    publicId: { type: String, required: true, default: () => randomUUID() },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: [
        "connection-request",
        "connection-accepted",
        "team-update",
        "team-message",
        "rating",
        "hackathon",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, required: true, maxlength: 300 },
    href: { type: String, required: true, maxlength: 200 },
    dedupeKey: { type: String, required: true, maxlength: 240 },
    readAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ publicId: 1 }, { unique: true, sparse: true });
notificationSchema.index({ recipientId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, dedupeKey: 1 }, { unique: true });

export type NotificationDocument = HydratedDocument<NotificationRecord>;

export const Notification = model<NotificationRecord>("Notification", notificationSchema);
