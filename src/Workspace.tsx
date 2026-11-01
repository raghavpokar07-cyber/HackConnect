import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  addTeamTask,
  beginMfaSetup,
  confirmMfaSetup,
  createTeam,
  deleteAchievement,
  deleteConnection,
  disableMfa,
  generateTeamPlan,
  getAchievements,
  getConnections,
  getCurrentUser,
  getHackathonCatalog,
  getHackathonNotificationFilters,
  getHackathonSourceStatuses,
  getHackathonState,
  getMfaStatus,
  getNotifications,
  getPublicAchievements,
  getProfile,
  getPublicProfilePage,
  getPublicRatings,
  getRatings,
  getTeamMessages,
  getTeams,
  getUsers,
  inviteTeamMember,
  loginAccount,
  logoutAccount,
  markAllNotificationsRead,
  markNotificationRead,
  registerAccount,
  requestConnection,
  sendTeamMessage,
  signInWithGoogle,
  submitRating,
  updateConnection,
  updateHackathonState,
  saveHackathonNotificationFilters,
  updateProfile,
  updateTeamTask,
  setAchievementVisibility,
  uploadAchievement,
  verifyMfaChallenge,
} from "./api";
import type {
  Achievement,
  AuthUser,
  HackathonEvent,
  HackathonFilters,
  HackathonSourceStatus,
  MfaStatus,
  PublicProfile,
  Reauthentication,
  WorkspaceNotification,
  WorkspaceConnection,
  WorkspaceMessage,
  WorkspaceRating,
  WorkspaceTeam,
} from "./api";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  CircleUserRound,
  Command,
  Compass,
  Filter,
  Heart,
  LayoutDashboard,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Star,
  Trophy,
  UserPlus,
  Users,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AppView } from "./App";

type Props = {
  view: AppView;
  onNavigate: (view: AppView) => void;
  onViewProfile?: (userId: string) => void;
  profileId?: string;
  currentUser?: AuthUser | null;
};

type NavigateProps = Pick<Props, "onNavigate">;

type NavigationItem = {
  id: AppView;
  label: string;
  icon: LucideIcon;
};

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "discover", label: "Find teammates", icon: Compass },
  { id: "connections", label: "Connections", icon: UsersRound },
  { id: "teams", label: "My teams", icon: Users },
  { id: "chat", label: "Messages", icon: MessageSquare },
  { id: "hackathons", label: "Hackathons", icon: CalendarDays },
  { id: "profile", label: "My profile", icon: CircleUserRound },
  { id: "ratings", label: "Reputation", icon: Trophy },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const profileColors = ["coral", "blue", "pink", "yellow", "mint"];

function eventDate(date: string | null) {
  return date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Date not listed";
}

function eventColor(event: HackathonEvent) {
  const key = `${event.categories.join(" ")} ${event.name}`.toLowerCase();
  if (/climate|environment|sustain|green/.test(key)) return "mint";
  if (/ai|machine learning|data/.test(key)) return "lavender";
  return "orange";
}

function sourceStatusLabel(source: HackathonSourceStatus) {
  if (source.status === "ok") return "LISTINGS FOUND";
  if (source.status === "blocked") return "ACCESS LIMITED";
  if (source.status === "empty" || /no event records/i.test(source.message)) return "NO LISTINGS";
  return "TEMPORARY ISSUE";
}

