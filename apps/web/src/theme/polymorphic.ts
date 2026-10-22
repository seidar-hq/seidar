import type { BoxProps } from "@mui/material/Box";

// styled(Box) drops Box's `component` prop from its type; this restores it (plus any custom props).
export type PolymorphicBox<P = object> = React.FC<
  BoxProps & P & { component?: React.ElementType; [prop: string]: unknown }
>;
