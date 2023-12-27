import { Socket } from "socket.io";
import { ExtendedError } from "socket.io/dist/namespace";
import { ClientManager } from "./client-manager";

export const tunnelMiddleware = (
  clientManager: ClientManager,
  socket: Socket,
  next: (err?: ExtendedError | undefined) => void,
) => {
  const clientHost = socket.handshake.headers.host;
  const forwardDomain = socket.handshake.headers["x-forwardme-domain"];

  if (!clientHost || typeof forwardDomain !== "string") {
    console.error(`ws-tunnel: Invalid client host or forwarding domain.`);
    return;
  }

  if (clientManager.getClient(forwardDomain)) {
    return next(new Error(`${clientHost} has a existing connection for ${forwardDomain}`));
  }
  next();
};

export const onConnection = (clientManager: ClientManager, socket: Socket) => {
  socket.client.conn.remoteAddress;
  const connectHost = socket.handshake.headers.host;
  const forwardDomain = socket.handshake.headers["x-forwardme-domain"] as string;

  if (!connectHost || typeof forwardDomain !== "string") {
    console.error(`ws-tunnel: Invalid host ${connectHost} -> ${forwardDomain}`);
    return;
  }
  clientManager.addClient(forwardDomain, socket);
  console.log(`ws-tunnel: Client connected at ${forwardDomain} -> ${socket.client.conn.remoteAddress}`);
  const onMessage = (message: string) => {
    if (message === "ping") {
      socket.send("pong");
    }
  };
  const onDisconnect = (reason: string) => {
    console.log("ws-tunnel: Client disconnected: ", reason);
    clientManager.removeClient(forwardDomain);
    socket.off("message", onMessage);
  };
  socket.on("message", onMessage);
  socket.once("disconnect", onDisconnect);
};