function sourceStatusMessage(source: HackathonSourceStatus) {
  if (/abort|timed?\s*out/i.test(source.message)) {
    return "The site did not respond in time. It can be checked again on a later crawl.";
  }
  if (/no event records/i.test(source.message)) {
    return "The page loaded, but no public event details could be safely extracted.";
  }
  if (source.status === "blocked") {
    return "The site restricted automated access. We will not bypass its protections.";
  }
  return source.message || (source.status === "ok" ? "Events were fetched successfully." : "No additional details were provided.");
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function Brand({ onClick }: { onClick: () => void }) {
  return (
    <button className="workspace-brand" onClick={onClick} type="button">
      <span className="brand-mark"><Command size={16} /></span>
      <span>HACK<span className="brand-light">CONNECT</span></span>
    </button>
  );
}

function AuthPage({ onNavigate }: Props) {
  const [signup, setSignup] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const navigateRef = useRef(onNavigate);
  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    "262093778913-6ija8ou7dlgcirqq9ut5ulde4cq5s4d2.apps.googleusercontent.com";

  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    const target = googleButtonRef.current;
    if (!googleClientId || !target) return;

    let active = true;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!active) return;
      if (!window.google) {
        setMessage("Google sign-in did not initialize. Please try email and password.");
        return;
      }
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => {
          setBusy(true);
          setMessage("");
          void signInWithGoogle(response.credential)
            .then((result) => {
              if ("mfaRequired" in result) {
                setChallengeToken(result.challengeToken);
                setSignup(false);
                setMessage("Enter the current 6-digit code from your authenticator app.");
              } else {
                navigateRef.current("dashboard");
              }
            })
            .catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
            })
            .finally(() => setBusy(false));
        },
      });
      window.google.accounts.id.renderButton(target, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.max(220, Math.min(target.clientWidth, 380)),
      });
    };
    script.onerror = () => {
      if (active) setMessage("Google sign-in could not load. Please try email and password.");
    };
    document.head.append(script);

    return () => {
      active = false;
      script.onload = null;
      script.onerror = null;
    };
  }, [googleClientId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");

    try {
      const email = String(formData.get("email") ?? "");
      const password = String(formData.get("password") ?? "");
      if (signup) {
        await registerAccount({
          fullName: String(formData.get("name") ?? ""),
          email,
          username: String(formData.get("username") ?? ""),
          password,
        });
        onNavigate("dashboard");
      } else {
        const result = await loginAccount({ email, password });
        if ("mfaRequired" in result) {
          setChallengeToken(result.challengeToken);
          setMessage("Enter the current 6-digit code from your authenticator app.");
          return;
        }
        onNavigate("dashboard");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account access failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitMfaCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!challengeToken) return;
    const formData = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      await verifyMfaChallenge(challengeToken, String(formData.get("code") ?? ""));
      setChallengeToken(null);
      onNavigate("dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The authenticator code could not be verified.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Brand onClick={() => onNavigate("landing")} />
        <button className="auth-back" onClick={() => onNavigate("landing")} type="button"><X size={16} /> BACK TO SITE</button>
      </header>
      <div className="auth-wrap">
        <section className="auth-story">
          <span className="workspace-kicker"><span className="live-dot" /> YOUR PEOPLE ARE OUT THERE</span>
          <h1>Big things<br />are better<br /><em>together.</em></h1>
          <p>Find collaborators who get your ideas, bring new ones, and make the work worth showing up for.</p>
          <div className="auth-proof"><div className="proof-avatars"><i>M</i><i>J</i><i>A</i><i>+</i></div><span>GOOD PEOPLE. BETTER PROJECTS.</span></div>
        </section>
        <section className="auth-card">
          {!challengeToken && <div className="auth-switch"><button className={signup ? "active" : ""} onClick={() => { setSignup(true); setMessage(""); setChallengeToken(null); }} type="button">CREATE ACCOUNT</button><button className={!signup ? "active" : ""} onClick={() => { setSignup(false); setMessage(""); setChallengeToken(null); }} type="button">SIGN IN</button></div>}
          <div className="auth-card-heading"><span className="workspace-kicker">{challengeToken ? "SECOND STEP" : signup ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</span><h2>{challengeToken ? "Verify it’s you." : signup ? "Find your people." : "Good to see you."}</h2><p>{challengeToken ? "Open your authenticator app and enter its current 6-digit code." : signup ? "A team with your name on it is waiting." : "Pick up right where your team left off."}</p></div>
          {challengeToken ? <form className="auth-form" onSubmit={(event) => void submitMfaCode(event)}>
            <label>AUTHENTICATOR CODE<input autoComplete="one-time-code" inputMode="numeric" name="code" pattern="[0-9]{6}" maxLength={6} placeholder="000000" required /></label>
            <button className="auth-submit" disabled={busy} type="submit">{busy ? "VERIFYING..." : "VERIFY AND SIGN IN"} <ArrowUpRight size={16} /></button>
            <button className="forgot-password" onClick={() => { setChallengeToken(null); setMessage(""); }} type="button">BACK TO SIGN IN</button>
          </form> : <form className="auth-form" onSubmit={submit}>
            {signup && <label>FULL NAME<input autoComplete="name" name="name" placeholder="Alex Morgan" required /></label>}
            <label>EMAIL ADDRESS<input autoComplete="email" name="email" placeholder="you@college.edu" type="email" required /></label>
            {signup && <label>USERNAME<input autoComplete="username" name="username" placeholder="alexbuilds" required /></label>}
            <label>PASSWORD<input autoComplete={signup ? "new-password" : "current-password"} minLength={8} name="password" placeholder="At least 8 characters" type="password" required /></label>
            {signup && <label className="auth-terms"><input type="checkbox" required /> I agree to the Terms and Privacy Policy.</label>}
            {!signup && <button className="forgot-password" onClick={() => setMessage("Password reset requires the email service to be configured.")} type="button">FORGOT PASSWORD?</button>}
            <button className="auth-submit" disabled={busy} type="submit">{busy ? "CONNECTING..." : signup ? "CREATE MY ACCOUNT" : "SIGN IN"} <ArrowUpRight size={16} /></button>
          </form>}
          {!challengeToken && <><div className="auth-divider"><span>OR CONTINUE WITH</span></div>
          {googleClientId
            ? <div className="google-button" ref={googleButtonRef} />
            : <button className="google-button google-button-pending" disabled type="button">GOOGLE SIGN-IN NEEDS SETUP</button>}
          </>}
          {message && <p className="auth-feedback" role="status" aria-live="polite">{message}</p>}
          <div className="preview-notice"><Sparkles size={15} /><span><b>Secure account access</b><br />Your account is stored in MongoDB when you sign up. Google sign-in is available when its client ID is configured.</span></div>
          <button className="preview-button" onClick={() => onNavigate("dashboard")} type="button">OPEN WORKSPACE PREVIEW <ArrowRight size={15} /></button>
        </section>
      </div>
      <footer className="auth-footer"><span>HACKCONNECT / EARLY BUILD</span><span>PREVIEW ACCESS DOES NOT CREATE AN ACCOUNT.</span></footer>
    </main>
  );
}

function DashboardHome({ onNavigate, currentUser }: Props) {
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<HackathonEvent[]>([]);
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [savedEvents, setSavedEvents] = useState<string[]>([]);
  const [ratings, setRatings] = useState<WorkspaceRating[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getHackathonCatalog()
      .then((catalog) => setUpcomingEvents(catalog.slice(0, 3)))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load upcoming hackathons."));
    Promise.all([getUsers(), getConnections(), getTeams(), getHackathonState(), getRatings()])
      .then(([userList, connectionList, teamList, eventState, ratingList]) => {
        setPeople(userList);
        setConnections(connectionList);
        setTeams(teamList);
        setSavedEvents(eventState.saved);
        setRatings(ratingList);
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load workspace summary."));
  }, []);

  const acceptedConnections = connections.filter((connection) => connection.status === "accepted").length;
  const averageRating = ratings.length
    ? (ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length).toFixed(1)
    : "—";
  const firstTeam = teams[0];

  return (
    <>
      <div className="workspace-welcome">
        <div><span className="workspace-kicker">YOUR CREW IS HERE</span><h1>Welcome, <em>{currentUser?.fullName.split(" ")[0] ?? "builder"}.</em></h1><p>Big ideas don’t build themselves. What are we making today?</p></div>
        <button className="workspace-primary" onClick={() => onNavigate("discover")}><Plus size={16} /> FIND YOUR TEAM</button>
      </div>
      <div className="stat-grid">
        <article className="stat-card stat-lime"><span>YOUR CONNECTIONS</span><strong>{acceptedConnections}</strong><small><Users size={14} /> Accepted teammates</small></article>
        <article className="stat-card"><span>TEAM PROJECTS</span><strong>{teams.length.toString().padStart(2, "0")}</strong><small><Zap size={14} /> Your active teams</small></article>
        <article className="stat-card"><span>HACKATHONS SAVED</span><strong>{savedEvents.length.toString().padStart(2, "0")}</strong><small><CalendarDays size={14} /> Saved to your account</small></article>
        <article className="stat-card"><span>YOUR RATING</span><strong>{averageRating}<span className="stat-out-of">/ 5</span></strong><small><Star size={14} /> From {ratings.length} reviews</small></article>
      </div>
      <div className="dashboard-columns">
        <section className="workspace-panel team-panel">
          <div className="panel-heading"><div><span className="workspace-kicker">YOUR PEOPLE, IN MOTION</span><h2>Team room</h2></div><button className="panel-link" onClick={() => onNavigate("teams")}>ALL TEAMS <ArrowUpRight size={14} /></button></div>
          {firstTeam ? <><div className="team-preview-image"><img src="/team-collaboration-alt.jpg" alt="Teammates collaborating" /><div className="team-preview-shade" /><span className="team-live"><i /> TEAM</span><div className="team-preview-title"><span>{firstTeam.hackathon || `${firstTeam.members.length} MEMBERS`}</span><h3>{firstTeam.name}</h3></div><button className="team-preview-open" onClick={() => onNavigate("chat")} aria-label="Open team chat"><ArrowUpRight size={18} /></button></div><div className="team-meta"><span><MapPin size={14} /> {firstTeam.hackathon || "TEAM WORKSPACE"}</span><span>{firstTeam.members.length} MEMBERS</span></div><div className="team-activity"><span className="mini-avatar coral">{initials(currentUser?.fullName ?? "You")}</span><p><b>Your team</b> is ready to collaborate<small>Messages are stored in MongoDB</small></p><button onClick={() => onNavigate("chat")} aria-label="Open messages"><MessageCircle size={16} /></button></div></> : <div className="empty-search">Your teams and activity will appear here. <button className="panel-link" onClick={() => onNavigate("teams")}>CREATE A TEAM</button></div>}
        </section>
        <section className="workspace-panel suggestions-panel">
          <div className="panel-heading"><div><span className="workspace-kicker">A FEW PEOPLE TO MEET</span><h2>Good chemistry</h2></div><button className="panel-link" onClick={() => onNavigate("discover")}>MEET MORE <ArrowUpRight size={14} /></button></div>
          {people.slice(0, 3).map((person, index) => (
            <article className="suggestion-row" key={person.id}>
              <span className={`person-avatar ${profileColors[index % profileColors.length]}`}>{initials(person.fullName)}</span>
              <span className="suggestion-info"><b>{person.fullName}</b><small>{person.role || "Builder"}</small></span><button className="suggestion-add" onClick={() => onNavigate("discover")} aria-label={`View ${person.fullName}`}><Plus size={16} /></button>
            </article>
          ))}
          <button className="assistant-nudge" onClick={() => onNavigate("teams")}><Sparkles size={17} /><span><b>Need a little structure?</b><small>Your team assistant can help make a plan.</small></span><ArrowUpRight size={15} /></button>
        </section>
      </div>
      <section className="workspace-panel upcoming-panel"><div className="panel-heading"><div><span className="workspace-kicker">GOOD REASONS TO GET TOGETHER</span><h2>Coming up</h2></div><button className="panel-link" onClick={() => onNavigate("hackathons")}>ALL HACKATHONS <ArrowUpRight size={14} /></button></div>{upcomingEvents.length ? upcomingEvents.map((event) => <a className="upcoming-row" href={event.registrationUrl} key={event.id} target="_blank" rel="noreferrer"><span className="upcoming-date"><b>{event.startDate ? new Date(event.startDate).getDate() : "—"}</b><br />{event.startDate ? new Date(event.startDate).toLocaleDateString(undefined, { month: "short" }).toUpperCase() : "DATE"}</span><span className="upcoming-name"><b>{event.name}</b><small>{event.categories[0] ?? event.source} · {event.format} · {event.city || event.country || "Location not listed"}</small></span><span className="upcoming-prize">{event.prize || "VIEW DETAILS"}</span><ArrowUpRight size={14} /></a>) : <p>No events are currently in the shared catalog. Check back after the local crawler runs.</p>}</section>
      {error && <p className="assistant-feedback" role="status">{error}</p>}
    </>
  );
}

function DiscoveryPage({ onNavigate, onViewProfile }: Pick<Props, "onNavigate"> & { onViewProfile: (userId: string) => void }) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [requested, setRequested] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [skillFilter, setSkillFilter] = useState("");

  useEffect(() => {
    getUsers().then(setPeople).catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : "Could not load profiles.");
    });
  }, []);

  const connect = async (personId: string) => {
    setBusyId(personId);
    setError("");
    try {
      await requestConnection(personId);
      setRequested((current) => [...current, personId]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send connection request.");
    } finally {
      setBusyId("");
    }
  };

  const filtered = people.filter((person) => {
    const text = `${person.fullName} ${person.role} ${person.location} ${person.school} ${person.skills.join(" ")}`.toLowerCase();
    return text.includes(query.toLowerCase()) &&
      (!roleFilter || person.role.toLowerCase().includes(roleFilter.toLowerCase())) &&
      (!locationFilter || `${person.location} ${person.school}`.toLowerCase().includes(locationFilter.toLowerCase())) &&
      (!skillFilter || person.skills.some((skill) => skill.toLowerCase().includes(skillFilter.toLowerCase())));
  });
  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">YOUR NEXT GREAT COLLABORATION</span><h1>Find your <em>people.</em></h1><p>People with complementary skills, compatible energy, and ideas of their own.</p></div><button className="workspace-quiet" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><Filter size={15} /> FILTERS <ChevronDown size={14} /></button></div>
      <div className="workspace-search"><Search size={17} /><input aria-label="Search people and skills" onChange={(event) => setQuery(event.target.value)} placeholder="Search a skill, a name, a “what if?”" value={query} /><span>⌘ K</span></div>
      {filtersOpen && <div className="discovery-filters"><label>ROLE<input value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} placeholder="Designer, developer…" /></label><label>LOCATION / SCHOOL<input value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} placeholder="City or campus" /></label><label>SKILL<input value={skillFilter} onChange={(event) => setSkillFilter(event.target.value)} placeholder="React, product…" /></label><button className="workspace-quiet" onClick={() => { setRoleFilter(""); setLocationFilter(""); setSkillFilter(""); setQuery(""); }}>CLEAR FILTERS</button></div>}
      <div className="discovery-grid">{filtered.map((person, index) => (
        <article className="discovery-card" key={person.id}>
          <div className={`discovery-cover cover-${profileColors[index % profileColors.length]}`}><span className="cover-index">BUILDER / {String(index + 1).padStart(2, "0")}</span><span className={`person-avatar discovery-avatar ${profileColors[index % profileColors.length]}`}>{initials(person.fullName)}</span><span className="cover-star">✳</span></div>
          <div className="discovery-content"><div className="discovery-name"><div><h2>{person.fullName}</h2><span>{person.role || "Builder"}</span></div><span className="person-rating"><Star size={13} /> PROFILE</span></div><p className="person-school"><MapPin size={13} /> {person.school || person.location || "Location not added"}</p><div className="person-skills">{person.skills.map((skill) => <span key={skill}>{skill}</span>)}</div><div className="discovery-actions"><button disabled={busyId === person.id || requested.includes(person.id)} className={requested.includes(person.id) ? "requested" : "connect-button"} onClick={() => void connect(person.id)}>{requested.includes(person.id) ? <><Check size={14} /> REQUEST SENT</> : <><Plus size={14} /> CONNECT</>}</button><button className="message-button" onClick={() => onNavigate("chat")} aria-label={`Message ${person.fullName}`}><MessageCircle size={16} /></button></div><button className="profile-view-button" type="button" onClick={() => onViewProfile(person.id)}>VIEW PROFILE & RATINGS<ArrowUpRight size={14} /></button></div>
        </article>
      ))}</div>
      {error && <p className="assistant-feedback" role="status">{error}</p>}
      {filtered.length === 0 && <div className="empty-search">{error ? "Sign in and seed demo users to discover teammates." : "No teammates match that search yet. Try another skill."}</div>}
    </>
  );
}

