# AuthPilot — Prior Authorization AI

## 1. Display Name
AuthPilot

## 2. Short Description
Autonomous AI agent for prior authorization. Fetches FHIR context, reasons against payer criteria, and submits justifications to save clinicians 10+ hours/week.

## 3. Full Description
AuthPilot is a clinical-grade AI agent designed to eliminate the administrative burden of prior authorizations. Built for health systems and clinical informaticists, AuthPilot integrates directly into your existing FHIR R4 environment to automate the most time-consuming part of physician documentation.

**How it works:**
1. **Discover**: AuthPilot exposes itself via the Model Context Protocol (MCP), making its clinical intelligence available to any AI-enabled workspace.
2. **Contextualize**: It uses the SHARP standard to automatically receive patient and FHIR server context, fetching relevant clinical records without manual input.
3. **Reason**: Unlike rigid rule-engines, AuthPilot uses advanced LLM reasoning to map clinical narratives to specific insurance criteria. It identifies gaps in evidence before a submission occurs, reducing the denial rate and improving turn-around time.
4. **Comply**: Every action represents a standards-compliant FHIR resource creation. We write justifications as DocumentReferences and submissions as Claims, maintaining a full Provenance audit trail.

AuthPilot isn't just a tool; it's a member of the clinical team that understands the story behind the data.

## 4. Categories
Prior Authorization, Administrative Automation, FHIR Tools

## 5. Use Case Examples

### Case 1: Routine MRI Brain Authorization (Happy Path)
- **Input**: `{ "patient_id": "131328281", "service_code": "70553", "service_description": "MRI Brain with Contrast" }`
- **Output**: 92% confidence justification citing 6 weeks of PT failure.

### Case 2: Identifying Clinical Gaps (The Borderline Case)
- **Input**: `{ "patient_id": "131328313", "service_code": "72148", "service_description": "MRI Lumbar Spine" }`
- **Output**: Identifies that only 3 weeks of therapy are documented instead of the required 6.

### Case 3: Urgent Stroke Bypass
- **Input**: `{ "patient_id": "131328357", "service_code": "70553", "urgency": "STAT" }`
- **Output**: Recognizes life-threatening clinical status and formats emergency bypass justification.

## 6. SHARP Context Fields
- `patient_id`
- `fhir_base_url`
- `fhir_token`

## 7. Tool Descriptions
1. `get_patient_clinical_context`: Aggregates Patient, Condition, and Procedure data into a clinical summary.
2. `check_prior_auth_required`: Maps service codes to payer-specific documentation requirements.
3. `build_clinical_justification`: Generates evidence-mapped medical necessity letters with confidence scoring.
4. `submit_prior_auth_request`: Commits the final submission to the FHIR server with full audit provenance.

## 8. Compliance
- FHIR R4
- Da Vinci CRD/DTR/PAS
- MCP 2024-11-05
- Provenance Audit Trail (HL7)
