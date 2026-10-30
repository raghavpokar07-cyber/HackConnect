import { Schema, model, type HydratedDocument } from "mongoose";

export type AuthProvider = "email" | "google";

export interface UserRecord {
  fullName: string;
  email: string;
  username?: string;
  passwordHash?: string;
  googleId?: string;
  authProviders: AuthProvider[];
  emailVerified: boolean;
  avatarUrl?: string;
  bio: string;
  role: string;
  school: string;
  location: string;
  skills: string[];
  profileVisibility: "public" | "private";
  savedHackathons: string[];
  eventInterests: string[];
  hackathonNotificationFilters: {
    formats: string[];
    categories: string[];
    destination: string;
  };
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaPendingSecret?: string;
  mfaPendingExpiresAt?: Date;
  mfaLastUsedStep: number;
  mfaChallengeId?: string;
  mfaChallengeExpiresAt?: Date;
}

const userSchema = new Schema<UserRecord>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    username: { type: String, trim: true, lowercase: true, maxlength: 30 },
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    authProviders: {
      type: [String],
      enum: ["email", "google"],
      default: ["email"],
    },
    emailVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, maxlength: 2048 },
    bio: { type: String, default: "", maxlength: 1000 },
    role: { type: String, default: "", maxlength: 100 },
    school: { type: String, default: "", maxlength: 120 },
    location: { type: String, default: "", maxlength: 120 },
    skills: { type: [String], default: [] },
    profileVisibility: { type: String, enum: ["public", "private"], default: "public" },
    savedHackathons: { type: [String], default: [] },
    eventInterests: { type: [String], default: [] },
    hackathonNotificationFilters: {
      formats: { type: [String], enum: ["online", "in-person", "hybrid"], default: [] },
      categories: { type: [String], default: [] },
      destination: { type: String, maxlength: 120, default: "" },
    },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, select: false },
    mfaPendingSecret: { type: String, select: false },
    mfaPendingExpiresAt: { type: Date, select: false },
    mfaLastUsedStep: { type: Number, default: -1 },
    mfaChallengeId: { type: String, select: false },
    mfaChallengeExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, sparse: true });
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });

export type UserDocument = HydratedDocument<UserRecord>;

export const User = model<UserRecord>("User", userSchema);

export function toPublicUser(user: UserDocument) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    username: user.username ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio,
    role: user.role,
    school: user.school,
    location: user.location,
    skills: user.skills,
    profileVisibility: user.profileVisibility ?? "public",
  };
}

export function toPublicProfile(user: UserDocument) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    username: user.username ?? null,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio,
    role: user.role,
    school: user.school,
    location: user.location,
    skills: user.skills,
  };
}
