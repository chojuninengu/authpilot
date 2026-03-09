const fs = require('fs');

const BACKEND_URL = "https://authpilot-yx1m.onrender.com";
const PATIENT_ID = "592011";
const FHIR_BASE_URL = "https://hapi.fhir.org/baseR4";
const SERVICE_CODE = "70553";
const SERVICE_DESC = "MRI Brain with Contrast";

async function runPipeline() {
    console.log("🚀 Starting AuthPilot 4-Tool Pipeline Test...");
    const results = {};

    try {
        // ── Tool 1: Patient Context ────────────────────────────────
        console.log("\n[1/4] Fetching Patient Context...");
        const ctxRes = await fetch(`${BACKEND_URL}/tools/patient-context`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: PATIENT_ID, fhir_base_url: FHIR_BASE_URL })
        });
        const ctxData = await ctxRes.json();
        if (ctxData.success) {
            console.log("✅ Tool 1 Success: Patient context retrieved.");
            results.patient_context = ctxData;
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
        if (authData.success) {
            console.log(`✅ Tool 2 Success: PA Required = ${authData.prior_auth_required}`);
            results.auth_check = authData;
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
        if (justData.success) {
            console.log("✅ Tool 3 Success: AI justification generated.");
            results.justification = justData;
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
        if (submitData.status === "awaiting_confirmation") {
            console.log("✅ Tool 4 Success: Awaiting confirmation (as expected).");
            results.submission = submitData;
        } else if (submitData.success) {
            console.log("✅ Tool 4 Success: Submitted.");
            results.submission = submitData;
        } else {
            console.log("❌ Tool 4 Failed:", submitData.error || submitData.message || "Unknown error");
            throw new Error("Pipeline stopped at Tool 4");
        }

        // ── Final Results ──────────────────────────────────────────
        console.log("\n" + "=".repeat(50));
        console.log("🏆 PIPELINE TEST COMPLETE");
        console.log(`Final Confidence Score: ${justData.justification.confidence_score}%`);
        console.log(`Approval Likelihood: ${justData.justification.approval_likelihood.toUpperCase()}`);
        console.log("=".repeat(50));

        fs.writeFileSync('pipeline-result.json', JSON.stringify(results, null, 2));
        console.log("\n📁 Full result saved to pipeline-result.json");

    } catch (error) {
        console.error("\n💥 Pipeline execution failed:", error.message);
        fs.writeFileSync('pipeline-result.json', JSON.stringify(results, null, 2));
        process.exit(1);
    }
}

runPipeline();
