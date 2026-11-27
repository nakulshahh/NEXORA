import { DnsSim } from "@/components/sim/DnsSim";
import { HttpSim } from "@/components/sim/HttpSim";
import { EventLoopSim } from "@/components/sim/EventLoopSim";
import { AuthSim, BtreeSim, BytesSim, CacheSim, RouterSim } from "@/components/sim/LabSims";

const SIMS = { dns: DnsSim, http: HttpSim, "event-loop": EventLoopSim, router: RouterSim, bytes: BytesSim, auth: AuthSim, btree: BtreeSim, cache: CacheSim } as const;

/** A real simulation embedded in a lesson. State stays local; the full lab page has shareable URLs. */
export function Sim({ id }: { id: keyof typeof SIMS }) {
  const S = SIMS[id];
  return <S embedded />;
}
