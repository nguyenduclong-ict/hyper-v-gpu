mod commands;

use commands::{
    cancel_create_vm, check_system, connect_vm_rdp, connect_vm_rdp_native, create_vm, delete_vm,
    get_default_vhd_path, get_host_drives, get_network_switches, get_vm_ip, is_admin, list_vms,
    load_vm_settings, restart_as_admin, save_vm_settings, start_vm, stop_vm, test_gpu_partitioning,
    update_vm, update_vm_config, validate_vm_config, ProvisioningState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(not(debug_assertions))]
            {
                if !commands::utils::is_admin_sync() {
                    let _ = commands::utils::restart_as_admin_sync();
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ProvisioningState::default())
        .invoke_handler(tauri::generate_handler![
            check_system,
            get_network_switches,
            get_default_vhd_path,
            validate_vm_config,
            create_vm,
            cancel_create_vm,
            delete_vm,
            list_vms,
            start_vm,
            stop_vm,
            update_vm,
            test_gpu_partitioning,
            update_vm_config,
            connect_vm_rdp,
            connect_vm_rdp_native,
            get_vm_ip,
            load_vm_settings,
            save_vm_settings,
            is_admin,
            restart_as_admin,
            get_host_drives
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