function ConnectionsPage({ onNavigate }: NavigateProps) {
  const [tab, setTab] = useState("YOUR PEOPLE");
  const [userId, setUserId] = useState("");
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [ratingOwner, setRatingOwner] = useState<PublicProfile | null>(null);
  const [publicRatings, setPublicRatings] = useState<WorkspaceRating[]>([]);
  const [error, setError] = useState("");

  const loadConnections = async () => {
    try {
      const [user, result] = await Promise.all([getCurrentUser(), getConnections()]);
      setUserId(user.id);
      setConnections(result);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load connections.");
    }
  };

  useEffect(() => { void loadConnections(); }, []);

  const showPublicRatings = async (person: PublicProfile) => {
    try {
      setRatingOwner(person);
      setPublicRatings(await getPublicRatings(person.id));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load public ratings.");
    }
  };

  const visibleConnections = connections.filter((connection) => tab === "YOUR PEOPLE"
    ? connection.status === "accepted"
    : connection.status === "pending" && connection.recipient?.id === userId);

  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">GOOD PEOPLE MAKE GOOD PROJECTS</span><h1>Your <em>connections.</em></h1><p>Keep the conversation going with people you’d build with again.</p></div><button className="workspace-primary" onClick={() => onNavigate("discover")}><Plus size={16} /> FIND PEOPLE</button></div>
      <div className="workspace-tabs">{["YOUR PEOPLE", "REQUESTS"].map((item) => <button className={tab === item ? "selected" : ""} key={item} onClick={() => setTab(item)}>{item}{item === "REQUESTS" ? ` (${connections.filter((connection) => connection.status === "pending" && connection.recipient?.id === userId).length})` : ""}</button>)}</div>
      <div className="connection-list">{visibleConnections.map((connection) => {
        const person = connection.requester?.id === userId ? connection.recipient : connection.requester;
        if (!person) return null;
        return <article className="connection-row" key={connection.id}><span className={`person-avatar ${profileColors[person.id.charCodeAt(0) % profileColors.length]}`}>{initials(person.fullName)}</span><div><h3>{person.fullName}</h3><span>{person.role || "Builder"} · {person.school || person.location || "Location not added"}</span><div className="person-skills">{person.skills.slice(0, 2).map((skill) => <span key={skill}>{skill}</span>)}</div></div><div className="connection-actions">{tab === "YOUR PEOPLE" ? <><button className="workspace-quiet" onClick={() => void showPublicRatings(person)}><Star size={15} /> PUBLIC RATINGS</button><button className="workspace-quiet" onClick={() => onNavigate("chat")}><MessageCircle size={15} /> MESSAGE</button><button className="workspace-quiet" onClick={() => void deleteConnection(connection.id).then(loadConnections).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not remove connection."))}>REMOVE</button></> : <><button className="workspace-primary" onClick={() => void updateConnection(connection.id, "accepted").then(loadConnections).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not accept request."))}><Check size={15} /> ACCEPT</button><button className="workspace-quiet" onClick={() => void updateConnection(connection.id, "declined").then(loadConnections).catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not decline request."))}>DECLINE</button></>}</div></article>;
      })}</div>
      {ratingOwner && <section className="public-achievement-panel"><div><span className="workspace-kicker">PUBLIC REPUTATION</span><button className="workspace-quiet" onClick={() => setRatingOwner(null)}>CLOSE</button></div><h2>{ratingOwner.fullName} · Ratings ({publicRatings.length})</h2>{publicRatings.length ? publicRatings.map((rating) => <article className="public-rating" key={rating.id}><b>{rating.score}/5</b><span>{rating.comment || "No written note."}</span><small>{rating.reviewer?.fullName ?? "Private reviewer"} · {new Date(rating.createdAt).toLocaleDateString()}</small></article>) : <p>No ratings yet.</p>}</section>}
      {error && <p className="assistant-feedback" role="status">{error}</p>}
      {!visibleConnections.length && <div className="empty-search">{error ? "Sign in to load your connections." : "No connections here yet. Find your first teammate."}</div>}
    </>
  );
}

function TeamsPage({ onNavigate }: Props) {
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [connections, setConnections] = useState<WorkspaceConnection[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [inviteeId, setInviteeId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamIdea, setTeamIdea] = useState("");
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [assistantPlan, setAssistantPlan] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [error, setError] = useState("");
  const team = teams[0];

  const loadTeams = async () => {
    try {
      const [teamList, peopleList, connectionList, user] = await Promise.all([
        getTeams(),
        getUsers(),
        getConnections(),
        getCurrentUser(),
      ]);
      setTeams(teamList);
      setProfiles(peopleList);
      setConnections(connectionList);
      setCurrentUserId(user.id);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load teams.");
    }
  };

  useEffect(() => { void loadTeams(); }, []);

  const acceptedConnectionIds = connections
    .filter((connection) => connection.status === "accepted")
    .map((connection) => connection.requester?.id === currentUserId
      ? connection.recipient?.id
      : connection.requester?.id)
    .filter((id): id is string => Boolean(id));
  const inviteCandidates = profiles.filter((person) =>
    acceptedConnectionIds.includes(person.id) &&
    !team?.members.some((member) => member.userId === person.id),
  );

  const inviteMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!team || !inviteeId) return;
    try {
      const updated = await inviteTeamMember(team.id, inviteeId);
      setTeams((current) => current.map((item) => item.id === updated.id ? updated : item));
      setInviteeId("");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not invite teammate.");
    }
  };

  const saveTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const created = await createTeam({ name: teamName, idea: teamIdea });
      setTeams((current) => [created, ...current]);
      setTeamName("");
      setTeamIdea("");
      setShowTeamForm(false);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create team.");
    }
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!team || !taskTitle.trim()) return;
    try {
      const updated = await addTeamTask(team.id, taskTitle);
      setTeams((current) => current.map((item) => item.id === updated.id ? updated : item));
      setTaskTitle("");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not add task.");
    }
  };

  const toggleTask = async (taskId: string, completed: boolean) => {
    if (!team) return;
    try {
      const updated = await updateTeamTask(team.id, taskId, !completed);
      setTeams((current) => current.map((item) => item.id === updated.id ? updated : item));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update task.");
    }
  };

  const askTeamSidekick = async () => {
    if (!team) {
      setAssistantError("Create or join a team before asking for a plan.");
      return;
    }
    setAssistantBusy(true);
    setAssistantError("");
    try {
      const result = await generateTeamPlan({
        teamName: team.name,
        idea: team.idea,
        members: team.members.map((member) => ({
          name: profiles.find((person) => person.id === member.userId)?.fullName ?? "Teammate",
          role: member.role,
        })),
      });
      setAssistantPlan(result.plan);
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : "The team sidekick could not make a plan.");
    } finally {
      setAssistantBusy(false);
    }
  };

  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">YOUR COLLABORATION, IN ONE PLACE</span><h1>Make it <em>together.</em></h1><p>Your teams, your tasks, and the next small step that moves it all forward.</p></div><button className="workspace-primary" onClick={() => setShowTeamForm((current) => !current)}><Plus size={16} /> CREATE A TEAM</button></div>
      {showTeamForm && <form className="profile-edit" onSubmit={(event) => void saveTeam(event)}><label>TEAM NAME<input value={teamName} onChange={(event) => setTeamName(event.target.value)} required maxLength={100} /></label><label>PROJECT IDEA<textarea value={teamIdea} onChange={(event) => setTeamIdea(event.target.value)} required minLength={10} maxLength={3000} /></label><button className="workspace-primary" type="submit"><Check size={15} /> CREATE TEAM</button></form>}
      <div className="team-workspace-grid">
        <section className="workspace-panel active-team">{team ? <><div className="team-panel-cover"><img src="/team-collaboration-alt.jpg" alt="Your team working together" /><div className="team-preview-shade" /><span>{team.hackathon || "YOUR TEAM"}</span><h2>{team.name}</h2></div><div className="team-members"><span className="workspace-kicker">THE PEOPLE BUILDING THIS</span><div className="team-member-list">{team.members.map((member, index) => { const person = profiles.find((profile) => profile.id === member.userId); return <span key={member.userId}><i className={`mini-avatar ${profileColors[index % profileColors.length]}`}>{person ? initials(person.fullName)[0] : "T"}</i><b>{person?.fullName.split(" ")[0] ?? "Teammate"}</b><small>{member.role}</small></span>; })}</div>{team.ownerId === currentUserId && inviteCandidates.length > 0 && <form className="chat-composer" onSubmit={(event) => void inviteMember(event)}><select aria-label="Invite an accepted connection" value={inviteeId} onChange={(event) => setInviteeId(event.target.value)} required><option value="">Invite an accepted connection…</option>{inviteCandidates.map((person) => <option value={person.id} key={person.id}>{person.fullName}</option>)}</select><button aria-label="Invite teammate" type="submit" disabled={!inviteeId}><Plus size={17} /></button></form>}<button className="panel-link" onClick={() => onNavigate("chat")}>OPEN TEAM CHAT <ArrowUpRight size={14} /></button></div></> : <div className="empty-search">No team yet. Create one to start sharing tasks and messages.</div>}</section>
        <section className="workspace-panel tasks-panel"><div className="panel-heading"><div><span className="workspace-kicker">SMALL STEPS, BIG MOMENTUM</span><h2>Team tasks</h2></div></div>{team?.tasks.map((task) => <button className={`task-row ${task.completed ? "task-done" : ""}`} key={task.id} onClick={() => void toggleTask(task.id, task.completed)}><span className="task-check">{task.completed && <Check size={13} />}</span><span>{task.title}</span><small>{profiles.find((person) => person.id === task.assigneeId)?.fullName.split(" ")[0]?.toUpperCase() ?? "YOU"}</small></button>)}{team && <form className="chat-composer" onSubmit={(event) => void saveTask(event)}><input aria-label="New team task" placeholder="Add a team task..." value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={240} /><button aria-label="Add task" type="submit"><Plus size={17} /></button></form>}<button className="assistant-nudge" disabled={assistantBusy} onClick={() => void askTeamSidekick()}><Sparkles size={16} /><span><b>{assistantBusy ? "Making your plan..." : "Ask your team sidekick"}</b><small>{assistantBusy ? "One moment" : "Suggest a fair plan for the week"}</small></span><ArrowUpRight size={15} /></button>{assistantError && <p className="assistant-feedback" role="status">{assistantError}</p>}{assistantPlan && <div className="assistant-plan" role="status"><b>YOUR TEAM’S NEXT STEPS</b><p>{assistantPlan}</p></div>}</section>
      </div>
      {error && <p className="assistant-feedback" role="status">{error}</p>}
      {team?.hackathon && <section className="workspace-panel team-deadline"><CalendarDays size={18} /><div><span className="workspace-kicker">HACKATHON</span><b>{team.hackathon}</b></div><button onClick={() => onNavigate("hackathons")}>EVENT DETAILS <ArrowUpRight size={14} /></button></section>}
    </>
  );
}

