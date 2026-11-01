import { Schema, model, type HydratedDocument } from "mongoose";

export type HackathonFormat = "online" | "in-person" | "hybrid" | "unknown";

export interface HackathonRecord {
  source: string;
  sourceId: string;
  slug: string;
  name: string;
  description: string;
  categories: string[];
  format: HackathonFormat;
  venue: string;
  city: string;
  region: string;
  country: string;
  startDate?: Date;
  endDate?: Date;
  registrationDeadline?: Date;
  registrationUrl: string;
  teamSize: string;
  prize: string;
  active: boolean;
  lastSeenAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const hackathonSchema = new Schema<HackathonRecord>(
  {
    source: { type: String, required: true, maxlength: 40 },
    sourceId: { type: String, required: true, maxlength: 300 },
    slug: { type: String, required: true, unique: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 3000, default: "" },
    categories: { type: [String], default: [] },
    format: {
      type: String,
      enum: ["online", "in-person", "hybrid", "unknown"],
      default: "unknown",
    },
    venue: { type: String, maxlength: 200, default: "" },
    city: { type: String, maxlength: 120, default: "" },
    region: { type: String, maxlength: 120, default: "" },
    country: { type: String, maxlength: 120, default: "" },
    startDate: { type: Date },
    endDate: { type: Date },
    registrationDeadline: { type: Date },
    registrationUrl: { type: String, required: true, maxlength: 2048 },
    teamSize: { type: String, maxlength: 80, default: "" },
    prize: { type: String, maxlength: 300, default: "" },
    active: { type: Boolean, default: true },
    lastSeenAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

hackathonSchema.index({ source: 1, sourceId: 1 }, { unique: true });
hackathonSchema.index({ active: 1, startDate: 1 });
hackathonSchema.index({ format: 1, city: 1, startDate: 1 });
hackathonSchema.index({ categories: 1 });

export type HackathonDocument = HydratedDocument<HackathonRecord>;

export const Hackathon = model<HackathonRecord>("Hackathon", hackathonSchema);
