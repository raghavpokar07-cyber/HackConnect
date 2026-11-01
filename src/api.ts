export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  username: string | null;
  avatarUrl: string | null;
  bio: string;
  role: string;
  school: string;
  location: string;
  skills: string[];
  profileVisibility: "public" | "private";
};

export type PublicProfile = Omit<AuthUser, "email" | "profileVisibility">;
export type PublicProfilePageData = {
  isPublic: boolean;
  profile: PublicProfile | null;
};
export type HackathonEvent = {
  id: string;
  slug: string;
  source: string;
  name: string;
  description: string;
  categories: string[];
  format: "online" | "in-person" | "hybrid" | "unknown";
  venue: string;
  city: string;
  region: string;
  country: string;
  startDate: string | null;
  endDate: string | null;
  registrationDeadline: string | null;
  registrationUrl: string;
  teamSize: string;
  prize: string;
  lastSeenAt: string;
};
export type HackathonFilters = {
  formats: Array<"online" | "in-person" | "hybrid">;
  categories: string[];
  destination: string;
};
export type HackathonSourceStatus = {
  id: string;
  status: "ok" | "empty" | "blocked" | "error";
  checkedAt: string;
  eventCount: number;
  message: string;
};
export type WorkspaceNotification = {
  id: string;
  type: "connection-request" | "connection-accepted" | "team-update" | "team-message" | "rating" | "hackathon" | "system";
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
  actor: PublicProfile | null;
};
export type AuthResult =
  | { user: AuthUser }
  | { mfaRequired: true; challengeToken: string };
export type MfaStatus = { enabled: boolean; provider: "email" | "google" };
export type Reauthentication = { password: string } | { googleCredential: string };
export type Achievement = {
  id: string;
  title: string;
  issuer: string;
  achievedAt: string;
  publicVisible: boolean;
  imageUrl: string;
};
export type ConnectionStatus = "pending" | "accepted" | "declined";

export type WorkspaceConnection = {
  id: string;
  status: ConnectionStatus;
  requester: PublicProfile | null;
  recipient: PublicProfile | null;
  createdAt: string;
};

export type TeamTask = {
  id: string;
  title: string;
  assigneeId: string | null;
  completed: boolean;
};

export type WorkspaceTeam = {
  id: string;
  name: string;
  idea: string;
  hackathon: string;
  ownerId: string;
  members: Array<{ userId: string; role: string }>;
  tasks: TeamTask[];
};

export type WorkspaceMessage = {
  id: string;
  text: string;
  sender: PublicProfile | null;
  createdAt: string;
};

export type WorkspaceRating = {
  id: string;
  reviewer: PublicProfile | null;
  teamId: string;
  score: number;
  comment: string;
  createdAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

function isProfileVisibility(value: unknown): value is AuthUser["profileVisibility"] {
  return value === "public" || value === "private";
}

function isConnectionStatus(value: unknown): value is ConnectionStatus {
  return value === "pending" || value === "accepted" || value === "declined";
}

function parseAuthUserResponse(value: unknown): AuthUser {
  if (!isRecord(value) || !isRecord(value.user)) {
    throw new Error("The server returned an invalid account response.");
  }
  const user = value.user;
  const profile = parsePublicProfile(user);
  if (
    typeof user.email !== "string" ||
    !profile ||
    !isProfileVisibility(user.profileVisibility)
  ) {
    throw new Error("The server returned an invalid account response.");
  }
  return {
    ...profile,
    email: user.email,
    profileVisibility: user.profileVisibility,
  };
}

function parseLoginResponse(value: unknown): AuthResult {
  if (
    isRecord(value) &&
    value.mfaRequired === true &&
    typeof value.challengeToken === "string"
  ) {
    return { mfaRequired: true, challengeToken: value.challengeToken };
  }
  return { user: parseAuthUserResponse(value) };
}

function parsePublicProfile(value: unknown): PublicProfile | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.fullName !== "string" ||
    !(typeof value.username === "string" || value.username === null) ||
    !(typeof value.avatarUrl === "string" || value.avatarUrl === null) ||
    typeof value.bio !== "string" ||
    typeof value.role !== "string" ||
    typeof value.school !== "string" ||
    typeof value.location !== "string" ||
    !isStringArray(value.skills)
  ) {
    return null;
  }
  return {
    id: value.id,
    fullName: value.fullName,
    username: value.username,
    avatarUrl: value.avatarUrl,
    bio: value.bio,
    role: value.role,
    school: value.school,
    location: value.location,
    skills: value.skills,
  };
}

