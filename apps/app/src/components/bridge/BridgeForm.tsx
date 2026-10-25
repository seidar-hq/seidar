"use client";

import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CheckRounded from "@mui/icons-material/CheckRounded";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";
import { bridgeInputs, bridgeLayout, bridgeText, bridgeTooltip } from "./bridgeStyles";

type Network = { id: string; name: string; logoURI: string };

// Networks the bridge can route between once a wallet is connected.
export const BRIDGE_NETWORKS: Network[] = [
  { id: "stellar", name: "Stellar", logoURI: "/assets/wallets/xlm-logo.png" },
  { id: "ethereum", name: "Ethereum", logoURI: "/assets/weth.png" },
];

const isNumber = (v: string) => v === "" || /^\d*\.?\d*$/.test(v);

function NetworkSelect({
  placeholder,
  value,
  onChange,
  options,
  disabled,
}: {
  placeholder: string;
  value: Network | undefined;
  onChange: (n: Network | undefined) => void;
  options: Network[];
  disabled: boolean;
}) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);

  return (
    <Autocomplete
      value={value ?? undefined}
      onChange={(_, v) => onChange(v ?? undefined)}
      options={options}
      getOptionLabel={(o) => o.name}
      disabled={disabled}
      onKeyDown={(e) => e.preventDefault()}
      popupIcon={<KeyboardArrowDown sx={{ color: "grey.200", fontSize: "1.25rem" }} />}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          placeholder={placeholder}
          sx={s.networkDropdownContainer}
          slotProps={{
            input: {
              ...params.InputProps,
              style: s.networkInputStyle,
              startAdornment: value ? (
                <InputAdornment position="start" sx={s.inputAdornment}>
                  <img src={value.logoURI} alt={value.name} style={s.networkLogoInInput} />
                </InputAdornment>
              ) : null,
            },
          }}
        />
      )}
      renderOption={(props, option, { selected }) => {
        const { key, ...rest } = props;
        return (
          <Box
            key={key}
            component="li"
            {...rest}
            sx={{ display: "flex !important", alignItems: "center", justifyContent: "space-between", width: "100%" }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
              <Box sx={s.networkLogoDropdownContainer}>
                <img src={option.logoURI} alt={option.name} style={s.networkLogoInDropdown} />
              </Box>
              <Typography variant="body3" sx={{ color: "sidebar.heading" }} noWrap>
                {option.name}
              </Typography>
            </Box>
            <Box sx={selected ? s.networkOptionCheck : s.networkOptionRadio}>
              {selected && (
                <CheckRounded sx={{ fontSize: "0.625rem", color: isDarkMode ? "sidebar.purple100" : "sidebar.white" }} />
              )}
            </Box>
          </Box>
        );
      }}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      disableClearable
      noOptionsText="No networks found"
      slotProps={{ paper: { sx: s.networkDropdownPaper } }}
    />
  );
}

