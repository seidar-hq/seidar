"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import { useThemeMode } from "@/theme/ThemeModeContext";
import { useWallet } from "@/wallet/WalletContext";
import { AIIntroStep, FinalStep, StepPage, WelcomeStep } from "./TourSteps";

const Heading = (lead: string, accent?: string, inverted = false) => (
  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
    <Typography
      variant="h1"
      color={inverted ? "sidebar.primary" : "common.black"}
      sx={inverted ? { fontStyle: "italic" } : undefined}
    >
      {lead}{" "}
      {accent && (
        <Typography component="span" variant="h1" color={inverted ? "common.black" : "sidebar.primary"} sx={{ fontStyle: "italic" }}>
          {accent}
        </Typography>
      )}
    </Typography>
  </Box>
);

const TwoAccentHeading = (lead: string, a: string, b: string, tail = "") => (
  <Box sx={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
    <Typography variant="h1" color="common.black">
      {lead}
      <Typography component="span" variant="h1" color="sidebar.primary" sx={{ fontStyle: "italic" }}>
        {a}
      </Typography>
      {"& "}
      <Typography component="span" variant="h1" color="sidebar.primary" sx={{ fontStyle: "italic" }}>
        {b}
      </Typography>
      {tail}
    </Typography>
  </Box>
);

type Step = { headingComponent: React.ReactNode; description: string; image: string; detailsArray?: string[] };

const img = (n: number, dark: boolean) => `/assets/tour/step${n}${dark ? "Dark" : "Light"}.png`;

const getSteps = (dark: boolean): Step[] => [
  {
    headingComponent: Heading("Connect your", "Wallets"),
    description: "Connect all your Stellar wallets to get a complete overview and insights into your portfolio.",
    image: img(1, dark),
  },
  {
    headingComponent: Heading("Connect your", "Exchange Accounts"),
    description: "Log in to your exchange account, create an API key and connect the account to Seidar.",
    image: img(2, dark),
  },
  {
    headingComponent: Heading("View your", "Portfolio"),
    description: "See your portfolio KPIs and charts, your list of assets and start using Seidar.",
    image: img(3, dark),
  },
  {
    headingComponent: TwoAccentHeading("AI-Powered ", "Insights ", "Reports"),
    description:
      "Analyze your portfolio, explore token signals, and make smarter investment decisions with powerful AI insights.",
    image: img(4, dark),
  },
  {
    headingComponent: TwoAccentHeading("View your ", "Token ", "Position ", "details"),
    description:
      "Click on any token to see all token details, your balance and active positions, rewards earned and APY, and your token performance.",
    image: img(5, dark),
    detailsArray: [
      "Explore all yield opportunities and directly deposit into them with just a few clicks.",
      "Track your positions and switch when better yield opportunities come up.",
      "See your entire transaction history of the token across your wallets and protocols.",
    ],
  },
  {
    headingComponent: Heading("Start", "Trading"),
    description:
      "Trade across Stellar's DEXs and AMMs and find a broad spectrum of tokens and pairs with the deepest liquidity.",
    image: img(6, dark),
    detailsArray: [
      "Go to Trade / Swap and get advanced charts across markets.",
      "Pick your venue of choice and find the best prices.",
    ],
  },
  {
    headingComponent: Heading("Bridge", "Tokens", true),
    description: "Bridge tokens to and from Stellar across a growing number of chains.",
    image: img(7, dark),
  },
  {
    headingComponent: Heading("Stake", "Tokens", true),
    description: "Stake your tokens and generate attractive yields across Stellar protocols.",
    image: img(8, dark),
  },
  {
    headingComponent: Heading("Lend", "Tokens", true),
    description: "Supply your tokens to lending protocols to earn interest and always stay on track.",
    image: img(9, dark),
  },
  {
    headingComponent: Heading("Borrow", "Tokens", true),
    description: "Borrow against your tokens to leverage trades and make capital more efficient.",
    image: img(10, dark),
  },
  {
    headingComponent: Heading("Provide", "Liquidity"),
    description: "Supply your token pairs to automated market maker pools and earn trading fees.",
    image: img(11, dark),
  },
  {
    headingComponent: Heading("Track all your", "positions"),
    description: "See all your active positions and manage each position directly from one place.",
    image: img(12, dark),
  },
  {
    headingComponent: Heading("Track your", "Transactions & Export Reports"),
    description:
      "Keep full control of all your transactions across all your wallets, see the details of each transaction and export spreadsheets or reports.",
    image: img(13, dark),
  },
];

function TourGuide({
  handleClose,
  onStepChange,
  onTotalStepsChange,
}: {
  handleClose: () => void;
  onStepChange: (s: number) => void;
  onTotalStepsChange: (n: number) => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const { isConnected } = useWallet();
  const { isDarkMode } = useThemeMode();
  const steps = getSteps(isDarkMode);

  const next = useCallback(() => {
    setStep(step + 1);
    onStepChange(step + 1);
  }, [step, onStepChange]);
  const prev = useCallback(() => {
    setStep(step - 1);
    onStepChange(step - 1);
  }, [step, onStepChange]);
  const closeAndNavigate = useCallback(() => {
    handleClose();
    router.push("/dashboard");
  }, [handleClose, router]);

  const dots = isConnected ? steps.length : steps.length + 1;
  const total = steps.length + 3;

  useEffect(() => onTotalStepsChange(total), [total, onTotalStepsChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        if (step < total - 1) next();
        else if (isConnected) closeAndNavigate();
      } else if (e.key === "ArrowLeft" && step > 0) prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, total, isConnected, next, prev, closeAndNavigate]);

  let content: React.ReactNode;
  if (step === 0) content = <AIIntroStep handleNext={next} />;
  else if (step === 1) content = <WelcomeStep handleNext={next} handleClose={handleClose} />;
  else if (step === total - 1) content = <FinalStep handleCloseAndNavigate={closeAndNavigate} />;
  else {
    const s = steps[step - 2];
    const isFinish = isConnected && step - 1 === steps.length;
    content = (
      <StepPage
        headingComponent={s.headingComponent}
        description={s.description}
        image={s.image}
        handlePrevious={prev}
        handleClose={handleClose}
        detailsArray={s.detailsArray ?? []}
        isFinishButton={isFinish}
        currentStep={step - 2}
        totalSteps={dots}
        handleNextAndNavigate={() => (isFinish ? closeAndNavigate() : next())}
      />
    );
  }

  return (
    <Box
      sx={{
        p: step <= 1 || step === total - 1 ? 0 : { xs: "1rem", sm: "1.875rem" },
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        width: "100%",
      }}
    >
      {content}
    </Box>
  );
}

export default function TourGuideModal({ open, handleClose }: { open: boolean; handleClose: () => void }) {
  const theme = useTheme();
  const { isDarkMode } = useThemeMode();
  const [step, setStep] = useState(0);
  const [total, setTotal] = useState(0);

  const isIntro = step === 0;
  const isWelcome = step === 1;
  const isFinal = total > 0 && step === total - 1;
  const isCover = isIntro || isWelcome || isFinal;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={(_, reason) => reason !== "backdropClick" && handleClose()}
      maxWidth={false}
      PaperProps={{
        elevation: 0,
        sx: {
          width: "90vw",
          maxWidth: "54.625rem",
          height: "90vh",
          maxHeight: "53rem",
          borderRadius: "1.625rem",
          position: "relative",
          border: isCover
            ? "none"
            : theme.palette.mode === "dark"
              ? `0.0625rem solid ${theme.palette.purple.main100}33`
              : `0.125rem solid ${theme.palette.purple.main}33`,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "sidebar.main",
          backgroundImage: "none",
          ...(isCover || isWelcome
            ? { boxShadow: `0 0.25rem 2.5rem 0 ${theme.palette.shadow.default}` }
            : {
                justifyContent: "center",
                alignItems: "center",
                gap: "1.5rem",
                background: theme.palette.mode === "dark" ? theme.palette.overlay.white04 : theme.palette.common.white,
                boxShadow: `0 0.25rem 2.5rem 0 ${theme.palette.shadow.exchange}`,
                backdropFilter: "blur(2.6875rem)",
                WebkitBackdropFilter: "blur(2.6875rem)",
              }),
        },
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        <TourGuide handleClose={handleClose} onStepChange={setStep} onTotalStepsChange={setTotal} />
        <IconButton
          sx={{
            position: "absolute",
            top: "1.25rem",
            right: "1.5rem",
            borderRadius: "50%",
            backgroundColor: isDarkMode ? "overlay.white10" : "grey.800",
            color: "common.black",
            width: "2rem",
            height: "2rem",
            zIndex: 10,
            boxShadow: isDarkMode ? `0 0.1543rem 1.5428rem 0 ${theme.palette.shadow.elevated}` : "none",
            "&:hover": { backgroundColor: isDarkMode ? "overlay.white15" : "grey.300" },
          }}
          onClick={handleClose}
        >
          <CloseIcon sx={{ fontSize: "1.125rem" }} />
        </IconButton>
      </Box>
    </Dialog>
  );
}
