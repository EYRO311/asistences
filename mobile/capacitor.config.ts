import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eyro.agenda",
  appName: "Mi Agenda",
  webDir: "dist",
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
      androidIsEncryption: false,
      electronWindowsLocation: "C:\\ProgramData\\CapacitorDatabases",
    },
  },
};

export default config;
