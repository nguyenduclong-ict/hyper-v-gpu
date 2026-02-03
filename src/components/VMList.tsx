import { useState, useEffect } from "react";
import { VMUpdateModal } from "./VMUpdateModal";
import { invoke } from "@tauri-apps/api/core";
import { Button, Card, CardContent } from "@/components/ui";
import {
  Play,
  Square,
  Trash2,
  RefreshCw,
  Monitor,
  Cpu,
  HardDrive,
  Clock,
  AlertCircle,
  Loader2,
  Settings,
  MonitorPlay,
} from "lucide-react";

interface VMInfo {
  name: string;
  state: string;
  cpu_usage: number;
  memory_assigned_mb: number;
  uptime: string;
  has_gpu: boolean;
}

export function VMList() {
  const [vms, setVms] = useState<VMInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [selectedVmForUpdate, setSelectedVmForUpdate] = useState<string | null>(
    null,
  );

  const loadVMs = async (isFirstLoad: boolean = true) => {
    setLoading(isFirstLoad);
    setError(null);
    try {
      const vmList = await invoke<VMInfo[]>("list_vms");
      setVms(vmList);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVMs();
    // Auto refresh every 5 seconds
    const interval = setInterval(() => loadVMs(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (name: string) => {
    setActionLoading(name);
    try {
      await invoke("start_vm", { name });
      await loadVMs();
    } catch (err) {
      alert(`Failed to start VM: ${err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStop = async (name: string, force: boolean = false) => {
    setActionLoading(name);
    try {
      await invoke("stop_vm", { name, force });
      await loadVMs();
    } catch (err) {
      alert(`Failed to stop VM: ${err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa VM "${name}"?`)) return;

    setActionLoading(name);
    try {
      await invoke("delete_vm", { name });
      await loadVMs();
    } catch (err) {
      alert(`Failed to delete VM: ${err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case "running":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "off":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      case "saved":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "paused":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  if (loading && vms.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertCircle className="h-5 w-5" />
              <p>{error}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => loadVMs()}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Danh sách máy ảo</h2>
        <Button
          variant="outline"
          onClick={() => loadVMs(false)}
          disabled={loading}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Làm mới
        </Button>
      </div>

      {vms.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Monitor className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">
              Chưa có máy ảo nào. Tạo máy ảo mới ở tab "Tạo VM".
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {vms.map((vm) => (
            <Card key={vm.name} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Monitor className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{vm.name}</h3>
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${getStateColor(
                            vm.state,
                          )}`}
                        >
                          {vm.state}
                        </span>
                        {vm.has_gpu && (
                          <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            GPU
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Cpu className="h-3 w-3" />
                          {vm.cpu_usage}%
                        </span>
                        <span className="flex items-center gap-1">
                          <HardDrive className="h-3 w-3" />
                          {vm.memory_assigned_mb} MB
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {vm.uptime}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {vm.state.toLowerCase() === "off" ? (
                      <Button
                        size="sm"
                        onClick={() => handleStart(vm.name)}
                        disabled={actionLoading === vm.name}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Start
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleStop(vm.name, false)}
                        disabled={actionLoading === vm.name}
                      >
                        <Square className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        console.log("Settings button clicked for", vm.name);
                        setSelectedVmForUpdate(vm.name);
                        setUpdateModalOpen(true);
                      }}
                      disabled={actionLoading === vm.name}
                      title="Cấu hình GPU"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>

                    {/* RDP Button */}
                    {vm.state.toLowerCase() === "running" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900 dark:hover:bg-blue-950"
                        onClick={async () => {
                          setActionLoading(vm.name);
                          try {
                            await invoke("connect_vm_rdp", { name: vm.name });
                          } catch (e) {
                            alert(`RDP Error: ${e}`);
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                        disabled={actionLoading === vm.name}
                        title="Kết nối Remote Desktop"
                      >
                        <MonitorPlay className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(vm.name)}
                      disabled={
                        actionLoading === vm.name ||
                        vm.state.toLowerCase() !== "off"
                      }
                      title={
                        vm.state.toLowerCase() !== "off"
                          ? "VM phải tắt trước khi xóa"
                          : "Xóa VM"
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <VMUpdateModal
        isOpen={updateModalOpen}
        onClose={() => {
          setUpdateModalOpen(false);
          setSelectedVmForUpdate(null);
        }}
        vmName={selectedVmForUpdate || ""}
        onSuccess={() => loadVMs(false)}
      />
    </div>
  );
}