function parsePlanResponse(value: unknown): { plan: string } {
  if (!isRecord(value) || typeof value.plan !== "string") {
    throw new Error("The server returned an invalid plan response.");
  }
  return { plan: value.plan };
}

const API_BASE_URL = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.VITE_API_URL as string | undefined) ||
  "https://hackconnect-backend-1m62.onrender.com"
).replace(/\/+$/, "");

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  parseResponse: (value: unknown) => T,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = await getCsrfToken();
  }
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload: unknown;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The server returned an invalid response (${response.status}).`);
    }
  }

  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `The request failed (${response.status}).`,
    );
  }

  return parseResponse(payload);
}

let csrfTokenCache: string | null = null;

async function getCsrfToken(): Promise<string> {
  if (csrfTokenCache) return csrfTokenCache;
  const response = await fetch(`${API_BASE_URL}/api/auth/csrf`, { credentials: "include" });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Could not initialize request protection (${response.status}).`);
  }
  if (!response.ok || !isRecord(payload) || typeof payload.csrfToken !== "string") {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : "Could not initialize request protection.",
    );
  }
  csrfTokenCache = payload.csrfToken;
  return csrfTokenCache;
}

async function requestMultipart<T>(
  path: string,
  formData: FormData,
  parseResponse: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "X-CSRF-Token": await getCsrfToken() },
    body: formData,
  });
  let payload: unknown;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      throw new Error(`The server returned an invalid response (${response.status}).`);
    }
  }
  if (!response.ok) {
    throw new Error(
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `The request failed (${response.status}).`,
    );
  }
  return parseResponse(payload);
}

function parseAchievement(value: unknown): Achievement {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.issuer !== "string" ||
    typeof value.achievedAt !== "string" ||
    typeof value.publicVisible !== "boolean" ||
    typeof value.imageUrl !== "string"
  ) {
    throw new Error("The server returned an invalid achievement.");
  }
  return {
    id: value.id,
    title: value.title,
    issuer: value.issuer,
    achievedAt: value.achievedAt,
    publicVisible: value.publicVisible,
    imageUrl: value.imageUrl.startsWith("/") ? `${API_BASE_URL}${value.imageUrl}` : value.imageUrl,
  };
}

function parseAchievementResponse(value: unknown): Achievement {
  if (!isRecord(value) || !isRecord(value.achievement)) {
    throw new Error("The server returned an invalid achievement.");
  }
  return parseAchievement(value.achievement);
}

export function registerAccount(input: {
  fullName: string;
  email: string;
  username: string;
  password: string;
}) {
  return requestJson("/auth/register", "POST", input, parseAuthUserResponse);
}

export function loginAccount(input: { email: string; password: string }) {
  return requestJson("/auth/login", "POST", input, parseLoginResponse);
}

export function signInWithGoogle(credential: string) {
  return requestJson("/auth/google", "POST", { credential }, parseLoginResponse);
}

export function verifyMfaChallenge(challengeToken: string, code: string) {
  return requestJson(
    "/auth/mfa/verify",
    "POST",
    { challengeToken, code },
    (value) => ({ user: parseAuthUserResponse(value) }),
  );
}

export function getMfaStatus() {
  return requestJson("/auth/mfa/status", "GET", undefined, (value): MfaStatus => {
    if (
      !isRecord(value) ||
      typeof value.enabled !== "boolean" ||
      (value.provider !== "email" && value.provider !== "google")
    ) {
      throw new Error("The server returned invalid authenticator settings.");
    }
    return { enabled: value.enabled, provider: value.provider };
  });
}

