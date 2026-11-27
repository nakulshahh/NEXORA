import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/ResetForms";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };
export default function Page() { return <ResetPasswordForm />; }
