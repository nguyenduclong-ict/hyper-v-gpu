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
