import { randomUUID } from "node:crypto";
import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface TeamMember {
  userId: Types.ObjectId;
  role: string;
}

export interface TeamTask {
  publicId: string;
  _id?: Types.ObjectId;
  title: string;
  assigneeId?: Types.ObjectId;
  completed: boolean;
}

export interface TeamRecord {
  publicId: string;
  name: string;
  idea: string;
  hackathon: string;
  ownerId: Types.ObjectId;
  members: TeamMember[];
  tasks: TeamTask[];
}

const teamSchema = new Schema<TeamRecord>(
  {
    publicId: { type: String, required: true, default: () => randomUUID() },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    idea: { type: String, required: true, trim: true, maxlength: 3000 },
    hackathon: { type: String, trim: true, maxlength: 120, default: "" },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    members: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        role: { type: String, trim: true, maxlength: 80, default: "Builder" },
      },
    ],
    tasks: [
      {
        publicId: { type: String, required: true, default: () => randomUUID() },
        title: { type: String, required: true, trim: true, maxlength: 240 },
        assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
        completed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

teamSchema.index({ "members.userId": 1, updatedAt: -1 });
teamSchema.index({ publicId: 1 }, { unique: true, sparse: true });

export type TeamDocument = HydratedDocument<TeamRecord>;

export const Team = model<TeamRecord>("Team", teamSchema);
