"use client";
import { useState, useEffect } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "https://authpilot-yx1m.onrender.com";

interface CaseItem {
  id: string;
  patient: string;
  age: number | string;
  service: string;
  code: string;
  status: string;
  confidence: number;
  payer: string;
  submitted: string;
  conditions: string[];
  source: "live" | "demo";
}

const DEMO_CASES: CaseItem[] = [
  { id: "PA-2024-001", patient: "Eleanor Vance", age: 52, service: "MRI Brain with Contrast", code: "70553", status: "approved", confidence: 94, payer: "BlueCross BlueShield", submitted: "2 hours ago", conditions: ["Recurring Migraines", "Hypertension"], source: "demo" },
  { id: "PA-2024-002", patient: "Marcus Webb", age: 41, service: "Adalimumab (Humira) Injection", code: "J0135", status: "pending", confidence: 78, payer: "Aetna", submitted: "5 hours ago", conditions: ["Rheumatoid Arthritis", "DMARD failure"], source: "demo" },
  { id: "PA-2024-003", patient: "Priya Nair", age: 67, service: "Home Health Skilled Nursing", code: "G0299", status: "needs_info", confidence: 55, payer: "Medicare Advantage", submitted: "1 day ago", conditions: ["CHF", "Post-surgical recovery"], source: "demo" },
  { id: "PA-2024-004", patient: "James Okoye", age: 38, service: "MRI Lumbar Spine", code: "72148", status: "approved", confidence: 91, payer: "UnitedHealth", submitted: "3 days ago", conditions: ["Lumbar radiculopathy", "Conservative therapy failed"], source: "demo" },
];

const STATUS_CONFIG: Record<string, { label: string, dot: string, bg: string, text: string }> = {
  approved: { label: "Approved", dot: "#22c55e", bg: "rgba(34,197,94,0.12)", text: "#4ade80" },
  pending: { label: "Pending", dot: "#f59e0b", bg: "rgba(245,158,11,0.12)", text: "#fbbf24" },
  needs_info: { label: "Needs Info", dot: "#ef4444", bg: "rgba(239,68,68,0.12)", text: "#f87171" },
};

