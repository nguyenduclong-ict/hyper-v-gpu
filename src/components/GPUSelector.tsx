import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
} from "@/components/ui";
import {
  Cpu,
  Monitor,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Layers,
} from "lucide-react";

interface GpuInfo {
  name: string;
  driver_version: string;
  supports_partitioning: boolean;
}

interface VMInfo {
  name: string;
  state: string;
  has_gpu: boolean;
}

interface SystemInfo {
  gpu_list: GpuInfo[];
}

export function GPUSelector() {
  const [gpuList, setGpuList] = useState<GpuInfo[]>([]);
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [systemInfo, vmList] = await Promise.all([
          invoke<SystemInfo>("check_system"),
          invoke<VMInfo[]>("list_vms"),
        ]);
        setGpuList(systemInfo.gpu_list);
        setVms(vmList);
      } catch (err) {
        setError(err as string);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const gpuVMs = vms.filter((vm) => vm.has_gpu);
  const supportedGPUs = gpuList.filter((g) => g.supports_partitioning);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Quản lý GPU</h2>

      {/* GPU Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <Cpu className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{gpuList.length}</p>
                <p className="text-sm text-muted-foreground">Tổng số GPU</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Layers className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{supportedGPUs.length}</p>
                <p className="text-sm text-muted-foreground">
                  Hỗ trợ Partitioning
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Monitor className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{gpuVMs.length}</p>
                <p className="text-sm text-muted-foreground">
                  VM đang dùng GPU
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GPU List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            Danh sách GPU
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gpuList.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Không tìm thấy GPU nào trên hệ thống
            </p>
          ) : (
            <div className="space-y-3">
              {gpuList.map((gpu, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-3 rounded-lg ${
                        gpu.supports_partitioning
                          ? "bg-green-500/10"
                          : "bg-muted"
                      }`}
                    >
                      <Cpu
                        className={`h-5 w-5 ${
                          gpu.supports_partitioning
                            ? "text-green-500"
                            : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{gpu.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Driver: {gpu.driver_version}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {gpu.supports_partitioning ? (
                      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Hỗ trợ GPU-PV
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="h-3 w-3 mr-1" />
                        Không hỗ trợ
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* VMs using GPU */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            VM đang sử dụng GPU
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gpuVMs.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              Chưa có VM nào sử dụng GPU partitioning
            </p>
          ) : (
            <div className="space-y-2">
              {gpuVMs.map((vm) => (
                <div
                  key={vm.name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{vm.name}</span>
                  </div>
                  <Badge
                    className={
                      vm.state.toLowerCase() === "running"
                        ? "bg-green-500/10 text-green-600"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {vm.state}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="pt-6">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
            Về GPU Partitioning (GPU-PV)
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>GPU-PV cho phép chia sẻ GPU giữa host và các máy ảo Hyper-V</li>
            <li>Chỉ GPU của NVIDIA, AMD hoặc Intel mới hỗ trợ tính năng này</li>
            <li>Mỗi VM có thể được cấp một phần VRAM và compute của GPU</li>
            <li>
              Driver trong VM cần được cài đặt riêng (copy từ host hoặc cài từ
              ISO)
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
