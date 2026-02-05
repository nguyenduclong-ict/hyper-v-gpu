use std::path::Path;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

// Only import what we strictly need from windows to avoid type confusion
use windows::core::PCWSTR;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetMenuItemCount, GetMenuItemID, GetMenuStringW, GetSubMenu, GetSystemMenu,
    GetSystemMetrics, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible, PostMessageW,
    SetWindowPos, HWND_TOP, MF_BYPOSITION, SM_CXSCREEN, SM_CYSCREEN, SWP_NOSIZE, SWP_NOZORDER,
    WM_SYSCOMMAND,
};

/// Structure to automate RDP client interaction
pub struct RdpAutomator;

impl RdpAutomator {
    /// Launch mstsc.exe with the given .rdp file and attempt to set the zoom level.
    pub fn launch_with_zoom(rdp_file: &Path, zoom_level: u32) -> Result<(), String> {
        // 1. Launch mstsc.exe
        let child = Command::new("mstsc")
            .arg(rdp_file.as_os_str())
            .spawn()
            .map_err(|e| format!("Failed to launch mstsc: {}", e))?;

        let target_pid = child.id();

        // 2. Spawn a background thread to handle the Window Finding & Zooming
        // We do this in a thread so we don't block the main Tauri command
        thread::spawn(move || {
            Self::wait_and_zoom(target_pid, zoom_level);
        });

        Ok(())
    }

    fn wait_and_zoom(target_pid: u32, zoom_level: u32) {
        let start = Instant::now();
        let timeout = Duration::from_secs(30);

        println!("[RDP] Waiting for mstsc window (PID: {})...", target_pid);

        while start.elapsed() < timeout {
            if let Some(hwnd) = Self::find_main_window(target_pid) {
                println!("[RDP] Found window HWND: {:?}", hwnd);

                // Slight delay to ensure UI is ready
                thread::sleep(Duration::from_millis(1500));

                if Self::apply_zoom(hwnd, zoom_level) {
                    println!("[RDP] Zoom applied successfully.");

                    // Wait for resize to happen
                    thread::sleep(Duration::from_millis(500));

                    // Center the window
                    Self::center_window(hwnd);
                    return;
                } else {
                    println!("[RDP] Failed to apply zoom (maybe menu not found yet). Retrying...");
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
        println!("[RDP] Timeout waiting for window or zoom.");
    }

    fn find_main_window(process_id: u32) -> Option<HWND> {
        let class_name = "TscShellContainerClass";
        let class_name_wide: Vec<u16> = class_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let class_pcwstr = PCWSTR(class_name_wide.as_ptr());

        let mut current_hwnd = HWND(0 as _);

        unsafe {
            loop {
                // FindWindowExW returns Result<HWND> or HWND. We ignore errors.
                let next_hwnd_result =
                    FindWindowExW(HWND(0 as _), current_hwnd, class_pcwstr, PCWSTR::null());

                // Handle both Result and direct return if crate version differs, but assuming Result based on errors.
                let next_hwnd = match next_hwnd_result {
                    Ok(h) => h,
                    Err(_) => break,
                };

                if next_hwnd.0 == 0 as _ {
                    break;
                }
                current_hwnd = next_hwnd;

                let mut pid: u32 = 0;
                GetWindowThreadProcessId(current_hwnd, Some(&mut pid));

                if pid == process_id && IsWindowVisible(current_hwnd).as_bool() {
                    return Some(current_hwnd);
                }
            }
        }
        None
    }

    fn apply_zoom(hwnd: HWND, zoom_level: u32) -> bool {
        unsafe {
            let h_sys_menu = GetSystemMenu(hwnd, BOOL(0)); // Revert=FALSE
            if h_sys_menu.0 == 0 as _ {
                return false;
            }

            let count = GetMenuItemCount(h_sys_menu);
            if count == -1 {
                return false;
            }

            for i in 0..count {
                let mut buf = [0u16; 256];

                // GetMenuStringW returns i32 count
                let len = GetMenuStringW(h_sys_menu, i as u32, Some(&mut buf), MF_BYPOSITION);

                if len == 0 {
                    continue;
                }

                let menu_text = String::from_utf16_lossy(&buf[0..len as usize]);
                let menu_lower = menu_text.to_lowercase();

                if menu_lower.contains("zoom") || menu_lower.contains("thu ph") {
                    println!("[RDP] Found Zoom menu at index {}", i);

                    let h_sub_menu = GetSubMenu(h_sys_menu, i as i32);
                    if h_sub_menu.0 == 0 as _ {
                        continue;
                    }

                    let sub_count = GetMenuItemCount(h_sub_menu);
                    let target_str = format!("{}%", zoom_level);

                    for j in 0..sub_count {
                        let mut sub_buf = [0u16; 256];
                        let sub_len =
                            GetMenuStringW(h_sub_menu, j as u32, Some(&mut sub_buf), MF_BYPOSITION);
                        let sub_text = String::from_utf16_lossy(&sub_buf[0..sub_len as usize]);

                        if sub_text.contains(&target_str) {
                            let cmd_id = GetMenuItemID(h_sub_menu, j as i32);
                            println!(
                                "[RDP] Found Zoom Level {}% (ID: {}). Executing...",
                                zoom_level, cmd_id
                            );

                            // Send WM_SYSCOMMAND
                            let _ = PostMessageW(
                                hwnd,
                                WM_SYSCOMMAND,
                                WPARAM(cmd_id as usize),
                                LPARAM(0),
                            );
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn center_window(hwnd: HWND) {
        unsafe {
            let screen_w = GetSystemMetrics(SM_CXSCREEN);
            let screen_h = GetSystemMetrics(SM_CYSCREEN);

            let mut rect = windows::Win32::Foundation::RECT::default();
            let _ = GetWindowRect(hwnd, &mut rect);

            let window_w = rect.right - rect.left;
            let window_h = rect.bottom - rect.top;

            let x = (screen_w - window_w) / 2;
            let y = (screen_h - window_h) / 2;

            // Ensure we don't put it off-screen top/left
            let x = if x < 0 { 0 } else { x };
            let y = if y < 0 { 0 } else { y };

            println!("[RDP] Centering window to ({}, {})", x, y);

            let _ = SetWindowPos(hwnd, HWND_TOP, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
        }
    }
}