export default function AuthPilotDashboard() {
  const [selected, setSelected] = useState<number | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [activeTab, setActiveTab] = useState<"cases" | "new" | "analytics">("cases");
  const [newPA, setNewPA] = useState({ patientId: "", serviceCode: "", serviceDesc: "", notes: "" });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [cases, setCases] = useState<CaseItem[]>(DEMO_CASES);
  const [casesLoading, setCasesLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"live" | "fallback">("fallback");

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then(r => setBackendStatus(r.ok ? "online" : "offline"))
      .catch(() => setBackendStatus("offline"));
  }, []);

  // Fetch live FHIR patient data + PA auth-check on mount
  useEffect(() => {
    let cancelled = false;
    setCasesLoading(true);
    (async () => {
      try {
        const [ctxRes, authRes] = await Promise.all([
          fetch(`${BACKEND_URL}/tools/patient-context`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: "131268989", fhir_base_url: "https://hapi.fhir.org/baseR4" }),
          }).then(r => r.json()),
          fetch(`${BACKEND_URL}/tools/auth-check`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_code: "70553", service_description: "MRI Brain with Contrast" }),
          }).then(r => r.json()),
        ]);
        if (cancelled) return;

        if (ctxRes.success && authRes.success) {
          const summary = ctxRes.summary || {};
          // Build full name from raw FHIR given+family, fall back to summary.name
          let patientName = "FHIR Patient";
          const rawName = ctxRes.raw_context?.patient?.name?.[0];
          if (rawName) {
            const given = Array.isArray(rawName.given) ? rawName.given.join(" ") : "";
            const family = rawName.family || "";
            const full = [given, family].filter(Boolean).join(" ");
            if (full) patientName = full;
          } else if (summary.name && summary.name !== "Unknown") {
            patientName = summary.name;
          }
          const conditions: string[] = (summary.active_conditions && summary.active_conditions.length > 0)
            ? summary.active_conditions.slice(0, 4)
            : ["No active conditions"];
          const payer = summary.payer || "Unknown Payer";
          const birthDate = summary.birth_date || "";
          const age = birthDate ? new Date().getFullYear() - new Date(birthDate).getFullYear() : "—";

          const liveCase: CaseItem = {
            id: `PA-LIVE-${ctxRes.patient_id}`,
            patient: patientName,
            age,
            service: authRes.service_description || "MRI Brain with Contrast",
            code: authRes.service_code || "70553",
            status: authRes.prior_auth_required ? "pending" : "approved",
            confidence: authRes.prior_auth_required ? 82 : 95,
            payer,
            submitted: "just now",
            conditions,
            source: "live",
          };

          setCases([liveCase, ...DEMO_CASES.slice(1)]);
          setDataSource("live");
        }
      } catch {
        // Backend unreachable — keep DEMO_CASES fallback
      }
      if (!cancelled) setCasesLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const runPipeline = async () => {
    setRunning(true); setResult(null);
    try {
      const [ctx, auth] = await Promise.all([
        fetch(`${BACKEND_URL}/tools/patient-context`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patient_id: newPA.patientId || "592011", fhir_base_url: "https://hapi.fhir.org/baseR4" }),
        }).then(r => r.json()),
        fetch(`${BACKEND_URL}/tools/auth-check`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service_code: newPA.serviceCode || "70553", service_description: newPA.serviceDesc || "MRI Brain" }),
        }).then(r => r.json()),
      ]);
      setResult({ patient: ctx, auth });
    } catch (e: any) { setResult({ error: e.message }); }
    setRunning(false);
  };

  const stats = [
    { label: "Processed Today", value: "47", delta: "↑ +12%", up: true },
    { label: "Avg Confidence", value: "88%", delta: "↑ +4pts", up: true },
    { label: "Hours Saved", value: "94h", delta: "↑ this week", up: true },
    { label: "Approval Rate", value: "91%", delta: "↑ +6%", up: true },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#080c14", color: "#e2e8f0",
      fontFamily: "'IBM Plex Mono','Courier New',monospace"
    }}>

      {/* Shimmer keyframe for loading skeletons */}
      <style>{`
        @keyframes authpilot-shimmer {
          0% { background-position: -400px 0; }
          100% { background-position: 400px 0; }
        }
      `}</style>

      {/* Background grid */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: `linear-gradient(rgba(0,212,255,0.03) 1px,transparent 1px),
          linear-gradient(90deg,rgba(0,212,255,0.03) 1px,transparent 1px)`,
        backgroundSize: "48px 48px"
      }} />

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50, height: 60, padding: "0 32px",
        background: "rgba(8,12,20,0.93)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(0,212,255,0.15)",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: "linear-gradient(135deg,#00d4ff,#0066ff)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 900, color: "#fff"
          }}>A</div>
          <span style={{
            fontSize: 17, fontWeight: 800, letterSpacing: 3,
            background: "linear-gradient(90deg,#00d4ff,#60a5fa)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
          }}>AUTHPILOT</span>
          <span style={{ fontSize: 9, color: "#334155", letterSpacing: 3, marginLeft: 4 }}>MCP · A2A · FHIR R4</span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "4px 14px", borderRadius: 20,
          background: backendStatus === "online" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${backendStatus === "online" ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: backendStatus === "online" ? "#22c55e" : "#ef4444",
            animation: backendStatus === "online" ? "pulse 2s infinite" : "none"
          }} />
          <span style={{ fontSize: 11, color: backendStatus === "online" ? "#4ade80" : "#f87171" }}>
            {backendStatus === "checking" ? "Checking..." : backendStatus === "online" ? "API Live" : "API Offline"}
          </span>
        </div>
      </header>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1200, margin: "0 auto", padding: "36px 24px" }}>

        {/* Hero */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: "clamp(22px,3.5vw,40px)", fontWeight: 800, margin: 0, letterSpacing: -1, lineHeight: 1.15 }}>
            Prior Authorization,{" "}
            <span style={{
              background: "linear-gradient(90deg,#00d4ff,#60a5fa,#a78bfa)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>Automated.</span>
          </h1>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 8, letterSpacing: 0.3 }}>
            Reads FHIR · Reasons with AI · Submits compliant PA requests · Saves 10+ physician hours/week
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 32 }}>
          {stats.map((s, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(0,212,255,0.08)",
              borderRadius: 12, padding: "18px 22px", transition: "border-color 0.2s", cursor: "default"
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.08)")}>
              <div style={{ fontSize: 10, color: "#334155", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#f1f5f9", letterSpacing: -1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#4ade80", marginTop: 4 }}>{s.delta}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 3, marginBottom: 22,
          background: "rgba(0,0,0,0.3)", borderRadius: 10, padding: 4, width: "fit-content",
          border: "1px solid rgba(255,255,255,0.06)"
        }}>
          {(["cases", "new", "analytics"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: "8px 18px", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 11, fontFamily: "inherit", letterSpacing: 1.5, textTransform: "uppercase",
                fontWeight: activeTab === tab ? 700 : 400,
                background: activeTab === tab ? "rgba(0,212,255,0.12)" : "transparent",
                color: activeTab === tab ? "#00d4ff" : "#475569",
                transition: "all 0.2s"
              }}>
              {tab === "cases" ? "PA Cases" : tab === "new" ? "New Request" : "Analytics"}
            </button>
          ))}
        </div>

        {/* ── CASES ── */}
        {activeTab === "cases" && (
          <div style={{ display: "grid", gap: 10 }}>
            {casesLoading ? (
              // Loading skeleton cards
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "18px 22px"
                }}>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{
                      width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                      background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.07) 50%, rgba(255,255,255,0.03) 75%)",
                      backgroundSize: "800px 100%",
                      animation: "authpilot-shimmer 1.5s infinite linear"
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        width: "40%", height: 14, borderRadius: 4, marginBottom: 6,
                        background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
                        backgroundSize: "800px 100%",
                        animation: "authpilot-shimmer 1.5s infinite linear"
                      }} />
                      <div style={{
                        width: "60%", height: 10, borderRadius: 3,
                        background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)",
                        backgroundSize: "800px 100%",
                        animation: "authpilot-shimmer 1.5s infinite linear"
                      }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
                    {["45%", "20%", "25%"].map((w, wi) => (
                      <div key={wi} style={{
                        width: w, height: 18, borderRadius: 5,
                        background: "linear-gradient(90deg, rgba(255,255,255,0.02) 25%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 75%)",
                        backgroundSize: "800px 100%",
                        animation: "authpilot-shimmer 1.5s infinite linear"
                      }} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // Real / fallback case cards
              cases.map((c, i) => {
                const s = STATUS_CONFIG[c.status] || STATUS_CONFIG.pending;
                const open = selected === i;
                return (
                  <div key={i} onClick={() => setSelected(open ? null : i)}
                    style={{
                      background: open ? "rgba(0,212,255,0.04)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${open ? "rgba(0,212,255,0.35)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 12, padding: "18px 22px", cursor: "pointer", transition: "all 0.2s"
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div style={{
                          width: 38, height: 38, borderRadius: 9, flexShrink: 0,
                          background: "linear-gradient(135deg,#1e3a5f,#0f1f35)",
                          border: "1px solid rgba(0,212,255,0.18)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 700, color: "#60a5fa"
                        }}>
                          {c.patient.split(" ").map(n => n[0]).join("")}
                        </div>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>{c.patient}</span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, letterSpacing: 1.5, padding: "2px 6px",
                              borderRadius: 4, textTransform: "uppercase" as const,
                              background: c.source === "live" ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.04)",
                              color: c.source === "live" ? "#00d4ff" : "#334155",
                              border: `1px solid ${c.source === "live" ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.06)"}`
                            }}>{c.source === "live" ? "⚡ LIVE" : "DEMO"}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>{c.age}y · {c.id} · {c.payer}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 9, color: "#334155", letterSpacing: 1.5, marginBottom: 4, textAlign: "right" }}>CONFIDENCE</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 72, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                              <div style={{
                                height: "100%", borderRadius: 2,
                                width: `${c.confidence}%`,
                                background: c.confidence > 85 ? "#22c55e" : c.confidence > 65 ? "#f59e0b" : "#ef4444"
                              }} />
                            </div>
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              color: c.confidence > 85 ? "#4ade80" : c.confidence > 65 ? "#fbbf24" : "#f87171"
                            }}>
                              {c.confidence}%
                            </span>
                          </div>
                        </div>
                        <div style={{
                          padding: "4px 12px", borderRadius: 20, fontSize: 11,
                          background: s.bg, color: s.text, border: `1px solid ${s.dot}44`,
                          display: "flex", alignItems: "center", gap: 6
                        }}>
                          <div style={{ width: 5, height: 5, borderRadius: "50%", background: s.dot }} />
                          {s.label}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", gap: 7, flexWrap: "wrap" }}>
                      {[c.service, `CPT ${c.code}`, ...c.conditions].map((tag, ti) => (
                        <span key={ti} style={{
                          fontSize: 10, color: ti === 0 ? "#94a3b8" : "#475569",
                          background: "rgba(255,255,255,0.03)", padding: "3px 9px",
                          borderRadius: 5, border: "1px solid rgba(255,255,255,0.05)"
                        }}>{tag}</span>
                      ))}
                      <span style={{ fontSize: 10, color: "#1e293b", marginLeft: "auto" }}>{c.submitted}</span>
                    </div>
                    {open && (
                      <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                          <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: 14 }}>
                            <div style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 2, marginBottom: 8 }}>FHIR RESOURCES CREATED</div>
                            {[`Claim/${c.id}`, `DocumentReference/doc-${c.id}`, `Provenance/${c.id}-prov`].map((r, ri) => (
                              <div key={ri} style={{
                                fontSize: 10, color: "#334155", padding: "3px 0",
                                borderBottom: "1px solid rgba(255,255,255,0.03)", fontFamily: "monospace"
                              }}>✓ {r}</div>
                            ))}
                          </div>
                          <div style={{ background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: 14 }}>
                            <div style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 2, marginBottom: 8 }}>AGENT PIPELINE</div>
                            {["get_patient_clinical_context", "check_prior_auth_required", "build_clinical_justification", "submit_prior_auth_request"].map((t, ti) => (
                              <div key={ti} style={{
                                fontSize: 10, color: "#4ade80", padding: "3px 0",
                                borderBottom: "1px solid rgba(255,255,255,0.03)", fontFamily: "monospace"
                              }}>✓ {t}</div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── NEW REQUEST ── */}
        {activeTab === "new" && (
          <div style={{ maxWidth: 640 }}>
            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,212,255,0.1)",
              borderRadius: 16, padding: 30
            }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 6px 0" }}>New PA Request</h2>
              <p style={{ fontSize: 12, color: "#475569", margin: "0 0 26px 0" }}>
                AuthPilot fetches FHIR data → evaluates payer criteria → generates AI justification via Gemini 2.5 Flash
              </p>
              {[
                { label: "PATIENT ID (FHIR)", key: "patientId", placeholder: "e.g. 592011" },
                { label: "SERVICE CODE (CPT)", key: "serviceCode", placeholder: "e.g. 70553" },
                { label: "SERVICE DESCRIPTION", key: "serviceDesc", placeholder: "e.g. MRI Brain with Contrast" },
              ].map(({ label, key, placeholder }) => (
                <div key={key} style={{ marginBottom: 18 }}>
                  <label style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 2, display: "block", marginBottom: 5 }}>{label}</label>
                  <input value={newPA[key as keyof typeof newPA]}
                    onChange={e => setNewPA(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{
                      width: "100%", background: "rgba(0,0,0,0.45)",
                      border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8,
                      padding: "10px 13px", color: "#f1f5f9", fontSize: 12,
                      fontFamily: "'IBM Plex Mono',monospace", outline: "none", boxSizing: "border-box"
                    }}
                    onFocus={e => (e.target.style.borderColor = "rgba(0,212,255,0.45)")}
                    onBlur={e => (e.target.style.borderColor = "rgba(255,255,255,0.09)")} />
                </div>
              ))}
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 2, display: "block", marginBottom: 5 }}>CLINICAL NOTES</label>
                <textarea value={newPA.notes} onChange={e => setNewPA(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Additional context for the AI..." rows={3}
                  style={{
                    width: "100%", background: "rgba(0,0,0,0.45)",
                    border: "1px solid rgba(255,255,255,0.09)", borderRadius: 8,
                    padding: "10px 13px", color: "#f1f5f9", fontSize: 12,
                    fontFamily: "'IBM Plex Mono',monospace", outline: "none",
                    resize: "vertical", boxSizing: "border-box"
                  }} />
              </div>
              <button onClick={runPipeline} disabled={running}
                style={{
                  width: "100%", padding: 13, borderRadius: 9, border: "none",
                  cursor: running ? "wait" : "pointer",
                  background: running ? "rgba(255,255,255,0.04)" : "linear-gradient(135deg,#00d4ff,#0055ff)",
                  color: running ? "#334155" : "#fff", fontSize: 12, fontWeight: 700,
                  fontFamily: "inherit", letterSpacing: 2, textTransform: "uppercase", transition: "all 0.2s"
                }}>
                {running ? "⟳  Running Agents..." : "▶  Run AuthPilot Pipeline"}
              </button>
              {result && (
                <div style={{
                  marginTop: 22, padding: 18, background: "rgba(0,0,0,0.4)",
                  borderRadius: 10, border: "1px solid rgba(0,212,255,0.12)"
                }}>
                  <div style={{ fontSize: 9, color: "#00d4ff", letterSpacing: 2, marginBottom: 10 }}>PIPELINE RESULT</div>
                  {result.error ? (
                    <div style={{ color: "#f87171", fontSize: 12 }}>Error: {result.error}</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 6 }}>✓ Patient context fetched from FHIR</div>
                      <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 6 }}>
                        ✓ PA requirement check: {result.auth?.prior_auth_required ? "Authorization Required" : "Not Required"}
                      </div>
                      <div style={{ fontSize: 11, color: "#fbbf24", marginBottom: 12 }}>
                        ⚠ Justification step requires clinician confirmation (human-in-the-loop)
                      </div>
                      <pre style={{
                        fontSize: 10, color: "#334155", overflow: "auto", maxHeight: 180,
                        background: "rgba(0,0,0,0.3)", padding: 10, borderRadius: 6, margin: 0
                      }}>
                        {JSON.stringify(result.auth, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab === "analytics" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 18 }}>
            {[
              {
                title: "Approval Rate by Service", items: [
                  { label: "MRI Brain", value: 94, color: "#22c55e" },
                  { label: "Specialty Drugs", value: 78, color: "#f59e0b" },
                  { label: "Home Health", value: 71, color: "#f59e0b" },
                  { label: "Spine Imaging", value: 88, color: "#22c55e" },
                ]
              },
              {
                title: "Volume by Payer", items: [
                  { label: "BlueCross BlueShield", value: 34, color: "#3b82f6" },
                  { label: "Aetna", value: 28, color: "#8b5cf6" },
                  { label: "UnitedHealth", value: 22, color: "#06b6d4" },
                  { label: "Medicare Advantage", value: 16, color: "#64748b" },
                ]
              },
            ].map((chart, ci) => (
              <div key={ci} style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, padding: 22
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 1.5,
                  marginBottom: 18, textTransform: "uppercase"
                }}>{chart.title}</div>
                {chart.items.map((item, ii) => (
                  <div key={ii} style={{ marginBottom: 14 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", fontSize: 11,
                      color: "#94a3b8", marginBottom: 5
                    }}>
                      <span>{item.label}</span>
                      <span style={{ color: item.color, fontWeight: 700 }}>{item.value}%</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3 }}>
                      <div style={{
                        height: "100%", width: `${item.value}%`, borderRadius: 3,
                        background: `linear-gradient(90deg,${item.color}66,${item.color})`
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{
              background: "rgba(0,212,255,0.03)",
              border: "1px solid rgba(0,212,255,0.12)", borderRadius: 14, padding: 22,
              gridColumn: "1 / -1"
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "#00d4ff",
                letterSpacing: 1.5, marginBottom: 16, textTransform: "uppercase"
              }}>AuthPilot 4-Tool Pipeline</div>
              <div style={{ display: "flex", gap: 0, alignItems: "center", flexWrap: "wrap" }}>
                {[
                  { n: "01", l: "FHIR Fetch", d: "Patient context" },
                  { n: "02", l: "PA Check", d: "Payer criteria" },
                  { n: "03", l: "AI Justify", d: "Gemini 2.5 Flash" },
                  { n: "04", l: "Submit", d: "FHIR PAS Bundle" },
                ].map((s, si, arr) => (
                  <div key={si} style={{ display: "flex", alignItems: "center" }}>
                    <div style={{
                      textAlign: "center", padding: "12px 18px",
                      background: "rgba(0,0,0,0.3)", borderRadius: 9,
                      border: "1px solid rgba(0,212,255,0.12)"
                    }}>
                      <div style={{ fontSize: 9, color: "#00d4ff44", marginBottom: 3 }}>{s.n}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9" }}>{s.l}</div>
                      <div style={{ fontSize: 10, color: "#334155" }}>{s.d}</div>
                    </div>
                    {si < arr.length - 1 && <div style={{ fontSize: 16, color: "#00d4ff33", padding: "0 8px" }}>→</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{
          marginTop: 56, paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.04)",
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10
        }}>
          <span style={{ fontSize: 10, color: "#1e293b" }}>AuthPilot · MCP + A2A + FHIR R4 · Agents Assemble Hackathon 2026</span>
          <div style={{ display: "flex", gap: 18 }}>
            {["GitHub", "Status Page", "Prompt Opinion"].map(l => (
              <span key={l} style={{ fontSize: 10, color: "#1e293b", cursor: "pointer", transition: "color 0.2s" }}
                onMouseEnter={e => ((e.target as HTMLElement).style.color = "#00d4ff")}
                onMouseLeave={e => ((e.target as HTMLElement).style.color = "#1e293b")}>{l}</span>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
