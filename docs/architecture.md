# Hyper-V GPU Passthrough GUI - Architecture Document

## 📋 Tổng quan dự án

Một công cụ GUI nhẹ để tự động hóa việc tạo máy ảo Windows trên Hyper-V với hỗ trợ GPU Passthrough (GPU-PV).

### Tham khảo

- [Easy-GPU-PV](https://github.com/jamesstringer90/Easy-GPU-PV) - Script PowerShell gốc

---

## 🛠️ Tech Stack: Tauri

```
┌─────────────────────────────────────────────────────────────┐
│                        Tauri App (~10-15MB)                 │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Frontend (React + TypeScript + Vite)         │   │
│  │  - WebView2 (Edge Chromium)                          │   │
│  │  - Tailwind CSS                                      │   │
│  │  - shadcn/ui components                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ▲                                │
│                            │ Tauri IPC (invoke/events)      │
│                            ▼                                │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Backend (Rust)                       │   │
│  │  - PowerShell execution (std::process::Command)     │   │
│  │  - Windows API (windows-rs crate)                   │   │
│  │  - Hyper-V WMI queries                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │      PowerShell Scripts      │
              │  (embedded hoặc external)    │
              └─────────────────────────────┘
```

### Tại sao chọn Tauri?

| Tiêu chí     | Tauri             | Electron   |
| ------------ | ----------------- | ---------- |
| Bundle size  | ~10-15MB          | ~150MB     |
| RAM usage    | ~30-50MB          | ~150-300MB |
| Startup time | <1s               | 2-3s       |
| Security     | Sandbox mặc định  | Cần config |
| Native API   | Rust + windows-rs | Node.js    |

---

## 📁 Cấu trúc thư mục

```
hyper-v-gpu/
├── docs/
│   ├── idea.md
│   └── architecture.md
├── src/                         # Frontend (React)
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── SystemCheck.tsx      # Kiểm tra yêu cầu hệ thống
│   │   ├── VMForm.tsx           # Form tạo/cập nhật VM
│   │   ├── GPUSelector.tsx      # Chọn GPU và % phân bổ
│   │   ├── VMList.tsx           # Danh sách VM
│   │   ├── VMEditModal.tsx      # Modal chỉnh sửa VM
│   │   └── ProgressModal.tsx    # Progress khi tạo VM
│   ├── hooks/
│   │   └── useTauriCommand.ts   # Wrapper cho Tauri invoke
│   ├── lib/
│   │   └── utils.ts
│   └── styles/
│       └── index.css
├── src-tauri/                   # Backend (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── main.rs              # Entry point
│   │   ├── lib.rs
│   │   ├── commands/            # Tauri commands (IPC)
│   │   │   ├── mod.rs
│   │   │   ├── system.rs        # System check commands
│   │   │   ├── vm.rs            # VM management commands
│   │   │   └── gpu.rs           # GPU commands
│   │   ├── services/
│   │   │   ├── mod.rs
│   │   │   ├── powershell.rs    # Execute PowerShell scripts
│   │   │   └── hyperv.rs        # Hyper-V WMI integration
│   │   └── models/
│   │       ├── mod.rs
│   │       ├── vm.rs
│   │       └── gpu.rs
│   └── scripts/                 # PowerShell scripts (embedded)
│       ├── PreChecks.ps1
│       ├── CreateVM.ps1
│       ├── ConfigureGPU.ps1
│       └── UpdateDrivers.ps1
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## 🔧 Core Features

### 1. System Checker

```typescript
// Frontend call
const systemInfo = await invoke<SystemInfo>("check_system");

interface SystemInfo {
  osVersion: string;
  osEdition: string; // Pro/Enterprise/Education
  hyperVEnabled: boolean;
  gpuList: GPUInfo[];
  availableMemoryGB: number;
  issues: string[]; // Danh sách vấn đề cần fix
}

interface GPUInfo {
  name: string;
  driverVersion: string;
  supportsPartitioning: boolean;
}
```

### 2. VM Creation

```typescript
interface VMConfig {
  name: string;
  isoPath: string;
  diskSizeGB: number;
  memoryGB: number;
  cpuCores: number;
  username: string;
  password: string;
  autoLogon: boolean;
}

// Frontend
await invoke("create_vm", { config: vmConfig });
```

### 3. GPU Assignment

```typescript
interface GPUAssignment {
  vmName: string;
  gpuName: string; // or "AUTO"
  allocationPercent: number; // 10-100
}

await invoke("assign_gpu", { assignment });
```

### 4. VM Update

```typescript
interface VMUpdateConfig {
  vmName: string; // Tên VM cần update (không đổi)
  memoryGB?: number; // Cập nhật RAM
  cpuCores?: number; // Cập nhật CPU
  gpuName?: string; // Thay đổi GPU
  gpuAllocationPercent?: number; // Thay đổi % GPU
}

// Frontend
await invoke("update_vm", { config: updateConfig });

// Lưu ý: VM phải ở trạng thái OFF để update
```

---

## 🔌 Tauri Commands (Rust Backend)

```rust
// src-tauri/src/commands/vm.rs

#[tauri::command]
pub async fn create_vm(config: VMConfig) -> Result<String, String> {
    // 1. Validate config
    // 2. Execute PowerShell script
    // 3. Return VM ID or error
}

#[tauri::command]
pub async fn list_vms() -> Result<Vec<VMInfo>, String> {
    // Query Hyper-V via WMI/PowerShell
}

#[tauri::command]
pub async fn start_vm(name: String) -> Result<(), String> {
    execute_powershell(&format!("Start-VM -Name '{}'", name))
}

#[tauri::command]
pub async fn stop_vm(name: String) -> Result<(), String> {
    execute_powershell(&format!("Stop-VM -Name '{}' -Force", name))
}

#[tauri::command]
pub async fn update_vm(config: VMUpdateConfig) -> Result<(), String> {
    // 1. Check VM is stopped
    // 2. Update memory if provided
    if let Some(memory) = config.memory_gb {
        execute_powershell(&format!(
            "Set-VMMemory -VMName '{}' -StartupBytes {}GB",
            config.vm_name, memory
        ))?;
    }
    // 3. Update CPU if provided
    if let Some(cpu) = config.cpu_cores {
        execute_powershell(&format!(
            "Set-VMProcessor -VMName '{}' -Count {}",
            config.vm_name, cpu
        ))?;
    }
    // 4. Update GPU partition if provided
    // Uses Update-VMGpuPartitionDriver.ps1
    Ok(())
}

#[tauri::command]
pub async fn get_vm_config(name: String) -> Result<VMConfig, String> {
    // Get current VM configuration for editing
}
```

---

## 📱 UI Flow

```
┌─────────────────────────────────────────────┐
│              SYSTEM CHECK                   │
│  ┌─────────────────────────────────────┐   │
│  │ ✓ Windows 11 Pro                    │   │
│  │ ✓ Hyper-V enabled                   │   │
│  │ ✓ GPU: NVIDIA RTX 3080              │   │
│  │ ✓ 32GB RAM available                │   │
│  └─────────────────────────────────────┘   │
│                [Continue →]                 │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│              CREATE NEW VM                  │
│  ┌─────────────────────────────────────┐   │
│  │ VM Name: [GPU-VM-1        ]         │   │
│  │ ISO:     [C:\Win11.iso    ] [Browse]│   │
│  │ Disk:    [====40GB====]             │   │
│  │ RAM:     [====8GB=====]             │   │
│  │ CPU:     [4 cores     ▼]            │   │
│  ├─────────────────────────────────────┤   │
│  │ GPU:     [NVIDIA RTX 3080 ▼]        │   │
│  │ GPU %:   [=====50%=====]            │   │
│  ├─────────────────────────────────────┤   │
│  │ Username: [GPUVM          ]         │   │
│  │ Password: [••••••••••     ]         │   │
│  │ □ Auto Login                        │   │
│  └─────────────────────────────────────┘   │
│        [Cancel]          [Create VM]        │
└─────────────────────────────────────────────┘
```

---

## 📦 Dependencies

### Frontend (package.json)

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0",
    "@vitejs/plugin-react": "^4",
    "tailwindcss": "^3",
    "typescript": "^5",
    "vite": "^5"
  }
}
```

### Backend (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
windows = { version = "0.52", features = ["Win32_System_Com"] }
```

---

## 🚀 Roadmap

### Phase 1: Setup & Basic UI

- [ ] Khởi tạo Tauri project
- [ ] Setup React + Tailwind + shadcn/ui
- [ ] System check UI component
- [ ] Basic PowerShell execution từ Rust

### Phase 2: VM Creation

- [ ] VM creation form
- [ ] Integrate PowerShell scripts từ Easy-GPU-PV
- [ ] Progress tracking với events
- [ ] Error handling

### Phase 3: GPU & Management

- [ ] GPU detection và selection
- [ ] GPU partition configuration
- [ ] VM list với status
- [ ] Start/Stop/Delete VM
- [ ] Update VM (RAM, CPU, GPU settings)

### Phase 4: Polish

- [ ] Driver update feature
- [ ] Settings/preferences
- [ ] Dark/Light theme
- [ ] Installer (NSIS/WiX)

---

## ⚠️ Yêu cầu hệ thống

- Windows 10/11 Pro, Enterprise, hoặc Education
- Hyper-V enabled
- GPU hỗ trợ partitioning (NVIDIA/AMD/Intel integrated)
- Administrator privileges
- WebView2 Runtime (đi kèm Windows 11, cần cài cho Windows 10)

---

## 🔐 Quyền và Security

1. **Run as Administrator** - Bắt buộc để tạo VM và cấu hình GPU
2. **PowerShell Execution Policy** - Cần allow scripts
3. **Tauri Security** - CSP headers mặc định, chỉ allow cần thiết
