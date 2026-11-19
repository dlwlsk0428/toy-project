import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let a phone on the same Wi-Fi open the dev server by the computer's private IP
  // (the punch-power bonus game). Each `*` stands for one part of the address.
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
};

export default nextConfig;
