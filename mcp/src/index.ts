import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";

const transport = process.env.RIVAL_MCP_TRANSPORT;

if (transport === "http") {
  const port = parseInt(process.env.PORT ?? "3100", 10);
  const token = process.env.RIVAL_MCP_TOKEN;
  if (!token) {
    console.error("RIVAL_MCP_TOKEN is required for HTTP transport");
    process.exit(1);
  }
  startHttp(port, token).catch((err) => {
    console.error("Failed to start HTTP transport:", err);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    console.error("Failed to start stdio transport:", err);
    process.exit(1);
  });
}
