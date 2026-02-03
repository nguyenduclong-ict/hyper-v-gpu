import { createContext, useContext, useState, ReactNode } from "react";

interface LogEntry {
  id: number;
  timestamp: Date;
  level: "info" | "warn" | "error" | "success";
  source: string;
  message: string;
}

interface LogContextType {
  logs: LogEntry[];
  addLog: (level: LogEntry["level"], source: string, message: string) => void;
  clearLogs: () => void;
}

const LogContext = createContext<LogContextType | null>(null);

let logId = 0;

export function LogProvider({ children }: { children: ReactNode }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (
    level: LogEntry["level"],
    source: string,
    message: string,
  ) => {
    const entry: LogEntry = {
      id: ++logId,
      timestamp: new Date(),
      level,
      source,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <LogContext.Provider value={{ logs, addLog, clearLogs }}>
      {children}
    </LogContext.Provider>
  );
}

export function useLog() {
  const context = useContext(LogContext);
  if (!context) {
    throw new Error("useLog must be used within a LogProvider");
  }
  return context;
}
