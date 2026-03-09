use serde::{Deserialize, Serialize};
use anyhow::Result;
use reqwest::Client;

/// Core FHIR R4 client — handles all resource fetching
pub struct FhirClient {
    pub base_url: String,
    pub client: Client,
    pub token: Option<String>,
}

impl FhirClient {
    pub fn new(base_url: &str, client: Client, token: Option<String>) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            client,
            token,
        }
    }

    fn auth_header(&self) -> Option<String> {
        self.token.as_ref().map(|t| format!("Bearer {}", t))
    }

    pub async fn get_resource(&self, resource_type: &str, id: &str) -> Result<serde_json::Value> {
        let url = format!("{}/{}/{}", self.base_url, resource_type, id);
        let mut req = self.client.get(&url)
            .header("Accept", "application/fhir+json");
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        let resp = req.send().await?.json::<serde_json::Value>().await?;
        Ok(resp)
    }

    pub async fn search(&self, resource_type: &str, params: &[(&str, &str)]) -> Result<serde_json::Value> {
        let url = format!("{}/{}", self.base_url, resource_type);
        let mut req = self.client.get(&url)
            .header("Accept", "application/fhir+json")
            .query(params);
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        let resp = req.send().await?.json::<serde_json::Value>().await?;
        Ok(resp)
    }

    pub async fn create_resource(&self, resource_type: &str, body: serde_json::Value) -> Result<serde_json::Value> {
        let url = format!("{}/{}", self.base_url, resource_type);
        let mut req = self.client.post(&url)
            .header("Content-Type", "application/fhir+json")
            .header("Accept", "application/fhir+json")
            .json(&body);
        if let Some(auth) = self.auth_header() {
            req = req.header("Authorization", auth);
        }
        let resp = req.send().await?.json::<serde_json::Value>().await?;
        Ok(resp)
    }

    /// Fetch full clinical context for a patient
    pub async fn get_patient_bundle(&self, patient_id: &str) -> Result<PatientClinicalContext> {
        // Run all queries concurrently for speed
        let condition_params = [("patient", patient_id), ("_count", "50")];
        let medication_params = [("patient", patient_id), ("status", "active"), ("_count", "20")];
        let observation_params = [("patient", patient_id), ("category", "laboratory"), ("_count", "30"), ("_sort", "-date")];
        let allergy_params = [("patient", patient_id)];
        let coverage_params = [("patient", patient_id), ("status", "active")];

        let (patient, conditions, medications, observations, allergies, coverage) = tokio::join!(
            self.get_resource("Patient", patient_id),
            self.search("Condition", &condition_params),
            self.search("MedicationRequest", &medication_params),
            self.search("Observation", &observation_params),
            self.search("AllergyIntolerance", &allergy_params),
            self.search("Coverage", &coverage_params),
        );

        Ok(PatientClinicalContext {
            patient_id: patient_id.to_string(),
            patient: patient.unwrap_or_default(),
            conditions: extract_entries(conditions.unwrap_or_default()),
            medications: extract_entries(medications.unwrap_or_default()),
            observations: extract_entries(observations.unwrap_or_default()),
            allergies: extract_entries(allergies.unwrap_or_default()),
            coverage: extract_entries(coverage.unwrap_or_default()),
        })
    }
}

fn extract_entries(bundle: serde_json::Value) -> Vec<serde_json::Value> {
    bundle["entry"]
        .as_array()
        .map(|arr| arr.iter().map(|e| e["resource"].clone()).collect())
        .unwrap_or_default()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PatientClinicalContext {
    pub patient_id: String,
    pub patient: serde_json::Value,
    pub conditions: Vec<serde_json::Value>,
    pub medications: Vec<serde_json::Value>,
    pub observations: Vec<serde_json::Value>,
    pub allergies: Vec<serde_json::Value>,
    pub coverage: Vec<serde_json::Value>,
}
