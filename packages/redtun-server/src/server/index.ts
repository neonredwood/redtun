import {
  TunnelResponse,
  TunnelResponseMeta,
  WritableTunnelRequest,
} from "packages/redtun-common/src/tunnel";
import dotenv from "dotenv";
import express from "express";
import * as http from "http";
import { IncomingMessage } from "http";
import morgan from "morgan";
import { Server, Socket } from "socket.io";
import { v4 as uuidV4 } from "uuid";
dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const webTunnelPath = "/$web_tunnel";
const io = new Server(httpServer, {
  path: webTunnelPath,
});

type TunnelSocket = {
  forwardDomain: string;
  socket: Socket;
};

let tunnelSockets: TunnelSocket[] = [];

const getTunnelSocket = (forwardDomain: string) => {
  const host = forwardDomain.split(":")[0];
  return tunnelSockets.find(
    (s) => s.forwardDomain === host,
  );
};

const setTunnelSocket = (forwardDomain: string, socket: Socket) => {
  tunnelSockets.push({
    forwardDomain,
    socket,
  });
};

const removeTunnelSocket = (forwardDomain: string) => {
  tunnelSockets = tunnelSockets.filter(
    (s) => !(s.forwardDomain === forwardDomain),
  );
  console.log("tunnelSockets: ", tunnelSockets);
};

const getAvailableTunnelSocket = (host: string) => {
  return getTunnelSocket(host)?.socket;
};

io.use((socket, next) => {
  const connectHost = socket.handshake.headers.host;
  const forwardDomain = socket.handshake.headers["x-forwardme-domain"] as string;
  if (!connectHost) {
    console.error(
      `Invalid host connectHost: ${connectHost}`,
    );
    return;
  }

  if (getTunnelSocket(forwardDomain)) {
    return next(new Error(`${connectHost} has a existing connection`));
  }
  return next();
  // if (!socket.handshake.auth || !socket.handshake.auth.token) {
  //   next(new Error("Authentication error"));
  // }
  // jwt.verify(socket.handshake.auth.token, process.env.SECRET_KEY, function (err, decoded) {
  //   if (err) {
  //     return next(new Error('Authentication error'));
  //   }
  //   if (decoded.token !== process.env.VERIFY_TOKEN) {
  //     return next(new Error('Authentication error'));
  //   }
  //   next();
  // });
});

io.on("connection", (socket: Socket) => {
  const connectHost = socket.handshake.headers.host;
  const forwardDomain = socket.handshake.headers["x-forwardme-domain"] as string;
  if (!connectHost) {
    console.error(
      `Invalid host and prefix. connectHost: ${connectHost}`,
    );
    return;
  }
  setTunnelSocket(forwardDomain, socket);
  console.log(`client connected at ${connectHost}, forwarddomain: ${forwardDomain}`);
  const onMessage = (message: string) => {
    if (message === "ping") {
      socket.send("pong");
    }
  };
  const onDisconnect = (reason: string) => {
    console.log("client disconnected: ", reason);
    removeTunnelSocket(forwardDomain);
    socket.off("message", onMessage);
  };
  socket.on("message", onMessage);
  socket.once("disconnect", onDisconnect);
});

app.use(morgan("tiny"));
// app.get('/tunnel_jwt_generator', (req, res) => {
//   if (!process.env.JWT_GENERATOR_USERNAME || !process.env.JWT_GENERATOR_PASSWORD) {
//     res.status(404);
//     res.send('Not found');
//     return;
//   }
//   if (
//     req.query.username === process.env.JWT_GENERATOR_USERNAME &&
//     req.query.password === process.env.JWT_GENERATOR_PASSWORD
//   ) {
//     const jwtToken = jwt.sign({ token: process.env.VERIFY_TOKEN }, process.env.SECRET_KEY);
//     res.status(200);
//     res.send(jwtToken);
//     return;
//   }
//   res.status(401);
//   res.send('Forbidden');
// });

