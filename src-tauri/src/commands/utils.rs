use std::os::windows::process::CommandExt;
use std::process::Command;

/// Execute a PowerShell command and return the output
/// UTF-8 encoding is automatically set for proper character handling
pub fn run_powershell(script: &str) -> Result<String, String> {
    // Wrap script with UTF-8 encoding setup
    let utf8_script = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}",
        script
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &utf8_script,
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            Err(stderr)
        }
    }
}

/// Spawn a PowerShell command and return the Child process
/// This allows for streaming output and cancellation
pub fn spawn_powershell(script: &str) -> std::io::Result<std::process::Child> {
    // Wrap script with UTF-8 encoding setup
    let utf8_script = format!(
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; {}",
        script
    );

    Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &utf8_script,
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .spawn()
}

pub fn is_admin_sync() -> bool {
    // Check if running as admin using PowerShell
    let script = "([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)";
    match run_powershell(script) {
        Ok(output) => output.trim().to_lowercase() == "true",
        Err(_) => false,
    }
}

pub fn restart_as_admin_sync() -> Result<(), String> {
    let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;

    // Use PowerShell Start-Process -Verb RunAs to relaunch
    let script = format!(
        "Start-Process -FilePath '{}' -Verb RunAs",
        current_exe.to_string_lossy()
    );

    // We run this and don't wait for output, as the current process should exit shortly after
    let _ = run_powershell(&script);

    std::process::exit(0);
}

#[tauri::command]
pub async fn is_admin() -> bool {
    is_admin_sync()
}

#[tauri::command]
pub async fn restart_as_admin() -> Result<(), String> {
    restart_as_admin_sync()
}

#[tauri::command]
pub async fn get_host_drives() -> Result<Vec<String>, String> {
    // Get list of local fixed disks (DriveType = 3)
    let script = "Get-CimInstance -ClassName Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 } | Select-Object -ExpandProperty DeviceID";
    let output = run_powershell(script)?;

    // Parse output lines into vector
    let drives = output
        .lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    Ok(drives)
}
