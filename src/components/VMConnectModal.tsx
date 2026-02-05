import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DialogDescription,
} from "@/components/ui";
import { MonitorPlay, Terminal, Loader2 } from "lucide-react";

interface VMConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  vmName: string;
}

interface ConnectionSettings {
  resolution_w: number;
  resolution_h: number;
  scale: number;
  username: string;
  password?: string;
  shared_drives: string[];
  fullscreen: boolean;
}

const RESOLUTIONS = [
  { label: "1920 x 1080 (Full HD)", w: 1920, h: 1080 },
  { label: "1280 x 720 (HD)", w: 1280, h: 720 },
  { label: "1600 x 900", w: 1600, h: 900 },
  { label: "1024 x 768", w: 1024, h: 768 },
];

const SCALES = [100, 125, 150, 200, 300];

export function VMConnectModal({
  isOpen,
  onClose,
  vmName,
}: VMConnectModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [availableDrives, setAvailableDrives] = useState<string[]>([]);
  const [settings, setSettings] = useState<ConnectionSettings>({
    resolution_w: 1920,
    resolution_h: 1080,
    scale: 100,
    username: "Administrator",
    shared_drives: [],
    fullscreen: true,
  });

  useEffect(() => {
    if (isOpen) {
      loadDrives();
      if (vmName) {
        loadSettings();
      }
    }
  }, [isOpen, vmName]);

  const loadDrives = async () => {
    setLoadingDrives(true);
    try {
      const drives = await invoke<string[]>("get_host_drives");
      setAvailableDrives(drives);
    } catch (e) {
      console.error("Failed to load drives:", e);
    } finally {
      setLoadingDrives(false);
    }
  };

  const loadSettings = async () => {
    try {
      const saved: ConnectionSettings = await invoke("load_vm_settings", {
        name: vmName,
      });
      if (saved) {
        // Build a fresh object merging defaults with saved data to avoid missing fields
        // Ensure shared_drives is initialized if missing in saved data
        setSettings((prev) => ({
          ...prev,
          ...saved,
          shared_drives: saved.shared_drives || [],
        }));
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
  };

  const handleSave = async () => {
    try {
      await invoke("save_vm_settings", { name: vmName, settings });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const handleConsoleConnect = async () => {
    setLoading(true);
    try {
      await handleSave(); // Save preference implicitly? Or maybe just connect.
      await invoke("connect_vm_rdp", { name: vmName });
      onClose();
    } catch (e) {
      alert(t("Connection Failed: {{error}}", { error: e }));
    } finally {
      setLoading(false);
    }
  };

  const handleNativeRDPConnect = async () => {
    setLoading(true);
    try {
      await handleSave();
      await invoke("connect_vm_rdp_native", { name: vmName, settings });
      onClose();
    } catch (e) {
      alert(t("RDP Connection Failed: {{error}}", { error: e }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {t("Connect to {{name}}", { name: vmName })}
          </DialogTitle>
          <DialogDescription>
            {t("Choose connection method and configure display settings.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Resolution & Scale Group */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("Resolution")}</Label>
              <Select
                value={
                  settings.fullscreen
                    ? "fullscreen"
                    : `${settings.resolution_w}x${settings.resolution_h}`
                }
                onValueChange={(val) => {
                  if (val === "fullscreen") {
                    setSettings({ ...settings, fullscreen: true });
                  } else {
                    const [w, h] = val.split("x").map(Number);
                    setSettings({
                      ...settings,
                      fullscreen: false,
                      resolution_w: w,
                      resolution_h: h,
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fullscreen">{t("Full Screen")}</SelectItem>
                  {RESOLUTIONS.map((r) => (
                    <SelectItem key={r.label} value={`${r.w}x${r.h}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("Scale (DPI)")}</Label>
              <Select
                value={settings.scale.toString()}
                onValueChange={(val) =>
                  setSettings({ ...settings, scale: Number(val) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCALES.map((s) => (
                    <SelectItem key={s} value={s.toString()}>
                      {s}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Credentials */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("Username")}</Label>
              <Input
                value={settings.username || ""}
                onChange={(e) =>
                  setSettings({ ...settings, username: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{t("Password (Optional)")}</Label>
              <Input
                type="password"
                placeholder={t("Enter password for auto-login")}
                value={settings.password || ""}
                onChange={(e) =>
                  setSettings({ ...settings, password: e.target.value })
                }
              />
            </div>
          </div>

          {/* Shared Drives */}
          <div className="space-y-2">
            <Label>{t("Shared Drives")}</Label>
            <div className="border rounded-md p-3 max-h-[150px] overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900/50">
              {availableDrives.length === 0 ? (
                <div className="flex items-center justify-center p-2 text-sm text-muted-foreground">
                  {loadingDrives ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                  ) : null}
                  {t(loadingDrives ? "Loading drives..." : "No drives found")}
                </div>
              ) : (
                availableDrives.map((drive) => (
                  <div key={drive} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`drive-${drive}`}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={settings.shared_drives.includes(drive)}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSettings((prev) => {
                          const current = new Set(prev.shared_drives);
                          if (checked) current.add(drive);
                          else current.delete(drive);
                          return {
                            ...prev,
                            shared_drives: Array.from(current),
                          };
                        });
                      }}
                    />
                    <Label
                      htmlFor={`drive-${drive}`}
                      className="cursor-pointer font-normal"
                    >
                      {t("Drive {{drive}}", { drive })}
                    </Label>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("Selected drives will be mounted in the VM.")}
            </p>
          </div>
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={handleConsoleConnect}
            disabled={loading}
            className="gap-2"
          >
            <Terminal className="h-4 w-4" />
            {t("Console (vmconnect)")}
          </Button>

          <Button
            onClick={handleNativeRDPConnect}
            disabled={loading}
            className="gap-2 min-w-[140px]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MonitorPlay className="h-4 w-4" />
            )}
            {t("Connect RDP")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
