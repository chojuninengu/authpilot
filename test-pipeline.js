const fs = require('fs');

/**
 * AuthPilot End-to-End Pipeline Test
 * Usage: node test-pipeline.js [backend_url] [patient_id]
 * Example: node test-pipeline.js http://localhost:8081 131328281
 */

const BACKEND_URL = process.argv[2] || "http://localhost:8081";
const PATIENT_ID = process.argv[3] || "592011";
const FHIR_BASE_URL = "https://app.promptopinion.ai/api/workspaces/019cd3a6-9e78-72d4-8c89-88bcaa1c155c/fhir";
const SERVICE_CODE = "70553";
const SERVICE_DESC = "MRI Brain with Contrast";

async function runPipeline() {
    console.log(`🚀 Starting AuthPilot 4-Tool Pipeline Test...`);
    console.log(`📡 Backend: ${BACKEND_URL}`);
    console.log(`🏥 Patient: ${PATIENT_ID}`);

    const results = {
        timestamp: new Date().toISOString(),
        backend_url: BACKEND_URL,
        patient_id: PATIENT_ID,
        steps: []
    };

    try {
        // ── Tool 1: Patient Context ────────────────────────────────
        console.log("\n[1/4] Fetching Patient Context...");
        const ctxRes = await fetch(`${BACKEND_URL}/tools/patient-context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: PATIENT_ID, fhir_base_url: FHIR_BASE_URL })
        });
        const ctxData = await ctxRes.json();
        results.steps.push({ step: "patient-context", success: ctxData.success, data: ctxData });
        if (ctxData.success) {
            console.log("✅ Tool 1 Success: Patient context retrieved.");
        } else {
            console.log("❌ Tool 1 Failed:", ctxData.error || "Unknown error");
            throw new Error("Pipeline stopped at Tool 1");
        }

        // ── Tool 2: Auth Check ─────────────────────────────────────
        console.log("\n[2/4] Checking Prior Authorization Requirements...");
        const authRes = await fetch(`${BACKEND_URL}/tools/auth-check`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_code: SERVICE_CODE, service_description: SERVICE_DESC })
        });
        const authData = await authRes.json();
        results.steps.push({ step: "auth-check", success: authData.success, data: authData });
        if (authData.success) {
            console.log(`✅ Tool 2 Success: PA Required = ${authData.prior_auth_required}`);
        } else {
            console.log("❌ Tool 2 Failed:", authData.error || "Unknown error");
            throw new Error("Pipeline stopped at Tool 2");
        }

        // ── Tool 3: Justification ──────────────────────────────────
        console.log("\n[3/4] Generating AI Clinical Justification...");
        const justRes = await fetch(`${BACKEND_URL}/tools/justification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_context: ctxData,
                pa_requirements: authData,
                requested_service: SERVICE_DESC,
                service_code: SERVICE_CODE
            })
        });
        const justData = await justRes.json();
        results.steps.push({ step: "justification", success: justData.success, data: justData });
        if (justData.success) {
            console.log(`✅ Tool 3 Success: AI justification generated using ${justData.model}.`);
        } else {
            console.log("❌ Tool 3 Failed:", justData.error || "Unknown error");
            throw new Error("Pipeline stopped at Tool 3");
        }

        // ── Tool 4: Submit PA ──────────────────────────────────────
        console.log("\n[4/4] Submitting Prior Authorization Request (Human-in-Loop Test)...");
        const submitRes = await fetch(`${BACKEND_URL}/tools/submit-pa`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                patient_id: PATIENT_ID,
                service_code: SERVICE_CODE,
                service_description: SERVICE_DESC,
                justification: justData.justification,
                patient_context: ctxData,
                fhir_base_url: FHIR_BASE_URL,
                clinician_confirmed: false
            })
        });
        const submitData = await submitRes.json();
        results.steps.push({ step: "submit-pa", success: submitData.success || submitData.status === "awaiting_confirmation", data: submitData });
        if (submitData.status === "awaiting_confirmation") {
            console.log("✅ Tool 4 Success: Awaiting confirmation (as expected for human-in-the-loop).");
        } else if (submitData.success) {
            console.log("✅ Tool 4 Success: Submitted.");
        } else {
            console.log("❌ Tool 4 Failed:", submitData.error || submitData.message || "Unknown error");
            throw new Error("Pipeline stopped at Tool 4");
        }

        // ── Final Results ──────────────────────────────────────────
        console.log("\n" + "=".repeat(60));
        console.log("🏆 PIPELINE TEST COMPLETE");
        console.log(`Final Confidence Score: ${justData.justification.confidence_score}%`);
        console.log(`Approval Likelihood: ${justData.justification.approval_likelihood.toUpperCase()}`);
        console.log("=".repeat(60));

        fs.writeFileSync('pipeline-result.json', JSON.stringify(results, null, 2));
        console.log("\n📁 Full result saved to pipeline-result.json");

    } catch (error) {
        console.error("\n💥 Pipeline execution failed:", error.message);
        process.exit(1);
    }
}

runPipeline();
