"use client";
import { useLayoutEffect, useState } from "react";

let mounts = 0;
/** Plays the curtain lift on client-side navigations only — never on first load. */
export function RouteCurtain() {
  const [show, setShow] = useState(false);
  useLayoutEffect(() => {
    mounts += 1;
    if (mounts > 1) setShow(true);
  }, []);
  return show ? <div className="route-curtain" aria-hidden="true" /> : null;
}