export default function BridgeForm() {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const { isConnected } = useWallet();
  const t = useMemo(() => bridgeText(theme, isDarkMode), [theme, isDarkMode]);
  const inputs = useMemo(() => bridgeInputs(theme), [theme]);
  const s = useMemo(() => bridgeLayout(theme, isDarkMode), [theme, isDarkMode]);
  const tip = useMemo(() => bridgeTooltip(theme), [theme]);

  const [from, setFrom] = useState<Network | undefined>();
  const [to, setTo] = useState<Network | undefined>();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [editingDestination, setEditingDestination] = useState(false);

  const sameNetwork = !!from && !!to && from.name === to.name;
  const tokenDisabled = !isConnected || !from || !to;
  const editBg = editingDestination ? theme.palette.grey.A100 : isDarkMode ? theme.palette.grey[800] : theme.palette.common.white;

  return (
    <Box sx={{ width: "100%", maxWidth: "43.750rem", px: { xs: 0, sm: 0, md: 0 } }}>
      <Typography variant="subtitle2" sx={{ ...t.subheading, mb: "1rem" }}>
        Bridge Asset
      </Typography>
      <Box sx={{ mb: "1rem" }}>
        <Typography variant="subtitle1" sx={{ mb: "1rem", ...t.bodyLarge }}>
          Select Network
        </Typography>
        <Box sx={{ display: "flex", flexDirection: { xs: "column", sm: "row" }, gap: "1rem" }}>
          <Box sx={{ flex: 1 }}>
            <NetworkSelect
              placeholder="From"
              value={isConnected ? from : undefined}
              onChange={(n) => {
                setFrom(n);
                setAmount("");
              }}
              options={BRIDGE_NETWORKS}
              disabled={!isConnected}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <NetworkSelect
              placeholder="To"
              value={isConnected ? to : undefined}
              onChange={(n) => {
                setTo(n);
                setAmount("");
              }}
              options={BRIDGE_NETWORKS.filter((n) => n.id !== from?.id)}
              disabled={!isConnected || !from}
            />
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <Typography variant="subtitle2" sx={{ mb: "0.500rem", ...t.bodyLarge }}>
          Amount
        </Typography>
        <Box sx={s.greyContainer}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
              width: "100%",
              mb: "1rem",
              gap: { xs: "1rem", sm: "0rem" },
            }}
          >
            <TextField
              variant="outlined"
              placeholder="0"
              type="text"
              size="small"
              sx={{ ...s.transparentInput, flex: { xs: "unset", sm: 1 }, "& .MuiInputBase-input": inputs.inputLarge }}
              onChange={(e) => isNumber(e.target.value) && setAmount(e.target.value)}
              value={amount}
            />
            <Box
              sx={{
                ...s.selectTokenButton,
                cursor: tokenDisabled ? "default" : "pointer",
                opacity: tokenDisabled ? 0.5 : 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ color: "common.black" }}>
                Select Token
              </Typography>
              <KeyboardArrowDown sx={{ fontSize: "1.125rem", color: "primary.main" }} />
            </Box>
          </Box>
          <Box sx={{ ...s.flexSpaceBetween, width: "100%" }}>
            <Typography variant="body2" sx={{ ...t.secondary }}>
              $0.00
            </Typography>
            <Typography variant="body2" sx={{ ...t.secondary }}>
              Balance: 0.00
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              width: "100%",
              mt: "0.75rem",
              pt: "0.75rem",
              borderTop: `0.0625rem solid ${theme.palette.grey[300]}`,
              gap: { xs: "1rem", sm: "0rem" },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
              <img src="/assets/bridge/timer.svg" alt="timer" style={{ width: "1.250rem", height: "1.250rem" }} />
              <Typography variant="body1" sx={{ whiteSpace: "nowrap", color: theme.palette.grey[200] }}>
                ~0 secs
              </Typography>
            </Box>
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                alignItems: { xs: "flex-start", sm: "center" },
                gap: "0.875rem",
                width: { xs: "100%", sm: "auto" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.250rem" }}>
                <Typography variant="body1" sx={{ whiteSpace: "nowrap", color: theme.palette.grey[200], cursor: "default" }}>
                  $0.00 fee
                </Typography>
                <Tooltip
                  title={
                    <Box>
                      <Typography sx={tip.titleStyle}>Bridge fee</Typography>
                      <Typography sx={tip.descriptionStyle}>
                        Fee paid to the bridge&apos;s liquidity providers and relayers.
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="top"
                  componentsProps={tip.tooltipProps}
                >
                  <InfoOutlinedIcon sx={{ fontSize: "1rem", color: "primary.main", cursor: "pointer" }} />
                </Tooltip>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                <Box
                  sx={{
                    ...s.iconButtonContainer,
                    backgroundColor: theme.palette.common.white,
                    width: "2rem",
                    height: "2rem",
                    padding: "0.125rem",
                  }}
                >
                  <LocalGasStationIcon sx={{ fontSize: "1.125rem", color: theme.palette.grey[200] }} />
                </Box>
                <Typography variant="body1" sx={{ whiteSpace: "nowrap", color: theme.palette.grey[200], cursor: "default" }}>
                  $0.00
                </Typography>
                <Tooltip
                  title={
                    <Box>
                      <Typography sx={tip.titleStyle}>Destination gas fee</Typography>
                      <Typography sx={tip.descriptionStyle}>
                        Fee to cover gas for the destination chain transaction.
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="top"
                  componentsProps={tip.tooltipProps}
                >
                  <InfoOutlinedIcon sx={{ fontSize: "1rem", color: "primary.main", cursor: "pointer" }} />
                </Tooltip>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <Box
          sx={{
            backgroundColor: isDarkMode ? theme.palette.overlay.white05 : theme.palette.grey[100],
            borderRadius: "0.5rem",
            padding: { xs: "0.625rem 0.750rem", sm: "0.75rem 1rem" },
            display: "flex",
            alignItems: "center",
            gap: { xs: "0.500rem", sm: "0.750rem" },
            flexWrap: "wrap",
          }}
        >
          <Box sx={s.outputAmountContainer}>
            <Typography variant="subtitle1" color="grey.200" sx={{ cursor: "default" }}>
              0.00 ($0.00) in{" "}
            </Typography>
            <Typography variant="subtitle1" color="primary.main">
              ~0 secs
            </Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: "1rem" }}>
        <Box sx={s.greyContainer}>
          <Typography variant="body1" sx={{ mb: "0.5rem", color: theme.palette.grey[200] }}>
            Destination address
          </Typography>
          <Box sx={s.flexCenterGapMedium}>
            <TextField
              value={destination}
              onChange={(e) => setDestination(e.target.value.replace(/\s/g, ""))}
              disabled={!editingDestination}
              placeholder="Enter destination address"
              fullWidth
              multiline
              size="small"
              sx={{
                ...s.transparentInput,
                "& .MuiInputBase-input": inputs.inputMedium,
                "& .MuiInputBase-input.Mui-disabled": {
                  WebkitTextFillColor: isDarkMode ? theme.palette.primary.main : theme.palette.common.black,
                },
              }}
            />
            <Box
              onClick={() => setEditingDestination(!editingDestination)}
              sx={{
                ...s.iconButtonContainer,
                cursor: "pointer",
                width: "2rem",
                height: "2rem",
                flexShrink: 0,
                backgroundColor: editBg,
                border: editingDestination ? `0.0625rem solid ${theme.palette.primary.main}` : "none",
                "&:hover": { backgroundColor: isDarkMode ? theme.palette.grey[800] : theme.palette.grey.A100 },
              }}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d={
                    editingDestination
                      ? "M15 5L7.5 12.5L5 10"
                      : "M14.166 2.5009C14.3849 2.28203 14.6447 2.10842 14.9307 1.98996C15.2167 1.87151 15.5232 1.81055 15.8327 1.81055C16.1422 1.81055 16.4487 1.87151 16.7347 1.98996C17.0206 2.10842 17.2805 2.28203 17.4993 2.5009C17.7182 2.71977 17.8918 2.97961 18.0103 3.26558C18.1287 3.55154 18.1897 3.85804 18.1897 4.16757C18.1897 4.4771 18.1287 4.7836 18.0103 5.06956C17.8918 5.35553 17.7182 5.61537 17.4993 5.83424L6.24935 17.0842L1.66602 18.3342L2.91602 13.7509L14.166 2.5009Z"
                  }
                  stroke={theme.palette.primary.main}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Box>
          </Box>
        </Box>
      </Box>

      {sameNetwork && (
        <Alert severity="error" sx={{ mb: "0.75rem" }}>
          Source and destination networks must be different.
        </Alert>
      )}
      <Button variant="solid" fullWidth disabled>
        {isConnected ? "CONFIRM" : "CONNECT WALLET"}
      </Button>
    </Box>
  );
}
