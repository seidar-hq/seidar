"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Alert, { type AlertColor } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import { useTheme, type SxProps, type Theme } from "@mui/material/styles";

type AlertItem = { key: number; severity: AlertColor; message: string; title?: string; duration?: number };
type AlertInput = { message: string; title?: string; duration?: number };

type AlertContextValue = {
  successAlert: (a: AlertInput) => void;
  errorAlert: (a: AlertInput) => void;
  infoAlert: (a: AlertInput) => void;
};

const AlertContext = createContext<AlertContextValue>({
  successAlert: () => {},
  errorAlert: () => {},
  infoAlert: () => {},
});

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const push = useCallback((severity: AlertColor, a: AlertInput) => {
    setAlerts((prev) => [...prev, { key: Date.now() + Math.random(), severity, ...a }]);
  }, []);
  const remove = () => setAlerts((prev) => prev.slice(1));

  const value = useMemo(
    () => ({
      successAlert: (a: AlertInput) => push("success", a),
      errorAlert: (a: AlertInput) => push("error", a),
      infoAlert: (a: AlertInput) => push("info", a),
    }),
    [push],
  );

  const alertSx = (severity: AlertColor): SxProps<Theme> => {
    const base = {
      width: "22rem",
      overflow: "hidden",
      wordWrap: "break-word",
      borderRadius: "0.75rem",
      boxShadow: `0 4px 20px ${theme.palette.shadow.strong}`,
      padding: "0.875rem 1rem",
      "& .MuiAlert-icon": { fontSize: "1.5rem", marginRight: "0.75rem" },
      "& .MuiAlert-message": { padding: "0", fontSize: "0.875rem", lineHeight: 1.5 },
      "& .MuiAlert-action": { paddingTop: "0", alignItems: "flex-start" },
      "& .MuiAlertTitle-root": { fontWeight: 600, marginBottom: "0.25rem", fontSize: "0.9375rem" },
    };
    switch (severity) {
      case "success":
        return { ...base, backgroundColor: theme.palette.success.alert ?? theme.palette.success.main, color: "sidebar.white" };
      case "error":
        return { ...base, backgroundColor: "error.main", color: "sidebar.white" };
      case "info":
        return { ...base, backgroundColor: "info.main", color: "sidebar.white" };
      default:
        return base;
    }
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Stack spacing="0.75rem" sx={{ width: "100%", zIndex: 99 }}>
        {alerts.map((a) => (
          <Snackbar
            key={a.key}
            open
            autoHideDuration={a.duration ?? 4000}
            onClose={remove}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
          >
            <Alert sx={alertSx(a.severity)} elevation={6} variant="filled" severity={a.severity} onClose={remove}>
              {a.title && <AlertTitle>{a.title}</AlertTitle>}
              {a.message}
            </Alert>
          </Snackbar>
        ))}
      </Stack>
    </AlertContext.Provider>
  );
}

export const useAlerts = () => useContext(AlertContext);