function ChatPage({ onNavigate }: NavigateProps) {
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [activeTeamId, setActiveTeamId] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getTeams(), getCurrentUser()])
      .then(([teamList, user]) => {
        setTeams(teamList);
        setActiveTeamId(teamList[0]?.id ?? "");
        setCurrentUserId(user.id);
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load team messages."));
  }, []);

  useEffect(() => {
    if (!activeTeamId) return;
    let active = true;
    const loadMessages = () => {
      getTeamMessages(activeTeamId)
        .then((result) => { if (active) { setMessages(result); setError(""); } })
        .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : "Could not load messages."); });
    };
    loadMessages();
    const intervalId = window.setInterval(loadMessages, 8000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [activeTeamId]);

  const activeTeam = teams.find((team) => team.id === activeTeamId);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim() || !activeTeamId) return;
    try {
      await sendTeamMessage(activeTeamId, draft.trim());
      setDraft("");
      setMessages(await getTeamMessages(activeTeamId));
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not send message.");
    }
  };
  return (
    <div className="chat-layout">
      <aside className="chat-list-panel"><div className="chat-list-heading"><div><span className="workspace-kicker">SAY THE THING</span><h2>Messages</h2></div></div><div className="workspace-search chat-search"><Search size={15} /><input aria-label="Search conversations" placeholder="Find a conversation" /></div>{teams.map((team, index) => <button className={`chat-thread ${activeTeamId === team.id ? "active" : ""}`} key={team.id} onClick={() => setActiveTeamId(team.id)}><span className={`person-avatar ${profileColors[index % profileColors.length]}`}>{initials(team.name)}</span><span><b>{team.name}</b><small>{team.members.length} teammates</small></span></button>)}</aside>
      <section className="chat-room"><header className="chat-room-header"><span className="person-avatar mint">{activeTeam ? initials(activeTeam.name) : "?"}</span><span><b>{activeTeam?.name ?? "Team messages"}</b><small><i /> {activeTeam ? `${activeTeam.members.length} teammates` : "Join or create a team to chat"}</small></span><button className="workspace-quiet" onClick={() => onNavigate("teams")}>TEAM DETAILS <ChevronDown size={14} /></button></header><div className="chat-history">{messages.map((message) => <article className={`workspace-message ${message.sender?.id === currentUserId ? "own-message" : ""}`} key={message.id}><span className={`mini-avatar ${profileColors[(message.sender?.id.charCodeAt(0) ?? 0) % profileColors.length]}`}>{message.sender ? initials(message.sender.fullName) : "?"}</span><div><div className="message-byline"><b>{message.sender?.fullName ?? "Former teammate"}</b><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div><p>{message.text}</p></div></article>)}{!activeTeam && <div className="empty-search">Create a team before starting a conversation.</div>}<div className="chat-ai-hint"><Sparkles size={14} /><span>Need a plan? Ask your team sidekick in the Teams page.</span></div></div><form className="chat-composer" onSubmit={(event) => void send(event)}><input aria-label="Write a message" onChange={(event) => setDraft(event.target.value)} placeholder="Say something useful, kind, or wonderfully weird…" value={draft} disabled={!activeTeam} maxLength={4000} /><button aria-label="Send message" type="submit" disabled={!activeTeam}><Send size={17} /></button></form>{error && <p className="assistant-feedback" role="status">{error}</p>}</section>
    </div>
  );
}

