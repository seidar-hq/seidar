"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { styled, useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { IoClose } from "react-icons/io5";
import ResponsiveTypography from "@/components/common/ResponsiveTypography";
import { useAlerts } from "@/components/common/Alerts";
import { CONTACT_ENDPOINT } from "@/lib/links";
import type { PolymorphicBox } from "@/theme/polymorphic";

const inputStyles = (theme: Theme) => ({
  "& .MuiOutlinedInput-root": {
    height: "3.0625rem",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: "8px",
    color: theme.palette.white.main,
    "& fieldset": { borderColor: "rgba(255,255,255,0.12)" },
    "&:hover fieldset": { borderColor: "rgba(255,255,255,0.2)" },
    "&.Mui-focused fieldset": { borderColor: "rgba(255,255,255,0.3)" },
  },
  "& .MuiInputBase-input": {
    color: theme.palette.white.main,
    fontSize: "14px",
    [theme.breakpoints.down("md")]: { fontSize: "12px" },
    "&::placeholder": { color: theme.palette.grey.inputPlaceholder, opacity: 1 },
  },
});

const Root = styled(Box)(({ theme }) => ({
  position: "relative",
  display: "flex",
  flexDirection: "row",
  gap: "28px",
  padding: "28px",
  minHeight: "700px",
  borderRadius: "10px",
  overflow: "hidden",
  [theme.breakpoints.down("md")]: {
    flexDirection: "column",
    minHeight: "550px",
    padding: "20px",
    gap: "14px",
  },
  "@media (max-height: 600px) and (orientation: landscape)": {
    minHeight: "auto",
    maxHeight: "90vh",
    overflowY: "auto",
  },
}));

const LoadingOverlay = styled(Box)({
  position: "absolute",
  inset: 0,
  zIndex: 10,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "16px",
  background: "rgba(10, 10, 16, 0.7)",
  backdropFilter: "blur(6px)",
  borderRadius: "inherit",
}) as unknown as PolymorphicBox<object>;

const ImagePane = styled(Box)(({ theme }) => ({
  position: "relative",
  width: "415px",
  flexShrink: 0,
  overflow: "hidden",
  borderRadius: "10px",
  border: "1px solid rgba(0,0,0,0.05)",
  [theme.breakpoints.down("md")]: { display: "none" },
}));

const BrandMark = styled("img")({
  width: 38,
  height: 38,
  borderRadius: "4.694px",
  background: "rgba(255, 255, 255, 0.10)",
  padding: "8px",
});

const PaneImage = styled("img")({
  width: "100%",
  height: "100%",
  objectFit: "cover",
  display: "block",
});

const FormPane = styled(Box)(({ theme }) => ({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  minWidth: 0,
  gap: "28px",
  [theme.breakpoints.down("md")]: { gap: "18px" },
})) as unknown as PolymorphicBox<object>;

const HeaderRow = styled(Box)({ display: "flex", justifyContent: "space-between", alignItems: "center" });

const CloseButton = styled(IconButton)(({ theme }) => ({
  color: theme.palette.white.main,
  borderRadius: "50px",
  background: "rgba(255, 255, 255, 0.10)",
  padding: "8px",
  "&:hover": { backgroundColor: "rgba(255,255,255,0.10)" },
}));

const Fields = styled(Box)({ display: "flex", flexDirection: "column", gap: "16px" });
const Field = styled(Box)({ display: "flex", flexDirection: "column", gap: "1px" });

const Input = styled(TextField)(({ theme }) => ({ ...inputStyles(theme) }));

const TextArea = styled(TextField)(({ theme }) => ({
  ...inputStyles(theme),
  "& .MuiOutlinedInput-root": {
    ...inputStyles(theme)["& .MuiOutlinedInput-root"],
    height: "auto",
    minHeight: "128px",
    alignItems: "flex-start",
    [theme.breakpoints.down("md")]: { minHeight: "80px" },
  },
}));

