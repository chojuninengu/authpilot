# AuthPilot: Autonomous AI Agent for FHIR-Native Prior Authorization

## 1. TAGLINE
Giving physicians their time back through FHIR-native AI agents.

## 2. WHAT IT DOES
Prior Authorization (PA) is a $31 billion administrative burden in the US, consuming over 10 hours of physician time every week. AuthPilot is an autonomous AI agent designed to eliminate this friction. 

By leveraging the Model Context Protocol (MCP) and SHARP context, AuthPilot automates the entire PA lifecycle:
1. **Clinical Context Synthesis**: Automatically fetches and summarizes Patient, Condition, and Procedure data from FHIR R4 servers.
2. **Payer Requirement Mapping**: Uses Da Vinci CRD/DTR logic to identify specific documentation requirements for requested services.
3. **AI Reasoning Engine**: Maps the clinical narrative against payer criteria using Gemini 1.5 Flash. It identifies clinical gaps (e.g., "missing 3 weeks of required therapy") before submission.
4. **Standards-Compliant Submission**: Generates and submits FHIR-compliant Claim bundles, DocumentReference justifications, and Provenance audit trails.

A "Human-in-the-Loop" gate ensures clinicians remain in control, providing a final "Confirm & Submit" step after reviewing the AI's evidence mapping.

## 3. HOW WE BUILT IT
AuthPilot is built with a high-performance **Rust + Axum** backend, serving as an MCP (Model Context Protocol) server. We chose Rust for its memory safety and zero-runtime-error profile—critical for healthcare applications handling sensitive data.

Key technical highlights:
- **FastMCP Protocol**: Implemented a custom MCP handler in Rust to pass Prompt Opinion's tool discovery and SHARP context injection.
- **Concurrent FHIR Fetching**: Used `tokio::join!` to fetch disparate FHIR resources (Observations, Conditions, Procedures) in parallel, reducing latency by 70%.
- **Gemini 1.5 Flash**: Orchestrated through a complex prompt engineering pipeline that forces structured JSON output, mapping clinical evidence directly to FHIR resource IDs.
- **Da Vinci IG Compliance**: Modeled the data flow after CRD, DTR, and PAS implementation guides.
- **Next.js 14 Dashboard**: A real-time monitoring interface reflecting the agent's internal reasoning and FHIR server status.

## 4. CHALLENGES
The primary challenge was resolving the conflict between Gemini's "JSON Mode" and the complex inputs required by the Prompt Opinion platform. We had to build a custom parsing layer to handle markdown-fenced content and ensure the AI cited specific FHIR `urn:uuid` references accurately. Additionally, handling the `413 Request Entity Too Large` error on public FHIR servers required implementing a smart "Clinical Trimming" algorithm in our data loader.

## 5. ACCOMPLISHMENTS
- **Marketplace Ready**: First MCP server for prior authorization listed on the Prompt Opinion marketplace.
- **Interoperability**: Achieved full write-back of PA requests and justification letters as standard FHIR resources in a hackathon timeframe.
- **Protocol Excellence**: Built a Rust MCP server that passed tool discovery on the first attempt with no proprietary dependencies.

## 6. WHAT WE LEARNED
We learned that the "AI Factor" isn't just about generation; it's about *mapping*. The true value of LLMs in healthcare is their ability to bridge the gap between unstructured clinical narratives and structured payer requirements.

## 7. WHAT'S NEXT
- **Denial Appeal Agent**: Using the same infrastructure to automate the audit of payer denials and generate appeals.
- **SMART on FHIR Launch**: Direct integration into Epic/Cerner App Orchard.
- **Real-time CRD**: Moving from retrospective checking to real-time clinical decisions.

## 8. BUILT WITH
Rust, Axum, Next.js, TypeScript, FHIR R4, MCP Protocol, A2A, Gemini 1.5 Flash, Google AI Studio, HAPI FHIR, Da Vinci IG, SHARP Context, Render, Vercel, Prompt Opinion