function HackathonsPage({ signedIn }: { signedIn: boolean }) {
  const [eventsList, setEventsList] = useState<HackathonEvent[]>([]);
  const [sources, setSources] = useState<HackathonSourceStatus[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [interested, setInterested] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [formats, setFormats] = useState<Array<"online" | "in-person" | "hybrid">>([]);
  const [category, setCategory] = useState("");
  const [destination, setDestination] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [interestedOnly, setInterestedOnly] = useState(false);
  const [notifyFilters, setNotifyFilters] = useState<HackathonFilters>({ formats: [], categories: [], destination: "" });
  const [notifySaved, setNotifySaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getHackathonCatalog().then(setEventsList).catch((requestError: unknown) =>
      setError(requestError instanceof Error ? requestError.message : "Could not load hackathons."),
    );
    getHackathonSourceStatuses().then(setSources).catch((requestError: unknown) =>
      setError(requestError instanceof Error ? requestError.message : "Could not load source status."),
    );
    if (signedIn) {
      getHackathonState().then((state) => { setSaved(state.saved); setInterested(state.interested); }).catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "Could not load saved events."),
      );
      getHackathonNotificationFilters().then(setNotifyFilters).catch((requestError: unknown) =>
        setError(requestError instanceof Error ? requestError.message : "Could not load notification preferences."),
      );
    }
  }, [signedIn]);

  const toggle = async (slug: string, enabled: boolean) => {
    try {
      const nextEnabled = !enabled;
      const state = await updateHackathonState(slug, { saved: nextEnabled, interested: nextEnabled });
      setSaved(state.saved);
      setInterested(state.interested);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update event.");
    }
  };

  const categories = [...new Set(eventsList.flatMap((event) => event.categories))].sort();
  const filteredEvents = eventsList.filter((event) => {
    const searchable = `${event.name} ${event.description} ${event.categories.join(" ")} ${event.city} ${event.region} ${event.country} ${event.venue}`.toLowerCase();
    const date = event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : "";
    return searchable.includes(query.toLowerCase()) &&
      (!formats.length || formats.includes(event.format as "online" | "in-person" | "hybrid")) &&
      (!category || event.categories.includes(category)) &&
      (!destination || `${event.city} ${event.region} ${event.country}`.toLowerCase().includes(destination.toLowerCase())) &&
      (!dateFrom || (date && date >= dateFrom)) &&
      (!dateTo || (date && date <= dateTo)) &&
      (!interestedOnly || interested.includes(event.slug));
  });
  const toggleFormat = (format: "online" | "in-person" | "hybrid") => {
    setFormats((current) => current.includes(format) ? current.filter((value) => value !== format) : [...current, format]);
  };
  const toggleNotificationFormat = (format: "online" | "in-person" | "hybrid") => {
    setNotifyFilters((current) => ({
      ...current,
      formats: current.formats.includes(format) ? current.formats.filter((value) => value !== format) : [...current.formats, format],
    }));
  };
  const saveNotifications = async () => {
    try {
      setNotifyFilters(await saveHackathonNotificationFilters(notifyFilters));
      setNotifySaved(true);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save notification preferences.");
    }
  };

  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">FIND A CHALLENGE WORTH SHOWING UP FOR</span><h1>Make room for <em>what if?</em></h1><p>Shared event listings from our sources. Verify dates and registration with the official organizer.</p></div></div>
      <div className="workspace-search"><Search size={17} /><input aria-label="Search hackathons" onChange={(event) => setQuery(event.target.value)} placeholder="Search events, categories, or destinations…" value={query} /></div>
      <div className="hackathon-filters">
        <fieldset><legend>EVENT FORMAT</legend><div className="format-filter-options">{(["online", "in-person", "hybrid"] as const).map((format) => <label className={`format-filter-option ${formats.includes(format) ? "selected" : ""}`} key={format}><input type="checkbox" checked={formats.includes(format)} onChange={() => toggleFormat(format)} /><span>{format === "in-person" ? "In person" : format === "online" ? "Online" : "Hybrid"}</span></label>)}</div></fieldset>
        <label>CATEGORY<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>DESTINATION<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="City, region, country" /></label>
        <label>STARTING AFTER<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>STARTING BEFORE<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <div className="hackathon-filter-actions">
          <button className="workspace-quiet" onClick={() => { setQuery(""); setFormats([]); setCategory(""); setDestination(""); setDateFrom(""); setDateTo(""); }}>CLEAR</button>
          <button
            className="workspace-primary interested-hackathons-button"
            type="button"
            disabled={!signedIn}
            title={signedIn ? undefined : "Sign in to save interested hackathons"}
            aria-pressed={interestedOnly}
            onClick={() => setInterestedOnly((current) => !current)}
          >
            <Heart size={15} fill="currentColor" />
            {interestedOnly ? "SHOW ALL HACKATHONS" : `INTERESTED HACKATHONS${interested.length ? ` · ${interested.length}` : ""}`}
          </button>
        </div>
      </div>
      <div className="hackathon-results-bar"><span>SHOWING <b>{filteredEvents.length}</b> OF {interestedOnly ? interested.length : eventsList.length} {interestedOnly ? "INTERESTED " : ""}EVENTS</span>{(interestedOnly || formats.length > 0 || category || destination || dateFrom || dateTo || query) && <span className="active-filter-note">{interestedOnly ? "INTERESTED ONLY" : "FILTERS ACTIVE"}</span>}</div>
      {signedIn && <section className="workspace-panel notification-preferences"><span className="workspace-kicker">OPTIONAL EVENT ALERTS</span><h2>Notify me about matching hackathons</h2><div className="preference-formats">{(["online", "in-person", "hybrid"] as const).map((format) => <label key={format}><input type="checkbox" checked={notifyFilters.formats.includes(format)} onChange={() => toggleNotificationFormat(format)} /> {format}</label>)}</div><label>CATEGORY<input value={notifyFilters.categories.join(", ")} onChange={(event) => setNotifyFilters((current) => ({ ...current, categories: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="AI, climate (comma separated)" /></label><label>DESTINATION<input value={notifyFilters.destination} onChange={(event) => setNotifyFilters((current) => ({ ...current, destination: event.target.value }))} placeholder="City or country" /></label><button className="workspace-primary" type="button" onClick={() => void saveNotifications()}>SAVE ALERTS</button>{notifySaved && <span>Alert preferences saved.</span>}</section>}
      {sources.length > 0 && <section className="source-status"><div className="source-status-heading"><div><span className="workspace-kicker">SOURCE HEALTH</span><p>{sources.filter((source) => source.status === "ok").length} of {sources.length} sources returned event listings.</p></div><small>Organizer pages may restrict automated access or omit public event data.</small></div><div className="source-status-grid">{sources.map((source) => <article className={`source-status-item source-${source.status}`} key={source.id}><div><b>{source.id}</b><i>{sourceStatusLabel(source)}</i></div><span>{source.eventCount} events found</span><small>{sourceStatusMessage(source)}</small></article>)}</div></section>}
      <div className="hackathon-grid">{filteredEvents.map((event) => <article className={`workspace-event event-${eventColor(event)}`} key={event.slug}><div className="workspace-event-top"><span>{event.categories[0]?.toUpperCase() ?? event.source.toUpperCase()} · {event.source.toUpperCase()}</span><button disabled={!signedIn} aria-label={`${saved.includes(event.slug) ? "Unsave" : "Save"} ${event.name}`} className={saved.includes(event.slug) ? "saved" : ""} onClick={() => void toggle(event.slug, saved.includes(event.slug))}><Heart size={17} fill={saved.includes(event.slug) ? "currentColor" : "none"} /></button></div><div className="workspace-event-symbol">✳</div><h2>{event.name}</h2><p className="workspace-event-description">{event.description || "Open the organizer’s page for event details."}</p><div className="event-details"><span><CalendarDays size={14} /> {eventDate(event.startDate)}{event.endDate ? ` – ${eventDate(event.endDate)}` : ""}</span><span><MapPin size={14} /> {[event.format === "in-person" ? "In person" : event.format, event.city, event.region, event.country].filter(Boolean).join(" · ") || "Location not listed"}</span><span><Trophy size={14} /> {event.prize || "Prize details not listed"}</span>{event.registrationDeadline && <span>Registration deadline: {eventDate(event.registrationDeadline)}</span>}</div><div className="event-registration"><a href={event.registrationUrl} target="_blank" rel="noreferrer">OFFICIAL EVENT PAGE <ArrowUpRight size={14} /></a>{signedIn && <button className={interested.includes(event.slug) ? "registered-button" : "event-register"} onClick={() => void toggle(event.slug, interested.includes(event.slug))}>{interested.includes(event.slug) ? "INTERESTED" : "MARK INTEREST"} <ArrowUpRight size={14} /></button>}</div></article>)}</div>
      {!filteredEvents.length && <div className="empty-search">{interestedOnly ? "No hackathons marked as interested yet. Mark an event as interested to save it here." : eventsList.length ? "No hackathons match these filters." : sources.length ? "No hackathons are available in the catalog yet. The latest source checks found no safely extractable listings; some sites timed out, restricted automated access, or did not expose event details. This is a source-access issue, not a filter setting." : "No event listings have been ingested yet. Run the local crawler to check the sources."}</div>}
      {error && <p className="assistant-feedback" role="status">{error}</p>}
      <p className="sample-disclaimer"><Bell size={14} /> LISTINGS ARE AUTOMATICALLY EXTRACTED AND MAY BE INCOMPLETE. VERIFY EVENT DETAILS WITH THE ORGANIZER.</p>
    </>
  );
}

function NotificationsPage({
  onNavigate,
  onUnreadCountChange,
}: NavigateProps & { onUnreadCountChange: (count: number) => void }) {
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const result = await getNotifications();
    setNotifications(result.notifications);
    onUnreadCountChange(result.unreadCount);
  };

  useEffect(() => {
    void refresh().catch((requestError: unknown) =>
      setError(requestError instanceof Error ? requestError.message : "Could not load notifications."),
    ).finally(() => setLoading(false));
  }, []);

  const unreadCount = notifications.filter((item) => !item.readAt).length;
  const filteredNotifications = filter === "unread"
    ? notifications.filter((item) => !item.readAt)
    : notifications;

  const markRead = async (item: WorkspaceNotification) => {
    try {
      if (!item.readAt) {
        await markNotificationRead(item.id);
        setNotifications((current) => current.map((notification) =>
          notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification,
        ));
        onUnreadCountChange(Math.max(0, unreadCount - 1));
      }
      const destination: Record<string, AppView> = {
        "/connections": "connections",
        "/teams": "teams",
        "/chat": "chat",
        "/ratings": "ratings",
        "/hackathons": "hackathons",
      };
      onNavigate(destination[item.href] ?? "notifications");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update notification.");
    }
  };

  const markAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      onUnreadCountChange(0);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not mark notifications as read.");
    }
  };

  return (
    <>
      <div className="workspace-welcome notification-welcome">
        <div><span className="workspace-kicker">YOUR ACTIVITY</span><h1>Notifications<em>.</em></h1><p>Team updates, new connections, messages, and more—all in one place.</p></div>
        <div className="notification-heading-actions">
          <span className="notification-unread-count">{unreadCount} UNREAD</span>
          <button className="workspace-quiet" disabled={!unreadCount} onClick={() => void markAllRead()}><Check size={14} /> MARK ALL READ</button>
        </div>
      </div>
      <section className="notification-inbox" aria-label="Your notifications">
        <div className="notification-toolbar">
          <div><span className="workspace-kicker">INBOX</span><b>{notifications.length} {notifications.length === 1 ? "UPDATE" : "UPDATES"}</b></div>
          <div className="notification-filters" aria-label="Filter notifications">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>ALL</button>
            <button className={filter === "unread" ? "active" : ""} onClick={() => setFilter("unread")}>UNREAD{unreadCount > 0 ? ` · ${unreadCount}` : ""}</button>
          </div>
        </div>
        <div className="notification-list">
          {filteredNotifications.map((item) => {
            const NotificationIcon = {
              "connection-request": UserPlus,
              "connection-accepted": UsersRound,
              "team-update": Users,
              "team-message": MessageSquare,
              rating: Star,
              hackathon: CalendarDays,
              system: Sparkles,
            }[item.type];
            const category = item.type.replace(/-/g, " ");
            return (
              <button
                className={`notification-row ${item.readAt ? "read" : "unread"} notification-${item.type}`}
                key={item.id}
                onClick={() => void markRead(item)}
                aria-label={`${item.title}. ${item.body}`}
              >
                <span className="notification-type-icon" aria-hidden="true">
                  {item.actor?.avatarUrl
                    ? <img src={item.actor.avatarUrl} alt="" />
                    : <NotificationIcon size={17} />}
                </span>
                <span className="notification-copy">
                  <span className="notification-meta"><span>{category}</span>{!item.readAt && <i>NEW</i>}</span>
                  <b>{item.title}</b>
                  <small>{item.body}</small>
                  <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}</time>
                </span>
                <ArrowUpRight className="notification-open-icon" size={16} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {!loading && !filteredNotifications.length && !error && (
          <div className="notification-empty">
            <span><Bell size={20} /></span>
            <b>{filter === "unread" ? "You’re all caught up." : "Your inbox is quiet."}</b>
            <small>{filter === "unread" ? "There are no unread updates right now." : "New connection and team activity will show up here."}</small>
            {filter === "unread" && notifications.length > 0 && <button onClick={() => setFilter("all")}>VIEW ALL UPDATES <ArrowRight size={14} /></button>}
          </div>
        )}
      </section>
      {error && <p className="assistant-feedback" role="alert">{error}</p>}
    </>
  );
}

function SecurityAndAchievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [title, setTitle] = useState("");
  const [issuer, setIssuer] = useState("");
  const [achievedAt, setAchievedAt] = useState("");
  const [certificate, setCertificate] = useState<File | null>(null);
  const [publicVisible, setPublicVisible] = useState(false);
  const [password, setPassword] = useState("");
  const [authenticatorCode, setAuthenticatorCode] = useState("");
  const [mfaSetup, setMfaSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [googleAction, setGoogleAction] = useState<"setup" | "disable" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId =
    import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
    "262093778913-6ija8ou7dlgcirqq9ut5ulde4cq5s4d2.apps.googleusercontent.com";

  const refresh = async () => {
    const [items, status] = await Promise.all([getAchievements(), getMfaStatus()]);
    setAchievements(items);
    setMfaStatus(status);
  };

  useEffect(() => {
    void refresh().catch((requestError: unknown) =>
      setError(requestError instanceof Error ? requestError.message : "Could not load profile security settings."),
    );
  }, []);

  const startSetup = async (credentials: Reauthentication) => {
    setBusy(true);
    setError("");
    try {
      setMfaSetup(await beginMfaSetup(credentials));
      setPassword("");
      setNotice("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start authenticator setup.");
    } finally {
      setBusy(false);
    }
  };

  const finishGoogleAction = async (credential: string) => {
    const action = googleAction;
    setGoogleAction(null);
    if (!action) return;
    if (action === "setup") {
      await startSetup({ googleCredential: credential });
      return;
    }
    setBusy(true);
    setError("");
    try {
      await disableMfa(authenticatorCode, { googleCredential: credential });
      setAuthenticatorCode("");
      setMfaSetup(null);
      setPassword("");
      setNotice("Authenticator MFA is disabled.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disable authenticator MFA.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const target = googleButtonRef.current;
    if (!target || !googleAction) return;
    if (!googleClientId) {
      setError("Google reauthentication is not configured in this app.");
      setGoogleAction(null);
      return;
    }
    let active = true;
    let script: HTMLScriptElement | undefined;
    const renderGoogleButton = () => {
      if (!active || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response) => void finishGoogleAction(response.credential),
      });
      window.google.accounts.id.renderButton(target, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.max(220, Math.min(target.clientWidth, 380)),
      });
    };
    if (window.google) {
      renderGoogleButton();
    } else {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = renderGoogleButton;
      script.onerror = () => setError("Google reauthentication could not load.");
      document.head.append(script);
    }
    return () => {
      active = false;
      if (script) script.remove();
    };
  }, [googleAction, googleClientId]);

  const submitCertificate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!certificate) {
      setError("Choose a photo certificate before saving.");
      return;
    }
    if (certificate.size > 5 * 1024 * 1024) {
      setError("Certificate photos must be 5 MiB or smaller.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await uploadAchievement({
        title,
        issuer,
        achievedAt,
        file: certificate,
        publicVisible,
      });
      setAchievements((current) => [created, ...current]);
      setTitle("");
      setIssuer("");
      setAchievedAt("");
      setCertificate(null);
      setPublicVisible(false);
      const input = document.getElementById("achievement-certificate") as HTMLInputElement | null;
      if (input) input.value = "";
      setNotice(publicVisible ? "Certificate saved and published to your profile." : "Certificate saved privately.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this certificate.");
    } finally {
      setBusy(false);
    }
  };

  const confirmSetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await confirmMfaSetup(authenticatorCode);
      setAuthenticatorCode("");
      setMfaSetup(null);
      setNotice("Authenticator MFA is enabled. Keep your authenticator app available when signing in.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not verify the authenticator code.");
    } finally {
      setBusy(false);
    }
  };

  const disableWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await disableMfa(authenticatorCode, { password });
      setAuthenticatorCode("");
      setPassword("");
      setNotice("Authenticator MFA is disabled.");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disable authenticator MFA.");
    } finally {
      setBusy(false);
    }
  };

  const changeVisibility = async (achievement: Achievement) => {
    const makePublic = !achievement.publicVisible;
    if (
      makePublic &&
      !window.confirm("Publish this certificate photo so anyone with its profile image link can view it?")
    ) return;
    try {
      const updated = await setAchievementVisibility(achievement.id, makePublic);
      setAchievements((current) => current.map((item) => item.id === updated.id ? updated : item));
      setNotice(makePublic ? "Certificate is now public." : "Certificate is private.");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update certificate visibility.");
    }
  };

  const removeAchievement = async (id: string) => {
    try {
      await deleteAchievement(id);
      setAchievements((current) => current.filter((item) => item.id !== id));
      setNotice("Certificate removed.");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove certificate.");
    }
  };

  return (
    <div className="profile-extras">
      <section className="workspace-panel security-panel">
        <span className="workspace-kicker">ACCOUNT SECURITY</span>
        <h2>Authenticator-app MFA</h2>
        <p>{mfaStatus?.enabled ? "An authenticator app is required after your password or Google sign-in." : "Add a time-based one-time code as a second sign-in step."}</p>
        {!mfaStatus ? <p>Loading account security settings…</p> : mfaStatus.enabled ? (
          mfaStatus.provider === "email" ? (
            <form className="profile-edit" onSubmit={(event) => void disableWithPassword(event)}>
              <label>ACCOUNT PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
              <label>CURRENT AUTHENTICATOR CODE<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value)} required /></label>
              <button className="workspace-quiet" type="submit" disabled={busy}>DISABLE MFA</button>
            </form>
          ) : (
            <div className="profile-edit">
              <label>CURRENT AUTHENTICATOR CODE<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value)} /></label>
              <button className="workspace-quiet" type="button" disabled={busy || authenticatorCode.length !== 6} onClick={() => setGoogleAction("disable")}>REAUTHENTICATE WITH GOOGLE TO DISABLE</button>
              {googleAction === "disable" && <div className="google-button" ref={googleButtonRef} />}
            </div>
          )
        ) : mfaSetup ? (
          <form className="profile-edit" onSubmit={(event) => void confirmSetup(event)}>
            <p>In your authenticator app, add a time-based account for HackConnect and enter this setup key:</p>
            <code className="totp-setup-key">{mfaSetup.secret}</code>
            <a className="authenticator-link" href={mfaSetup.otpauthUrl}>Open authenticator app</a>
            <label>6-DIGIT AUTHENTICATOR CODE<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={authenticatorCode} onChange={(event) => setAuthenticatorCode(event.target.value)} required /></label>
            <button className="workspace-primary" type="submit" disabled={busy}>CONFIRM AND ENABLE MFA</button>
          </form>
        ) : mfaStatus?.provider === "email" ? (
          <form className="profile-edit" onSubmit={(event) => { event.preventDefault(); void startSetup({ password }); }}>
            <label>ACCOUNT PASSWORD<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="workspace-primary" type="submit" disabled={busy}>VERIFY AND SET UP MFA</button>
          </form>
        ) : (
          <div className="profile-edit">
            <button className="workspace-primary" type="button" disabled={busy} onClick={() => setGoogleAction("setup")}>REAUTHENTICATE WITH GOOGLE</button>
            {googleAction === "setup" && <div className="google-button" ref={googleButtonRef} />}
          </div>
        )}
      </section>

      <section className="workspace-panel achievements-panel">
        <span className="workspace-kicker">YOUR WORK, RECOGNIZED</span>
        <h2>Achievements & certificates</h2>
        <p>A photo certificate is required for every achievement. Images are private by default.</p>
        <form className="profile-edit achievement-form" onSubmit={(event) => void submitCertificate(event)}>
          <label>ACHIEVEMENT<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} /></label>
          <label>ISSUED BY<input value={issuer} onChange={(event) => setIssuer(event.target.value)} required maxLength={120} /></label>
          <label>DATE<input type="date" value={achievedAt} onChange={(event) => setAchievedAt(event.target.value)} required /></label>
          <label className="certificate-upload">CERTIFICATE PHOTO (JPEG, PNG, OR WEBP; MAX 5 MiB)<span className="certificate-upload-control"><span className="certificate-upload-button">CHOOSE PHOTO</span><span className="certificate-file-name">{certificate?.name ?? "No file selected"}</span><input id="achievement-certificate" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setCertificate(event.target.files?.[0] ?? null)} /></span></label>
          <label className="achievement-consent"><input type="checkbox" checked={publicVisible} onChange={(event) => setPublicVisible(event.target.checked)} /> I consent to making this certificate photo publicly viewable on my profile.</label>
          <button className="workspace-primary" type="submit" disabled={busy}>SAVE ACHIEVEMENT</button>
        </form>
        <div className="achievement-list">
          {achievements.map((achievement) => (
            <article className="achievement-item" key={achievement.id}>
              <img src={achievement.imageUrl} alt={`Certificate for ${achievement.title}`} />
              <div><h3>{achievement.title}</h3><p>{achievement.issuer} · {new Date(achievement.achievedAt).toLocaleDateString()}</p><span>{achievement.publicVisible ? "PUBLIC" : "PRIVATE"}</span></div>
              <button className="workspace-quiet" type="button" onClick={() => void changeVisibility(achievement)}>{achievement.publicVisible ? "MAKE PRIVATE" : "PUBLISH"}</button>
              <button className="workspace-quiet" type="button" onClick={() => void removeAchievement(achievement.id)}>REMOVE</button>
            </article>
          ))}
        </div>
      </section>
      {notice && <p className="assistant-feedback" role="status">{notice}</p>}
      {error && <p className="assistant-feedback" role="alert">{error}</p>}
    </div>
  );
}

