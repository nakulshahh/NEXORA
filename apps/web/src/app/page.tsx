import { Hero } from "@/components/landing/Hero";
import { Iceberg } from "@/components/landing/Iceberg";
import { Philosophy } from "@/components/landing/Philosophy";
import { CurriculumPreview } from "@/components/landing/CurriculumPreview";
import { Labs } from "@/components/landing/Labs";
import { Professor } from "@/components/landing/Professor";
import { Experience } from "@/components/landing/Experience";
import { Final } from "@/components/landing/Final";
import { ScrollTrace } from "@/components/landing/ScrollTrace";

export default function Home() {
  return (
    <>
      <ScrollTrace />
      <Hero />
      <Iceberg />
      <Philosophy />
      <CurriculumPreview />
      <Labs />
      <Professor />
      <Experience />
      <Final />
    </>
  );
}