export function beginMfaSetup(credentials: Reauthentication) {
  return requestJson("/auth/mfa/setup", "POST", credentials, (value) => {
    if (
      !isRecord(value) ||
      typeof value.secret !== "string" ||
      typeof value.otpauthUrl !== "string"
    ) {
      throw new Error("The server returned invalid authenticator setup details.");
    }
    return { secret: value.secret, otpauthUrl: value.otpauthUrl };
  });
}

export function confirmMfaSetup(code: string) {
  return requestJson("/auth/mfa/confirm", "POST", { code }, () => undefined);
}

export function disableMfa(code: string, credentials: Reauthentication) {
  return requestJson("/auth/mfa/disable", "POST", { code, ...credentials }, () => undefined);
}

export function getAchievements() {
  return requestJson("/achievements", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.achievements)) {
      throw new Error("The server returned an invalid achievement list.");
    }
    return value.achievements.map(parseAchievement);
  });
}

export function getPublicAchievements(userId: string) {
  return requestJson(
    `/users/${encodeURIComponent(userId)}/achievements`,
    "GET",
    undefined,
    (value) => {
      if (!isRecord(value) || !Array.isArray(value.achievements)) {
        throw new Error("The server returned an invalid achievement list.");
      }
      return value.achievements.map(parseAchievement);
    },
  );
}

export function uploadAchievement(input: {
  title: string;
  issuer: string;
  achievedAt: string;
  file: File;
  publicVisible: boolean;
}) {
  const formData = new FormData();
  formData.set("title", input.title);
  formData.set("issuer", input.issuer);
  formData.set("achievedAt", input.achievedAt);
  formData.set("publicVisible", String(input.publicVisible));
  if (input.publicVisible) formData.set("publicConsent", "on");
  formData.set("certificate", input.file);
  return requestMultipart("/achievements", formData, parseAchievementResponse);
}

export function setAchievementVisibility(achievementId: string, publicVisible: boolean) {
  return requestJson(
    `/achievements/${encodeURIComponent(achievementId)}/visibility`,
    "PATCH",
    { publicVisible, ...(publicVisible ? { publicConsent: true } : {}) },
    parseAchievementResponse,
  );
}

export function deleteAchievement(achievementId: string) {
  return requestJson(
    `/achievements/${encodeURIComponent(achievementId)}`,
    "DELETE",
    {},
    () => undefined,
  );
}

export function generateTeamPlan(input: {
  teamName: string;
  idea: string;
  members: Array<{ name: string; role: string }>;
}) {
  return requestJson("/assistant/plan", "POST", input, parsePlanResponse);
}

export function getCurrentUser() {
  return requestJson("/auth/me", "GET", undefined, parseAuthUserResponse);
}

export function getProfile() {
  return requestJson("/profile", "GET", undefined, (value) => {
    if (!isRecord(value) || !isRecord(value.profile)) throw new Error("Invalid profile response.");
    const profile = parsePublicProfile(value.profile);
    if (!profile || typeof value.profile.email !== "string" ||
      !isProfileVisibility(value.profile.profileVisibility)) {
      throw new Error("Invalid profile response.");
    }
    return {
      ...profile,
      email: value.profile.email,
      profileVisibility: value.profile.profileVisibility,
    };
  });
}

export function updateProfile(input: Pick<AuthUser, "fullName" | "bio" | "role" | "school" | "location" | "skills" | "profileVisibility">) {
  return requestJson("/profile", "PUT", input, (value) => {
    if (!isRecord(value) || !isRecord(value.profile)) throw new Error("Invalid profile response.");
    const profile = parsePublicProfile(value.profile);
    if (!profile || typeof value.profile.email !== "string" ||
      !isProfileVisibility(value.profile.profileVisibility)) {
      throw new Error("Invalid profile response.");
    }
    return {
      ...profile,
      email: value.profile.email,
      profileVisibility: value.profile.profileVisibility,
    };
  });
}

export function getUsers() {
  return requestJson("/users", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.users)) throw new Error("Invalid users response.");
    return value.users.map((item) => {
      const profile = parsePublicProfile(item);
      if (!profile) throw new Error("Invalid user profile response.");
      return profile;
    });
  });
}

