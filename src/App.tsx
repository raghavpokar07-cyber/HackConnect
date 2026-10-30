import { useEffect, useRef, useState } from "react";
import { Workspace } from "./Workspace";
import { getHackathonCatalog } from "./api";
import type { HackathonEvent } from "./api";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  Check,
  ChevronDown,
  CirclePlay,
  Command,
  Compass,
  Menu,
  MessageCircle,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";

export type AppView = "landing" | "auth" | "dashboard" | "discover" | "connections" | "teams" | "chat" | "hackathons" | "profile" | "ratings" | "notifications" | "public-profile";

function landingEventColor(event: HackathonEvent) {
  const key = `${event.categories.join(" ")} ${event.name}`.toLowerCase();
  if (/climate|environment|sustain|green/.test(key)) return "mint";
  if (/ai|machine learning|data/.test(key)) return "lavender";
  return "orange";
}

function landingEventDate(event: HackathonEvent) {
  if (!event.startDate) return "DATE NOT LISTED";
  const start = new Date(event.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  const end = event.endDate ? new Date(event.endDate).toLocaleDateString(undefined, { day: "numeric" }).toUpperCase() : "";
  return end ? `${start} — ${end}` : start;
}

function BrushReveal() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: -200, y: -200, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const section = canvas?.closest<HTMLElement>(".hero");
    if (!canvas || !context || !section) return;
    let overlayGradient: CanvasGradient | null = null;
    let fadeFrame = 0;
    let fadeLastFrame = 0;
    let lastPointerAt = 0;

    const paint = () => {
      const bounds = section.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = bounds.width * pixelRatio;
      canvas.height = bounds.height * pixelRatio;
      canvas.style.width = `${bounds.width}px`;
      canvas.style.height = `${bounds.height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const gradient = context.createLinearGradient(0, 0, bounds.width, bounds.height);
      gradient.addColorStop(0, "#151713");
      gradient.addColorStop(0.52, "#22251e");
      gradient.addColorStop(1, "#171915");
      overlayGradient = gradient;
      context.globalCompositeOperation = "source-over";
      context.fillStyle = gradient;
      context.fillRect(0, 0, bounds.width, bounds.height);

      context.globalAlpha = 0.1;
      for (let i = 0; i < 80; i += 1) {
        const x = (i * 193) % bounds.width;
        const y = (i * 137) % bounds.height;
        context.fillStyle = i % 2 ? "#cbff70" : "#ffffff";
        context.fillRect(x, y, 1, 1);
      }
      context.globalAlpha = 1;
      context.globalCompositeOperation = "destination-out";
      const { x, y, active } = pointer.current;
      if (active) revealAt(x, y);
      context.globalCompositeOperation = "source-over";
    };

    const fadeTrail = (now: number) => {
      if (!fadeLastFrame) fadeLastFrame = now;
      const elapsed = now - fadeLastFrame;
      fadeLastFrame = now;

      if (now - lastPointerAt >= 15000) {
        paint();
        fadeFrame = 0;
        fadeLastFrame = 0;
        return;
      }

      const bounds = canvas.getBoundingClientRect();
      if (overlayGradient) {
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = Math.min(elapsed / 5000, 1);
        context.fillStyle = overlayGradient;
        context.fillRect(0, 0, bounds.width, bounds.height);
        context.globalAlpha = 1;
      }
      fadeFrame = window.requestAnimationFrame(fadeTrail);
    };

    const revealAt = (x: number, y: number) => {
      const brush = context.createRadialGradient(x, y, 12, x, y, 116);
      brush.addColorStop(0, "rgba(0,0,0,1)");
      brush.addColorStop(0.58, "rgba(0,0,0,.92)");
      brush.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = brush;
      context.beginPath();
      context.arc(x, y, 116, 0, Math.PI * 2);
      context.fill();
    };

    let previous: { x: number; y: number } | null = null;
    const onPointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      pointer.current = { ...current, active: true };
      lastPointerAt = performance.now();
      if (!fadeFrame) fadeFrame = window.requestAnimationFrame(fadeTrail);
      if (previous) {
        const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
        const steps = Math.max(1, Math.ceil(distance / 28));
        context.globalCompositeOperation = "destination-out";
        for (let i = 1; i <= steps; i += 1) {
          const ratio = i / steps;
          revealAt(
            previous.x + (current.x - previous.x) * ratio,
            previous.y + (current.y - previous.y) * ratio,
          );
        }
        context.globalCompositeOperation = "source-over";
      } else {
        context.globalCompositeOperation = "destination-out";
        revealAt(current.x, current.y);
        context.globalCompositeOperation = "source-over";
      }
      previous = current;
    };
    const onPointerLeave = () => {
      pointer.current.active = false;
      previous = null;
    };

    paint();
    section.addEventListener("pointermove", onPointerMove);
    section.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", paint);
    return () => {
      section.removeEventListener("pointermove", onPointerMove);
      section.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", paint);
      if (fadeFrame) window.cancelAnimationFrame(fadeFrame);
    };
  }, []);

  return <canvas aria-hidden="true" className="brush-canvas" ref={canvasRef} />;
}

function LandingPage({ onNavigate }: { onNavigate: (view: AppView) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [activeFilter, setActiveFilter] = useState("");
  const [hackathons, setHackathons] = useState<HackathonEvent[]>([]);
  const [hackathonError, setHackathonError] = useState("");
  const filterOptions = ["", ...new Set(hackathons.flatMap((event) => event.categories))].slice(0, 7);
  const visibleHackathons = hackathons.filter((event) => !activeFilter || event.categories.includes(activeFilter));

  useEffect(() => {
    getHackathonCatalog().then(setHackathons).catch((error: unknown) =>
      setHackathonError(error instanceof Error ? error.message : "Could not load live hackathons."),
    );
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.14 },
    );
    document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const submitWaitlist = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (email.trim()) setJoined(true);
  };

  return (
    <main>
      <nav className="navigation">
        <a className="brand" href="#home" aria-label="HackConnect home">
          <span className="brand-mark"><Command size={17} strokeWidth={2.5} /></span>
          <span>HACK<span className="brand-light">CONNECT</span></span>
        </a>
        <div className={`nav-links ${menuOpen ? "nav-links-open" : ""}`}>
          <a href="#why" onClick={() => setMenuOpen(false)}>THE WHY</a>
          <a href="#how" onClick={() => setMenuOpen(false)}>HOW IT WORKS</a>
          <a href="#events" onClick={() => setMenuOpen(false)}>HACKATHONS</a>
          <button className="nav-preview" onClick={() => onNavigate("dashboard")} type="button">OPEN APP PREVIEW <ArrowUpRight size={13} /></button>
          <a className="mobile-join" href="#join" onClick={() => setMenuOpen(false)}>GET EARLY ACCESS ↗</a>
        </div>
        <button className="nav-cta" onClick={() => onNavigate("auth")}>SIGN IN / SIGN UP <ArrowUpRight size={15} /></button>
        <button
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>

      <section className="hero" id="home">
        <div className="hero-reveal">
          <div className="under-paint" />
          <BrushReveal />
        </div>
        <div className="hero-grid" />
        <div className="hero-topline">
          <span><span className="live-dot" /> THE COLLABORATION ERA IS HERE</span>
          <span className="hero-edition">INDEPENDENT THINKERS. BETTER TOGETHER. &nbsp;—&nbsp; VOL. 001</span>
        </div>
        <div className="hero-content">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> A DIFFERENT KIND OF HACKATHON PLATFORM</p>
            <h1>Great ideas<br />need <span className="headline-accent">great</span><br />teams<span className="period">.</span></h1>
            <div className="hero-lower">
              <p>Find your people. Bring your weird, wonderful ideas.<br className="desktop-break" /> Make something that matters — together.</p>
              <button className="button button-lime" onClick={() => onNavigate("discover")} type="button">
                FIND YOUR PEOPLE <ArrowUpRight size={17} />
              </button>
            </div>
          </div>
          <div className="hero-visual" aria-label="Hackathon teammates collaborating around a shared idea">
            <div className="photo-frame">
              <img
                className="team-photo"
                src="/team-collaboration-alt.jpg"
                alt="A team of students sharing ideas around a table"
                fetchPriority="high"
              />
              <div className="photo-shade" />
              <div className="photo-topline">
                <span><span className="photo-live-dot" /> LIVE TEAM ROOM</span>
                <span>HC—001</span>
              </div>
              <div className="photo-crosshair" aria-hidden="true">+</div>
              <div className="photo-caption">
                <span>BUILT TOGETHER, FROM DAY ONE</span>
                <p>One idea.<br /><em>Four perspectives.</em></p>
              </div>
            </div>
            <div className="match-card">
              <span className="match-sparkle"><Sparkles size={16} /></span>
              <span className="match-copy"><small>THE RIGHT PEOPLE, IN ONE ROOM</small><strong>Team chemistry: <span>looking good.</span></strong></span>
              <span className="match-avatars" aria-label="Four teammates"><i>M</i><i>J</i><i>A</i><i>+</i></span>
            </div>
            <div className="visual-side-note"><span>GOOD IDEAS<br />DON’T BUILD<br />THEMSELVES.</span><ArrowDownRight size={17} /></div>
          </div>
        </div>
        <div className="hero-bottom">
          <span>SCROLL TO FIND YOUR PEOPLE</span>
          <a href="#why" aria-label="Scroll to find out why"><ArrowDown size={17} /></a>
          <span className="hero-coordinates">37° 46' 49.5" N &nbsp; 122° 25' 09.7" W</span>
        </div>
        <div className="hero-sticker"><span>MAKE<br />SOMETHING<br /><b>MATTER.</b></span><ArrowDownRight size={20} /></div>
      </section>

      <section className="marquee" aria-label="HackConnect values">
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, index) => (
            <div className="marquee-content" key={index}>
              <span>GOOD IDEAS ARE A TEAM SPORT</span><span className="marquee-star">✳</span>
              <span>BUILD WITH YOUR PEOPLE</span><span className="marquee-star">✳</span>
              <span>YOUR NEXT BIG THING STARTS HERE</span><span className="marquee-star">✳</span>
              <span className="marquee-coordinates">HC / FIND YOUR PEOPLE / MAKE IT REAL</span><span className="marquee-star">✳</span>
            </div>
          ))}
        </div>
      </section>

      <section className="manifesto section-pad" id="why">
        <div className="section-index reveal"><span>01 / THE WHY</span><span>THE STARTING LINE</span></div>
        <div className="manifesto-layout">
          <div className="manifesto-aside reveal">
            <div className="hand-drawn-star">✳</div>
            <p>EVERY GREAT THING STARTED WITH A CONVERSATION.</p>
            <span className="aside-caption">YEAH, EVEN THAT ONE.</span>
          </div>
          <div className="manifesto-main reveal">
            <p className="eyebrow"><span className="eyebrow-line" /> FOR THE CURIOUS, THE MAKERS, THE “WHAT IF?” PEOPLE</p>
            <h2>You have the idea.<br />You have the <span className="text-outline">drive.</span><br /><span className="text-lime">Now find your</span><br /><span className="text-lime">people.</span></h2>
            <p className="manifesto-body">Hacking is better when you don’t have to do it alone. We bring the right people together — by the things they’re great at, the things they want to learn, and the ideas they can’t stop thinking about.</p>
            <a className="text-link" href="#how">HERE’S HOW WE DO THAT <ArrowUpRight size={16} /></a>
          </div>
        </div>
        <div className="manifesto-foot"><span>01</span><span>THE BEST IDEAS DON’T HAPPEN IN ISOLATION.</span><span>THEY HAPPEN IN GOOD COMPANY. ↗</span></div>
      </section>

      <section className="how section-pad" id="how">
        <div className="section-index reveal"><span>02 / THE METHOD</span><span>LESS SWIPING. MORE BUILDING.</span></div>
        <div className="how-heading reveal">
          <h2>Find your<br /><span className="text-lime">kind of people.</span></h2>
          <p>Not a random group chat. A team that actually clicks — and then makes something real.</p>
        </div>
        <div className="steps-grid">
          <article className="step-card reveal">
            <span className="step-num">01</span><div className="step-icon"><Compass size={23} /></div>
            <h3>Show up as<br />your whole self.</h3>
            <p>Your skills, your curiosities, your slightly-too-ambitious ideas. All of it belongs here.</p>
            <div className="skill-pills"><span>FRONTEND</span><span>STORYTELLING</span><span>✦ BIG THINKING</span></div>
          </article>
          <article className="step-card step-card-highlight reveal">
            <span className="step-num">02</span><div className="step-icon"><Users size={24} /></div>
            <h3>Meet your<br />missing pieces.</h3>
            <p>Find collaborators who balance your strengths and bring a whole new perspective.</p>
            <div className="mini-network"><span>M</span><i /><span>J</span><i /><span>A</span><i /><span>YOU</span></div>
          </article>
          <article className="step-card reveal">
            <span className="step-num">03</span><div className="step-icon"><Zap size={23} /></div>
            <h3>Make the thing<br />you came to make.</h3>
            <p>Pick a challenge, get your team in sync, and turn the “what if?” into “we did.”</p>
            <div className="step-complete"><Check size={15} /><span>LET’S BUILD SOMETHING</span><ArrowUpRight size={14} /></div>
          </article>
        </div>
        <div className="how-foot"><span>GOOD TEAMS AREN’T FOUND. THEY’RE PUT TOGETHER.</span><span>AND THAT’S WHERE WE COME IN. <ArrowDownRight size={15} /></span></div>
      </section>

      <section className="assistant section-pad">
        <div className="assistant-orb orb-large" /><div className="assistant-orb orb-small" />
        <div className="section-index reveal"><span>03 / YOUR SIDEKICK</span><span>NOT HERE TO DO THE WORK. HERE TO MAKE IT WORK.</span></div>
        <div className="assistant-layout">
          <div className="assistant-copy reveal">
            <p className="eyebrow"><span className="eyebrow-line" /> MEET THE TEAMMATE WHO NEVER FORGETS THE DEADLINE</p>
            <h2>Less “who’s<br />doing what?”<br /><span className="text-lime">More “we’ve<br />got this.”</span></h2>
            <p className="assistant-body">Your AI team sidekick helps sort the swirl of ideas into a plan. Milestones, task suggestions, gentle nudges — the boring stuff that gives your team more room to do the brilliant stuff.</p>
            <div className="assistant-note"><Sparkles size={16} /><span>GOOD TO KNOW: IT’S ABOUT TEAMWORK, NOT WRITING YOUR CODE.</span></div>
          </div>
          <div className="assistant-ui reveal">
            <div className="chat-window">
              <div className="chat-top"><div className="chat-presence"><span /> TEAM SPACE / 04 ONLINE</div><span>•••</span></div>
              <div className="chat-date">MONDAY, 9:41 AM</div>
              <div className="chat-message"><span className="chat-avatar">M</span><div><span className="chat-name">MAYA <small>9:38 AM</small></span><p>Big question: how do we make the air-quality data feel more human?</p></div></div>
              <div className="chat-message"><span className="chat-avatar avatar-blue">J</span><div><span className="chat-name">JAY <small>9:39 AM</small></span><p>Could turn it into a neighborhood map?</p></div></div>
              <div className="ai-reply"><div className="ai-reply-head"><span className="ai-avatar"><Sparkles size={13} /></span><span>HACKCONNECT AI</span><span className="ai-tag">TEAM SIDEKICK</span></div><p>Love this direction. Want me to help shape a first-week plan around the neighborhood map idea?</p><div className="ai-actions"><button>SHOW A PLAN <ArrowRight size={13} /></button><button>NOT YET</button></div></div>
              <div className="chat-compose"><span>Message your team...</span><span className="compose-send"><ArrowUpRight size={15} /></span></div>
            </div>
            <div className="assistant-stamp"><AudioLines size={17} /><span>IDEAS IN.<br />MOMENTUM OUT.</span></div>
          </div>
        </div>
      </section>

      <section className="events section-pad" id="events">
        <div className="section-index reveal"><span>04 / THE PLAYGROUND</span><span>FIND A CHALLENGE WORTH SHOWING UP FOR</span></div>
        <div className="events-heading reveal">
          <div><p className="eyebrow"><span className="eyebrow-line" /> PICK YOUR NEXT “WHAT IF?”</p><h2>Big ideas.<br /><span className="text-lime">Real deadlines.</span></h2></div>
          <button className="events-link" onClick={() => onNavigate("hackathons")} type="button">SEE WHAT’S OUT THERE <ArrowUpRight size={16} /></button>
        </div>
        <div className="events-filters reveal" role="group" aria-label="Filter hackathons">
          {filterOptions.map((filter) => (
            <button
              aria-pressed={activeFilter === filter}
              className={activeFilter === filter ? "filter-active" : ""}
              key={filter}
              onClick={() => setActiveFilter(filter)}
            >{filter || "ALL EVENTS"}</button>
          ))}
        </div>
        <div className="event-grid">
          {visibleHackathons.slice(0, 3).map((event) => (
            <article className={`event-card event-${landingEventColor(event)} reveal`} key={event.id}>
              <div className="event-card-top"><span>{event.categories[0]?.toUpperCase() ?? event.source.toUpperCase()}</span><span className="event-arrow">↗</span></div>
              <div className="event-art" aria-hidden="true"><div className="event-art-orbit" /><span>✳</span><div className="event-art-grid" /></div>
              <h3><span>{event.name}</span></h3>
              <div className="event-card-bottom"><span>{landingEventDate(event)}</span><span>EXPLORE EVENT <ArrowUpRight size={14} /></span></div>
            </article>
          ))}
          {!visibleHackathons.length && <p className="landing-event-empty">{hackathonError ? "Hackathon listings are temporarily unavailable." : hackathons.length ? "No listings match this category yet." : "No event listings have been ingested yet."}</p>}
        </div>
        <div className="events-disclaimer"><span><Bell size={14} /> VERIFY EVENT DATES AND REGISTRATION WITH ORGANIZERS.</span><span>LIVE SOURCE LISTINGS · DETAILS MAY CHANGE</span></div>
      </section>

      <section className="join section-pad" id="join">
        <div className="join-scribble">✳</div>
        <div className="section-index reveal"><span>05 / YOUR MOVE</span><span>THE NEXT STEP IS YOURS</span></div>
        <div className="join-content reveal">
          <p className="eyebrow"><span className="eyebrow-line" /> YOUR PEOPLE ARE OUT THERE</p>
          <h2>Your next big idea<br />starts with <span className="text-lime">your team.</span></h2>
          <p>Get on the list. Be there when HackConnect opens its doors.</p>
          <form className="join-form" onSubmit={submitWaitlist}>
            <label className="sr-only" htmlFor="email">Your email address</label>
            <input id="email" type="email" placeholder="Your email address" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <button type="submit">{joined ? <>YOU’RE ON THE LIST <Check size={16} /></> : <>GET EARLY ACCESS <ArrowUpRight size={16} /></>}</button>
          </form>
          <span className="join-privacy">{joined ? "Thanks — this demo saved your signup in this session only." : "NO SPAM. JUST YOUR INVITE WHEN IT’S READY."}</span>
        </div>
        <div className="join-bottom"><span>MAKE GOOD THINGS WITH GOOD PEOPLE.</span><a href="#home">BACK TO THE TOP <ArrowUpRight size={14} /></a></div>
      </section>

      <footer className="footer">
        <a className="brand" href="#home"><span className="brand-mark"><Command size={17} strokeWidth={2.5} /></span><span>HACK<span className="brand-light">CONNECT</span></span></a>
        <span>FIND YOUR PEOPLE. BUILD YOUR TEAM. HACK TOGETHER.</span>
        <span>MADE FOR THE MAKERS. © 2026</span>
      </footer>
      <a className="floating-chat" href="#join" aria-label="Chat with HackConnect"><MessageCircle size={19} /><span>LET’S TALK</span></a>
      <a className="floating-play" href="#how" aria-label="See how HackConnect works"><CirclePlay size={16} /> THE 30-SECOND TOUR <ChevronDown size={14} /></a>
    </main>
  );
}

const appViews: AppView[] = ["landing", "auth", "dashboard", "discover", "connections", "teams", "chat", "hackathons", "profile", "ratings", "notifications", "public-profile"];

function App() {
  const readProfileId = () => {
    const match = window.location.pathname.match(/^\/users\/([a-f\d]{24})$/i);
    return match?.[1] ?? "";
  };
  const readView = (): AppView => {
    const path = window.location.pathname.slice(1) as AppView | "login" | "signup";
    if (path === "login" || path === "signup") return "auth";
    if (readProfileId()) return "public-profile";
    return appViews.includes(path as AppView) ? path as AppView : "landing";
  };
  const [view, setView] = useState<AppView>(() => {
    return readView();
  });
  const [profileId, setProfileId] = useState(readProfileId);

  useEffect(() => {
    const syncView = () => {
      setView(readView());
      setProfileId(readProfileId());
    };
    window.addEventListener("popstate", syncView);
    return () => window.removeEventListener("popstate", syncView);
  }, []);

  const navigate = (nextView: AppView) => {
    const nextPath = nextView === "landing" ? "/" : nextView === "auth" ? "/login" : `/${nextView}`;
    window.history.pushState({ view: nextView }, "", nextPath);
    setView(nextView);
    setProfileId("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const navigateToProfile = (userId: string) => {
    const nextPath = `/users/${encodeURIComponent(userId)}`;
    window.history.pushState({ view: "public-profile", profileId: userId }, "", nextPath);
    setProfileId(userId);
    setView("public-profile");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "landing") return <LandingPage onNavigate={navigate} />;
  return <Workspace view={view} onNavigate={navigate} onViewProfile={navigateToProfile} profileId={profileId} />;
}

export default App;
