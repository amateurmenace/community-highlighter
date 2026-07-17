import React from "react";

const CONTROL_Z_REPO = "https://github.com/amateurmenace/control-z";
const CONTROL_Z_RELEASES = "https://github.com/amateurmenace/control-z/releases";

// The ten tools that ship inside the control-z Suite. Community Highlighter is one of them.
const CONTROL_Z_TOOLS = [
  { name: "Community Highlighter", desc: "meeting video → reel / EDL", highlight: true },
  { name: "BIG Video Grabber", desc: "civic-portal + Zoom fetch" },
  { name: "Scribe", desc: "transcription & captions" },
  { name: "Clear", desc: "dialogue rescue" },
  { name: "Pivot", desc: "smart reframe 9:16 / 1:1" },
  { name: "Stencil", desc: "AI roto mattes" },
  { name: "Rise", desc: "super-resolution" },
  { name: "Depth", desc: "depth mattes + Fusion" },
  { name: "Index", desc: "footage librarian" },
  { name: "Slate", desc: "station graphics kit" },
];

export default function AboutPage({ onClose }) {
  const scrollToDesktop = (e) => {
    if (e) e.preventDefault();
    document.getElementById("about-desktop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="about-page-overlay">
      <div className="about-page">
        <button className="about-close-btn" onClick={onClose}>Back to App</button>

        {/* Hero */}
        <div className="about-hero">
          <span className="about-hero-badge" onClick={scrollToDesktop} title="Jump to the desktop download">
            Now part of the control-z Suite
          </span>
          <h1 className="about-hero-title">Community Highlighter</h1>
          <p className="about-hero-subtitle" style={{ maxWidth: '820px', fontSize: '19px' }}>
            We believe civic technology should not solely be aimed at making things more <em style={{ fontStyle: 'italic' }}>inclusive</em> — for that means inviting more people to participate in the very unchanged systems that once excluded them in the first place. Instead, technology should be developed to make civic life more <strong style={{ color: '#1e7f63' }}>expansive</strong>: to make the systems themselves change and grow to meet more people where they're at — fitting into the contours of their lives, and not the other way around.
          </p>
          <div className="about-hero-cta-row">
            <a className="about-hero-btn-primary" href={CONTROL_Z_RELEASES} target="_blank" rel="noopener noreferrer">
              Download the Desktop App
            </a>
            <a className="about-hero-btn-ghost" href="#about-desktop" onClick={scrollToDesktop}>
              How it works
            </a>
          </div>
        </div>

        {/* ============ NOW PART OF CONTROL-Z SUITE ============ */}
        <div id="about-desktop" className="about-ctrlz">
          <span className="about-ctrlz-badge">The desktop app, reimagined</span>
          <h2>Community Highlighter now lives inside control-z</h2>
          <p className="about-ctrlz-tagline">control-z — undo the paywall.</p>

          <div className="about-ctrlz-grid">
            <div>
              <p style={{ marginTop: 0 }}>
                Community Highlighter began life as a standalone desktop app. Today it ships as one tool inside <strong>control-z</strong> — a free, open-source suite of cleaning, prepping, and finishing tools built for <strong>DaVinci Resolve</strong> and for the people who keep community media alive: public-access stations, journalists, filmmakers, and artists.
              </p>
              <p>
                The philosophy is the same as this web app's, aimed at a different paywall. Professional post-production tooling — roto, upscaling, dialogue repair, reframing, captioning — has always lived behind expensive subscriptions. control-z ports those capabilities into free, local tools. <strong>Everything runs on your machine.</strong> No cloud, no telemetry, no account.
              </p>
              <p style={{ marginBottom: 0 }}>
                Inside the suite, Community Highlighter is the civic-media workhorse: it turns a meeting recording into a transcript, scores the moments that matter, and exports a finished reel or an EDL you can drop straight onto a Resolve timeline. Everything you can do in this browser, plus the things only a desktop can: full-quality YouTube downloads and real MP4 rendering with captions, transitions, color grades, and lower thirds.
              </p>

              <div className="ctrlz-subhead">Ten tools in the suite</div>
              <div className="ctrlz-tools">
                {CONTROL_Z_TOOLS.map((tool) => (
                  <span key={tool.name} className={`ctrlz-tool${tool.highlight ? ' is-highlighter' : ''}`}>
                    {tool.name} <span>· {tool.desc}</span>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="ctrlz-subhead" style={{ marginTop: 0 }}>Get it running in four steps</div>
              <div className="ctrlz-steps">
                <div className="ctrlz-step">
                  <span className="ctrlz-step-num">1</span>
                  <span className="ctrlz-step-body">
                    Open the <a className="ctrlz-link" href={CONTROL_Z_RELEASES} target="_blank" rel="noopener noreferrer">control-z releases page</a> and download the latest <strong>control-z Suite</strong> build for macOS (the <code>.dmg</code>).
                  </span>
                </div>
                <div className="ctrlz-step">
                  <span className="ctrlz-step-num">2</span>
                  <span className="ctrlz-step-body">
                    Open the disk image and launch <strong>control-z Suite</strong>. On first run, right-click the app and choose <strong>Open</strong> to clear macOS Gatekeeper.
                  </span>
                </div>
                <div className="ctrlz-step">
                  <span className="ctrlz-step-num">3</span>
                  <span className="ctrlz-step-body">
                    Pick <strong>Community Highlighter</strong> from the suite's tool menu.
                  </span>
                </div>
                <div className="ctrlz-step">
                  <span className="ctrlz-step-num">4</span>
                  <span className="ctrlz-step-body">
                    Paste a meeting's YouTube URL. It works just like this web app — now with full-quality downloads and MP4 reel rendering added on top.
                  </span>
                </div>
              </div>

              <div className="ctrlz-cta-row">
                <a className="ctrlz-btn-primary" href={CONTROL_Z_RELEASES} target="_blank" rel="noopener noreferrer">
                  Download control-z Suite
                </a>
                <a className="ctrlz-btn-ghost" href={CONTROL_Z_REPO} target="_blank" rel="noopener noreferrer">
                  View control-z on GitHub
                </a>
              </div>
              <p className="ctrlz-platform">
                <strong>macOS on Apple Silicon</strong> (M-series). A Windows build is on the way. control-z bundles yt-dlp and expects a recent <strong>ffmpeg</strong> — install it with Homebrew (<code>brew install ffmpeg</code>) if you're prompted.
              </p>
            </div>
          </div>
        </div>

        {/* ============ PART 1: PHILOSOPHY ============ */}
        <div className="about-section">
          <h2 className="about-section-title" style={{ textAlign: 'left' }}>Philosophy</h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
            <div style={{ fontSize: '15px', lineHeight: 1.8, color: '#334155' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>The Problem</h3>
              <p style={{ marginBottom: '16px' }}>
                Most people will never attend a city council meeting. Not because they don't care, but because attending a three-hour meeting on a Tuesday evening is a luxury that working parents, shift workers, caregivers, and students simply don't have. And yet the decisions made in those rooms — about zoning, school budgets, policing, development — shape every part of their daily lives.
              </p>
              <p>
                Even when meetings are recorded and posted on YouTube, the barrier merely shifts from attendance to endurance. A two-hour recording with no table of contents, no search, no way to find the five minutes that actually affect your neighborhood. The information is technically public, but practically inaccessible.
              </p>
            </div>
            <div style={{ fontSize: '15px', lineHeight: 1.8, color: '#334155' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b', marginBottom: '12px' }}>Our Approach</h3>
              <p style={{ marginBottom: '16px' }}>
                Community Highlighter exists to close that gap. Not by asking people to change their schedules, but by bringing the meeting to them — as a five-minute highlight reel on a commute, a searchable transcript at 11pm, a shareable clip in a group chat, or a single question answered by an AI that read the whole thing.
              </p>
              <p>
                We built this tool for the parent who wants to know if their school's budget was discussed, the tenant who heard a zoning change might affect their building, the reporter on deadline who needs the exact quote, and the community organizer who wants to share one powerful moment of public testimony with their network.
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '20px 0 32px', fontSize: '16px', fontWeight: 600, color: '#475569', fontStyle: 'italic' }}>
            Every feature was designed with a specific question: What barrier to civic participation does this remove?
          </div>

          <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#1e293b', marginBottom: '24px' }}>Features and Why They Exist</h3>
          <div className="about-values-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="about-value">
              <h3>AI Summaries</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: time.</strong> Nobody should have to watch a three-hour meeting to find out what happened. The AI reads the entire transcript and writes a concise executive brief with clickable timestamps — specific names, decisions, and dollar amounts. Want the full story? A one-click report streams in as a news-style article. For long meetings it works in parallel chunks so no detail is lost, regardless of length.</p>
            </div>
            <div className="about-value">
              <h3>Word Cloud</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: information overload.</strong> A visual map of what the meeting was actually about. We filter out hundreds of common speech fillers — "thank you," "I think," "going to," "Mr. Chair" — that dominate civic meeting transcripts. What surfaces are the real topics: policy names, places, organizations, issues. Click any word to search for every mention.</p>
            </div>
            <div className="about-value">
              <h3>Transcript Search</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: navigation.</strong> Sometimes you only care about one topic. Search any word or phrase to instantly find every mention across the full transcript, with timestamps. Click to jump straight to that moment. A sparkline shows the distribution across the timeline so you can see where your topic clusters. Find the 30 seconds that matter to you.</p>
            </div>
            <div className="about-value">
              <h3>Shareable Reel Links</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: friction of sharing.</strong> Share a curated highlight reel without downloading anything, rendering anything, or creating an account. Recipients see your clips play back-to-back as a cinematic preview — with title overlays, fade transitions, a segmented progress bar, and playback controls — entirely in the browser. The URL contains everything.</p>
            </div>
            <div className="about-value">
              <h3>Talk to a Meeting</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: complexity.</strong> Ask an AI agent any question about a meeting. "Was my street mentioned?" "What did they decide about the school budget?" "Who voted against the zoning change?" It reads the full transcript and streams back answers with direct citations and clickable timestamps — like having a colleague who took meticulous notes.</p>
            </div>
            <div className="about-value">
              <h3>Knowledge Base</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: memory.</strong> Civic issues never live in a single meeting. Add meetings to a Knowledge Base and a full analytics dashboard tracks entities, decisions, topics, and framing <em>across</em> them — bump charts of how issues rise and fade, a cross-meeting word cloud, participation matrices, and semantic search over everything. Then build a montage that pulls clips from many meetings at once.</p>
            </div>
            <div className="about-value">
              <h3>Video Editor Timeline</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: technical skill.</strong> Build highlight reels with a professional-feeling timeline editor. Drag to reorder clips, drag edges to trim, split clips, choose transitions between them. Add captions, color grades, intro/outro slides, and background music. No video editing experience required — but the tools are there if you want them.</p>
            </div>
            <div className="about-value">
              <h3>Multilingual Transcripts</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: language.</strong> Civic participation shouldn't require English fluency. Translate any meeting transcript into 14 languages — Spanish, Portuguese, Chinese, Arabic, Vietnamese, Hindi, and more. The decisions made in those rooms affect everyone in the community, regardless of what language they speak at home.</p>
            </div>
            <div className="about-value">
              <h3>Transcript Upload</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: platform dependency.</strong> Not every meeting has YouTube captions. Upload a .vtt, .srt, or plain text transcript file and the entire app works the same way — full search, AI analysis, highlight reels. We didn't want to leave anyone out just because their municipality hasn't enabled closed captioning or uses a different platform.</p>
            </div>
            <div className="about-value">
              <h3>Channel Import</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: discovery.</strong> Paste a YouTube channel URL or @handle to load all recent videos from an official municipal channel. Filter by meeting type (City Council, Planning, School Board), date range, and relevance. Follow your local government the same way you'd follow a creator — except the content is about your neighborhood.</p>
            </div>
            <div className="about-value">
              <h3>Entity Analysis</h3>
              <p><strong style={{ color: '#64748b' }}>Barrier removed: context.</strong> The app automatically identifies every person, organization, place, and policy mentioned in a meeting. Click any entity to see news articles, maps, or Wikipedia pages. Cross-reference entities across multiple meetings to track how issues evolve over time. Context transforms information into understanding.</p>
            </div>
          </div>
        </div>

        {/* ============ PART 2: TECHNOLOGY ============ */}
        <div className="about-section about-section-dark">
          <h2 className="about-section-title" style={{ color: '#e2e8f0', textAlign: 'left' }}>Technology</h2>

          <div style={{ fontSize: '14px', lineHeight: 1.8, color: '#94a3b8' }}>
            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>The YouTube Downloading Problem</h3>
            <p style={{ marginBottom: '16px' }}>
              Downloading videos from YouTube is, by design, difficult. YouTube actively blocks automated downloads by frequently changing their internal APIs, rotating encryption signatures, and blocking IP ranges associated with cloud servers and data centers. Any tool that downloads YouTube videos is in a constant arms race — and most tools lose.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Community Highlighter relies on <a href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener noreferrer" style={{ color: '#86efac', fontWeight: 600 }}>yt-dlp</a>, an extraordinary open-source project maintained by a dedicated community of developers who reverse-engineer YouTube's changes, sometimes within hours of a breaking update. yt-dlp handles the staggering complexity of YouTube's DASH streaming protocol, where high-resolution videos are split into separate video and audio streams that must be downloaded independently and merged with ffmpeg.
            </p>
            <p style={{ marginBottom: '24px' }}>
              Because stable releases of yt-dlp can become outdated within weeks, the desktop app <strong style={{ color: '#e2e8f0' }}>automatically updates yt-dlp to the latest nightly build</strong> from GitHub's master branch on every launch. This means it installs the newest code — sometimes committed just hours ago — so downloads keep working even as YouTube evolves its defenses. If the nightly fails to install, it falls back to the latest stable release.
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>Residential Proxies</h3>
            <p style={{ marginBottom: '24px' }}>
              Even with the latest yt-dlp, YouTube sometimes blocks requests based on IP reputation — particularly from data center and cloud IP ranges. To mitigate this, Community Highlighter supports routing transcript fetching and video downloads through <strong style={{ color: '#e2e8f0' }}>residential proxy servers</strong>. These use IP addresses assigned to real internet service providers, making requests appear to originate from ordinary household connections rather than cloud infrastructure. This significantly improves reliability for both transcript extraction and video downloading. Proxy support is configured via environment variables and is entirely optional — the app works without it, but proxy routing provides a valuable fallback when direct requests fail.
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>Cloud and Desktop: Two Halves of One Tool</h3>
            <p style={{ marginBottom: '16px' }}>
              YouTube specifically blocks video downloads from cloud server IP addresses — the very servers that host web applications like this one. This creates a fundamental tension: the cloud provides the best user experience (instant access, no installation, works on any device), but a desktop is required for the core video download and rendering functionality.
            </p>
            <p style={{ marginBottom: '16px' }}>
              Rather than treating this as a limitation, we split the app into <strong style={{ color: '#e2e8f0' }}>two halves that hand off to each other</strong>:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '0 0 16px 0' }}>
              <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ margin: '0 0 6px', color: '#86efac', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>This Web App</p>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: 1.7 }}>Instant access from any browser. AI analysis, transcript search and translation, word clouds, the Knowledge Base dashboard, timeline editing, and shareable reel links — all without installing anything. Build an entire highlight reel, preview it, and share it in the browser.</p>
              </div>
              <div style={{ padding: '18px 20px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ margin: '0 0 6px', color: '#fbbf24', fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>control-z Suite (Desktop)</p>
                <p style={{ margin: 0, color: '#e2e8f0', fontSize: '13px', lineHeight: 1.7 }}>Adds video downloading and MP4 rendering with captions, transitions, color grades, lower thirds, intro/outro slides, background music with smart ducking, and EBU R128 audio normalization. Hardware-accelerated encoding keeps rendering fast. Exports EDLs straight into DaVinci Resolve.</p>
              </div>
            </div>
            <p style={{ marginBottom: '24px' }}>
              The two work together seamlessly: build a reel in the browser, export a <code style={{ color: '#86efac', background: 'rgba(134,239,172,0.1)', padding: '2px 6px', borderRadius: '4px' }}>.chreel</code> plan, then open it in control-z's Community Highlighter to render as video. Or share a reel link that works anywhere, and grab the desktop app when you're ready to export.
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>The Reel Player: Zero-Cost Video Sharing</h3>
            <p style={{ marginBottom: '16px' }}>
              When you share a reel link, the recipient doesn't need to download or render anything. The entire experience is constructed client-side using a technique we call the <strong style={{ color: '#e2e8f0' }}>Reel Player</strong>.
            </p>
            <p style={{ marginBottom: '16px' }}>
              The shared URL encodes all clip data directly: video ID, start/end timestamps, and titles. When opened, the Reel Player orchestrates sequential YouTube iframe seeks entirely in the browser — seeking to each clip's start time, auto-playing for its duration, fading to black via CSS transitions, then seeking to the next clip. Title overlays appear as animated lower thirds. A segmented progress bar shows position across all clips. To keep the load light, share links lazy-load only the tiny Reel Player bundle instead of the full editor.
            </p>
            <p style={{ marginBottom: '24px' }}>
              The result feels like watching a rendered video, but costs zero server resources — no rendering pipeline, no storage, no bandwidth. YouTube serves the video. The browser orchestrates the experience. The URL is the entire "file."
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>AI Pipeline</h3>
            <p style={{ marginBottom: '16px' }}>
              The app is model-agnostic: pick <strong style={{ color: '#e2e8f0' }}>Gemini 2.5 Flash</strong> (the default — its million-token context reads a whole meeting in one pass), or an OpenAI model like GPT-4o or GPT-5.1. For long meetings on models with smaller context windows, a <strong style={{ color: '#e2e8f0' }}>map-reduce strategy</strong> splits the transcript into chunks, analyzes each in parallel, then synthesizes a unified result — no detail lost from the start of a three-hour session, no token limit hit.
            </p>
            <p style={{ marginBottom: '16px' }}>
              <strong style={{ color: '#e2e8f0' }}>Quote-to-timestamp matching</strong> connects AI-generated highlights back to the original video. The algorithm matches the first words of each AI-quoted passage against transcript segments, finds the best match, and builds a clip with configurable padding. This is how "AI Highlight Reels" work — the AI identifies the most important moments, and the app automatically creates timed clips from them.
            </p>
            <p style={{ marginBottom: '24px' }}>
              <strong style={{ color: '#e2e8f0' }}>Entity extraction</strong> identifies every person, organization, place, and policy mentioned, then a ChromaDB-backed Knowledge Base cross-references them across meetings. This powers issue tracking, cross-reference networks, framing analysis, and the ability to ask "Has this topic been discussed before?"
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>Video Rendering Pipeline</h3>
            <p style={{ marginBottom: '16px' }}>
              When the desktop app renders clips, it downloads only the necessary video segments (not the full video) using yt-dlp's section downloading feature. Adjacent clips within 30 seconds are merged into single download groups to minimize network requests. Clip encoding and downloading run in parallel via thread pools.
            </p>
            <p style={{ marginBottom: '24px' }}>
              The encoder auto-detects hardware acceleration — VideoToolbox on macOS, NVENC on NVIDIA GPUs — and falls back to libx264. Captions are rendered as SRT subtitles with pill-style backgrounds. Color grades, transitions, speed changes, lower thirds with speaker names, intro/outro title cards, and background music with sidechain-compressed ducking are all composed via ffmpeg filter graphs. Real-time progress is tracked through ffmpeg's <code style={{ color: '#86efac', background: 'rgba(134,239,172,0.1)', padding: '2px 6px', borderRadius: '4px' }}>-progress pipe:1</code> output.
            </p>

            <h3 style={{ color: '#e2e8f0', fontSize: '20px', fontWeight: 800, marginBottom: '12px' }}>Tech Stack</h3>
            <div className="about-tech-grid" style={{ marginBottom: '16px' }}>
              <div className="about-tech-item"><strong>Frontend</strong> — React 19 + Vite, code-split into lazy chunks, installable as a Progressive Web App with offline transcript caching via IndexedDB</div>
              <div className="about-tech-item"><strong>Backend</strong> — FastAPI + Python with 80+ API endpoints, SSE streaming, WebSocket job status, and Webshare residential proxy support</div>
              <div className="about-tech-item"><strong>AI</strong> — Gemini 2.5 Flash (default) and OpenAI GPT models, with map-reduce for long documents and RAG-based Q&A</div>
              <div className="about-tech-item"><strong>Video</strong> — yt-dlp (auto-updating nightly) + ffmpeg with hardware-accelerated encoding and parallel processing</div>
              <div className="about-tech-item"><strong>Knowledge Base</strong> — ChromaDB vector store with all-MiniLM-L6-v2 embeddings for cross-meeting semantic search and analytics</div>
              <div className="about-tech-item"><strong>Desktop</strong> — ships inside the <a href={CONTROL_Z_REPO} target="_blank" rel="noopener noreferrer" style={{ color: '#86efac', fontWeight: 600 }}>control-z Suite</a> for macOS (Apple Silicon); a Windows build is in progress</div>
            </div>
          </div>
        </div>

        {/* ============ CREDITS ============ */}
        <div className="about-section">
          <h2 className="about-section-title" style={{ textAlign: 'left' }}>Credits</h2>
          <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#475569', marginBottom: '28px', maxWidth: '760px' }}>
            This app was built over many months from inside an actual public-access TV station, with the assistance of <a href="https://claude.ai/code" target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63', fontWeight: 600 }}>Claude Code</a>. It is now one tool in the free, open-source <a href={CONTROL_Z_REPO} target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63', fontWeight: 600 }}>control-z Suite</a>.
          </p>
          <div className="about-values-grid">
            <div className="about-value" style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '18px' }}>Brookline Interactive Group</h3>
              <p style={{ fontWeight: 600, color: '#1e7f63', marginBottom: '8px' }}>Producer</p>
              <p>A community media organization in Brookline, Massachusetts dedicated to amplifying local voices through media production, technology education, and civic engagement programming. BIG has been empowering community storytelling and democratic participation for over two decades.</p>
              <a href="https://brooklineinteractive.org" target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63', fontSize: '13px', fontWeight: 600 }}>brooklineinteractive.org</a>
            </div>
            <div className="about-value" style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '18px' }}>NeighborhoodAI</h3>
              <p style={{ fontWeight: 600, color: '#1e7f63', marginBottom: '8px' }}>Advisor</p>
              <p>An initiative exploring how artificial intelligence can strengthen neighborhoods and make community institutions more responsive, transparent, and accessible. NeighborhoodAI advises on the responsible application of AI to civic infrastructure.</p>
              <a href="https://neighborhoodai.org" target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63', fontSize: '13px', fontWeight: 600 }}>neighborhoodai.org</a>
            </div>
            <div className="about-value" style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '18px' }}>Stephen Walter</h3>
              <p style={{ fontWeight: 600, color: '#1e7f63', marginBottom: '8px' }}>Designer + Developer</p>
              <p>Technologist and creative director building tools at the intersection of media, civic engagement, and emerging technology. Stephen designed and developed Community Highlighter and the control-z Suite from concept to deployment — the AI pipeline, video rendering engine, and cloud/desktop architecture.</p>
              <a href="https://weirdmachine.org" target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63', fontSize: '13px', fontWeight: 600 }}>weirdmachine.org</a>
            </div>
          </div>
        </div>

        {/* ============ FOOTER ============ */}
        <div className="about-footer">
          <button className="about-footer-btn" onClick={onClose}>Start Analyzing Meetings</button>
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginTop: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
            <a href={CONTROL_Z_RELEASES} target="_blank" rel="noopener noreferrer">Download the Desktop App</a>
            <a href={CONTROL_Z_REPO} target="_blank" rel="noopener noreferrer">control-z Suite on GitHub</a>
            <a href="https://github.com/amateurmenace/community-highlighter" target="_blank" rel="noopener noreferrer">Web App Source</a>
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 License</a>
          </div>
        </div>
      </div>
    </div>
  );
}
