import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dashboard,
  VMForm,
  VMList,
  GPUSelector,
  Settings,
  Logs,
  ErrorBoundary,
} from "./components";
import { Button, Badge, Separator } from "./components/ui";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import { LogProvider } from "./contexts/LogContext";
import {
  LayoutDashboard,
  Plus,
  List,
  Cpu,
  Settings as SettingsIcon,
  Moon,
  Sun,
  Monitor,
  PanelLeftClose,
  PanelLeft,
  FileText,
} from "lucide-react";
import "./App.css";

type Tab = "dashboard" | "create" | "list" | "gpu" | "logs" | "settings";

interface VMInfo {
  name: string;
  state: string;
}

const navItems = [
  { id: "dashboard" as Tab, label: "Dashboard", icon: LayoutDashboard },
  { id: "create" as Tab, label: "Tạo VM", icon: Plus },
  { id: "list" as Tab, label: "Danh sách VM", icon: List },
  { id: "gpu" as Tab, label: "GPU", icon: Cpu },
  { id: "logs" as Tab, label: "Logs", icon: FileText },
  { id: "settings" as Tab, label: "Cài đặt", icon: SettingsIcon },
];

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [runningVMs, setRunningVMs] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const loadVMCount = async () => {
      try {
        const vms = await invoke<VMInfo[]>("list_vms");
        setRunningVMs(
          vms.filter((vm) => vm.state.toLowerCase() === "running").length,
        );
      } catch {
        // ignore
      }
    };
    loadVMCount();
    const interval = setInterval(loadVMCount, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-52" : "w-14"
        } flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-200 shrink-0`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-sidebar-border">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Monitor className="h-4 w-4 text-primary-foreground" />
          </div>
          {sidebarOpen && (
            <div className="flex flex-col overflow-hidden">
              <span className="font-bold text-sm truncate">Hyper-V GPU</span>
              <span className="text-xs text-muted-foreground truncate">
                Passthrough Tool
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/50"
                }`}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {sidebarOpen && (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.id === "list" && runningVMs > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {runningVMs}
                      </Badge>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-2 border-t border-sidebar-border space-y-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50 transition-colors"
            title={
              !sidebarOpen
                ? theme === "dark"
                  ? "Light Mode"
                  : "Dark Mode"
                : undefined
            }
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0" />
            ) : (
              <Moon className="h-4 w-4 shrink-0" />
            )}
            {sidebarOpen && (
              <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 flex items-center gap-4 px-4 border-b shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="h-8 w-8"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-lg font-semibold">
            {navItems.find((item) => item.id === activeTab)?.label}
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === "dashboard" && <Dashboard />}
          {activeTab === "create" && <VMForm />}
          {activeTab === "list" && <VMList />}
          {activeTab === "gpu" && <GPUSelector />}
          {activeTab === "logs" && <Logs />}
          {activeTab === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <LogProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </LogProvider>
    </ThemeProvider>
  );
}

export default App;