export function getPublicProfile(userId: string) {
  return requestJson(`/users/${encodeURIComponent(userId)}`, "GET", undefined, (value) => {
    if (!isRecord(value) || !isRecord(value.profile)) throw new Error("Invalid profile response.");
    const profile = parsePublicProfile(value.profile);
    if (!profile) throw new Error("Invalid profile response.");
    return profile;
  });
}

export function getPublicProfilePage(userId: string) {
  return requestJson(`/users/${encodeURIComponent(userId)}/profile-page`, "GET", undefined, (value): PublicProfilePageData => {
    if (!isRecord(value) || typeof value.isPublic !== "boolean") {
      throw new Error("Invalid profile visibility response.");
    }
    if (!value.isPublic) return { isPublic: false, profile: null };
    if (!isRecord(value.profile)) throw new Error("Invalid public profile response.");
    const profile = parsePublicProfile(value.profile);
    if (!profile) throw new Error("Invalid public profile response.");
    return { isPublic: true, profile };
  });
}

function parseRatings(value: unknown): WorkspaceRating[] {
  if (!isRecord(value) || !Array.isArray(value.ratings)) throw new Error("Invalid ratings response.");
  return value.ratings.map((item): WorkspaceRating => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.teamId !== "string" ||
      typeof item.score !== "number" || typeof item.comment !== "string" ||
      typeof item.createdAt !== "string") throw new Error("Invalid rating response.");
    const reviewer = item.reviewer === null ? null : parsePublicProfile(item.reviewer);
    if (item.reviewer !== null && !reviewer) throw new Error("Invalid reviewer profile response.");
    return { id: item.id, teamId: item.teamId, score: item.score, comment: item.comment, createdAt: item.createdAt, reviewer };
  });
}

export function getPublicRatings(userId: string) {
  return requestJson(`/users/${encodeURIComponent(userId)}/ratings`, "GET", undefined, parseRatings);
}

export function getNotifications() {
  return requestJson("/notifications", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.notifications) || typeof value.unreadCount !== "number") {
      throw new Error("Invalid notifications response.");
    }
    const notifications = value.notifications.map((item): WorkspaceNotification => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.type !== "string" ||
        typeof item.title !== "string" || typeof item.body !== "string" ||
        typeof item.href !== "string" || !(typeof item.readAt === "string" || item.readAt === null) ||
        typeof item.createdAt !== "string") throw new Error("Invalid notification response.");
      const allowedTypes: WorkspaceNotification["type"][] = [
        "connection-request", "connection-accepted", "team-update", "team-message",
        "rating", "hackathon", "system",
      ];
      if (!allowedTypes.includes(item.type as WorkspaceNotification["type"])) {
        throw new Error("Invalid notification type.");
      }
      const actor = item.actor === null ? null : parsePublicProfile(item.actor);
      if (item.actor !== null && !actor) throw new Error("Invalid notification actor.");
      return {
        id: item.id,
        type: item.type as WorkspaceNotification["type"],
        title: item.title,
        body: item.body,
        href: item.href,
        readAt: item.readAt,
        createdAt: item.createdAt,
        actor,
      };
    });
    return { notifications, unreadCount: value.unreadCount };
  });
}

export function markNotificationRead(notificationId: string, read = true) {
  return requestJson(`/notifications/${encodeURIComponent(notificationId)}`, "PATCH", { read }, (value) => value);
}

export function markAllNotificationsRead() {
  return requestJson("/notifications/read-all", "POST", {}, () => undefined);
}

export function getConnections() {
  return requestJson("/connections", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.connections)) throw new Error("Invalid connections response.");
    return value.connections.map((item): WorkspaceConnection => {
      if (!isRecord(item) || typeof item.id !== "string" ||
          !isConnectionStatus(item.status) ||
        typeof item.createdAt !== "string") throw new Error("Invalid connection response.");
      const requester = item.requester === null ? null : parsePublicProfile(item.requester);
      const recipient = item.recipient === null ? null : parsePublicProfile(item.recipient);
      if ((item.requester !== null && !requester) || (item.recipient !== null && !recipient)) {
        throw new Error("Invalid connection profile response.");
      }
      return {
        id: item.id,
        status: item.status,
        createdAt: item.createdAt,
        requester,
        recipient,
      };
    });
  });
}

