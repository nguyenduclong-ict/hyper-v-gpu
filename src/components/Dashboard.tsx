import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import {
  Monitor,
  Cpu,
  HardDrive,
  CheckCircle,
  XCircle,
  Loader2,
  Play,
  Square,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface SystemInfo {
  os_version: string;
  os_edition: string;
  hyper_v_enabled: boolean;
  gpu_list: { name: string; supports_partitioning: boolean }[];
  available_memory_gb: number;
  issues: string[];
}

interface VMInfo {
  name: string;
  state: string;
  has_gpu: boolean;
}

export function Dashboard() {
  const { t } = useTranslation();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [system, vmList] = await Promise.all([
          invoke<SystemInfo>("check_system"),
          invoke<VMInfo[]>("list_vms"),
        ]);
        setSystemInfo(system);
        setVms(vmList);
      } catch (err) {
        console.error("Failed to load dashboard data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !systemInfo) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const runningVMs = vms.filter(
    (vm) => vm.state.toLowerCase() === "running",
  ).length;
  const stoppedVMs = vms.filter(
    (vm) => vm.state.toLowerCase() === "off",
  ).length;
  const gpuVMs = vms.filter((vm) => vm.has_gpu).length;
  const supportedGPUs =
    systemInfo?.gpu_list.filter((g) => g.supports_partitioning).length || 0;
  const isReady = systemInfo && systemInfo.issues.length === 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* System Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("System Status")}
            </CardTitle>
            {isReady ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {isReady ? t("Ready") : t("Has Issues")}
            </div>
            <p className="text-xs text-muted-foreground">
              {systemInfo?.issues.length || 0} {t("issues found")}
            </p>
          </CardContent>
        </Card>

        {/* Total VMs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("Total VMs")}
            </CardTitle>
            <Monitor className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {vms.length}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500">
                {runningVMs} {t("running")}
              </span>
              {" • "}
              <span>
                {stoppedVMs} {t("stopped")}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* GPU VMs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("GPUs with GPU")}
            </CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{gpuVMs}</div>
            <p className="text-xs text-muted-foreground">
              {supportedGPUs} {t("GPUs available")}
            </p>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("System RAM")}
            </CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {systemInfo?.available_memory_gb || 0} GB
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Total Capacity")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent VMs */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>{t("Recent VMs")}</CardTitle>
          </CardHeader>
          <CardContent>
            {vms.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t("No virtual machines")}
              </p>
            ) : (
              <div className="space-y-4">
                {vms.slice(0, 5).map((vm) => (
                  <div
                    key={vm.name}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${
                          vm.state.toLowerCase() === "running"
                            ? "bg-green-100 dark:bg-green-900"
                            : "bg-gray-100 dark:bg-gray-800"
                        }`}
                      >
                        {vm.state.toLowerCase() === "running" ? (
                          <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
                        ) : (
                          <Square className="h-4 w-4 text-gray-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{vm.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {vm.has_gpu ? t("GPU Passthrough") : t("No GPU")}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        vm.state.toLowerCase() === "running"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {vm.state}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle>{t("System Information")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("OS")}
              </span>
              <span className="font-medium text-right text-sm">
                {systemInfo?.os_edition}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("Version")}
              </span>
              <span className="font-medium">{systemInfo?.os_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("Hyper-V")}
              </span>
              <span
                className={`font-medium ${
                  systemInfo?.hyper_v_enabled
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {systemInfo?.hyper_v_enabled ? t("Enabled") : t("Disabled")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">
                {t("Supported GPUs")}
              </span>
              <span className="font-medium">{supportedGPUs}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issues */}
      {systemInfo?.issues && systemInfo.issues.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-red-800 dark:text-red-200">
              {t("Issues to resolve")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {systemInfo.issues.map((issue, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-sm text-red-600 dark:text-red-300"
                >
                  <XCircle className="h-4 w-4 flex-shrink-0" />
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
