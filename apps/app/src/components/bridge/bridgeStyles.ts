import type { Theme } from "@mui/material/styles";

const FONT = "Public Sans, sans-serif";

const text = (fontSize: string, fontWeight: number, lineHeight: string, color: string) => ({
  fontFamily: FONT,
  fontWeight,
  fontSize,
  lineHeight,
  color,
});

export const bridgeText = (theme: Theme, dark = false) => ({
  heading: text("1.5rem", 500, "120%", theme.palette.common.black),
  subheading: text("1.125rem", 500, "140%", theme.palette.common.black),
  body: text("1rem", 400, "120%", dark ? theme.palette.grey[200] : theme.palette.grey[600]),
  bodyLarge: text("1rem", 400, "140%", theme.palette.common.black),
  secondary: text("1rem", 400, "140%", theme.palette.grey[200]),
});

export const bridgeInputs = (theme: Theme) => ({
  inputLarge: {
    fontFamily: FONT,
    fontWeight: 600,
    fontStyle: "normal",
    fontSize: "1.375rem",
    lineHeight: "140%",
    letterSpacing: "0%",
    verticalAlign: "middle",
    padding: "0rem",
    color: theme.palette.black.main100,
  },
  inputMedium: {
    fontFamily: FONT,
    fontWeight: 400,
    fontSize: "1rem",
    color: theme.palette.common.black,
    padding: "0rem",
    wordBreak: "break-all" as const,
  },
});