const SubmitButton = styled(Button)(({ theme }) => ({
  borderRadius: "1000px",
  border: "1px solid rgba(255,255,255,0.12)",
  color: theme.palette.white.main,
  backgroundColor: "#0F0F16",
  textTransform: "none",
  fontSize: "16px",
  fontWeight: 500,
  padding: "9px 16px",
  alignSelf: "flex-start",
  display: "flex",
  alignItems: "center",
  gap: "16px",
  transition: "all 0.3s ease",
  "&:hover": { backgroundColor: "#15151F", borderColor: "rgba(255,255,255,0.24)" },
}));

const SubmitIcon = styled(Box)({
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "linear-gradient(135deg, #4F7BFF 0%, #346CFF 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const BLOCKED_DOMAINS = [
  "test.com", "test.org", "testing.com", "example.com", "example.org", "example.net", "fake.com",
  "mailinator.com", "tempmail.com", "throwaway.email", "guerrillamail.com", "yopmail.com",
  "sharklasers.com", "grr.la", "dispostable.com", "maildrop.cc", "temp-mail.org", "trashmail.com",
  "fakeinbox.com", "mailnesia.com", "guerrillamailblock.com",
];
const MAX_WORDS = { name: 10, specification: 150 } as const;
const MAX_CHARS = { name: 60, specification: 1200 } as const;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const countWords = (value: string) => {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

type FormState = { name: string; email: string; specification: string };
type FieldName = keyof FormState;

const EMPTY_FORM: FormState = { name: "", email: "", specification: "" };

const RequiredLabel = ({ children }: { children: string }) => (
  <ResponsiveTypography variant="caption" smallFontSize={12} mediumFontSize={12} sx={{ letterSpacing: "-0.24px" }}>
    {children}
    <Typography component="span" variant="caption" sx={{ color: "error.main", ml: 0.5 }}>
      *
    </Typography>
  </ResponsiveTypography>
);

const FieldError = ({ message }: { message: string }) =>
  message ? (
    <ResponsiveTypography
      variant="overline"
      smallFontSize={10}
      mediumFontSize={10}
      sx={{ color: "error.main", textTransform: "none" }}
    >
      {message}
    </ResponsiveTypography>
  ) : null;

const WordCount = ({ value, max }: { value: string; max: number }) => (
  <ResponsiveTypography
    variant="overline"
    smallFontSize={10}
    mediumFontSize={10}
    sx={{ textTransform: "none", opacity: 0.5, alignSelf: "flex-end" }}
  >
    {countWords(value)}/{max} words
  </ResponsiveTypography>
);

export default function ContactForm({ onClose, hideClose = false }: { onClose?: () => void; hideClose?: boolean }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { successAlert, errorAlert } = useAlerts();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imageRef.current?.complete) setImageLoaded(true);
  }, []);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const name = event.target.name as FieldName;
    let value = event.target.value;
    const maxChars = MAX_CHARS[name as keyof typeof MAX_CHARS];
    if (maxChars && value.length > maxChars) value = value.slice(0, maxChars);
    const maxWords = MAX_WORDS[name as keyof typeof MAX_WORDS];
    if (maxWords) {
      const words = value.trim().split(/\s+/).filter(Boolean);
      if (words.length > maxWords) value = words.slice(0, maxWords).join(" ");
    }
    setForm({ ...form, [name]: value });
    setErrors({ ...errors, [name]: "" });
  };

  const validate = () => {
    const next: FormState = { ...EMPTY_FORM };
    if (!form.name.trim()) next.name = "Please enter your name.";

    const email = form.email.trim();
    if (!email) next.email = "Please enter your email address.";
    else if (email.split(/[,;]+/).filter(Boolean).length > 1)
      next.email = "Please enter only one email address, remove the extra one(s).";
    else if (/\s/.test(email))
      next.email = "Email addresses can't contain spaces, please remove any spaces and try again.";
    else if (!EMAIL_PATTERN.test(email))
      next.email = "That doesn't look like a valid email address — please double-check and try again.";
    else {
      const domain = email.split("@")[1].toLowerCase();
      if (BLOCKED_DOMAINS.some((blocked) => domain === blocked || domain.endsWith(`.${blocked}`)))
        next.email = "Please use a real email address.";
    }

    if (!form.specification.trim()) next.specification = "Please enter your query.";
    setErrors(next);
    return !next.name && !next.email && !next.specification;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    if (!CONTACT_ENDPOINT) {
      errorAlert({ message: "The contact form isn't connected yet. Please reach out to us on X." });
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw response;
      setForm(EMPTY_FORM);
      successAlert({ message: "Thank you for contacting us, we will get in touch with you shortly." });
      onClose?.();
    } catch (error) {
      const status = error instanceof Response ? error.status : undefined;
      const message =
        status === 409
          ? "It looks like we already have a submission from this email address. Our team will be in touch soon."
          : status === 429
            ? "Please wait a few seconds and try again."
            : "Something went wrong, please try again.";
      errorAlert({ message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Root>
      <AnimatePresence>
        {isLoading && (
          <LoadingOverlay
            component={motion.div}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <CircularProgress size={40} thickness={4} sx={{ color: "#fff" }} />
            <Typography variant="body4Medium" sx={{ color: "white.main" }}>
              Submitting your request...
            </Typography>
          </LoadingOverlay>
        )}
      </AnimatePresence>

      <ImagePane>
        {!imageLoaded && (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{ width: "100%", height: "100%", bgcolor: "rgba(255,255,255,0.08)" }}
          />
        )}
        <PaneImage
          ref={imageRef}
          src="/images/contact/join-beta.png"
          alt="Contact Us"
          onLoad={() => setImageLoaded(true)}
          sx={{
            opacity: imageLoaded ? 1 : 0,
            transition: "opacity 0.3s ease-in",
            position: imageLoaded ? "static" : "absolute",
          }}
        />
      </ImagePane>

      <FormPane component="form" autoComplete="off" onSubmit={handleSubmit}>
        <Fields>
          <HeaderRow>
            <BrandMark src="/logos/seidar-mark-white.svg" alt="Seidar logo" />
            {!hideClose && (
              <CloseButton onClick={onClose} aria-label="Close">
                <IoClose style={{ fontSize: 20 }} />
              </CloseButton>
            )}
          </HeaderRow>

          <Box sx={{ display: "flex", flexDirection: "column", gap: "11px" }}>
            <Typography variant="body2SemiBold">Get started with Seidar</Typography>
            <Typography variant="subtitle1" sx={{ opacity: 0.8 }}>
              Let’s Build Your Financial Future
            </Typography>
          </Box>

          <Field>
            <RequiredLabel>Name</RequiredLabel>
            <Input
              name="name"
              placeholder="e.g. john Doe"
              value={form.name}
              onChange={handleChange}
              error={!!errors.name}
              fullWidth
              size="small"
              slotProps={{ htmlInput: { maxLength: MAX_CHARS.name } }}
            />
            <FieldError message={errors.name} />
            <WordCount value={form.name} max={MAX_WORDS.name} />
          </Field>

          <Field>
            <RequiredLabel>Email Address</RequiredLabel>
            <Input
              name="email"
              placeholder="e.g. johndoe@gmail.com"
              value={form.email}
              onChange={handleChange}
              error={!!errors.email}
              fullWidth
              size="small"
            />
            <FieldError message={errors.email} />
          </Field>

          <Field>
            <RequiredLabel>Query</RequiredLabel>
            <TextArea
              name="specification"
              placeholder="Type your query"
              value={form.specification}
              onChange={handleChange}
              error={!!errors.specification}
              fullWidth
              multiline
              rows={isMobile ? 3 : 4}
              slotProps={{ htmlInput: { maxLength: MAX_CHARS.specification } }}
            />
            <FieldError message={errors.specification} />
            <WordCount value={form.specification} max={MAX_WORDS.specification} />
          </Field>
        </Fields>

        <SubmitButton type="submit" disabled={isLoading}>
          <Typography variant="body4Medium">{isLoading ? "Submitting..." : "Submit"}</Typography>
          <SubmitIcon>
            {isLoading ? (
              <CircularProgress size={14} thickness={5} sx={{ color: "#fff" }} />
            ) : (
              <Box component="img" src="/images/icons/arrow-white.svg" alt="" sx={{ width: 10, height: 10 }} />
            )}
          </SubmitIcon>
        </SubmitButton>
      </FormPane>
    </Root>
  );
}
