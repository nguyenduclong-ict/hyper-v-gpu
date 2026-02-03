import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, CheckCircle, Terminal } from "lucide-react";

interface VMCreationModalProps {
  open: boolean;
  vmName: string;
  logs: string[];
  status: "idle" | "running" | "success" | "error";
  error?: string;
  onCancel: () => void;
  onClose: () => void;
  title?: string;
}

export function VMCreationModal({
  open,
  vmName,
  logs,
  status,
  error,
  onCancel,
  onClose,
  title,
}: VMCreationModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-background border-2 border-border rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-2 border-b flex items-center justify-between bg-muted/20">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            {status === "running" && (
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
            )}
            {status === "success" && (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            {status === "error" && <XCircle className="h-5 w-5 text-red-500" />}
            {title || "Creating VM"}
            <span className="text-primary">{vmName}</span>
          </h2>
        </div>

        {/* Content - Terminal */}
        <div className="flex-1 min-h-0 relative bg-zinc-950 p-4 font-mono text-sm text-green-400 overflow-hidden m-4 rounded-md border shadow-inner">
          <div className="absolute top-2 right-2 opacity-50 pointer-events-none">
            <Terminal className="h-4 w-4" />
          </div>
          <div
            ref={scrollRef}
            className="w-full h-full overflow-y-auto pr-2 space-y-1 pb-4"
          >
            {logs.length === 0 && (
              <div className="text-gray-500 italic p-4 text-center mt-10">
                Initializing process... <br />
                (Waiting for logs...)
              </div>
            )}
            {logs.map((log, i) => (
              <div
                key={i}
                className="break-words whitespace-pre-wrap leading-relaxed"
              >
                {log}
              </div>
            ))}
          </div>
        </div>

        {/* Error Details */}
        {status === "error" && error && (
          <div className="px-6 pb-2">
            <div className="bg-red-50 dark:bg-red-950/50 p-3 rounded text-red-600 dark:text-red-300 text-sm border border-red-200 dark:border-red-900">
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t bg-muted/20 flex justify-end gap-2">
          {status === "running" ? (
            <Button variant="destructive" onClick={onCancel}>
              Cancel
            </Button>
          ) : (
            <Button
              variant={status === "success" ? "default" : "secondary"}
              onClick={onClose}
              className="px-8"
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
