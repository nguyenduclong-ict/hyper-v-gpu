import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useLog } from "@/contexts/LogContext";
import { VMCreationModal } from "./VMCreationModal";
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Slider,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui";
import {
  HardDrive,
  Cpu,
  MemoryStick,
  Monitor,
  User,
  Lock,
  FolderOpen,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

interface NetworkSwitch {
  name: string;
  switch_type: string;
}

interface GpuInfo {
  name: string;
  driver_version: string;
  supports_partitioning: boolean;
}

interface SystemInfo {
  gpu_list: GpuInfo[];
}

interface VMConfig {
  name: string;
  iso_path: string;
  disk_size_gb: number;
  memory_gb: number;
  cpu_cores: number;
  vhd_path: string;
  network_switch: string;
  username: string;
  password: string;
  auto_logon: boolean;
  gpu_name: string;
  gpu_allocation_percent: number;
  tpm_enabled: boolean;
  secure_boot: boolean;
}

interface VMProgress {
  step: number;
  total_steps: number;
  message: string;
  completed: boolean;
  error?: string;
}

export function VMForm() {
  const [config, setConfig] = useState<VMConfig>({
    name: "",
    iso_path: "",
    disk_size_gb: 60,
    memory_gb: 8,
    cpu_cores: 4,
    vhd_path: "",
    network_switch: "Default Switch",
    username: "GPUVM",
    password: "",
    auto_logon: true,
    gpu_name: "AUTO",
    gpu_allocation_percent: 50,
    tpm_enabled: true,
    secure_boot: true,
  });

  const [switches, setSwitches] = useState<NetworkSwitch[]>([]);
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const { addLog } = useLog();
  const [progress, setProgress] = useState<VMProgress | null>(null);

  // Creation Modal State
  const [showModal, setShowModal] = useState(false);
  const [creationLogs, setCreationLogs] = useState<string[]>([]);
  const [creationStatus, setCreationStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [creationError, setCreationError] = useState<string>();

  // Load initial data in parallel
  useEffect(() => {
    const loadData = async () => {
      setInitialLoading(true);

      // Load all data in parallel
      const results = await Promise.allSettled([
        invoke<NetworkSwitch[]>("get_network_switches"),
        invoke<SystemInfo>("check_system"),
        invoke<string>("get_default_vhd_path"),
      ]);

      // Process network switches
      if (results[0].status === "fulfilled") {
        const switchList = results[0].value;
        setSwitches(switchList);
        if (switchList.length > 0) {
          setConfig((prev) => ({
            ...prev,
            network_switch: switchList[0].name,
          }));
        }
      } else {
        setSwitches([{ name: "Default Switch", switch_type: "Internal" }]);
      }

      // Process GPU list
      if (results[1].status === "fulfilled") {
        const systemInfo = results[1].value;
        setGpuList(systemInfo.gpu_list.filter((g) => g.supports_partitioning));
      }

      // Process VHD path
      if (results[2].status === "fulfilled") {
        const vhdResult = results[2] as PromiseFulfilledResult<string>;
        setConfig((prev) => ({ ...prev, vhd_path: vhdResult.value }));
      }

      setInitialLoading(false);
    };
    loadData();
  }, []);

  const handleBrowseISO = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "ISO files", extensions: ["iso"] }],
      });
      if (selected) {
        setConfig((prev) => ({ ...prev, iso_path: selected as string }));
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const handleBrowseVHD = async () => {
    try {
      const selected = await open({
        directory: true,
      });
      if (selected) {
        setConfig((prev) => ({ ...prev, vhd_path: selected as string }));
      }
    } catch (err) {
      console.error("Failed to open folder dialog:", err);
    }
  };

  const handleValidate = async () => {
    try {
      await invoke("validate_vm_config", { config });
      setValidationErrors([]);
      return true;
    } catch (err) {
      setValidationErrors([err instanceof Error ? err.message : String(err)]);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setProgress(null);
    setValidationErrors([]);
    setCreationLogs([]);
    setCreationStatus("running");
    setCreationError(undefined);
    setShowModal(true);

    addLog("info", "VMForm", `Đang tạo VM: ${config.name}`);

    // Validate first
    const isValid = await handleValidate();
    if (!isValid) {
      addLog(
        "error",
        "VMForm",
        `Validation failed: ${validationErrors.join(", ")}`,
      );
      setLoading(false);
      setShowModal(false); // Close modal if validation fails immediately
      return;
    }

    let unlisten: (() => void) | undefined;

    try {
      // Setup log listener
      unlisten = await listen<string>("vm-log", (event) => {
        setCreationLogs((prev) => [...prev, event.payload]);
      });

      addLog("info", "VMForm", "Bắt đầu tạo VM và cấu hình GPU...");
      const result = await invoke<VMProgress>("create_vm", { config });
      setProgress(result);

      if (result.error) {
        setCreationStatus("error");
        setCreationError(result.error);
        addLog("warn", "VMForm", "VM đã tạo nhưng GPU passthrough thất bại:");
        addLog("warn", "VMForm", result.error);
      } else {
        setCreationStatus("success");
        setCreationLogs((prev) => [
          ...prev,
          "\n✅ PROCESS COMPLETE: " + result.message,
        ]);
        addLog(
          "success",
          "VMForm",
          `VM "${config.name}" đã tạo thành công với GPU!`,
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setCreationStatus("error");
      setCreationError(errorMsg);
      setCreationLogs((prev) => [...prev, "\n❌ ERROR: " + errorMsg]);

      addLog("error", "VMForm", `Lỗi tạo VM: ${errorMsg}`);
      setProgress({
        step: 0,
        total_steps: 2,
        message: "Failed to create VM",
        completed: false,
        error: errorMsg,
      });
    } finally {
      if (unlisten) unlisten();
      setLoading(false);
    }
  };

  const handleCancelCreation = async () => {
    if (creationStatus !== "running") return;

    try {
      setCreationLogs((prev) => [...prev, "\n⚠️ CANCELLING..."]);
      await invoke("cancel_create_vm", { name: config.name });
      setCreationLogs((prev) => [...prev, "🛑 OPERATION CANCELLED BY USER"]);
      setCreationStatus("error");
      setCreationError("Operation cancelled");
    } catch (err) {
      console.error("Failed to cancel:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      setCreationLogs((prev) => [...prev, "❌ Failed to cancel: " + errorMsg]);
    }
  };

  const updateConfig = (
    field: keyof VMConfig,
    value: string | number | boolean,
  ) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Tạo máy ảo mới</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Thông tin cơ bản
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Tên máy ảo</Label>
                <Input
                  id="name"
                  value={config.name}
                  onChange={(e) => updateConfig("name", e.target.value)}
                  placeholder="GPU-VM-1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="network">Network Switch</Label>
                <Select
                  value={config.network_switch}
                  onValueChange={(value) =>
                    updateConfig("network_switch", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn network switch" />
                  </SelectTrigger>
                  <SelectContent>
                    {switches.map((sw) => (
                      <SelectItem key={sw.name} value={sw.name}>
                        {sw.name} ({sw.switch_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="iso">Windows ISO</Label>
              <div className="flex gap-2">
                <Input
                  id="iso"
                  value={config.iso_path}
                  onChange={(e) => updateConfig("iso_path", e.target.value)}
                  placeholder="C:\Downloads\Win11.iso"
                  required
                />
                <Button type="button" size="icon" onClick={handleBrowseISO}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vhd">VHD Storage Path</Label>
              <div className="flex gap-2">
                <Input
                  id="vhd"
                  value={config.vhd_path}
                  onChange={(e) => updateConfig("vhd_path", e.target.value)}
                  required
                />
                <Button type="button" size="icon" onClick={handleBrowseVHD}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Resources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Tài nguyên
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4" />
                  Dung lượng ổ đĩa
                </Label>
                <span className="text-sm font-medium">
                  {config.disk_size_gb} GB
                </span>
              </div>
              <Slider
                min={20}
                max={500}
                step={10}
                value={[config.disk_size_gb]}
                onValueChange={(value) =>
                  updateConfig("disk_size_gb", value[0])
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <MemoryStick className="h-4 w-4" />
                  RAM
                </Label>
                <span className="text-sm font-medium">
                  {config.memory_gb} GB
                </span>
              </div>
              <Slider
                min={2}
                max={64}
                step={2}
                value={[config.memory_gb]}
                onValueChange={(value) => updateConfig("memory_gb", value[0])}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  CPU Cores
                </Label>
                <span className="text-sm font-medium">
                  {config.cpu_cores} cores
                </span>
              </div>
              <Slider
                min={1}
                max={16}
                step={1}
                value={[config.cpu_cores]}
                onValueChange={(value) => updateConfig("cpu_cores", value[0])}
              />
            </div>
          </CardContent>
        </Card>

        {/* GPU Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              GPU Passthrough
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gpu">GPU</Label>
              <Select
                value={config.gpu_name}
                onValueChange={(value) => updateConfig("gpu_name", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn GPU" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">
                    AUTO (Tự động chọn GPU đầu tiên)
                  </SelectItem>
                  {gpuList.map((gpu) => (
                    <SelectItem key={gpu.name} value={gpu.name}>
                      {gpu.name} (v{gpu.driver_version})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gpuList.length === 0 && (
                <p className="text-xs text-yellow-600">
                  Không tìm thấy GPU hỗ trợ partitioning
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>GPU Allocation</Label>
                <span className="text-sm font-medium">
                  {config.gpu_allocation_percent}%
                </span>
              </div>
              <Slider
                min={10}
                max={100}
                step={10}
                value={[config.gpu_allocation_percent]}
                onValueChange={(value) =>
                  updateConfig("gpu_allocation_percent", value[0])
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Windows Account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Tài khoản Windows
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="username"
                    value={config.username}
                    onChange={(e) => updateConfig("username", e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    value={config.password}
                    onChange={(e) => updateConfig("password", e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autologon"
                checked={config.auto_logon}
                onChange={(e) => updateConfig("auto_logon", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="autologon">Tự động đăng nhập</Label>
            </div>
          </CardContent>
        </Card>

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800 dark:text-red-200">
                    Vui lòng sửa các lỗi sau:
                  </p>
                  <ul className="mt-2 list-disc list-inside text-sm text-red-600 dark:text-red-300">
                    {validationErrors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {progress && (
          <Card
            className={
              progress.error
                ? "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
                : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
            }
          >
            <CardContent className="pt-4">
              <div className="flex items-start gap-2">
                {progress.completed && !progress.error ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-yellow-500" />
                )}
                <div>
                  <p
                    className={`font-medium ${
                      progress.error
                        ? "text-yellow-800 dark:text-yellow-200"
                        : "text-green-800 dark:text-green-200"
                    }`}
                  >
                    {progress.message}
                  </p>
                  {progress.error && (
                    <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-300">
                      {progress.error}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Button type="submit" disabled={loading} size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Đang tạo...
              </>
            ) : (
              "Tạo máy ảo"
            )}
          </Button>
        </div>
      </form>

      <VMCreationModal
        open={showModal}
        vmName={config.name}
        logs={creationLogs}
        status={creationStatus}
        error={creationError}
        onCancel={handleCancelCreation}
        onClose={() => setShowModal(false)}
      />
    </div>
  );
}
