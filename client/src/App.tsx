import KarnatakaMap from "./KarnatakaMap";
import { useEffect, useRef, useState } from "react";
import LoginPage, { type AuthUser } from "./LoginPage";
import ProfilePage from "./ProfilePage";
import PatternLab from "./PatternLab";

type Page = "command" | "vault" | "board" | "patterns" | "map" | "assistant" | "reports";

type Dataset = {
  fileName: string;
  format: string;
  kind: "table" | "document";
  uploadedAt: string;
  totalRecords: number;
  columns: string[];
  preview: Record<string, string>[];
  textPreview?: string;
  textLength?: number;
  sheetNames?: string[];
};

type Profile = {
  overall: {
    totalFiles: number;
    tableFiles: number;
    documentFiles: number;
    totalRows: number;
  };
  mappings: {
    fileName: string;
    column: string;
    suggestedAs: string;
    confidence: string;
  }[];
};

type CrimeCase = {
  id: string;
  title: string;
  type: string;
  area: string;
  time: string;
  risk: "High" | "Medium" | "Low";
  status: string;
};

type EvidenceCard = {
  title: string;
  detail: string;
  column: string;
  sources: string[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  evidenceCards?: EvidenceCard[];
  timestamp: Date;
  isError?: boolean;
};

const cases: CrimeCase[] = [
  { id: "KSP-2026-0142", title: "Repeated vehicle theft pattern", type: "Theft", area: "Shivajinagar", time: "2 hours ago", risk: "High", status: "Open" },
  { id: "KSP-2026-0139", title: "Suspicious transaction cluster", type: "Fraud", area: "Whitefield", time: "5 hours ago", risk: "Medium", status: "Review" },
  { id: "KSP-2026-0133", title: "Night-time burglary sequence", type: "Burglary", area: "Majestic", time: "Yesterday", risk: "High", status: "Open" },
];

const navItems: { id: Page; icon: string; label: string }[] = [
  { id: "command",   icon: "◈",  label: "Command Center" },
  { id: "vault",     icon: "▣",  label: "Case Vault" },
  { id: "board",     icon: "◫",  label: "Investigation Board" },
  { id: "patterns",  icon: "⌁",  label: "Pattern & MO Lab" },
  { id: "map",       icon: "⌖",  label: "Geo Crime Map" },
  { id: "assistant", icon: "✦",  label: "AI Assistant" },
  { id: "reports",   icon: "▤",  label: "Reports & Audit" },
];

const PROMPT_CHIPS = [
  "Which district has the most cases?",
  "Show me crime type breakdown",
  "How many records are uploaded?",
  "What are open vs closed cases?",
  "List all data columns",
  "Who are the repeat suspects?",
];

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (r) => { if (r.ok) setUser((await r.json()).user); })
      .finally(() => setCheckingAuth(false));
  }, []);

  const [activePage, setActivePage]     = useState<Page>("command");
  const [selectedCase, setSelectedCase] = useState<CrimeCase>(cases[0]);
  const [search, setSearch]             = useState("");
  const [files, setFiles]               = useState<File[]>([]);
  const [datasets, setDatasets]         = useState<Dataset[]>([]);
  const dataset     = datasets[0] || null;
  const totalRecords = datasets.reduce((t, d) => t + d.totalRecords, 0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading]         = useState(false);
  const [question, setQuestion]           = useState("");
  const [aiLoading, setAiLoading]         = useState(false);
  const [copiedId, setCopiedId]           = useState<string | null>(null);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [profile, setProfile]             = useState<Profile | null>(null);
  const [showProfile, setShowProfile]     = useState(false);

  const chatEndRef   = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, aiLoading]);

  const visibleCases = cases.filter((c) =>
    `${c.id} ${c.title} ${c.area}`.toLowerCase().includes(search.toLowerCase())
  );

  const loadProfile = async () => {
    const r = await fetch("http://localhost:5000/api/analytics/profile");
    if (r.ok) setProfile((await r.json()).profile);
  };

  const handleUpload = async () => {
    if (files.length === 0) { setUploadMessage("Choose one or more files first."); return; }
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    try {
      setUploading(true);
      const r = await fetch("http://localhost:5000/api/datasets/upload", { method: "POST", body: formData });
      const result = await r.json();
      if (!r.ok) throw new Error(result.message);
      setDatasets(result.datasets);
      await loadProfile();
      setUploadMessage(result.message);
    } catch (e) {
      setUploadMessage(e instanceof Error ? e.message : "Could not upload files.");
    } finally {
      setUploading(false);
    }
  };

  const sendQuestion = async (q: string) => {
    const cleanQ = q.trim();
    if (!cleanQ || aiLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      text: cleanQ,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");
    setAiLoading(true);

    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const r = await fetch("/api/assistant/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: cleanQ }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Assistant failed");

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-ai",
          role: "assistant",
          text: result.answer,
          evidenceCards: result.evidenceCards,
          timestamp: new Date(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-err",
          role: "assistant",
          text: e instanceof Error ? e.message : "Assistant connection failed.",
          timestamp: new Date(),
          isError: true,
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(question);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendQuestion(question);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestion(e.target.value);
    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const copyToClipboard = (text: string, id: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (checkingAuth) {
    return (
      <main className="login-page">
        <div style={{ textAlign: "center", color: "rgba(82,223,192,0.8)", fontSize: 14 }}>
          Checking secure session…
        </div>
      </main>
    );
  }

  if (!user) return <LoginPage onAuthenticated={setUser} />;

  return (
    <div className="app-shell">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-orb">◈</span>
          <div>
            <h1>CrimeLens</h1>
            <p>INTELLIGENCE OS</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${activePage === item.id ? "active" : ""}`}
              onClick={() => setActivePage(item.id)}
            >
              <span>{item.icon}</span> {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span className="live-dot" /> SYSTEM SECURE
          <p>Human decision required for all alerts.</p>
        </div>
      </aside>

      {/* ── Workspace ───────────────────────────────────────────────────────── */}
      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">CRIMELENS / {activePage.toUpperCase()}</p>
            <h2>{navItems.find((n) => n.id === activePage)?.label}</h2>
          </div>
          <div className="topbar-actions">
            <span className="status-pill"><i /> Live demo mode</span>
            <button className="profile" title="Open profile" onClick={() => setShowProfile(true)}>
              {user.name.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </header>

        {/* ── Command Center ─────────────────────────────────────────────────── */}
        {activePage === "command" && (
          <>
            <section className="pulse-banner">
              <span className="pulse-icon">✦</span>
              <div>
                <button className="profile" title="Open profile" onClick={() => setShowProfile(true)}>
                  {user.name.slice(0, 2).toUpperCase()}
                </button>
                <strong>Crime Pulse: 3 priority signals detected</strong>
                <p>Area-level signals are for investigation support, not automatic decisions.</p>
              </div>
              <button onClick={() => setActivePage("patterns")}>Review signals →</button>
            </section>

            <section className="metrics">
              <article className="metric">
                <span>ACTIVE CASES</span>
                <strong>{datasets.length > 0 ? totalRecords.toLocaleString() : "128"}</strong>
                <small>records available for review</small>
              </article>
              <article className="metric">
                <span>PRIORITY SIGNALS</span>
                <strong className="amber">03</strong>
                <small>Requires investigator review</small>
              </article>
              <article className="metric">
                <span>LINKED CASES</span>
                <strong>17</strong>
                <small>Demo relationships found</small>
              </article>
              <article className="metric">
                <span>DATA STATUS</span>
                <strong className={dataset ? "green" : ""}>{dataset ? "READY" : "WAITING"}</strong>
                <small>{dataset ? dataset.fileName : "Upload a file in Case Vault"}</small>
              </article>
            </section>

            <section className="main-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">LIVE CASE FEED</p>
                    <h3>Priority investigations</h3>
                  </div>
                  <input
                    className="search-box"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search case or area"
                  />
                </div>

                <div className="case-list">
                  {visibleCases.map((item) => (
                    <div className="case-item" key={item.id}>
                      <span className={`risk-dot ${item.risk.toLowerCase()}`} />
                      <div className="case-main">
                        <strong>{item.title}</strong>
                        <p>{item.id} · {item.type} · {item.area}</p>
                      </div>
                      <span className="case-time">{item.time}</span>
                      <button
                        className="inspect-btn"
                        onClick={() => { setSelectedCase(item); setActivePage("board"); }}
                      >
                        Investigate
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <KarnatakaMap />
            </section>
          </>
        )}

        {/* ── Case Vault ─────────────────────────────────────────────────────── */}
        {activePage === "vault" && (
          <section className="page-card">
            <p className="eyebrow">CASE VAULT / FILE INGESTION</p>
            <h3>Import crime-case data</h3>
            <p className="muted">CrimeLens reads the column names, row count, and a safe preview of your report.</p>

            <div className="upload-zone">
              <label htmlFor="csv-file">
                <span>↑</span>
                <strong>
                  {files.length > 0 ? `${files.length} file(s) selected` : "Choose one or more crime-data files"}
                </strong>
                <small>CSV · XLSX · JSON · TXT · Max 30 MB</small>
              </label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,.xlsx,.xls,.txt,.json"
                multiple
                onChange={(e) => { setFiles(Array.from(e.target.files || [])); setUploadMessage(""); }}
              />
              <button className="primary-btn" onClick={handleUpload} disabled={uploading}>
                {uploading ? "Analysing…" : "Analyse Dataset"}
              </button>
            </div>

            {uploadMessage && <p className="message">{uploadMessage}</p>}

            {dataset && (
              <div className="dataset-summary">
                <div><span>RECORDS</span><strong>{dataset.totalRecords.toLocaleString()}</strong></div>
                <div><span>FIELDS</span><strong>{dataset.columns.length}</strong></div>
                <div><span>UPLOADED FILE</span><strong>{dataset.fileName}</strong></div>
              </div>
            )}

            {profile && (
              <div className="ai-reply" style={{ marginTop: 20 }}>
                <span>✦</span>
                <div>
                  <strong>Data Profiling Agent</strong>
                  {profile.mappings.slice(0, 10).map((m) => (
                    <p key={`${m.fileName}-${m.column}`}>
                      {m.column} → {m.suggestedAs} ({m.confidence})
                    </p>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Investigation Board ────────────────────────────────────────────── */}
        {activePage === "board" && (
          <section className="board-layout">
            <article className="panel">
              <p className="eyebrow">ACTIVE INVESTIGATION</p>
              <h3>{selectedCase.title}</h3>
              <p className="case-id">{selectedCase.id}</p>

              <div className="timeline">
                <div><span>01</span><p><strong>Signal created</strong><br />Pattern appeared in the recent case feed.</p></div>
                <div><span>02</span><p><strong>Evidence review</strong><br />Verify location, time, and related-case fields.</p></div>
                <div><span>03</span><p><strong>Investigator decision</strong><br />Record your conclusion before creating a report.</p></div>
              </div>
            </article>

            <article className="panel evidence-panel">
              <p className="eyebrow">EXPLAINABILITY</p>
              <h3>Evidence checklist</h3>
              <ul>
                <li>Case type: {selectedCase.type}</li>
                <li>Area: {selectedCase.area}</li>
                <li>Risk label: {selectedCase.risk}</li>
                <li>Status: {selectedCase.status}</li>
              </ul>
              <button className="primary-btn" onClick={() => setActivePage("reports")}>
                Create evidence report
              </button>
            </article>
          </section>
        )}

        {/* ── AI Assistant ────────────────────────────────────────────────────── */}
        {activePage === "assistant" && (
          <section className="assistant-page">
            {/* Header */}
            <div className="assistant-header">
              <p className="eyebrow">AI ASSISTANT / EVIDENCE-FIRST</p>
              <h2>Ask CrimeLens</h2>
              <p className="assistant-subtitle">
                Answers come only from your uploaded crime records — with evidence sources shown.
              </p>
            </div>

            {/* Thread */}
            <div className="chat-thread">
              {messages.length === 0 && !aiLoading && (
                <div className="chat-empty">
                  <div className="chat-empty-icon">✦</div>
                  <div>
                    <h3>Ready to analyse your records</h3>
                    <p>Upload a dataset in Case Vault, then ask me anything about it.</p>
                  </div>
                  <div className="prompt-chips">
                    {PROMPT_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        className="prompt-chip"
                        onClick={() => void sendQuestion(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.role}${msg.isError ? " error" : ""}`}>
                  <div className="chat-role">
                    <span className="chat-role-dot" />
                    {msg.role === "user" ? user.name : "CrimeLens AI"}
                  </div>

                  <p
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  />

                  {/* Evidence Cards */}
                  {msg.role === "assistant" && msg.evidenceCards && msg.evidenceCards.length > 0 && (
                    <>
                      <p className="evidence-section-label">Evidence Sources</p>
                      <div className="evidence-cards">
                        {msg.evidenceCards.map((card, i) => (
                          <div className="evidence-card" key={i}>
                            <div className="evidence-card-label">{card.column}</div>
                            <div className="evidence-card-title">{card.title}</div>
                            <div className="evidence-card-detail">{card.detail}</div>
                            <div className="evidence-card-source">
                              📄 {card.sources[0]}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="chat-meta">
                    <span className="chat-timestamp">{formatTime(msg.timestamp)}</span>
                    {msg.role === "assistant" && !msg.isError && (
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(msg.text, msg.id)}
                      >
                        {copiedId === msg.id ? "✓ Copied" : "Copy"}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {aiLoading && (
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="assistant-composer-wrap">
              <form className="assistant-composer" onSubmit={handleComposerSubmit}>
                <textarea
                  ref={textareaRef}
                  value={question}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask: Which district has the most cases?"
                  rows={1}
                />
                <button type="submit" className="send-btn" disabled={aiLoading || !question.trim()}>
                  ↑
                </button>
              </form>
              <p className="composer-hint">Enter to send · Shift+Enter for new line</p>
            </div>
          </section>
        )}

        {/* ── Pattern & MO Lab ──────────────────────────────────────────────── */}
        {activePage === "patterns" && <PatternLab />}

        {/* ── Module Previews ─────────────────────────────────────────────────── */}
        {["map", "reports"].includes(activePage) && (
          <section className="page-card module-preview">
            <p className="eyebrow">MODULE PREVIEW</p>
            <h3>{navItems.find((n) => n.id === activePage)?.label}</h3>
            <p>
              This section is ready in the Command Center. Its real analysis will be connected after we
              map the date, location, crime type, and case ID columns from your report.
            </p>
            <button className="primary-btn" onClick={() => setActivePage("vault")}>
              Go to Case Vault
            </button>
          </section>
        )}
      </main>

      {/* ── Profile Modal ───────────────────────────────────────────────────── */}
      {showProfile && (
        <ProfilePage
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdated={setUser}
          onLogout={() => { setUser(null); setShowProfile(false); }}
        />
      )}
    </div>
  );
}

export default App;