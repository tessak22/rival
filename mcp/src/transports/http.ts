import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../server.js";

export async function startHttp(port: number, token: string): Promise<void> {
  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${token}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  });

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  app.all("/mcp", async (req, res) => {
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(port, () => {
    console.error(`Rival MCP server listening on port ${port}`);
  });
}
