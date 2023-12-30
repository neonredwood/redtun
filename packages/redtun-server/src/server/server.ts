import express from "express";
import * as http from "http";
import morgan from "morgan";
import { Server, Socket } from "socket.io";
import { authMiddleWare } from "./auth";
import { ClientManager } from "./client-manager";
import { proxyHttpRequest } from "./http-proxy";
import { WebTunnelPath, handleWs } from "./ws-proxy";
import { onConnection, tunnelMiddleware } from "./ws-tunnel";

// Initialize server code, websockets code
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  path: WebTunnelPath,
});
const clientManager = new ClientManager();

// Configure socket.io
io.use((socket, next) => tunnelMiddleware(clientManager, socket, next));
io.use(authMiddleWare);
io.on("connection", (socket: Socket) => onConnection(clientManager, socket));

// Configure express app
app.use(morgan("tiny"));
app.use("/", (req, res) => proxyHttpRequest(clientManager, req, res));

httpServer.on("upgrade", (req, socket, head) => handleWs(clientManager, req, socket, head));

httpServer.listen(process.env.PORT ?? 3000);
console.log(`server: Started at http://localhost:${process.env.PORT ?? 3000}`);
