import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Slider,
} from "@/components/ui";
import {
  Cpu,
  Monitor,
  HardDrive,
  Network,
  Disc,
  FolderOpen,
  Loader2,
  AlertCircle,
  Hash,
  User,
  Key,
} from "lucide-react";
import { useLog } from "@/contexts/LogContext";
import { useTranslation } from "react-i18next";

interface GpuInfo {
  id: string;
  name: string;
  driver_version: string;
  supports_partitioning: boolean;
}

interface VmConfig {
  name: string;
  switch_name: string;
  iso_path: string;
  storage_path: string;
  disk_size_gb: number;
  ram_size_gb: number;
  cpu_count: number;
  username: string;
  password?: string;
  auto_logon: boolean;
  gpu_config?: {
    gpu_name: string;
    resource_allocation_percentage: number;
  };
}

interface NetworkSwitch {
  name: string;
  switch_type: string;
}

export function VMForm({ onSuccess }: { onSuccess: () => void }) {
  const { t } = useTranslation();
  const { addLog } = useLog();
  const [loading, setLoading] = useState(false);
  const [fetchingSystemInfo, setFetchingSystemInfo] = useState(true);
  const [switches, setSwitches] = useState<NetworkSwitch[]>([]);
  const [gpus, setGpus] = useState<GpuInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [config, setConfig] = useState<VmConfig>({
    name: "GPU-VM-1",
    switch_name: "",
    iso_path: "",
    storage_path: "",
    disk_size_gb: 64,
    ram_size_gb: 8,
    cpu_count: 4,
    username: "User",
    password: "",
    auto_logon: true,
  });

  const [enableGpu, setEnableGpu] = useState(true);
  const [selectedGpu, setSelectedGpu] = useState<string>("AUTO");
  const [gpuAllocation, setGpuAllocation] = useState(50);

  useEffect(() => {
    const loadSystemInfo = async () => {
      try {
        const [switchList, systemInfo] = await Promise.all([
          invoke<NetworkSwitch[]>("get_network_switches"),
          invoke<{ gpu_list: GpuInfo[] }>("check_system"),
        ]);
        setSwitches(switchList);
        setGpus(systemInfo.gpu_list);

        if (switchList.length > 0) {
          setConfig((prev) => ({ ...prev, switch_name: switchList[0].name }));
        }
      } catch (err) {
        console.error("Failed to load system info:", err);
        addLog("error", "System", `Failed to load info: ${err}`);
      } finally {
        setFetchingSystemInfo(false);
      }
    };
    loadSystemInfo();
  }, [addLog]);

  const handleBrowseIso = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Disk Image", extensions: ["iso"] }],
      });
      if (selected && typeof selected === "string") {
        setConfig((prev) => ({ ...prev, iso_path: selected }));
      }
    } catch (err) {
      console.error("Failed to browse ISO:", err);
    }
  };

  const handleBrowseStorage = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        setConfig((prev) => ({ ...prev, storage_path: selected }));
      }
    } catch (err) {
      console.error("Failed to browse storage:", err);
    }
  };

  const partitioningSupportedGPUs = gpus.filter((g) => g.supports_partitioning);

  const validateForm = () => {
    const errors: string[] = [];
    if (!config.name) errors.push(t("VM Name"));
    if (!config.iso_path) errors.push(t("Windows ISO"));
    if (!config.storage_path) errors.push(t("VHD Storage Path"));
    if (!config.switch_name) errors.push(t("Network Switch"));
    return errors;
  };

  const handleCreate = async () => {
    const missingFields = validateForm();
    if (missingFields.length > 0) {
      setError(`${t("Vui lòng sửa các lỗi sau:")} ${missingFields.join(", ")}`);
      return;
    }

    setLoading(true);
    setError(null);
    addLog("info", "VM", `${t("Đang tạo VM:")} ${config.name}...`);

    try {
      const vmConfig = { ...config };
      if (enableGpu) {
        vmConfig.gpu_config = {
          gpu_name: selectedGpu,
          resource_allocation_percentage: gpuAllocation,
        };
      }

      await invoke("create_vm", { config: vmConfig });

      addLog(
        "success",
        "VM",
        `VM "${config.name}" ${t('VM "{{name}}" đã tạo thành công với GPU!', { name: config.name })}`,
      );
      onSuccess();
    } catch (err: any) {
      const errorMsg = err.toString();
      setError(errorMsg);
      addLog("error", "VM", `${t("Lỗi tạo VM:")} ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (fetchingSystemInfo) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t("New Virtual Machine")}</h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Column: Basic Info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                {t("Basic Information")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vm-name">{t("VM Name")}</Label>
                <Input
                  id="vm-name"
                  value={config.name}
                  onChange={(e) =>
                    setConfig({ ...config, name: e.target.value })
                  }
                  placeholder={t("GPU-VM-1")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="switch">{t("Network Switch")}</Label>
                <Select
                  value={config.switch_name}
                  onValueChange={(val) =>
                    setConfig({ ...config, switch_name: val })
                  }
                >
                  <SelectTrigger id="switch">
                    <div className="flex items-center gap-2">
                      <Network className="h-4 w-4" />
                      <SelectValue placeholder={t("Select Network Switch")} />
                    </div>
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

              <div className="space-y-2">
                <Label>{t("Windows ISO")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={config.iso_path}
                    readOnly
                    placeholder={t("C:\\Downloads\\Win11.iso")}
                    className="bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleBrowseIso}
                  >
                    <Disc className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("VHD Storage Path")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={config.storage_path}
                    readOnly
                    placeholder={t("VHD Storage Path")}
                    className="bg-muted"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleBrowseStorage}
                  >
                    <FolderOpen className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                {t("Resources")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="flex justify-between">
                  <span>{t("Disk Size")}</span>
                  <span className="text-muted-foreground">
                    {config.disk_size_gb} GB
                  </span>
                </Label>
                <div className="flex items-center gap-4">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[config.disk_size_gb]}
                    min={32}
                    max={512}
                    step={1}
                    onValueChange={([val]) =>
                      setConfig({ ...config, disk_size_gb: val })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex justify-between">
                  <span>{t("RAM")}</span>
                  <span className="text-muted-foreground">
                    {config.ram_size_gb} GB
                  </span>
                </Label>
                <div className="flex items-center gap-4">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[config.ram_size_gb]}
                    min={2}
                    max={32}
                    step={1}
                    onValueChange={([val]) =>
                      setConfig({ ...config, ram_size_gb: val })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="flex justify-between">
                  <span>{t("CPU Cores")}</span>
                  <span className="text-muted-foreground">
                    {config.cpu_count} {t("cores")}
                  </span>
                </Label>
                <div className="flex items-center gap-4">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <Slider
                    value={[config.cpu_count]}
                    min={1}
                    max={16}
                    step={1}
                    onValueChange={([val]) =>
                      setConfig({ ...config, cpu_count: val })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: GPU & User */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-5 w-5" />
                  {t("GPU Settings")}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor="enable-gpu" className="text-sm font-normal">
                    {t("GPU Passthrough")}
                  </Label>
                  <Input
                    id="enable-gpu"
                    type="checkbox"
                    className="h-4 w-4 w-auto"
                    checked={enableGpu}
                    onChange={(e) => setEnableGpu(e.target.checked)}
                  />
                </div>
              </div>
            </CardHeader>
            {enableGpu && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("Select GPU")}</Label>
                  <Select value={selectedGpu} onValueChange={setSelectedGpu}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("Select GPU")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">
                        {t("AUTO (Automatically select first GPU)")}
                      </SelectItem>
                      {partitioningSupportedGPUs.map((gpu) => (
                        <SelectItem key={gpu.id} value={gpu.name}>
                          {gpu.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {partitioningSupportedGPUs.length === 0 && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" />
                      {t("No partitioning-supported GPUs found")}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex justify-between">
                    <span>
                      {t("GPU Allocation")} ({gpuAllocation}%)
                    </span>
                    <span className="text-xs text-muted-foreground w-1/2 text-right">
                      {t(
                        "Resource percentage (VRAM, Compute, Encode/Decode) shared to the VM.",
                      )}
                    </span>
                  </Label>
                  <Slider
                    value={[gpuAllocation]}
                    min={10}
                    max={100}
                    step={5}
                    onValueChange={([val]) => setGpuAllocation(val)}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                {t("Windows Account")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="vm-user">{t("Username")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="vm-user"
                    value={config.username}
                    onChange={(e) =>
                      setConfig({ ...config, username: e.target.value })
                    }
                    className="pl-9"
                    placeholder="User"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vm-pass">{t("Password")}</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="vm-pass"
                    type="password"
                    value={config.password}
                    onChange={(e) =>
                      setConfig({ ...config, password: e.target.value })
                    }
                    className="pl-9"
                    placeholder={t("Password")}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  id="auto-logon"
                  type="checkbox"
                  className="h-4 w-4 w-auto"
                  checked={config.auto_logon}
                  onChange={(e) =>
                    setConfig({ ...config, auto_logon: e.target.checked })
                  }
                />
                <Label htmlFor="auto-logon" className="font-normal">
                  {t("Auto Logon")}
                </Label>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button size="lg" onClick={handleCreate} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("Creating...")}
            </>
          ) : (
            <>{t("Create VM Button")}</>
          )}
        </Button>
      </div>
    </div>
  );
}
