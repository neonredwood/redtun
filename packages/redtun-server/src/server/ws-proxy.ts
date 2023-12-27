import * as http from "http";
import { TunnelResponse, TunnelResponseMeta, WritableTunnelRequest } from "packages/redtun-common/src/tunnel";
import internal from "stream";
import { v4 as uuidV4 } from "uuid";
import { ClientManager } from "./client-manager";
import { createSocketHttpHeader, getReqHeaders } from "./http-util";

export const WebTunnelPath = "/$web_tunnel";

export const handleWs = (
  clientManager: ClientManager,
  req: http.IncomingMessage,
  socket: internal.Duplex,
  head: Buffer,
) => {
  if (!req.url || !req.method || !req.headers.host) {
    return;
  }
  if (req.url.indexOf(WebTunnelPath) === 0) {
    return;
  }
  console.log(`WS ${req.url}`);
  // proxy websocket request
  const tunnelSocket = clientManager.getClient(req.headers.host);
  if (!tunnelSocket) {
    return;
  }
  if (head && head.length) socket.unshift(head);
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
  req.pipe(tunnelRequest);
  const tunnelResponse = new TunnelResponse({
    socket: tunnelSocket,
    responseId: requestId,
    duplex: true,
  });
  const onRequestError = () => {
    tunnelResponse.off("response", onResponse);
    tunnelResponse.destroy();
    socket.end();
  };
  const onResponse = ({ statusCode, statusMessage, headers, httpVersion }: TunnelResponseMeta) => {
    tunnelResponse.off("requestError", onRequestError);
    if (statusCode) {
      socket.once("error", () => {
        console.log(`WS ${req.url} ERROR`);
        // ignore error
      });
      // not upgrade event
      socket.write(createSocketHttpHeader(`HTTP/${httpVersion} ${statusCode} ${statusMessage}`, headers));
      tunnelResponse.pipe(socket);

      return;
    }
    const onSocketError = (err: Error) => {
      console.log(`WS ${req.url} ERROR`);
      socket.off("end", onSocketEnd);
      tunnelSocket.off("disconnect", onTunnelError);
      tunnelResponse.destroy(err);
    };
    const onSocketEnd = () => {
      console.log(`WS ${req.url} END`);
      socket.off("error", onSocketError);
      tunnelSocket.off("disconnect", onTunnelError);
      tunnelResponse.end();
      tunnelResponse.destroy();
    };
    const onTunnelError = () => {
      socket.off("error", onSocketError);
      socket.off("end", onSocketEnd);
      socket.end();
      tunnelResponse.destroy();
    };
    socket.once("error", onSocketError);
    socket.once("end", onSocketEnd);
    tunnelSocket.once("disconnect", onTunnelError);
    socket.write(createSocketHttpHeader("HTTP/1.1 101 Switching Protocols", headers));
    tunnelResponse.pipe(socket).pipe(tunnelResponse);
  };
  tunnelResponse.once("requestError", onRequestError);
  tunnelResponse.once("response", onResponse);
};