export const bridgeLayout = (theme: Theme, dark = false) => {
  const hairline = `0.0625rem solid ${theme.palette.grey.A200}`;
  return {
    networkInputStyle: {
      caretColor: "transparent",
      color: dark ? theme.palette.grey[200] : theme.palette.common.black,
      fontSize: "0.875rem",
      fontWeight: "400",
    },
    networkDropdownContainer: {
      "& .MuiOutlinedInput-root": {
        borderRadius: "1.75rem",
        height: "3rem",
        backgroundColor: dark ? theme.palette.overlay.white04 : theme.palette.surfaceBg.softInset,
        boxShadow: theme.palette.mode === "dark" ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.heavy}` : "none",
        paddingLeft: "1rem",
        paddingRight: "0.5rem",
        "& fieldset": { border: "none" },
      },
      "& .MuiInputBase-input::placeholder": { color: theme.palette.grey[200], opacity: 1 },
    },
    networkLogoInInput: {
      width: "2rem",
      height: "2rem",
      borderRadius: "50%",
      margin: "0 0.500rem 0 1rem",
      border: hairline,
      padding: "0.250rem",
    },
    networkLogoDropdownContainer: {
      width: "2rem",
      height: "2rem",
      borderRadius: "50%",
      backgroundColor: dark ? theme.palette.sidebar.black : theme.palette.grey[300],
      overflow: "hidden",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0.375rem",
    },
    networkLogoInDropdown: { width: "100%", height: "100%", objectFit: "cover" as const, borderRadius: "50%" },
    networkDropdownPaper: {
      backgroundColor: theme.palette.overlay.white08,
      backgroundImage: "none",
      backdropFilter: "blur(2.6875rem)",
      WebkitBackdropFilter: "blur(2.6875rem)",
      border: `0.0625rem solid ${theme.palette.overlay.white08}`,
      boxShadow: `0 0 1.25rem ${theme.palette.shadow.heavy}`,
      borderRadius: "1.25rem",
      padding: "0.5rem",
      marginTop: "0.5rem",
      marginBottom: "0.5rem",
      "& .MuiAutocomplete-listbox": { padding: "0 0.25rem 0 0" },
      "& .MuiAutocomplete-option": {
        borderRadius: "0.5rem",
        padding: "0.5rem 0.75rem",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        minHeight: "unset",
        color: theme.palette.sidebar.heading,
        fontSize: "0.875rem",
      },
      "& .MuiAutocomplete-option:hover, & .MuiAutocomplete-option.Mui-focused": {
        backgroundColor: theme.palette.overlay.white08,
      },
      "& .MuiAutocomplete-option[aria-selected='true'], & .MuiAutocomplete-option[aria-selected='true'].Mui-focused, & .MuiAutocomplete-option[aria-selected='true']:hover":
        {
          backgroundColor: `${theme.palette.overlay.white05} !important`,
          border: `0.0625rem solid ${theme.palette.border.main600}`,
        },
    },
    networkOptionRadio: {
      width: "1rem",
      height: "1rem",
      borderRadius: "0.5rem",
      backgroundColor: dark ? theme.palette.overlay.white20 : theme.palette.overlay.dark16,
      flexShrink: 0,
    },
    networkOptionCheck: {
      width: "1rem",
      height: "1rem",
      borderRadius: "0.5rem",
      backgroundColor: dark ? theme.palette.sidebar.white : theme.palette.sidebar.purple100,
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    selectTokenButton: {
      display: "inline-flex",
      alignItems: "center",
      gap: "0.625rem",
      height: "3rem",
      padding: "0 1.25rem",
      borderRadius: "999rem",
      backgroundColor: dark ? theme.palette.overlay.white05 : theme.palette.surfaceBg.softInset,
      border: dark ? "none" : `0.0625rem solid ${theme.palette.border.main600}`,
      boxShadow: dark ? `0 0.25rem 2.5rem 0 ${theme.palette.shadow.heavy}` : "none",
      whiteSpace: "nowrap" as const,
      userSelect: "none" as const,
      flexShrink: 0,
    },
    greyContainer: {
      backgroundColor: dark ? theme.palette.overlay.white05 : theme.palette.grey[100],
      borderRadius: "0.5rem",
      padding: "0.75rem 1rem",
    },
    iconButtonContainer: { display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%" },
    flexCenterGapMedium: { display: "flex", alignItems: "center", gap: "0.500rem" },
    flexSpaceBetween: { display: "flex", alignItems: "center", justifyContent: "space-between" },
    transparentInput: {
      backgroundColor: "transparent",
      "& .MuiOutlinedInput-root": { border: "none", padding: "0rem", "& fieldset": { border: "none" } },
    },
    inputAdornment: { marginRight: 0 },
    outputAmountContainer: { display: "flex", alignItems: "center", gap: "0.250rem", flexWrap: "wrap" as const },
    bridgeSectionCard: {
      backgroundColor: theme.palette.surfaceBg.section,
      borderRadius: "1.500rem",
      border: `0.0625rem solid ${theme.palette.border.main1000}`,
      boxShadow: dark ? `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.exchange}` : "none",
      padding: "1rem",
      position: "relative" as const,
      overflow: "hidden",
      backgroundImage: dark ? "url(/assets/bridge-bg.png)" : "none",
      backgroundSize: "contain",
      backgroundPosition: "center center",
      backgroundRepeat: "no-repeat",
      minHeight: "49.375rem",
    },
    bridgeWidgetWrapper: {
      display: "flex",
      flexDirection: "column" as const,
      justifyContent: "center",
      alignItems: "flex-start",
      gap: "1rem",
      padding: "1rem",
      borderRadius: "1.75rem",
      width: "100%",
      maxWidth: "30rem",
      backgroundColor: theme.palette.surfaceBg.section,
      border: theme.palette.mode === "light" ? `0.0625rem solid ${theme.palette.border.main1000}` : "none",
      ...(theme.palette.mode === "dark" && { backdropFilter: "blur(2rem)", WebkitBackdropFilter: "blur(2rem)" }),
      marginLeft: "auto",
      marginRight: "auto",
    },
  };
};

export const bridgeTooltip = (theme: Theme) => ({
  titleStyle: {
    fontFamily: FONT,
    fontWeight: 600,
    fontSize: "0.875rem",
    lineHeight: "140%",
    mb: "0.250rem",
    color: theme.palette.sidebar.black,
  },
  descriptionStyle: {
    fontFamily: FONT,
    fontWeight: 400,
    fontSize: "0.750rem",
    lineHeight: "140%",
    color: theme.palette.sidebar.black,
    opacity: 0.9,
  },
  tooltipProps: {
    tooltip: {
      sx: {
        bgcolor: theme.palette.sidebar.white,
        color: theme.palette.sidebar.black,
        padding: "0.625rem 0.750rem",
        borderRadius: "0.375rem",
        maxWidth: "17.500rem",
        boxShadow: `0rem 0.250rem 0.750rem ${theme.palette.shadow.strong}`,
        "& .MuiTooltip-arrow": { color: theme.palette.sidebar.white },
      },
    },
  },
});

export const summaryStyles = (theme: Theme, dark = false) => ({
  txnSummaryCard: {
    width: "100%",
    height: "100%",
    backgroundColor: dark ? theme.palette.overlay.white05 : theme.palette.surfaceBg.section,
    borderRadius: "1.25rem",
    boxShadow: dark ? `0rem 0.25rem 2.5rem 0rem ${theme.palette.shadow.exchange}` : "none",
    padding: "1rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.5rem",
    ...(dark && { backdropFilter: "blur(3.125rem)", WebkitBackdropFilter: "blur(3.125rem)" }),
    border:
      theme.palette.mode === "dark"
        ? `0.0625rem solid ${theme.palette.overlay.white08}`
        : `0.0625rem solid ${theme.palette.border.main1000}`,
  },
  lockedBody: {
    flex: 1,
    minHeight: "25rem",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "2rem",
    [theme.breakpoints.down("sm")]: { minHeight: "auto", gap: "1.5rem", py: "2.5rem" },
  },
  lockedIllustration: {
    width: "15.625rem",
    maxWidth: "100%",
    height: "auto",
    pointerEvents: "none" as const,
    userSelect: "none" as const,
  },
});