function ProfilePage() {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<AuthUser | null>(null);
  const [form, setForm] = useState<{ fullName: string; bio: string; role: string; school: string; location: string; skills: string; profileVisibility: "public" | "private" }>({
    fullName: "", bio: "", role: "", school: "", location: "", skills: "", profileVisibility: "public",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    getProfile()
      .then((user) => {
        setProfile(user);
        setForm({
          fullName: user.fullName,
          bio: user.bio,
          role: user.role,
          school: user.school,
          location: user.location,
          skills: user.skills.join(", "),
          profileVisibility: user.profileVisibility,
        });
      })
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load profile."));
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const updated = await updateProfile({
        ...form,
        skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean),
      });
      setProfile(updated);
      setEditing(false);
      setSaved(true);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save profile.");
    }
  };

  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">THE HUMAN BEHIND THE IDEAS</span><h1>Your <em>profile.</em></h1><p>Give future teammates a reason to say “we should build together.”</p></div><button className="workspace-primary" onClick={() => { setEditing((current) => !current); setSaved(false); }}>{editing ? <X size={15} /> : <Settings size={15} />}{editing ? "CANCEL" : "EDIT PROFILE"}</button></div>
      <section className="profile-card"><div className="profile-art"><span>HC / BUILDER PROFILE</span><span className="profile-art-spark">✳</span></div><div className="profile-details"><div className="person-avatar profile-avatar lime">{profile ? initials(profile.fullName) : "?"}</div><span className="profile-handle">{profile?.username ? `@${profile.username}` : profile?.email ?? "SIGN IN TO LOAD YOUR PROFILE"}</span>{editing ? <form className="profile-edit" onSubmit={(event) => void saveProfile(event)}><label>DISPLAY NAME<input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required minLength={2} maxLength={80} /></label><label>ROLE<input value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} maxLength={100} /></label><label>ABOUT YOU<textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} maxLength={1000} /></label><label>SCHOOL<input value={form.school} onChange={(event) => setForm((current) => ({ ...current, school: event.target.value }))} maxLength={120} /></label><label>LOCATION<input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} maxLength={120} /></label><label>YOUR SKILLS (COMMA SEPARATED)<input value={form.skills} onChange={(event) => setForm((current) => ({ ...current, skills: event.target.value }))} /></label><label className="profile-visibility"><span>PROFILE VISIBILITY</span><select value={form.profileVisibility} onChange={(event) => setForm((current) => ({ ...current, profileVisibility: event.target.value === "private" ? "private" : "public" }))}><option value="public">Public — visible in teammate discovery</option><option value="private">Private — hidden from discovery</option></select><small>Your ratings remain public either way.</small></label><button className="workspace-primary" type="submit"><Check size={15} /> SAVE PROFILE</button>{saved && <span>Profile saved to your account.</span>}</form> : <><h2>{profile?.fullName ?? "Your profile"}</h2><p className="profile-bio">{profile?.bio || (error ? "Sign in to load and edit your profile." : "Add a short bio to help teammates get to know you.")}</p><div className="profile-tags">{profile?.skills.map((skill) => <span key={skill}>{skill.toUpperCase()}</span>)}</div><div className="profile-social"><span><MapPin size={14} /> {profile?.location || "LOCATION NOT ADDED"}</span><span><Users size={14} /> {profile?.role || "BUILDER"}</span><span><CircleUserRound size={14} /> {profile?.school || "SCHOOL NOT ADDED"}</span></div><p className="profile-visibility-note">Profile is {profile?.profileVisibility ?? "public"} · Ratings are always public.</p></>}</div></section>
      {error && <p className="assistant-feedback" role="status">{error}</p>}
      <div className="profile-lower"><section className="workspace-panel"><span className="workspace-kicker">YOUR ACCOUNT</span><h2>Built around your profile.</h2><p>{profile?.email ?? "Sign in to view your account email."}</p><p>Profile changes are saved securely to your HackConnect account.</p></section></div>
      <SecurityAndAchievements />
    </>
  );
}

