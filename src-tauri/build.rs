fn main() {
    tauri_build::build();
    println!("cargo:rustc-link-arg-bins=/MANIFESTUAC:level='requireAdministrator'");
}
