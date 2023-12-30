import { getLogger } from ":redtun-common/logging";
import { ReadableTunnelRequest, TunnelResponse } from ":redtun-common/tunnel";
import http from "http";
import { Socket as NetSocket } from "net";
import { ManagerOptions, Socket, SocketOptions, io } from "socket.io-client";
import { RedtunConfig } from "../cli";
import { addHttpResponse, updateStatusContent } from "./display";

const logger = getLogger("client");

let socketRef: Socket | undefined = undefined;

const keepAlive = () => {
  setTimeout(() => {
    if (socketRef && socketRef.connected) {
      socketRef.send("ping");
    }
    keepAlive();
  }, 5000);
};

type InitOptions = RedtunConfig & {
  domain: string;
  localhost: string;
  port: number;
};

export const initClient = (options: InitOptions) => {
  const initParams: Partial<ManagerOptions & SocketOptions> = {
    path: "/$web_tunnel",
    transports: ["websocket"],
    auth: {
      token: options.apiKey,
    },
    extraHeaders: {},
  };
  if (options.domain && initParams.extraHeaders) {
    initParams.extraHeaders["x-forwardme-domain"] = options.domain;
  }

  updateStatusContent({
    sessionStatus: "disconnected",
    domain: options.domain,
    localhost: options.localhost,
    port: options.port,
    serverUrl: options.server,
  });

  const socket = io(options.server, initParams);
  socketRef = socket;

  socket.on("connect", () => {
    updateStatusContent({
      sessionStatus: "connected",
      domain: options.domain,
      localhost: options.localhost,
      port: options.port,
      serverUrl: options.server,
    });
    if (socket?.connected) {
      logger.debug(`Connected to server ${options.server} successfully`);
    }
  });

  socket.on("connect_error", e => {
    logger.debug(`Error connecting: ${e.message}`);
    updateStatusContent({ sessionStatus: "disconnected" });
  });

  socket.on("disconnect", () => {
    logger.debug(`Disconnected`);
    updateStatusContent({ sessionStatus: "disconnected" });
  });

  socket.on("request", (requestId: string, request: http.RequestOptions) => {
    const isWebSocket = request.headers?.upgrade === "websocket";
    // Create the HTTP Request
    const tunnelRequest = new ReadableTunnelRequest({
      requestId,
      socket,
    });

    logger.debug(`${isWebSocket ? "WS" : request.method}: `, request.path, requestId);

    request.port = options.port;
    request.hostname = options.localhost;

    const localReq = http.request(request);
    tunnelRequest.pipe(localReq);

    const onTunnelRequestError = (e: Error) => {
      tunnelRequest.off("end", onTunnelRequestEnd);
      localReq.destroy(e);
    };
    const onTunnelRequestEnd = () => {
      tunnelRequest.off("error", onTunnelRequestError);
      tunnelRequest.destroy();
    };
    tunnelRequest.once("error", onTunnelRequestError);
    tunnelRequest.once("end", onTunnelRequestEnd);

    const onLocalResponse = (localRes: http.IncomingMessage) => {
      localReq.off("error", onLocalError);
      if (isWebSocket && localRes.headers.upgrade) {
        return;
      }

      // Forward the HTTP Response through the tunnel
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: false,
      });

      addHttpResponse({
        method: request.method!,
        path: request.path!,
        statusCode: localRes.statusCode!,
        statusMessage: localRes.statusMessage!,
      });
      tunnelResponse.writeHead(localRes.statusCode, localRes.statusMessage, localRes.headers, localRes.httpVersion);
      localRes.pipe(tunnelResponse);
    };
    const onLocalError = (error: Error) => {
      logger.debug(error);
      localReq.off("response", onLocalResponse);
      socket.emit("request-error", requestId, error);
      tunnelRequest.destroy(error);
    };
    const onUpgrade = (localRes: http.IncomingMessage, localSocket: NetSocket, localHead: Buffer) => {
      localSocket.once("error", onTunnelRequestError);
      if (localHead && localHead.length) localSocket.unshift(localHead);
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: true,
      });
      tunnelResponse.writeHead(undefined, undefined, localRes.headers, localRes.httpVersion);
      localSocket.pipe(tunnelResponse).pipe(localSocket);
    };
    localReq.once("error", onLocalError);
    localReq.once("response", onLocalResponse);

    if (isWebSocket) {
      localReq.on("upgrade", onUpgrade);
      localReq.end();
    }
  });
  keepAlive();
};
