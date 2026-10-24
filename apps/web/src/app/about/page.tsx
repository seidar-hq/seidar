import type { Metadata } from "next";
import AboutHero from "@/components/about/AboutHero";
import AboutStory from "@/components/about/AboutStory";
import AboutAgents from "@/components/about/AboutAgents";
import AboutTerminals from "@/components/about/AboutTerminals";
import TakeControl from "@/components/home/TakeControl";

export const metadata: Metadata = {
  title: "About Seidar",
  description: "Seidar brings Stellar's DeFi protocols together so you and your agents can see the full picture.",
};

export default function AboutPage() {
  return (
    <>
      <AboutHero />
      <AboutStory />
      <AboutAgents />
      <AboutTerminals />
      <TakeControl />
    </>
  );
}
