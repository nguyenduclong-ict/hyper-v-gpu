import { useTheme } from "@/contexts/ThemeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Sun, Moon, Monitor, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Settings() {
  const { t } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themeOptions = [
    { value: "light" as const, label: t("Light"), icon: Sun },
    { value: "dark" as const, label: t("Dark"), icon: Moon },
    { value: "system" as const, label: t("System"), icon: Monitor },
  ];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">{t("Settings")}</h2>

      {/* Theme Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("Theme")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((option) => {
              const Icon = option.icon;
              const isActive = theme === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon
                    className={`h-6 w-6 ${
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-sm font-medium ${
                      isActive ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("Theme")}:{" "}
            {resolvedTheme === "dark" ? t("Dark Mode") : t("Light Mode")}
          </p>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Info className="h-5 w-5" />
            {t("Application Info")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-500">{t("Version")}</span>
            <span className="font-medium">0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Framework</span>
            <span className="font-medium">Tauri 2.x + React</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">{t("Reference")}</span>
            <a
              href="https://github.com/jamesstringer90/Easy-GPU-PV"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              Easy-GPU-PV
            </a>
          </div>
          <hr className="my-4 dark:border-gray-700" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t(
              "GPU-PV allows sharing a GPU between the host and Hyper-V virtual machines",
            )}
          </p>
        </CardContent>
      </Card>

      {/* Requirements Reminder */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
        <CardContent className="pt-6">
          <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
            {t("Important Notes")}
          </h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>{t("Application must be run as Administrator")}</li>
            <li>{t("Windows 10/11 Pro, Enterprise or Education")}</li>
            <li>{t("Hyper-V must be enabled in Windows Features")}</li>
            <li>{t("GPU must support partitioning (NVIDIA/AMD/Intel)")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
