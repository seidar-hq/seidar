"use client";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { useSkeletonBg } from "@/hooks/useSkeletonBg";
import { useThemeMode } from "@/theme/ThemeModeContext";

export type Column<Row> = {
  id: string;
  header: React.ReactNode;
  cell?: (row: Row) => React.ReactNode;
  accessor?: keyof Row;
  align?: "left" | "center" | "right";
};

export function EmptyState({
  message = "No records to display",
  minHeight = "12.500rem",
  padding = "1.500rem",
}: {
  message?: string;
  minHeight?: string;
  padding?: string;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        minHeight,
        p: padding,
        gap: "0.75rem",
        margin: "0 auto",
        textAlign: "center",
      }}
    >
      <Box component="img" src="/assets/noData.svg" alt="No data" sx={{ width: "5rem", height: "5rem" }} />
      <Typography variant="body1" color={theme.palette.grey[900]} sx={{ fontStyle: "normal" }}>
        {message}
      </Typography>
    </Box>
  );
}

type Props<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  isLoading?: boolean;
  emptyDataText?: string;
  from?: "dashboard";
  getRowId?: (row: Row, index: number) => string;
};

// Table styled after the material-react-table setup the original app used.
export default function DataTable<Row>({
  columns,
  rows,
  isLoading = false,
  emptyDataText = "No records to display",
  from,
  getRowId,
}: Props<Row>) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const skeletonBg = useSkeletonBg();
  const line = `0.0625rem solid ${theme.palette.border.table}`;
  const empty = !isLoading && rows.length === 0;
  const paperBg = from === "dashboard" ? theme.palette.overlay.zero : theme.palette.overlay.zero;

  if (isLoading) {
    return (
      <Box sx={{ width: "100%", padding: "1rem" }}>
        <Box sx={{ display: "table", width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <Box sx={{ display: "table-header-group", backgroundColor: isDarkMode ? "transparent" : theme.palette.common.white }}>
            <Box sx={{ display: "table-row" }}>
              {columns.map((c) => (
                <Box key={c.id} sx={{ display: "table-cell", padding: "1rem", borderBottom: `0.0625rem solid ${theme.palette.shadow.border}`, height: "3.500rem" }}>
                  <Skeleton variant="rounded" height="1.25rem" width="60%" animation="wave" sx={{ background: skeletonBg }} />
                </Box>
              ))}
            </Box>
          </Box>
          <Box sx={{ display: "table-row-group" }}>
            {Array.from({ length: 10 }).map((_, r) => (
              <Box key={r} sx={{ display: "table-row" }}>
                {columns.map((c) => (
                  <Box key={c.id} sx={{ display: "table-cell", padding: "1rem", height: "5rem" }}>
                    <Skeleton variant="rounded" height="1.5rem" width="80%" animation="wave" sx={{ background: skeletonBg }} />
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: "100%",
        minWidth: 0,
        height: "100%",
        ...(empty ? { minHeight: { xs: "18rem", md: "30rem" } } : {}),
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          boxShadow: "none",
          borderRadius: "1rem",
          width: "100%",
          minWidth: 0,
          padding: from === "dashboard" ? "0" : "1rem",
          overflow: "visible",
          backgroundColor: paperBg,
          backgroundImage: "none",
          border: "0px",
        }}
      >
        <TableContainer
          sx={{
            border: "none",
            borderRadius: "1rem",
            maxHeight: "none",
            overflowY: "visible",
            overflowX: "auto",
            position: "relative",
            width: "100%",
            backgroundColor: "transparent",
          }}
        >
          <Table sx={{ border: "none", borderRadius: "1rem", width: "100%", tableLayout: "auto", backgroundColor: "transparent" }}>
            <TableHead>
              <TableRow sx={{ boxShadow: "none", backgroundColor: "transparent", borderBottom: line }}>
                {columns.map((c) => (
                  <TableCell
                    key={c.id}
                    align={c.align}
                    sx={{
                      border: "none",
                      borderBottom: line,
                      fontWeight: 500,
                      fontSize: "0.875rem",
                      color: theme.palette.common.black,
                      height: "3.500rem",
                      padding: "1rem",
                      backgroundColor: "transparent",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.header}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={getRowId ? getRowId(row, i) : i} sx={{ backgroundColor: "transparent", "& td": { border: "none", borderBottom: line } }}>
                  {columns.map((c) => (
                    <TableCell
                      key={c.id}
                      align={c.align}
                      sx={{ height: "5rem", padding: "1rem", whiteSpace: "nowrap", backgroundColor: "transparent" }}
                    >
                      {c.cell ? c.cell(row) : c.accessor ? String(row[c.accessor] ?? "") : null}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      {empty && (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <EmptyState message={emptyDataText} />
        </Box>
      )}
    </Box>
  );
}
