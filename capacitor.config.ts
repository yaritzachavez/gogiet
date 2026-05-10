import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.yaritzachavez.gogieats",
  appName: "Gogi Eats",
  webDir: "out",
  server: {
    url: "https://www.gogieats.shop",
    cleartext: false,
  },
};

export default config;
