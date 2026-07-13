import { createPluginPage } from "../lib/plugin-list";
const builtinFallbacks = [
  {
    name: "cli" as const,
    pluginType: "platform" as const,
    source: "built-in" as const,
    status: "enabled" as const,
    manifest: {
      name: "cli" as const,
      type: "platform" as const,
      description: "Command-line interface platform",
    },
    config: {},
  },
];
export const renderPlatforms = createPluginPage({
  type: "platform",
  title: "Platforms",
  subtitle: "Communication platforms — built-in and plugin-based",
  builtinFallbacks,
});
