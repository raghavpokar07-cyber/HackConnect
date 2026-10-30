import { Schema, model, type HydratedDocument } from "mongoose";

export interface HackathonSourceStatusRecord {
  source: string;
  status: "ok" | "empty" | "blocked" | "error";
  checkedAt: Date;
  eventCount: number;
  message: string;
}

const hackathonSourceStatusSchema = new Schema<HackathonSourceStatusRecord>(
  {
    source: { type: String, required: true, unique: true, maxlength: 40 },
    status: { type: String, enum: ["ok", "empty", "blocked", "error"], required: true },
    checkedAt: { type: Date, required: true },
    eventCount: { type: Number, min: 0, required: true },
    message: { type: String, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

export type HackathonSourceStatusDocument = HydratedDocument<HackathonSourceStatusRecord>;

export const HackathonSourceStatus = model<HackathonSourceStatusRecord>(
  "HackathonSourceStatus",
  hackathonSourceStatusSchema,
);