export function requestConnection(recipientId: string) {
  return requestJson("/connections", "POST", { recipientId }, (value) => value);
}

export function updateConnection(id: string, status: "accepted" | "declined") {
  return requestJson(`/connections/${encodeURIComponent(id)}`, "PATCH", { status }, (value) => value);
}

export function deleteConnection(id: string) {
  return requestJson(`/connections/${encodeURIComponent(id)}`, "DELETE", undefined, () => undefined);
}

function parseTeam(value: unknown): WorkspaceTeam {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
    typeof value.idea !== "string" || typeof value.hackathon !== "string" ||
    typeof value.ownerId !== "string" || !Array.isArray(value.members) || !Array.isArray(value.tasks)) {
    throw new Error("Invalid team response.");
  }
  const members = value.members.map((member) => {
    if (!isRecord(member) || typeof member.userId !== "string" || typeof member.role !== "string") {
      throw new Error("Invalid team member response.");
    }
    return { userId: member.userId, role: member.role };
  });
  const tasks = value.tasks.map((task): TeamTask => {
    if (!isRecord(task) || typeof task.id !== "string" || typeof task.title !== "string" ||
      !(typeof task.assigneeId === "string" || task.assigneeId === null) || typeof task.completed !== "boolean") {
      throw new Error("Invalid task response.");
    }
    return { id: task.id, title: task.title, assigneeId: task.assigneeId, completed: task.completed };
  });
  return {
    id: value.id,
    name: value.name,
    idea: value.idea,
    hackathon: value.hackathon,
    ownerId: value.ownerId,
    members,
    tasks,
  };
}

export function getTeams() {
  return requestJson("/teams", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.teams)) throw new Error("Invalid teams response.");
    return value.teams.map(parseTeam);
  });
}

export function createTeam(input: { name: string; idea: string; hackathon?: string }) {
  return requestJson("/teams", "POST", input, (value) => {
    if (!isRecord(value)) throw new Error("Invalid team response.");
    return parseTeam(value.team);
  });
}

export function inviteTeamMember(teamId: string, userId: string, role = "Builder") {
  return requestJson(
    `/teams/${encodeURIComponent(teamId)}/members`,
    "POST",
    { userId, role },
    (value) => {
      if (!isRecord(value)) throw new Error("Invalid team response.");
      return parseTeam(value.team);
    },
  );
}

export function addTeamTask(teamId: string, title: string, assigneeId?: string) {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/tasks`, "POST", { title, assigneeId }, (value) => {
    if (!isRecord(value)) throw new Error("Invalid team response.");
    return parseTeam(value.team);
  });
}

export function updateTeamTask(teamId: string, taskId: string, completed: boolean) {
  return requestJson(
    `/teams/${encodeURIComponent(teamId)}/tasks/${encodeURIComponent(taskId)}`,
    "PATCH",
    { completed },
    (value) => {
      if (!isRecord(value)) throw new Error("Invalid team response.");
      return parseTeam(value.team);
    },
  );
}

export function getTeamMessages(teamId: string) {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/messages`, "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.messages)) throw new Error("Invalid messages response.");
    return value.messages.map((item): WorkspaceMessage => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.text !== "string" ||
        typeof item.createdAt !== "string") throw new Error("Invalid message response.");
      const sender = item.sender === null ? null : parsePublicProfile(item.sender);
      if (item.sender !== null && !sender) throw new Error("Invalid sender profile response.");
      return { id: item.id, text: item.text, createdAt: item.createdAt, sender };
    });
  });
}

export function sendTeamMessage(teamId: string, text: string) {
  return requestJson(`/teams/${encodeURIComponent(teamId)}/messages`, "POST", { text }, (value) => value);
}

export function getHackathonState() {
  return requestJson("/hackathons", "GET", undefined, (value) => {
    if (!isRecord(value) || !isStringArray(value.saved) || !isStringArray(value.interested)) {
      throw new Error("Invalid hackathon response.");
    }
    return { saved: value.saved, interested: value.interested };
  });
}

