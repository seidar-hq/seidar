"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Slide from "@mui/material/Slide";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { styled } from "@mui/material/styles";
import ResponsiveTypography from "./ResponsiveTypography";

type AlertItem = { key: string; title: string; message: string; severity: "success" | "error" };

type AlertApi = {
  successAlert: (payload: { title?: string; message: string }) => void;
  errorAlert: (payload: { message: string }) => void;
};

const AlertContext = createContext<AlertApi | null>(null);

const SuccessCard = styled(Box)(({ theme }) => ({
  display: "flex",
  alignItems: "flex-start",
  gap: "18px",
  width: "350px",
  maxWidth: "90vw",
  padding: "16px",
  borderRadius: "24px",
  backgroundColor: theme.palette.border.dark,
  boxShadow: "0px 4px 40px 0px rgba(0,0,0,0.3)",
}));

const TickIcon = styled("img")({ width: "42px", height: "42px", flexShrink: 0 });

const makeKey = (prefix: string) =>
  `${prefix}-id-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const removeAlert = useCallback(() => setAlerts((current) => current.slice(1)), []);

  const api = useMemo<AlertApi>(
    () => ({
      successAlert: ({ title, message }) =>
        setAlerts((current) => [
          ...current,
          { key: makeKey("success"), title: title || "Success", message, severity: "success" },
        ]),
      errorAlert: ({ message }) =>
        setAlerts((current) => [
          ...current,
          { key: makeKey("error"), title: "Error", message, severity: "error" },
        ]),
    }),
    [],
  );

  return (
    <AlertContext.Provider value={api}>
      {children}
      <Stack spacing={8}>
        {alerts.map((alert) => (
          <Snackbar
            key={alert.key}
            open
            onClose={removeAlert}
            autoHideDuration={3000}
            slots={{ transition: Slide }}
            anchorOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {alert.severity === "success" ? (
              <SuccessCard>
                <TickIcon src="/images/icons/tick-circle.svg" alt="" />
                <Box sx={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                  <Typography
                    variant="body4Medium"
                    sx={{ fontSize: "20px", letterSpacing: "-0.4px", color: "white.main" }}
                  >
                    {alert.title}
                  </Typography>
                  <Typography variant="subtitle1" sx={{ color: "white.soft" }}>
                    {alert.message}
                  </Typography>
                </Box>
              </SuccessCard>
            ) : (
              <Alert variant="filled" severity={alert.severity} onClose={removeAlert}>
                <ResponsiveTypography variant="subtitle1Medium" smallFontSize={14} mediumFontSize={14}>
                  {alert.message}
                </ResponsiveTypography>
              </Alert>
            )}
          </Snackbar>
        ))}
      </Stack>
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const api = useContext(AlertContext);
  if (!api) throw new Error("useAlerts must be used inside <AlertProvider>");
  return api;
}
