import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Centrale",
    short_name: "Centrale",
    description: "Find the right investors. Get the meeting.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6f1e8",
    theme_color: "#391c25",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
