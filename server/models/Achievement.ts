import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface AchievementRecord {
  publicId: string;
  ownerId: Types.ObjectId;
  title: string;
  issuer: string;
  achievedAt: Date;
  publicVisible: boolean;
  image: Buffer;
}

const achievementSchema = new Schema<AchievementRecord>(
  {
    publicId: { type: String, required: true, default: () => randomUUID() },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    issuer: { type: String, required: true, trim: true, maxlength: 120 },
    achievedAt: { type: Date, required: true },
    publicVisible: { type: Boolean, default: false, required: true },
    image: { type: Buffer, required: true, select: false },
  },
  { timestamps: true },
);

achievementSchema.index({ ownerId: 1, achievedAt: -1 });
achievementSchema.index({ publicId: 1 }, { unique: true, sparse: true });
achievementSchema.index({ publicVisible: 1, achievedAt: -1 });

export type AchievementDocument = HydratedDocument<AchievementRecord>;

export const Achievement = model<AchievementRecord>("Achievement", achievementSchema);
