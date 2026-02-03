import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface GpuInfo {
  name: string;
  driver_version: string;
  supports_partitioning: boolean;
}

interface SystemInfo {
  os_version: string;
  os_edition: string;
  hyper_v_enabled: boolean;
  gpu_list: GpuInfo[];
  available_memory_gb: number;
  issues: string[];
}

export function SystemCheck() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await invoke<SystemInfo>("check_system");
      setSystemInfo(info);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runCheck();
  }, []);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">
          Đang kiểm tra hệ thống...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="text-red-800 dark:text-red-200 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Lỗi kiểm tra hệ thống
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600 dark:text-red-300 mb-4">{error}</p>
            <Button variant="destructive" onClick={runCheck}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isReady = systemInfo && systemInfo.issues.length === 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Kiểm tra hệ thống</h2>

      {/* Status Banner */}
      <Card
        className={
          isReady
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
            : "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950"
        }
      >
        <CardContent className="pt-6">
          <div className="flex items-center">
            {isReady ? (
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            ) : (
              <AlertTriangle className="h-10 w-10 text-yellow-600 dark:text-yellow-400" />
            )}
            <div className="ml-4">
              <h3
                className={`font-semibold text-lg ${
                  isReady
                    ? "text-green-800 dark:text-green-200"
                    : "text-yellow-800 dark:text-yellow-200"
                }`}
              >
                {isReady ? "Hệ thống sẵn sàng!" : "Cần khắc phục một số vấn đề"}
              </h3>
              <p
                className={`text-sm ${
                  isReady
                    ? "text-green-600 dark:text-green-400"
                    : "text-yellow-600 dark:text-yellow-400"
                }`}
              >
                {isReady
                  ? "Bạn có thể tạo VM với GPU passthrough"
                  : "Xem chi tiết bên dưới"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* System Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* OS Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hệ điều hành</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {systemInfo?.os_edition}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Version: {systemInfo?.os_version}
                </p>
              </div>
              <StatusIcon
                checked={
                  systemInfo?.os_edition.includes("Pro") ||
                  systemInfo?.os_edition.includes("Enterprise") ||
                  systemInfo?.os_edition.includes("Education") ||
                  false
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Hyper-V */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Hyper-V</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {systemInfo?.hyper_v_enabled
                  ? "Đã kích hoạt"
                  : "Chưa kích hoạt"}
              </p>
              <StatusIcon checked={systemInfo?.hyper_v_enabled || false} />
            </div>
          </CardContent>
        </Card>

        {/* Memory */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">RAM</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {systemInfo?.available_memory_gb} GB khả dụng
              </p>
              <StatusIcon
                checked={(systemInfo?.available_memory_gb || 0) >= 8}
              />
            </div>
          </CardContent>
        </Card>

        {/* GPU Count */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">GPU hỗ trợ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {systemInfo?.gpu_list.filter((g) => g.supports_partitioning)
                  .length || 0}{" "}
                GPU
              </p>
              <StatusIcon
                checked={
                  (systemInfo?.gpu_list.filter((g) => g.supports_partitioning)
                    .length || 0) > 0
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GPU List */}
      <Card>
        <CardHeader>
          <CardTitle>Danh sách GPU</CardTitle>
        </CardHeader>
        <CardContent>
          {systemInfo?.gpu_list && systemInfo.gpu_list.length > 0 ? (
            <div className="space-y-3">
              {systemInfo.gpu_list.map((gpu, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div>
                    <p className="font-medium">{gpu.name}</p>
                    <p className="text-xs text-gray-500">
                      Driver: {gpu.driver_version}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                      gpu.supports_partitioning
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {gpu.supports_partitioning
                      ? "Hỗ trợ GPU-PV"
                      : "Không hỗ trợ"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Không tìm thấy GPU</p>
          )}
        </CardContent>
      </Card>

      {/* Issues */}
      {systemInfo?.issues && systemInfo.issues.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardHeader>
            <CardTitle className="text-red-800 dark:text-red-200">
              Vấn đề cần khắc phục
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {systemInfo.issues.map((issue, index) => (
                <li
                  key={index}
                  className="text-sm text-red-600 dark:text-red-300"
                >
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Refresh Button */}
      <div className="flex justify-center pt-4">
        <Button onClick={runCheck} size="lg">
          <RefreshCw className="h-4 w-4 mr-2" />
          Kiểm tra lại
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({ checked }: { checked: boolean }) {
  return checked ? (
    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
  ) : (
    <XCircle className="h-6 w-6 text-red-500 dark:text-red-400" />
  );
}
