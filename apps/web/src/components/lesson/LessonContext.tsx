"use client";
import { createContext, useContext } from "react";

export interface LessonCtx { chapter: string; slug: string; exerciseIds: string[]; chapterLessons: { slug: string; exercises: string[] }[] }
export const LessonContext = createContext<LessonCtx | null>(null);
export const useLessonCtx = () => useContext(LessonContext);
