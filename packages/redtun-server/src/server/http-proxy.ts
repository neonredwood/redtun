import dotenv from "dotenv";
import { Request, Response } from "express";
import { TunnelResponse, WritableTunnelRequest } from ":redtun-common/tunnel";
import { v4 as uuidV4 } from "uuid";
import { ClientManager } from "./client-manager";
import { getReqHeaders } from "./http-util";
dotenv.config();

export const proxyHttpRequest = (clientManager: ClientManager, req: Request, res: Response) => {
  // Check if there is a valid host header
  if (!req.headers.host) {
    res.status(502);
    res.end("Request error");
    return;
  }
  // Check if we have a tunnel client to forward to
  const tunnelSocket = clientManager.getClient(req.headers.host);
  if (!tunnelSocket) {
    res.status(404);
    res.send("Not Found");
    return;
  }

  // Proxy the HTTP request through the tunnel
  const requestId = uuidV4();
  const tunnelRequest = new WritableTunnelRequest({
    socket: tunnelSocket,
    requestId,
    request: {
      method: req.method,
      headers: getReqHeaders(req),
      path: req.url,
    },
  });

  const onReqError = (e: Error) => {
    tunnelRequest.destroy(e);
  };

  req.once("aborted", onReqError);
  req.once("error", onReqError);
  req.once("finish", () => {
    req.off("aborted", onReqError);
    req.off("error", onReqError);
  });
  req.pipe(tunnelRequest);
  req.once("end", () => {
    tunnelRequest.finish();
  });

  // Prepare to receive the response from the tunnel
  const tunnelResponse = new TunnelResponse({
    socket: tunnelSocket,
    responseId: requestId,
    duplex: true,
  });

  const onRequestError = () => {
    console.debug(`proxy-http: request error received, requestId=${requestId}`);
    tunnelResponse.off("response", onResponse);
    tunnelResponse.destroy();
    res.status(502);
    res.end("Request error");
  };
  const onResponse = ({
    statusCode,
    statusMessage,
    headers,
  }: {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
  }) => {
    console.debug(`proxy-http: response received, requestId=${requestId}`);
    tunnelRequest.off("requestError", onRequestError);
    res.writeHead(statusCode, statusMessage, headers);
  };
  const onSocketError = () => {
    console.debug(`proxy-http: socket error received, requestId=${requestId}`);
    res.off("close", onResClose);
    if (!res.headersSent) {
      res.sendStatus(500);
    }
    res.end();
  };
  const onResClose = () => {
    console.debug(`proxy-http: response closed, requestId=${requestId}`);
    tunnelSocket.off("disconnect", onSocketError);
  };
  tunnelResponse.once("requestError", onRequestError);
  tunnelResponse.once("response", onResponse);
  tunnelSocket.once("disconnect", onSocketError);
  res.once("close", onResClose);
  tunnelResponse.pipe(res);
};