function RatingsPage() {
  const [rating, setRating] = useState(0);
  const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [ratings, setRatings] = useState<WorkspaceRating[]>([]);
  const [teamId, setTeamId] = useState("");
  const [revieweeId, setRevieweeId] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const loadRatings = async () => {
    try {
      const [teamList, peopleList, ratingList] = await Promise.all([getTeams(), getUsers(), getRatings()]);
      setTeams(teamList);
      setProfiles(peopleList);
      setRatings(ratingList);
      setTeamId((current) => current || teamList[0]?.id || "");
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load reputation.");
    }
  };

  useEffect(() => { void loadRatings(); }, []);

  const selectedTeam = teams.find((team) => team.id === teamId);
  const teammates = selectedTeam?.members
    .map((member) => profiles.find((person) => person.id === member.userId))
    .filter((person): person is PublicProfile => Boolean(person)) ?? [];
  const average = ratings.length
    ? (ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length).toFixed(1)
    : "—";

  const sendRating = async () => {
    if (!teamId || !revieweeId || !rating) return;
    try {
      await submitRating({ teamId, revieweeId, score: rating, comment });
      setRating(0);
      setComment("");
      setRevieweeId("");
      await loadRatings();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not submit rating.");
    }
  };

  return (
    <>
      <div className="workspace-welcome"><div><span className="workspace-kicker">GOOD TEAMWORK LEAVES A MARK</span><h1>Your <em>reputation.</em></h1><p>Thoughtful feedback helps good collaborators find each other again.</p></div></div>
      <div className="rating-summary"><div><span className="workspace-kicker">YOUR OVERALL RATING</span><strong><span className="rating-value">{average}</span><span className="rating-scale">/ 5</span></strong><div className="profile-stars">{[1, 2, 3, 4, 5].map((star) => <Star fill="currentColor" key={star} size={17} />)}</div><small>{ratings.length} teammate reviews</small></div><div className="rating-bars">{ratings.slice(0, 4).map((review) => <span key={review.id}><b>{review.reviewer?.fullName ?? "Teammate"}</b><i><em style={{ width: `${review.score * 20}%` }} /></i><small>{review.score}.0</small></span>)}</div></div>
      <section className="workspace-panel leave-rating">
        <div className="rating-form-heading"><span className="workspace-kicker">SHARE THOUGHTFUL FEEDBACK</span><h2>Rate a teammate</h2><p>Reviews are saved to the team record and shown on your profile.</p></div>
        <label className="rating-field rating-team">TEAM<select value={teamId} onChange={(event) => { setTeamId(event.target.value); setRevieweeId(""); }}><option value="">Choose a team</option>{teams.map((team) => <option value={team.id} key={team.id}>{team.name}</option>)}</select></label>
        <label className="rating-field rating-teammate">TEAMMATE<select value={revieweeId} onChange={(event) => setRevieweeId(event.target.value)}><option value="">Choose a teammate</option>{teammates.map((person) => <option value={person.id} key={person.id}>{person.fullName}</option>)}</select></label>
        <label className="rating-field rating-note">OPTIONAL NOTE<textarea placeholder="Share a helpful, specific note about working together…" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} /></label>
        <div className="rating-picker" role="group" aria-label="Rate your teammate">{[1, 2, 3, 4, 5].map((star) => <button type="button" aria-label={`${star} star${star === 1 ? "" : "s"}`} className={rating >= star ? "active" : ""} key={star} onClick={() => setRating(star)}><Star fill="currentColor" size={27} /></button>)}</div>
        <button className="workspace-primary" disabled={!rating || !teamId || !revieweeId} onClick={() => void sendRating()}>{rating ? `SUBMIT ${rating}-STAR REVIEW` : "PICK A RATING"}</button>
        <small>One review per teammate, per team.</small>
      </section>
      {error && <p className="assistant-feedback" role="status">{error}</p>}
    </>
  );
}

