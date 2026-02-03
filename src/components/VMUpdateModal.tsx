import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Loader2, AlertTriangle } from "lucide-react";
import { useLog } from "@/contexts/LogContext";
import { VMCreationModal } from "./VMCreationModal";

interface VMUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmName: string;
  onSuccess: () => void;
}

interface NetworkSwitch {
  name: string;
  switch_type: string;
}

interface VMInfo {
  name: string;
  state: string;
  cpu_usage: number;
  memory_assigned_mb: number;
  uptime: string;
  has_gpu: boolean;
  cpu_cores: number;
  network_switch: string;
}

export function VMUpdateModal({
  isOpen,
  onClose,
  vmName,
  onSuccess,
}: VMUpdateModalProps) {
  const [loading, setLoading] = useState(false);
  const [gpuList, setGpuList] = useState<string[]>([]);
  const [switchList, setSwitchList] = useState<string[]>([]);
  const [selectedGpu, setSelectedGpu] = useState("AUTO");
  const [allocation, setAllocation] = useState(50);
  const [vmState, setVmState] = useState("");

  // Log Modal State
  const [showLogModal, setShowLogModal] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [updateStatus, setUpdateStatus] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");
  const [updateError, setUpdateError] = useState<string>();

  // New State Fields
  const [cpuCount, setCpuCount] = useState(4);
  const [memoryMB, setMemoryMB] = useState(4096);
  const [networkSwitch, setNetworkSwitch] = useState("");

  const { addLog } = useLog();

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      // 1. Load System Info (GPUs)
      const sysInfo = await invoke<any>("check_system");
      console.log("System Check Result (Raw):", sysInfo);
      if (sysInfo && sysInfo.gpu_list) {
        // Filter only supported GPUs
        const supported = sysInfo.gpu_list.filter(
          (g: any) => g.supports_partitioning,
        );
        const names = supported.map((g: any) => g.name);

        console.log("Parsed GPU Names:", names);
        setGpuList(names.length > 0 ? ["AUTO", ...names] : ["AUTO"]);
      } else {
        console.warn("No gpu_list found in sysInfo");
        setGpuList(["AUTO"]);
      }

      // 2. Load Network Switches
      const switches = await invoke<NetworkSwitch[]>("get_network_switches");
      setSwitchList(switches.map((s) => s.name));

      // 3. Load Current VM Details (to pre-fill)
      // We reusing list_vms since it now returns detailed info
      const vms = await invoke<VMInfo[]>("list_vms");
      const currentVM = vms.find((v) => v.name === vmName);
      console.log("Current VM Info:", currentVM);
      if (currentVM) {
        setVmState(currentVM.state);
        if (currentVM.cpu_cores > 0) setCpuCount(currentVM.cpu_cores);
        if (currentVM.memory_assigned_mb > 0)
          setMemoryMB(currentVM.memory_assigned_mb);
        if (currentVM.network_switch && currentVM.network_switch !== "None") {
          setNetworkSwitch(currentVM.network_switch);
        } else {
          setNetworkSwitch("");
        }
      }
    } catch (e) {
      console.error("Failed to load data", e);
      setGpuList(["AUTO"]);
    }
  };

  const handleUpdate = async () => {
    if (vmState === "Running") {
      if (
        !confirm(
          `Hành động này sẽ TẮT máy ảo "${vmName}" để cập nhật Cấu hình & GPU. Bạn có chắc chắn không?`,
        )
      ) {
        return;
      }
    }

    setLoading(true);
    setUpdateLogs([]);
    setUpdateStatus("running");
    setUpdateError(undefined);
    setShowLogModal(true);

    // Initial log
    addLog(
      "info",
      "VM-Manager",
      `Starting Configuration Update for ${vmName}...`,
    );
    setUpdateLogs([`Starting update for VM: ${vmName}...`]);

    let unlisten: (() => void) | undefined;

    try {
      unlisten = await listen<string>("vm-log", (event) => {
        setUpdateLogs((prev) => [...prev, event.payload]);
      });

      const result = await invoke("update_vm_config", {
        config: {
          name: vmName,
          gpu_name: selectedGpu,
          gpu_allocation_percent: allocation,
          cpu_count: cpuCount,
          memory_mb: memoryMB,
          network_switch: networkSwitch,
        },
      });

      setUpdateStatus("success");
      setUpdateLogs((prev) => [...prev, `\n✅ UPDATE COMPLETE: ${result}`]);
      addLog("success", "VM-Manager", result as string);
      onSuccess();
      // Don't auto close modal, let user see logs
    } catch (e) {
      const msg = `Lỗi cập nhật: ${e}`;
      setUpdateStatus("error");
      setUpdateError(msg);
      setUpdateLogs((prev) => [...prev, `\n❌ ERROR: ${msg}`]);
      addLog("error", "VM-Manager", msg);
    } finally {
      if (unlisten) unlisten();
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen && !showLogModal} onOpenChange={onClose}>
        <DialogContent
          className="sm:max-w-[600px] w-full"
          style={{
            maxHeight: "85vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <DialogHeader>
            <DialogTitle>Cấu hình VM - {vmName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 px-1 overflow-y-auto flex-1">
            <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30">
              <CardContent className="pt-4 flex gap-3 text-yellow-800 dark:text-yellow-200 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p>
                  Máy ảo sẽ được <b>TẮT</b> (Force Stop) để áp dụng thay đổi
                  CPU, RAM và GPU.
                </p>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              {/* CPU */}
              <div className="space-y-2">
                <Label>CPU Cores</Label>
                <Input
                  type="number"
                  min={1}
                  value={cpuCount}
                  onChange={(e) => setCpuCount(parseInt(e.target.value) || 1)}
                />
              </div>

              {/* RAM */}
              <div className="space-y-2">
                <Label>RAM (MB)</Label>
                <Input
                  type="number"
                  min={1024}
                  step={1024}
                  value={memoryMB}
                  onChange={(e) =>
                    setMemoryMB(parseInt(e.target.value) || 1024)
                  }
                />
              </div>
            </div>

            {/* Network Switch */}
            <div className="space-y-2">
              <Label>Network Switch</Label>
              <Select value={networkSwitch} onValueChange={setNetworkSwitch}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn Network Switch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {switchList.map((sw) => (
                    <SelectItem key={sw} value={sw}>
                      {sw}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* GPU Selection */}
            <div className="space-y-2">
              <Label>GPU Passthrough</Label>
              <Select value={selectedGpu} onValueChange={setSelectedGpu}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn GPU" />
                </SelectTrigger>
                <SelectContent>
                  {gpuList.map((gpu) => (
                    <SelectItem key={gpu} value={gpu}>
                      {gpu}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                "AUTO" sẽ tự động chọn GPU rời mạnh nhất.
              </p>
            </div>

            {/* Allocation */}
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label>Tài nguyên GPU (Partition)</Label>
                <span className="text-sm font-bold text-primary">
                  {allocation}%
                </span>
              </div>
              <Slider
                value={[allocation]}
                onValueChange={(v) => setAllocation(v[0])}
                min={10}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Tỷ lệ tài nguyên (VRAM, Compute, Encode/Decode) được chia sẻ cho
                VM.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cập nhật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VMCreationModal
        open={showLogModal}
        vmName={vmName}
        logs={updateLogs}
        status={updateStatus}
        error={updateError}
        onCancel={() => {
          setShowLogModal(false);
          onClose();
        }}
        onClose={() => {
          setShowLogModal(false);
          onClose();
        }}
        title="Updating VM Configuration"
      />
    </>
  );
}
