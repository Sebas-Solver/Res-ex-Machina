import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./config";
import { registerTools } from "./tools";

async function main() {
  // Config validates automatically on get
  const config = getConfig();

  const server = new McpServer({
    name: "Res-ex-Machina MCP",
    version: "1.0.0",
  });

  // Register all the Tools (Read-Only + Write if enabled)
  registerTools(server);

  if (config.MCP_TRANSPORT === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`RxM MCP Server running via stdio. Write Tools Enabled: ${config.MCP_ENABLE_WRITE_TOOLS}`);
  } else {
    console.error(`Unsupported transport: ${config.MCP_TRANSPORT}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error starting MCP Server:", error);
  process.exit(1);
});
