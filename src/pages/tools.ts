import { createPluginPage } from "../lib/plugin-list";
export const renderTools = createPluginPage({
  type: "tool",
  title: "Tools",
  subtitle: "MCP tools and servers - built-in and plugin-based",
  showMcpTools: true,
});
