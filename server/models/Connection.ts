import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export type ConnectionStatus = "pending" | "accepted" | "declined";

export interface ConnectionRecord {
  publicId: string;
  pairKey: string;
  requesterId: Types.ObjectId;
  recipientId: Types.ObjectId;
  status: ConnectionStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const connectionSchema = new Schema<ConnectionRecord>(
  {
    publicId: { type: String, required: true, default: () => randomUUID() },
    pairKey: { type: String, required: true, immutable: true },
    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
  },
  { timestamps: true },
);

connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });
connectionSchema.index({ publicId: 1 }, { unique: true, sparse: true });
connectionSchema.index({ pairKey: 1 }, { unique: true });
connectionSchema.index({ recipientId: 1, status: 1 });
connectionSchema.index({ requesterId: 1, status: 1 });

export type ConnectionDocument = HydratedDocument<ConnectionRecord>;

export const Connection = model<ConnectionRecord>("Connection", connectionSchema);
