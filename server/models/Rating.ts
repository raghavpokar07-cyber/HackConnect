import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface RatingRecord {
  reviewerId: Types.ObjectId;
  revieweeId: Types.ObjectId;
  teamId: Types.ObjectId;
  score: number;
  comment: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ratingSchema = new Schema<RatingRecord>(
  {
    reviewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    revieweeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);

ratingSchema.index({ reviewerId: 1, revieweeId: 1, teamId: 1 }, { unique: true });
ratingSchema.index({ revieweeId: 1, createdAt: -1 });

export type RatingDocument = HydratedDocument<RatingRecord>;

export const Rating = model<RatingRecord>("Rating", ratingSchema);
