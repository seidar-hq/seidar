// Minimal JSON-RPC over stdio: { id, method, params } <-> { id, result|error }.
// Methods: tools/list, tools/call { name, args }. MCP-protocol adapter lands
// on top of this registry without changing tools.

import { toolNames, tools, callTool } from "./tools.js";

const handlers = {
  "tools/list": () => ({
    tools: toolNames().map((name) => ({ name, description: tools[name].description })),
  }),
  "tools/call": ({ name, args }) => callTool(name, args),
};

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stdout.write(JSON.stringify({ id: null, error: "invalid JSON" }) + "\n");
      continue;
    }
    const h = handlers[msg.method];
    if (!h) {
      process.stdout.write(JSON.stringify({ id: msg.id ?? null, error: `unknown method: ${msg.method}` }) + "\n");
      continue;
    }
    try {
      process.stdout.write(JSON.stringify({ id: msg.id ?? null, result: h(msg.params ?? {}) }) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ id: msg.id ?? null, error: String(e.message || e) }) + "\n");
    }
  }
});
