import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/Dashboard";

export const metadata: Metadata = { title: "Workspace" };
export default function LearnPage() { return <Dashboard />; }
