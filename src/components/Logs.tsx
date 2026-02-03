import { useRef, useEffect, useState } from "react";
import { useLog } from "@/contexts/LogContext";
import { Button } from "@/components/ui";
import {
  FileText,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
} from "lucide-react";

export function Logs() {
  const { logs, clearLogs } = useLog();
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const exportLogs = () => {
    const logText = logs
      .map(
        (log) =>
          `[${log.timestamp.toLocaleString("vi-VN")}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`,
      )
      .join("\n");
    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hyper-v-gpu-logs-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getLevelIcon = (level: string) => {
    switch (level) {
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "warn":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "info":
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLevelClass = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-400";
      case "warn":
        return "text-yellow-400";
      case "success":
        return "text-green-400";
      case "info":
      default:
        return "text-blue-400";
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold">Logs</h2>
          <span className="text-sm text-muted-foreground">
            {logs.length} entries
          </span>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={exportLogs}
            disabled={logs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={clearLogs}
            disabled={logs.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Xóa
          </Button>
        </div>
      </div>

      {/* Logs Console - Full height */}
      <div className="flex-1 overflow-y-auto bg-slate-950 rounded-lg p-4 font-mono text-sm">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-16">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Chưa có logs nào.</p>
            <p className="text-xs mt-2">
              Logs sẽ xuất hiện khi bạn thực hiện các thao tác như tạo VM, v.v.
            </p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="flex items-start gap-2 py-1 hover:bg-slate-900 px-2 -mx-2 rounded"
            >
              <span className="text-gray-500 shrink-0 text-xs">
                {log.timestamp.toLocaleTimeString("vi-VN")}
              </span>
              <span className="shrink-0">{getLevelIcon(log.level)}</span>
              <span className="text-gray-400 shrink-0">[{log.source}]</span>
              <span className={getLevelClass(log.level)}>{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
