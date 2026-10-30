import { Schema, model, type HydratedDocument, type Types } from "mongoose";

export interface MessageRecord {
  teamId: Types.ObjectId;
  senderId: Types.ObjectId;
  text: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const messageSchema = new Schema<MessageRecord>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: true },
);

messageSchema.index({ teamId: 1, createdAt: -1 });

export type MessageDocument = HydratedDocument<MessageRecord>;

export const Message = model<MessageRecord>("Message", messageSchema);
