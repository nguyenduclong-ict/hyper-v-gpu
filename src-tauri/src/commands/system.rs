use serde::{Deserialize, Serialize};

use super::utils::run_powershell;

/// GPU information structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GpuInfo {
    pub name: String,
    pub driver_version: String,
    pub supports_partitioning: bool,
}

/// System check result structure
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os_version: String,
    pub os_edition: String,
    pub hyper_v_enabled: bool,
    pub gpu_list: Vec<GpuInfo>,
    pub available_memory_gb: f64,
    pub issues: Vec<String>,
}

/// Check if Hyper-V is enabled (using multiple methods, no admin required)
fn check_hyper_v() -> bool {
    // Method 1: Check if Hyper-V service (vmms) exists and is running
    let service_script = r#"
        $vmms = Get-Service -Name 'vmms' -ErrorAction SilentlyContinue
        if ($vmms -and $vmms.Status -eq 'Running') { 'true' } else { 'false' }
    "#;

    if let Ok(result) = run_powershell(service_script) {
        if result.to_lowercase() == "true" {
            return true;
        }
    }

    // Method 2: Check if vmcompute service exists (Hyper-V Host Compute Service)
    let vmcompute_script = r#"
        $vmcompute = Get-Service -Name 'vmcompute' -ErrorAction SilentlyContinue
        if ($vmcompute) { 'true' } else { 'false' }
    "#;

    if let Ok(result) = run_powershell(vmcompute_script) {
        if result.to_lowercase() == "true" {
            return true;
        }
    }

    // Method 3: Check registry key
    let registry_script = r#"
        $key = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Virtualization' -ErrorAction SilentlyContinue
        if ($key) { 'true' } else { 'false' }
    "#;

    run_powershell(registry_script)
        .map(|s| s.to_lowercase() == "true")
        .unwrap_or(false)
}

/// Get Windows version and edition
fn get_os_info() -> (String, String) {
    let version_script = "(Get-CimInstance Win32_OperatingSystem).Version";
    let edition_script = "(Get-CimInstance Win32_OperatingSystem).Caption";

    let version = run_powershell(version_script).unwrap_or_else(|_| "Unknown".to_string());
    let edition = run_powershell(edition_script).unwrap_or_else(|_| "Unknown".to_string());

    (version, edition)
}

/// Get available memory in GB
fn get_available_memory() -> f64 {
    let script =
        "[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 2)";
    run_powershell(script)
        .ok()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0)
}

