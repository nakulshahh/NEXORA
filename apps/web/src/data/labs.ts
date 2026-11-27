import { SIM_IDS } from "@/sim";
import { PAGE_LABS } from "./curriculum";

/** A lab is live if it is a registered simulation or a standalone lab page. */
export const isLiveLab = (id: string) => (SIM_IDS as string[]).includes(id) || PAGE_LABS.includes(id);