const getReqHeaders = (req: IncomingMessage) => {
  const encrypted = req.httpVersionMajor === 2; // TODO: make accurate
  const headers = { ...req.headers };
  const url = new URL(`${encrypted ? "https" : "http"}://${req.headers.host}`);
  type ForwardHeaders = "for" | "port" | "proto";
  const forwardValues: Record<ForwardHeaders, string | undefined> = {
    for: req.socket.remoteAddress,
    port: url.port || (encrypted ? "443" : "80"),
    proto: encrypted ? "https" : "http",
  };
  (["for", "port", "proto"] satisfies ForwardHeaders[]).forEach(
    (key: ForwardHeaders) => {
      const previousValue = (req.headers[`x-forwarded-${key}`] as string) ?? "";
      headers[`x-forwarded-${key}`] = `${previousValue ?? ""}${previousValue ? "," : ""
        }${forwardValues[key]}`;
    },
  );
  headers["x-forwarded-host"] =
    req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return headers;
};

app.use("/", (req, res) => {
  if (!req.headers.host) {
    res.status(502);
    res.end("Request error");
    return;
  }
  const tunnelSocket = getAvailableTunnelSocket(req.headers.host);
  if (!tunnelSocket) {
    res.status(404);
    res.send("Not Found");
    return;
  }
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
  req.pipe(tunnelRequest);
  req.once("finish", () => {
    req.off("aborted", onReqError);
    req.off("error", onReqError);
  });
  const tunnelResponse = new TunnelResponse({
    socket: tunnelSocket,
    responseId: requestId,
    duplex: true,
  });
  const onRequestError = () => {
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
    tunnelRequest.off("requestError", onRequestError);
    res.writeHead(statusCode, statusMessage, headers);
  };
  tunnelResponse.once("requestError", onRequestError);
  tunnelResponse.once("response", onResponse);
  tunnelResponse.pipe(res);
  const onSocketError = () => {
    res.off("close", onResClose);
    res.sendStatus(500);
    res.end();
  };
  const onResClose = () => {
    tunnelSocket.off("disconnect", onSocketError);
  };
  tunnelSocket.once("disconnect", onSocketError);
  res.once("close", onResClose);
});

const createSocketHttpHeader = (
  line: string,
  headers: Record<string, string>,
) => {
  return (
    Object.keys(headers)
      .reduce(
        function (head, key) {
          const value = headers[key];

          if (!Array.isArray(value)) {
            head.push(key + ": " + value);
            return head;
          }

          for (let i = 0; i < value.length; i++) {
            head.push(key + ": " + value[i]);
          }
          return head;
        },
        [line],
      )
      .join("\r\n") + "\r\n\r\n"
  );
};

httpServer.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.method || !req.headers.host) {
    return;
  }
  if (req.url.indexOf(webTunnelPath) === 0) {
    return;
  }
  console.log(`WS ${req.url}`);
  // proxy websocket request
  const tunnelSocket = getAvailableTunnelSocket(req.headers.host);
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
  const onResponse = ({
    statusCode,
    statusMessage,
    headers,
    httpVersion,
  }: TunnelResponseMeta) => {
    tunnelResponse.off("requestError", onRequestError);
    if (statusCode) {
      socket.once("error", () => {
        console.log(`WS ${req.url} ERROR`);
        // ignore error
      });
      // not upgrade event
      socket.write(
        createSocketHttpHeader(
          `HTTP/${httpVersion} ${statusCode} ${statusMessage}`,
          headers,
        ),
      );
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
    socket.write(
      createSocketHttpHeader("HTTP/1.1 101 Switching Protocols", headers),
    );
    tunnelResponse.pipe(socket).pipe(tunnelResponse);
  };
  tunnelResponse.once("requestError", onRequestError);
  tunnelResponse.once("response", onResponse);
});

httpServer.listen(process.env.PORT ?? 3000);
console.log(`app start at http://localhost:${process.env.PORT ?? 3000}`);
