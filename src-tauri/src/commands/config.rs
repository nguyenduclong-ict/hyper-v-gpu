use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VMConnectionSettings {
    pub resolution_w: u32,
    pub resolution_h: u32,
    pub scale: u32,
    pub username: Option<String>,
    pub password: Option<String>, // Note: In a real app, use keyring. For now, simple storage as requested.
    #[serde(default)]
    pub shared_drives: Vec<String>,
    pub fullscreen: bool,
    // Hardware Persistence
    pub gpu_name: Option<String>,
    pub gpu_allocation_percent: Option<u32>,
    pub cpu_count: Option<u32>,
    pub memory_gb: Option<u32>,
    pub network_switch: Option<String>,
}

impl Default for VMConnectionSettings {
    fn default() -> Self {
        Self {
            resolution_w: 1920,
            resolution_h: 1080,
            scale: 100,
            username: Some("Administrator".to_string()),
            password: None,
            shared_drives: Vec::new(),
            fullscreen: false,
            gpu_name: None,
            gpu_allocation_percent: None,
            cpu_count: None,
            memory_gb: None,
            network_switch: None,
        }
    }
}

// Global store for settings
pub struct VMSettingsStore {
    file_path: PathBuf,
    settings: Mutex<HashMap<String, VMConnectionSettings>>,
}

impl VMSettingsStore {
    pub fn new(app: &AppHandle) -> Self {
        let mut file_path = app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        // Ensure directory exists
        if !file_path.exists() {
            let _ = fs::create_dir_all(&file_path);
        }
        file_path.push("vm_connection_settings.json");

        let settings = if file_path.exists() {
            let content = fs::read_to_string(&file_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            HashMap::new()
        };

        Self {
            file_path,
            settings: Mutex::new(settings),
        }
    }

    pub fn get(&self, vm_name: &str) -> VMConnectionSettings {
        let lock = self.settings.lock().unwrap();
        lock.get(vm_name).cloned().unwrap_or_default()
    }

    pub fn set(&self, vm_name: String, config: VMConnectionSettings) -> Result<(), String> {
        let mut lock = self.settings.lock().unwrap();
        lock.insert(vm_name, config);

        // Persist to disk
        let content = serde_json::to_string_pretty(&*lock).map_err(|e| e.to_string())?;
        fs::write(&self.file_path, content).map_err(|e| e.to_string())?;

        Ok(())
    }
}
