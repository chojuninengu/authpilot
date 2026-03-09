const fs = require('fs');

const HAPI_FHIR_URL = "https://app.promptopinion.ai/api/workspaces/019cd3a6-9e78-72d4-8c89-88bcaa1c155c/fhir";

const PATIENTS = [
    {
        name: "Scenario A: Happy Path (MRI Brain)",
        url: "https://raw.githubusercontent.com/smart-on-fhir/generated-sample-data/master/R4/SYNTHEA/Abdul_Koepp_e925b0f3-8006-43f6-aa31-94bd215e55e7.json",
        patch: (bundle) => {
            const patientId = bundle.entry[0].fullUrl;
            bundle.entry.push({
                fullUrl: "urn:uuid:migraine-001",
                resource: {
                    resourceType: "Condition",
                    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
                    code: { coding: [{ system: "http://snomed.info/sct", code: "37796009", display: "Migraine" }] },
                    subject: { reference: patientId },
                    onsetDateTime: "2023-01-01T00:00:00Z"
                },
                request: { method: "POST", url: "Condition" }
            });
            bundle.entry.push({
                fullUrl: "urn:uuid:pt-001",
                resource: {
                    resourceType: "Procedure",
                    status: "completed",
                    code: { coding: [{ system: "http://snomed.info/sct", code: "102551000", display: "Physical therapy" }] },
                    subject: { reference: patientId },
                    performedPeriod: { start: "2024-01-01T00:00:00Z", end: "2024-02-15T00:00:00Z" },
                    note: [{ text: "Patient completed full 6-week course of conservative therapy with no improvement." }]
                },
                request: { method: "POST", url: "Procedure" }
            });
        }
    },
    {
        name: "Scenario B: Borderline (MRI Lumbar)",
        url: "https://raw.githubusercontent.com/smart-on-fhir/generated-sample-data/master/R4/SYNTHEA/Adalberto_Hartmann_44ec4447-9e2c-4eb9-bd4f-0bdb416b806e.json",
        patch: (bundle) => {
            const patientId = bundle.entry[0].fullUrl;
            bundle.entry.push({
                fullUrl: "urn:uuid:backpain-001",
                resource: {
                    resourceType: "Condition",
                    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
                    code: { coding: [{ system: "http://snomed.info/sct", code: "225444004", display: "Low back pain" }] },
                    subject: { reference: patientId },
                    onsetDateTime: "2024-02-01T00:00:00Z"
                },
                request: { method: "POST", url: "Condition" }
            });
            bundle.entry.push({
                fullUrl: "urn:uuid:pt-002",
                resource: {
                    resourceType: "Procedure",
                    status: "completed",
                    code: { coding: [{ system: "http://snomed.info/sct", code: "102551000", display: "Physical therapy" }] },
                    subject: { reference: patientId },
                    performedPeriod: { start: "2024-02-15T00:00:00Z", end: "2024-03-05T00:00:00Z" },
                    note: [{ text: "Patient started physical therapy but only completed 3 weeks." }]
                },
                request: { method: "POST", url: "Procedure" }
            });
        }
    },
    {
        name: "Scenario C: Urgent (Stroke Suspected)",
        url: "https://raw.githubusercontent.com/smart-on-fhir/generated-sample-data/master/R4/SYNTHEA/Addie_Tremblay_4c875c3c-b4d6-4f6d-aabe-5ddc24892adc.json",
        patch: (bundle) => {
            const patientId = bundle.entry[0].fullUrl;
            bundle.entry.push({
                fullUrl: "urn:uuid:stroke-001",
                resource: {
                    resourceType: "Condition",
                    clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
                    code: { coding: [{ system: "http://snomed.info/sct", code: "230690007", display: "Cerebrovascular accident" }] },
                    subject: { reference: patientId },
                    onsetDateTime: new Date().toISOString()
                },
                request: { method: "POST", url: "Condition" }
            });
            bundle.entry.push({
                fullUrl: "urn:uuid:sr-001",
                resource: {
                    resourceType: "ServiceRequest",
                    status: "active",
                    intent: "order",
                    priority: "stat", // Changed from 'emergency' to 'stat' (valid FHIR code)
                    code: { coding: [{ system: "http://www.ama-assn.org/go/cpt", code: "70553", display: "MRI Brain with Contrast" }] },
                    subject: { reference: patientId },
                    reasonCode: [{ text: "Acute onset of neurological deficits, suspected stroke." }]
                },
                request: { method: "POST", url: "ServiceRequest" }
            });
        }
    }
];

async function loadDemoData() {
    console.log("🛠️ AuthPilot Demo Data Loader");
    console.log(`Target: ${HAPI_FHIR_URL}\n`);

    for (const p of PATIENTS) {
        console.log(`📦 Processing ${p.name}...`);
        try {
            // 1. Download
            const resp = await fetch(p.url, { headers: { "User-Agent": "AuthPilot-Loader/1.0" } });
            const fullBundle = await resp.json();

            // 1.5 Strict Filter & Clean (Avoid placeholder and size issues)
            console.log(`   Filtering and cleaning bundle...`);
            const filteredEntries = fullBundle.entry.filter(e => {
                if (!e.resource) return false;
                // AuthPilot mostly cares about Patient, Condition, Procedure for the summary
                return ["Patient", "Condition", "Procedure", "Encounter"].includes(e.resource.resourceType);
            }).map(e => {
                // Deep clone to avoid mutating source if needed
                const res = JSON.parse(JSON.stringify(e.resource));
                // Strip references to resources we filtered out (Practitioners, Organizations, etc.)
                delete res.provider;
                delete res.performer;
                delete res.recorder;
                delete res.asserter;
                if (res.resourceType === "Encounter") {
                    delete res.participant;
                    delete res.serviceProvider;
                    delete res.location;
                }
                return {
                    fullUrl: e.fullUrl,
                    resource: res,
                    request: { method: "POST", url: res.resourceType }
                };
            }).slice(0, 50); // Very safe limit

            const bundle = {
                resourceType: "Bundle",
                type: "transaction",
                entry: filteredEntries
            };

            // 2. Patch
            console.log(`   Patching bundle...`);
            p.patch(bundle);

            // 3. Upload (Transaction)
            console.log(`   Uploading to Prompt Opinion FHIR...`);
            const uploadResp = await fetch(HAPI_FHIR_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/fhir+json",
                    "Accept": "application/fhir+json"
                },
                body: JSON.stringify(bundle)
            });
            const uploadText = await uploadResp.text();

            let uploadData;
            try {
                uploadData = JSON.parse(uploadText);
            } catch (e) {
                console.log(`❌ JSON Parse failed for upload response.`);
                console.log(`   Response start: ${uploadText.substring(0, 200)}`);
                continue;
            }

            if (uploadResp.ok) {
                const patientEntry = uploadData.entry.find(e => e.response && e.response.location && e.response.location.includes("Patient/"));
                const patientId = patientEntry ? patientEntry.response.location.split("Patient/")[1].split("/")[0] : "Unknown";
                console.log(`✅ Success! Patient ID: ${patientId}\n`);
            } else {
                console.log(`❌ Upload failed: ${JSON.stringify(uploadData).substring(0, 500)}\n`);
            }
        } catch (err) {
            console.log(`💥 Unexpected error: ${err.message}\n`);
        }
    }
}

loadDemoData();
