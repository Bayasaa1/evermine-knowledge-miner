import { createFileRoute, redirect } from "@tanstack/react-router";

// The old demo feed was removed; keep the address working by sending visitors home.
export const Route = createFileRoute("/explore")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});