export function getHackathonCatalog() {
  return requestJson("/hackathons/catalog", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.events)) throw new Error("Invalid hackathon catalog.");
    return value.events.map((item): HackathonEvent => {
      if (!isRecord(item) || typeof item.id !== "string" || typeof item.slug !== "string" ||
        typeof item.source !== "string" || typeof item.name !== "string" ||
        typeof item.description !== "string" || !isStringArray(item.categories) ||
        !["online", "in-person", "hybrid", "unknown"].includes(String(item.format)) ||
        typeof item.venue !== "string" || typeof item.city !== "string" ||
        typeof item.region !== "string" || typeof item.country !== "string" ||
        !(typeof item.startDate === "string" || item.startDate === null) ||
        !(typeof item.endDate === "string" || item.endDate === null) ||
        !(typeof item.registrationDeadline === "string" || item.registrationDeadline === null) ||
        typeof item.registrationUrl !== "string" ||
        (item.teamSize !== undefined && typeof item.teamSize !== "string") ||
        typeof item.prize !== "string" ||
        typeof item.lastSeenAt !== "string") throw new Error("Invalid hackathon event.");
      return {
        id: item.id,
        slug: item.slug,
        source: item.source,
        name: item.name,
        description: item.description,
        categories: item.categories,
        format: item.format as HackathonEvent["format"],
        venue: item.venue,
        city: item.city,
        region: item.region,
        country: item.country,
        startDate: item.startDate,
        endDate: item.endDate,
        registrationDeadline: item.registrationDeadline,
        registrationUrl: item.registrationUrl,
        teamSize: typeof item.teamSize === "string" ? item.teamSize : "",
        prize: item.prize,
        lastSeenAt: item.lastSeenAt,
      };
    });
  });
}

export function getHackathonSourceStatuses() {
  return requestJson("/hackathons/sources", "GET", undefined, (value) => {
    if (!isRecord(value) || !Array.isArray(value.sources)) throw new Error("Invalid source status response.");
    return value.sources.map((item): HackathonSourceStatus => {
      if (!isRecord(item) || typeof item.id !== "string" ||
        !["ok", "empty", "blocked", "error"].includes(String(item.status)) ||
        typeof item.checkedAt !== "string" || typeof item.eventCount !== "number" ||
        typeof item.message !== "string") throw new Error("Invalid source status.");
      return {
        id: item.id,
        status: item.status as HackathonSourceStatus["status"],
        checkedAt: item.checkedAt,
        eventCount: item.eventCount,
        message: item.message,
      };
    });
  });
}

export function getHackathonNotificationFilters() {
  return requestJson("/hackathons/notification-filters", "GET", undefined, (value) => {
    if (!isRecord(value) || !isRecord(value.filters) ||
      !isStringArray(value.filters.formats) ||
      !value.filters.formats.every((format) => ["online", "in-person", "hybrid"].includes(format)) ||
      !isStringArray(value.filters.categories) ||
      typeof value.filters.destination !== "string") throw new Error("Invalid hackathon notification filters.");
    return value.filters as HackathonFilters;
  });
}

export function saveHackathonNotificationFilters(filters: HackathonFilters) {
  return requestJson("/hackathons/notification-filters", "PUT", filters, (value) => {
    if (!isRecord(value) || !isRecord(value.filters) ||
      !isStringArray(value.filters.formats) || !isStringArray(value.filters.categories) ||
      typeof value.filters.destination !== "string") throw new Error("Invalid hackathon notification filters.");
    return value.filters as HackathonFilters;
  });
}

export function updateHackathonState(slug: string, input: { saved?: boolean; interested?: boolean }) {
  return requestJson(`/hackathons/${encodeURIComponent(slug)}`, "PUT", input, (value) => {
    if (!isRecord(value) || !isStringArray(value.saved) || !isStringArray(value.interested)) {
      throw new Error("Invalid hackathon response.");
    }
    return { saved: value.saved, interested: value.interested };
  });
}

export function getRatings() {
  return requestJson("/ratings", "GET", undefined, parseRatings);
}

export function submitRating(input: { revieweeId: string; teamId: string; score: number; comment: string }) {
  return requestJson("/ratings", "POST", input, (value) => value);
}

export function logoutAccount() {
  return requestJson("/auth/logout", "POST", {}, () => undefined);
}
