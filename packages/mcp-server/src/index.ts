import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { getConfig } from "./config.js";
import { registerTools } from "./tools.js";

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
  } else if (config.MCP_TRANSPORT === 'sse') {
    const app = express();

    app.use((req, res, next) => {
      if (!config.MCP_ALLOW_REMOTE_HTTP) {
        const clientIp = req.ip || req.socket.remoteAddress || '';
        if (!clientIp.includes('127.0.0.1') && !clientIp.includes('::1')) {
          res.status(403).send('Forbidden: Remote connections are disabled');
          return;
        }
      }

      if (config.MCP_HTTP_AUTH_TOKEN) {
        const authHeader = req.headers.authorization;
        if (!authHeader || authHeader !== `Bearer ${config.MCP_HTTP_AUTH_TOKEN}`) {
          res.status(401).send('Unauthorized');
          return;
        }
      } else if (config.MCP_ENABLE_WRITE_TOOLS) {
         console.error("CRITICAL SECURITY ERROR: Write tools are enabled but no MCP_HTTP_AUTH_TOKEN is provided. Refusing to start HTTP transport.");
         process.exit(1);
      }
      next();
    });

    let transport: SSEServerTransport;

    app.get("/sse", async (req, res) => {
      transport = new SSEServerTransport("/message", res);
      await server.connect(transport);
    });

    app.post("/message", async (req, res) => {
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send("Transport not initialized");
      }
    });

    const port = process.env.MCP_HTTP_PORT || 8787;
    app.listen(port, () => {
      console.error(`RxM MCP Server running via SSE on http://localhost:${port}/sse. Write Tools Enabled: ${config.MCP_ENABLE_WRITE_TOOLS}`);
    });
  } else {
    console.error(`Unsupported transport: ${config.MCP_TRANSPORT}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error starting MCP Server:", error);
  process.exit(1);
});
