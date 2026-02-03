mod commands;

use commands::{
    cancel_create_vm, check_system, connect_vm_rdp, create_vm, delete_vm, get_default_vhd_path,
    get_network_switches, list_vms, start_vm, stop_vm, test_gpu_partitioning, update_vm,
    update_vm_config, validate_vm_config, ProvisioningState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            connect_vm_rdp
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