function PublicUserProfilePage({ profileId, currentUserId, onNavigate }: {
  profileId: string;
  currentUserId?: string;
  onNavigate: (view: AppView) => void;
}) {
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [ratings, setRatings] = useState<WorkspaceRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectError, setConnectError] = useState("");
  const [connectionSent, setConnectionSent] = useState(false);
  const [sendingConnection, setSendingConnection] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setConnectError("");
    setConnectionSent(false);
    setProfile(null);
    setAchievements([]);
    setRatings([]);
    setIsPublic(null);

    const load = async () => {
      try {
        const [profilePage, publicRatings] = await Promise.all([
          getPublicProfilePage(profileId),
          getPublicRatings(profileId),
        ]);
        if (!active) return;
        setIsPublic(profilePage.isPublic);
        setRatings(publicRatings);
        if (profilePage.isPublic && profilePage.profile) {
          setProfile(profilePage.profile);
          const publicAchievements = await getPublicAchievements(profileId);
          if (active) setAchievements(publicAchievements);
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load this profile.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [profileId]);

  const average = ratings.length
    ? (ratings.reduce((sum, item) => sum + item.score, 0) / ratings.length).toFixed(1)
    : "—";

  const connect = async () => {
    setSendingConnection(true);
    setConnectError("");
    try {
      await requestConnection(profileId);
      setConnectionSent(true);
    } catch (requestError) {
      setConnectError(requestError instanceof Error ? requestError.message : "Could not send connection request.");
    } finally {
      setSendingConnection(false);
    }
  };

  const ratingSummary = (
    <div className="public-rating-summary" aria-label={`${average} average rating out of 5; ${ratings.length} public ratings`}>
      <div className="public-rating-average"><strong>{average}</strong><span>AVERAGE / 5</span></div>
      <div className="public-rating-count"><strong>{ratings.length}</strong><span>{ratings.length === 1 ? "PUBLIC RATING" : "PUBLIC RATINGS"}</span></div>
    </div>
  );

  return (
    <main className="public-profile-page">
      <header className="public-profile-heading">
        <div><span className="workspace-kicker">{isPublic ? "BUILDER PROFILE" : "PUBLIC REPUTATION"}</span><h1>{isPublic ? profile?.fullName ?? "Builder profile" : "Ratings"}</h1></div>
        <div className="public-profile-heading-actions">
          {isPublic !== null && currentUserId !== profileId && <button className={`public-profile-connect ${connectionSent ? "sent" : ""}`} type="button" onClick={() => void connect()} disabled={sendingConnection || connectionSent}>{connectionSent ? <><Check size={16} /> REQUEST SENT</> : <><Plus size={16} /> {sendingConnection ? "SENDING…" : "CONNECT"}</>}</button>}
          <button className="workspace-quiet" type="button" onClick={() => onNavigate("discover")}><ArrowRight size={15} /> BACK TO DISCOVER</button>
        </div>
      </header>
      {connectError && <p className="assistant-feedback" role="alert">{connectError}</p>}
      {loading && <p className="public-profile-state">Loading profile and public ratings…</p>}
      {error && <p className="assistant-feedback" role="alert">{error}</p>}
      {!loading && !error && isPublic && profile && (
        <>
          <section className="public-profile-card">
            <div className="public-profile-card-top"><span className="person-avatar lime">{initials(profile.fullName)}</span><span className="public-profile-badge">PUBLIC PROFILE</span></div>
            <h2>{profile.fullName}</h2>
            <p className="public-profile-bio">{profile.bio || "This builder has not added a bio yet."}</p>
            <div className="public-profile-meta">
              <span><MapPin size={15} /> {profile.location || "Location not added"}</span>
              <span><Users size={15} /> {profile.role || "Builder"}</span>
              <span><CircleUserRound size={15} /> {profile.school || "School not added"}</span>
            </div>
            {profile.skills.length > 0 && <div className="person-skills">{profile.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>}
          </section>
          <section className="public-profile-section">
            <div className="public-profile-section-heading"><div><span className="workspace-kicker">REPUTATION</span><h2>Public ratings</h2></div>{ratingSummary}</div>
            {ratings.length ? ratings.map((rating) => <article className="public-profile-rating" key={rating.id}><b>{rating.score}<span> / 5</span></b><span>{rating.comment || "No written note."}</span><small>{rating.reviewer?.fullName ?? "Private reviewer"} · {new Date(rating.createdAt).toLocaleDateString()}</small></article>) : <p>No public ratings yet.</p>}
          </section>
          <section className="public-profile-section">
            <div className="public-profile-section-heading"><div><span className="workspace-kicker">SHARED WORK</span><h2>Public certificates</h2></div></div>
            {achievements.length ? <div className="public-achievement-grid">{achievements.map((achievement) => <article key={achievement.id}><img src={achievement.imageUrl} alt={`Certificate for ${achievement.title}`} /><h3>{achievement.title}</h3><p>{achievement.issuer} · {new Date(achievement.achievedAt).toLocaleDateString()}</p></article>)}</div> : <p>No public certificates shared.</p>}
          </section>
        </>
      )}
      {!loading && !error && isPublic === false && (
        <section className="public-profile-private">
          <span className="workspace-kicker">PRIVATE PROFILE</span>
          <h2>Only public ratings are shown here.</h2>
          <p>Profile details and certificates are private. Their ratings remain public.</p>
          <div className="public-profile-section-heading"><div><span className="workspace-kicker">REPUTATION</span><h2>Public ratings</h2></div>{ratingSummary}</div>
          {ratings.length ? ratings.map((rating) => <article className="public-profile-rating" key={rating.id}><b>{rating.score}<span> / 5</span></b><span>{rating.comment || "No written note."}</span><small>{rating.reviewer?.fullName ?? "Private reviewer"} · {new Date(rating.createdAt).toLocaleDateString()}</small></article>) : <p>No public ratings yet.</p>}
        </section>
      )}
    </main>
  );
}

function WorkspacePage({ view, onNavigate, onViewProfile, profileId, currentUser: initialUser }: Props) {
  const activeItem = navigation.find((item) => item.id === view) ?? (view === "public-profile"
    ? { id: view, label: "Builder profile", icon: CircleUserRound }
    : navigation[0]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initialUser ?? null);
  const [sessionError, setSessionError] = useState("");
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    getCurrentUser()
      .then(setCurrentUser)
      .catch((requestError: unknown) => {
        setCurrentUser(null);
        setSessionError(requestError instanceof Error ? requestError.message : "Could not check your session.");
      });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setUnreadNotifications(0);
      return;
    }
    getNotifications()
      .then((result) => setUnreadNotifications(result.unreadCount))
      .catch((requestError: unknown) => setSessionError(requestError instanceof Error ? requestError.message : "Could not load notifications."));
  }, [currentUser, view]);

  const signOut = async () => {
    try {
      await logoutAccount();
      setCurrentUser(null);
      onNavigate("landing");
    } catch (requestError) {
      setSessionError(requestError instanceof Error ? requestError.message : "Could not sign out.");
    }
  };

  return (
    <main className="workspace-app">
      <aside className="workspace-sidebar"><Brand onClick={() => onNavigate("landing")} /><span className="workspace-label">YOUR WORKSPACE</span><nav>{navigation.map(({ id, label, icon: Icon }) => <button className={view === id ? "active" : ""} key={id} onClick={() => onNavigate(id)}><Icon size={17} /><span>{label}</span>{id === "notifications" && unreadNotifications > 0 && <span className="nav-unread">{unreadNotifications > 9 ? "9+" : unreadNotifications}</span>}</button>)}</nav><div className="sidebar-bottom"><button className="ai-sidebar-card" onClick={() => onNavigate("teams")}><Sparkles size={17} /><span><b>Your team sidekick</b><small>Good ideas, meet good plans.</small></span><ArrowUpRight size={14} /></button><button className="sidebar-user" onClick={() => onNavigate("profile")}><span className="mini-avatar lime">{initials(currentUser?.fullName ?? "Builder")}</span><span><b>{currentUser?.fullName ?? "Guest preview"}</b><small>{currentUser?.role || (currentUser ? "Student builder" : "Sign in to sync data")}</small></span><ChevronDown size={15} /></button>{currentUser ? <button className="sidebar-exit" onClick={() => void signOut()}><LogOut size={15} /> SIGN OUT</button> : <button className="sidebar-exit sidebar-signin" onClick={() => onNavigate("auth")}><LogIn size={15} /> SIGN IN</button>}</div></aside>
      <section className="workspace-main"><header className="workspace-topbar"><div className="workspace-crumb"><button onClick={() => onNavigate("dashboard")}>WORKSPACE</button><span>/</span><b>{activeItem.label.toUpperCase()}</b></div><div className="workspace-top-actions"><span className="preview-badge"><i /> {currentUser ? "ACCOUNT CONNECTED" : "SIGN IN REQUIRED"}</span><button className="top-icon" aria-label="Search"><Search size={17} /></button><button className="top-icon notification-icon" aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}`} onClick={() => onNavigate("notifications")}><Bell size={17} />{unreadNotifications > 0 && <i>{unreadNotifications > 9 ? "9+" : unreadNotifications}</i>}</button><span className="top-user-avatar">{initials(currentUser?.fullName ?? "Guest")}</span></div></header><div className={`workspace-content ${view === "chat" ? "workspace-chat-content" : ""}`}>{sessionError && !currentUser && <p className="assistant-feedback" role="status">{sessionError}</p>}{view === "dashboard" && <DashboardHome view={view} onNavigate={onNavigate} currentUser={currentUser} />}{view === "discover" && <DiscoveryPage onNavigate={onNavigate} onViewProfile={onViewProfile ?? (() => undefined)} />}{view === "public-profile" && <PublicUserProfilePage profileId={profileId ?? ""} currentUserId={currentUser?.id} onNavigate={onNavigate} />}{view === "connections" && <ConnectionsPage onNavigate={onNavigate} />}{view === "teams" && <TeamsPage view={view} onNavigate={onNavigate} />}{view === "chat" && <ChatPage onNavigate={onNavigate} />}{view === "hackathons" && <HackathonsPage signedIn={Boolean(currentUser)} />}{view === "profile" && <ProfilePage />}{view === "ratings" && <RatingsPage />}{view === "notifications" && <NotificationsPage onNavigate={onNavigate} onUnreadCountChange={setUnreadNotifications} />}</div></section>
    </main>
  );
}

export function Workspace({ view, onNavigate, onViewProfile, profileId }: Props) {
  if (view === "auth") return <AuthPage view={view} onNavigate={onNavigate} />;
  return <WorkspacePage view={view} onNavigate={onNavigate} onViewProfile={onViewProfile} profileId={profileId} />;
}
