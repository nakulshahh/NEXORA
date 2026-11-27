"use client";
import { useEffect } from "react";
import { recordVisit } from "@/lib/progress";

export function ChapterVisit({ id }: { id: string }) {
  useEffect(() => { recordVisit(id); }, [id]);
  return null;
}
