import Hero from "@/components/home/Hero";
import ProtocolMarquee from "@/components/home/ProtocolMarquee";
import Fragmented from "@/components/home/Fragmented";
import KeyBenefits from "@/components/home/KeyBenefits";
import CoreFeatures from "@/components/home/CoreFeatures";
import SeidarAi from "@/components/home/SeidarAi";
import SecureInfrastructure from "@/components/home/SecureInfrastructure";
import Protocols from "@/components/home/Protocols";
import Faq from "@/components/home/Faq";
import TakeControl from "@/components/home/TakeControl";

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProtocolMarquee />
      <Fragmented />
      <KeyBenefits />
      <CoreFeatures />
      <SeidarAi />
      <SecureInfrastructure />
      <Protocols />
      <Faq />
      <TakeControl />
    </>
  );
}
