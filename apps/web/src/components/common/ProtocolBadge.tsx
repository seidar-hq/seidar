import Box from "@mui/material/Box";

export type Protocol = {
  name: string;
  // White monochrome mark shown before the name.
  mark: string;
  // Relative size tweak for marks with unusual proportions.
  markScale?: number;
};

// Pill badge in the style of the original protocol badges: 10% white fill, white artwork at 70% opacity.
// Sizes are expressed in container units so the badge scales with its grid cell like the original SVGs did.
export default function ProtocolBadge({ protocol }: { protocol: Protocol }) {
  const { name, mark, markScale = 1 } = protocol;

  return (
    <Box
      role="img"
      aria-label={name}
      sx={{
        containerType: "inline-size",
        width: "100%",
        aspectRatio: "206 / 73",
        borderRadius: "1000px",
        background: "rgba(255, 255, 255, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "4cqw",
          opacity: 0.7,
        }}
      >
        <Box
          component="img"
          src={mark}
          alt=""
          sx={{ height: `${12.5 * markScale}cqw`, display: "block" }}
        />
        <Box
          component="span"
          sx={{
            color: "#FFF",
            fontFamily: '"Public Sans", sans-serif',
            fontWeight: 500,
            fontSize: "9.7cqw",
            lineHeight: 1,
            letterSpacing: "-0.02em",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </Box>
      </Box>
    </Box>
  );
}
