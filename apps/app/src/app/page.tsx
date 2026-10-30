import Home from "@/components/home/Home";
import Portfolio from "@/components/portfolio/Portfolio";
import { HOME_ENABLED } from "@/lib/features";

// "/" is Home once it ships; until then it stays Portfolio (see lib/features.ts).
export default function Page() {
  return HOME_ENABLED ? <Home /> : <Portfolio />;
}