/// Get list of GPUs that support partitioning
fn get_gpu_list() -> Vec<GpuInfo> {
    let script = r#"
        Get-CimInstance Win32_VideoController | ForEach-Object {
            $name = $_.Name
            $driver = $_.DriverVersion
            # Check if GPU supports partitioning (NVIDIA, AMD, or Intel)
            $supports = $name -match 'NVIDIA|AMD|Intel'
            "$name|$driver|$supports"
        }
    "#;

    run_powershell(script)
        .map(|output| {
            output
                .lines()
                .filter_map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    if parts.len() >= 3 {
                        Some(GpuInfo {
                            name: parts[0].to_string(),
                            driver_version: parts[1].to_string(),
                            supports_partitioning: parts[2].to_lowercase() == "true",
                        })
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Validate system requirements and return issues
fn validate_system(os_edition: &str, hyper_v_enabled: bool, gpu_list: &[GpuInfo]) -> Vec<String> {
    let mut issues = Vec::new();

    // Check Windows edition
    let valid_editions = ["Pro", "Enterprise", "Education"];
    if !valid_editions.iter().any(|e| os_edition.contains(e)) {
        issues.push("Windows edition must be Pro, Enterprise, or Education".to_string());
    }

    // Check Hyper-V
    if !hyper_v_enabled {
        issues.push("Hyper-V is not enabled. Please enable it in Windows Features.".to_string());
    }

    // Check GPU
    if gpu_list.is_empty() {
        issues.push("No GPU detected".to_string());
    } else if !gpu_list.iter().any(|g| g.supports_partitioning) {
        issues.push(
            "No GPU with partitioning support detected (NVIDIA/AMD/Intel required)".to_string(),
        );
    }

    issues
}

/// Internal sync function to check system
fn check_system_sync() -> Result<SystemInfo, String> {
    let (os_version, os_edition) = get_os_info();
    let hyper_v_enabled = check_hyper_v();
    let gpu_list = get_gpu_list();
    let available_memory_gb = get_available_memory();
    let issues = validate_system(&os_edition, hyper_v_enabled, &gpu_list);

    Ok(SystemInfo {
        os_version,
        os_edition,
        hyper_v_enabled,
        gpu_list,
        available_memory_gb,
        issues,
    })
}

/// Tauri command to check system requirements (async to not block UI)
#[tauri::command]
pub async fn check_system() -> Result<SystemInfo, String> {
    tokio::task::spawn_blocking(check_system_sync)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

/// Test GPU partitioning in detail
fn test_gpu_partitioning_sync() -> Result<String, String> {
    let mut output = Vec::new();

    // Check for partitionable GPUs
    output.push("=== Kiểm tra GPU Partitioning ===".to_string());

    let gpu_script = r#"
        $gpus = Get-VMHostPartitionableGpu
        if ($gpus) {
            foreach ($gpu in $gpus) {
                "GPU: $($gpu.Name)"
                "  - CurrentPartitionCount: $($gpu.CurrentPartitionCount)"
                "  - TotalVRAM: $($gpu.TotalVRAM)"
                "  - AvailableVRAM: $($gpu.AvailableVRAM)"
                "  - PartitionId: $($gpu.PartitionId)"
            }
        } else {
            "ERROR: Không tìm thấy GPU nào hỗ trợ partitioning"
            "Kiểm tra các điều kiện sau:"
            "  1. GPU phải là NVIDIA, AMD hoặc Intel"
            "  2. Driver GPU phải cập nhật mới nhất"
            "  3. Hyper-V phải được bật"
        }
    "#;

    match run_powershell(gpu_script) {
        Ok(result) => {
            for line in result.lines() {
                output.push(line.to_string());
            }
        }
        Err(e) => {
            output.push(format!("ERROR: Không thể chạy lệnh: {}", e));
        }
    }

    output.push("".to_string());
    output.push("=== Kiểm tra Hyper-V GPU ===".to_string());

    // Check Hyper-V GPU settings
    let hyperv_gpu_script = r#"
        try {
            $hostGpu = Get-VMHostPartitionableGpu -ErrorAction Stop
            if ($hostGpu) {
                "Tìm thấy $($hostGpu.Count) GPU hỗ trợ partitioning"
                foreach ($g in $hostGpu) {
                    "  - $($g.Name)"
                }
            } else {
                "WARNING: Get-VMHostPartitionableGpu trả về rỗng"
            }
        } catch {
            "ERROR: $($_.Exception.Message)"
        }
    "#;

    match run_powershell(hyperv_gpu_script) {
        Ok(result) => {
            for line in result.lines() {
                output.push(line.to_string());
            }
        }
        Err(e) => {
            output.push(format!("ERROR: {}", e));
        }
    }

    output.push("".to_string());
    output.push("=== Kiểm tra VMs với GPU ===".to_string());

    // Check VMs with GPU
    let vm_gpu_script = r#"
        $vms = Get-VM
        foreach ($vm in $vms) {
            $gpuAdapter = Get-VMGpuPartitionAdapter -VMName $vm.Name -ErrorAction SilentlyContinue
            if ($gpuAdapter) {
                "VM '$($vm.Name)' có GPU partition"
                "  - State: $($vm.State)"
            }
        }
        if (-not $vms) {
            "Không có VM nào"
        }
    "#;

    match run_powershell(vm_gpu_script) {
        Ok(result) => {
            for line in result.lines() {
                if !line.trim().is_empty() {
                    output.push(line.to_string());
                }
            }
        }
        Err(e) => {
            output.push(format!("ERROR: {}", e));
        }
    }

    Ok(output.join("\n"))
}

/// Tauri command to test GPU partitioning
#[tauri::command]
pub async fn test_gpu_partitioning() -> Result<String, String> {
    tokio::task::spawn_blocking(test_gpu_partitioning_sync)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
