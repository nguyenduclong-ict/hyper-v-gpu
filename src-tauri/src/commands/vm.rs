use super::utils::{run_powershell, spawn_powershell};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State, Window};

/// Shared state for tracking VM provisioning process
pub struct ProvisioningState {
    // Current running process ID for cancellation
    pub current_pid: Arc<Mutex<Option<u32>>>,
}

impl Default for ProvisioningState {
    fn default() -> Self {
        Self {
            current_pid: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct VMConfig {
    name: String,
    disk_size_gb: u32,
    memory_gb: u32,
    cpu_cores: u32,
    iso_path: String,
    tpm_enabled: bool,
    secure_boot: bool,
    network_switch: String,
    gpu_name: String,
    vhd_path: String,
    gpu_allocation_percent: u32,
    username: String,
    password: String,
    auto_logon: bool,
}

#[derive(Serialize)]
pub struct VMProgress {
    step: u32,
    total_steps: u32,
    message: String,
    completed: bool,
    error: Option<String>,
}

#[derive(Serialize)]
pub struct VMInfo {
    name: String,
    state: String,
    cpu_usage: u32,
    memory_assigned_mb: u64,
    uptime: String,
    has_gpu: bool,
    cpu_cores: u32,
    network_switch: String,
}

#[derive(serde::Serialize)]
pub struct NetworkSwitch {
    name: String,
    switch_type: String,
}

#[tauri::command]
pub async fn get_network_switches() -> Result<Vec<NetworkSwitch>, String> {
    let script = r#"
    Get-VMSwitch | Select-Object Name, SwitchType | ForEach-Object {
        "$($_.Name)|$($_.SwitchType)"
    }
    "#;
    let output = run_powershell(script)?;

    let switches = output
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 2 {
                Some(NetworkSwitch {
                    name: parts[0].trim().to_string(),
                    switch_type: parts[1].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(switches)
}

#[tauri::command]
pub async fn get_default_vhd_path() -> Result<String, String> {
    let output = run_powershell("Get-VMHost | Select-Object -ExpandProperty VirtualHardDiskPath")?;
    let path = output.trim().to_string();
    if path.is_empty() {
        Ok("C:\\Users\\Public\\Documents\\Hyper-V\\Virtual Hard Disks\\".to_string())
    } else {
        Ok(path)
    }
}

#[tauri::command]
pub async fn validate_vm_config(config: VMConfig) -> Result<(), String> {
    if config.name.is_empty() {
        return Err("VM Name is required".to_string());
    }
    // Basic validation
    Ok(())
}

#[tauri::command]
pub async fn update_vm(_name: String, _config: VMConfig) -> Result<(), String> {
    // Placeholder for update logic if needed
    Ok(())
}

// Internal helper for checking resources before VM creation
fn check_vm_resources(
    name: &str,
    memory_mb: u32,
    disk_size_gb: u32,
    vhd_path: &str,
    iso_path: &str,
) -> Result<(), String> {
    // Simple basic checks
    if name.is_empty() {
        return Err("VM Name cannot be empty".to_string());
    }
    if memory_mb < 2048 {
        return Err("Minimum memory is 2GB".to_string());
    }
    if disk_size_gb < 20 {
        return Err("Minimum disk size is 20GB".to_string());
    }

    // Check paths
    let vhd_dir = Path::new(vhd_path);
    if !vhd_dir.exists() {
        return Err(format!("VHD Path does not exist: {}", vhd_path));
    }

    let iso = Path::new(iso_path);
    if !iso.exists() {
        return Err(format!("ISO Path does not exist: {}", iso_path));
    }

    Ok(())
}

#[tauri::command]
pub async fn create_vm(
    window: Window,
    state: State<'_, ProvisioningState>,
    config: VMConfig,
) -> Result<VMProgress, String> {
    // 1. Check resources
    check_vm_resources(
        &config.name,
        config.memory_gb * 1024,
        config.disk_size_gb,
        &config.vhd_path,
        &config.iso_path,
    )?;

    // 2. Prepare the provision script (copy deps + patch params)
    let script_path = prepare_provision_script(&config)?;

    // 3. Execute script
    let _ = window.emit(
        "vm-log",
        format!("Starting provisioning for VM: {}...", config.name),
    );

    // We execute the PATCHED script path directly.
    // It is already a full path to a .ps1 file.
    let exec_command = format!(r#"& "{}""#, script_path);

    let mut child =
        spawn_powershell(&exec_command).map_err(|e| format!("Failed to spawn process: {}", e))?;
    let pid = child.id();

    {
        let mut lock = state.current_pid.lock().unwrap();
        *lock = Some(pid);
    }

    let pid_clone = state.current_pid.clone();

    // Stream output
    let result = tokio::task::spawn_blocking(move || {
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

        // Spawn a thread to read stderr to prevent deadlocks and capture errors
        let window_clone = window.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = window_clone.emit("vm-log", format!("[ERROR] {}", l));
                }
            }
        });

        let reader = BufReader::new(stdout);
        let mut success = false;
        let mut final_result: Result<(), String> = Err("Process exited unexpectedly".to_string());

        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let _ = window.emit("vm-log", &l);
                    if l.contains("PROVISION_SUCCESS") {
                        success = true;
                    }
                    if l.contains("PROVISION_FAILED") {
                        final_result = Err(format!("Provisioning failed: {}", l));
                    }
                }
                Err(e) => {
                    let _ = window.emit("vm-log", format!("Error reading log: {}", e));
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed to wait on child: {}", e))?;

        if success && status.success() {
            Ok(VMProgress {
                step: 1,
                total_steps: 1,
                message: "VM Provisioned Successfully!".to_string(),
                completed: true,
                error: None,
            })
        } else if let Err(e) = final_result {
            Err(e)
        } else {
            Err(format!(
                "Provisioning process exited with code: {:?}",
                status.code()
            ))
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?;

    {
        let mut lock = pid_clone.lock().unwrap();
        *lock = None;
    }

    result
}

fn prepare_provision_script(config: &VMConfig) -> Result<String, String> {
    // 1. Identify source path for dependencies (Easy-GPU-PV folder)
    let possible_paths = vec![
        "src-tauri/src/commands/easy-gpu-pv",
        "src/commands/easy-gpu-pv",
        "easy-gpu-pv",
        "../src-tauri/src/commands/easy-gpu-pv",
    ];

    let base_path = possible_paths
        .iter()
        .map(|p| Path::new(p))
        .find(|p| p.exists())
        .ok_or_else(|| {
            format!(
                "Could not find 'easy-gpu-pv' dependency directory. Checked: {:?}",
                possible_paths
            )
        })?;

    println!("DEBUG: Found easy-gpu-pv at: {:?}", base_path);
    let template_check = base_path.join("CopyFilesToVM.template.ps1");
    println!(
        "DEBUG: Template exists at source? {}",
        template_check.exists()
    );

    // 2. Create unique staging directory
    let temp_dir = env::temp_dir()
        .join("HyperV_GPU_Provisioning")
        .join(&config.name);
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| format!("Failed to clean temp dir: {}", e))?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    // 3. Copy ALL dependencies recursively
    copy_dir_recursive(base_path, &temp_dir)
        .map_err(|e| format!("Failed to copy dependencies: {}", e))?;

    // 4. Patch autounattend.xml from Template
    let xml_template_path = temp_dir.join("autounattend.template.xml");
    if xml_template_path.exists() {
        let mut content = fs::read_to_string(&xml_template_path)
            .map_err(|e| format!("Failed to read xml template: {}", e))?;
        content = content.replace("__USERNAME__", &config.username);
        content = content.replace("__PASSWORD__", &config.password);

        let xml_path = temp_dir.join("autounattend.xml");
        fs::write(&xml_path, content).map_err(|e| format!("Failed to write xml: {}", e))?;
    } else {
        return Err("autounattend.template.xml not found in dependency directory".to_string());
    }

    // 5. Patch CopyFilesToVM.ps1 from Template
    // We look for the template file in the temp dir (since we copied everything)
    let template_path = temp_dir.join("CopyFilesToVM.template.ps1");

    let script_content_template = if template_path.exists() {
        fs::read_to_string(&template_path)
            .map_err(|e| format!("Failed to read template script: {}", e))?
    } else {
        return Err("CopyFilesToVM.template.ps1 not found in dependency directory".to_string());
    };

    // Perform Replacements
    let mut script_content = script_content_template
        .replace("__VM_NAME__", &config.name)
        .replace("__ISO_PATH__", &config.iso_path)
        .replace("__VHD_PATH__", &config.vhd_path) // Directory path
        .replace("__DISK_SIZE_GB__", &config.disk_size_gb.to_string())
        .replace("__MEMORY_GB__", &config.memory_gb.to_string())
        .replace("__CPU_COUNT__", &config.cpu_cores.to_string())
        .replace("__GPU_NAME__", &config.gpu_name)
        .replace("__SWITCH_NAME__", &config.network_switch)
        .replace("__USERNAME__", &config.username)
        .replace("__PASSWORD__", &config.password)
        .replace("__AUTO_LOGON__", &config.auto_logon.to_string())
        .replace(
            "__GPU_ALLOCATION_PERCENT__",
            &config.gpu_allocation_percent.to_string(),
        );

    // Patch known issues for headless execution (still needed as they are code logic, not params)
    script_content = script_content.replace("Read-host", "# Read-host");
    script_content = script_content.replace("^[a-zA-Z0-9]+$", ".");
    script_content = script_content.replace(
        "$params.VMName.Length -gt 15",
        "$params.VMName.Length -gt 100",
    );

    // Add success marker at the end
    script_content.push_str("\nWrite-Host 'PROVISION_SUCCESS'");

    // Write to the actual script name expected by everything
    let script_path = temp_dir.join("CopyFilesToVM.ps1");
    fs::write(&script_path, script_content)
        .map_err(|e| format!("Failed to write patched script: {}", e))?;

    Ok(script_path.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_create_vm(
    state: State<'_, ProvisioningState>,
    name: String,
) -> Result<(), String> {
    let pid_opt = state.current_pid.lock().unwrap().take();
    if let Some(pid) = pid_opt {
        let kill_cmd = format!("taskkill /PID {} /T /F", pid);
        let _ = run_powershell(&kill_cmd);
    }

    // Helper functionality for cleanup could be expanded here.
    // Currently relying on Remove-VM which might fail if VM wasn't created yet or halfway.
    let cleanup_script = format!(
        r#"
        $vmName = '{}'
        Remove-VM -Name $vmName -Force -ErrorAction SilentlyContinue
        "#,
        name
    );
    let _ = run_powershell(&cleanup_script);
    Ok(())
}

/// Get list of all VMs
#[tauri::command]
pub async fn list_vms() -> Result<Vec<VMInfo>, String> {
    let parts_approach = run_powershell(
        r#"
        Get-VM | ForEach-Object {
            $gpu = Get-VMGpuPartitionAdapter -VMName $_.Name -ErrorAction SilentlyContinue
            $hasGpu = if ($gpu) { "true" } else { "false" }
            $switch = (Get-VMNetworkAdapter -VM $_).SwitchName
            if (-not $switch) { $switch = "None" }
            $mem = Get-VMMemory -VMName $_.Name
            "$($_.Name)|$($_.State)|$($_.CpuUsage)|$($mem.Startup)|$($_.Uptime)|$hasGpu|$($_.ProcessorCount)|$switch"
        }
        "#,
    )?;

    let vms: Vec<VMInfo> = parts_approach
        .lines()
        .filter_map(|line| {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 8 {
                Some(VMInfo {
                    name: parts[0].trim().to_string(),
                    state: parts[1].trim().to_string(),
                    cpu_usage: parts[2].parse::<u32>().unwrap_or(0),
                    memory_assigned_mb: parts[3].parse::<u64>().unwrap_or(0) / 1024 / 1024,
                    uptime: parts[4].trim().to_string(),
                    has_gpu: parts[5].trim() == "true",
                    cpu_cores: parts[6].parse::<u32>().unwrap_or(0),
                    network_switch: parts[7].trim().to_string(),
                })
            } else {
                None
            }
        })
        .collect();

    Ok(vms)
}

#[tauri::command]
pub async fn start_vm(name: String) -> Result<(), String> {
    run_powershell(&format!("Start-VM -Name '{}'", name))?;
    Ok(())
}

#[tauri::command]
pub async fn stop_vm(name: String) -> Result<(), String> {
    run_powershell(&format!("Stop-VM -Name '{}' -Force", name))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_vm(name: String) -> Result<(), String> {
    run_powershell(&format!("Remove-VM -Name '{}' -Force", name))?;
    Ok(())
}

#[derive(Serialize, Deserialize)]
pub struct VMUpdateConfig {
    name: String,
    gpu_name: String,
    gpu_allocation_percent: u32,
    cpu_count: u32,
    memory_mb: u64,
    network_switch: String,
}

#[tauri::command]
pub async fn update_vm_config(window: Window, config: VMUpdateConfig) -> Result<String, String> {
    // 1. Locate the script
    let possible_paths = vec![
        "src-tauri/src/commands/easy-gpu-pv/Update-VMConfig.ps1",
        "src/commands/easy-gpu-pv/Update-VMConfig.ps1",
        "easy-gpu-pv/Update-VMConfig.ps1",
        "../src-tauri/src/commands/easy-gpu-pv/Update-VMConfig.ps1",
    ];

    let script_path = possible_paths
        .iter()
        .map(|p| Path::new(p))
        .find(|p| p.exists())
        .ok_or_else(|| "Could not find Update-VMConfig.ps1 script".to_string())?;

    let abs_path = fs::canonicalize(script_path)
        .map_err(|e| format!("Failed to resolve script path: {}", e))?;

    // 2. Build Command
    let command = format!(
        r#"& "{}" -VMName "{}" -GPUName "{}" -GPUResourceAllocationPercentage {} -ProcessorCount {} -MemoryMB {} -NetworkSwitch "{}""#,
        abs_path.to_string_lossy(),
        config.name,
        config.gpu_name,
        config.gpu_allocation_percent,
        config.cpu_count,
        config.memory_mb,
        config.network_switch
    );

    let _ = window.emit(
        "vm-log",
        format!("Starting Configuration Update for VM: {}...", config.name),
    );

    // 3. Execute with Streaming (spawn_powershell)
    let mut child =
        spawn_powershell(&command).map_err(|e| format!("Failed to spawn process: {}", e))?;

    let result = tokio::task::spawn_blocking(move || {
        let stdout = child.stdout.take().ok_or("Failed to open stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to open stderr")?;

        // Spawn a thread to read stderr
        let window_clone = window.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = window_clone.emit("vm-log", format!("[ERROR] {}", l));
                }
            }
        });

        let reader = BufReader::new(stdout);
        let mut success = false;

        for line in reader.lines() {
            match line {
                Ok(l) => {
                    let _ = window.emit("vm-log", &l);
                    if l.contains("UPDATE_SUCCESS") {
                        success = true;
                    }
                }
                Err(e) => {
                    let _ = window.emit("vm-log", format!("Error reading log: {}", e));
                }
            }
        }

        let status = child
            .wait()
            .map_err(|e| format!("Failed to wait on child: {}", e))?;

        if success && status.success() {
            Ok("VM Configuration Updated Successfully".to_string())
        } else {
            Err(format!(
                "Update process failed (Exit Code: {:?}). Check logs for details.",
                status.code()
            ))
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))??;

    Ok(result)
}

#[tauri::command]
pub async fn connect_vm_rdp(name: String) -> Result<(), String> {
    // We switch back to using 'vmconnect.exe' (Hyper-V Manager Console).
    // This connects via VMBus, so it works without network/IP/Firewall configuration.
    // Ideally, this provides the most reliable "just works" experience for local VMs.

    std::process::Command::new("vmconnect")
        .arg("localhost")
        .arg(&name)
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to launch vmconnect: {}. Make sure Hyper-V Management Tools are installed.",
                e
            )
        })?;

    Ok(())
}
