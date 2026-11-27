import type { Metadata } from "next";
import { Account } from "@/components/auth/Account";

export const metadata: Metadata = { title: "Account" };
export default function Page() { return <Account />; }
