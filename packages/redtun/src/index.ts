import {
  ReadableTunnelRequest,
  TunnelResponse,
} from "@neonredwood/redtun-common";
import { Argument, Command } from "commander";
import fs from "fs";
import http from "http";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Socket as NetSocket } from "net";
import os from "os";
import path from "path";
import { ManagerOptions, Socket, SocketOptions, io } from "socket.io-client";

let socketRef: Socket | undefined = undefined;

const keepAlive = () => {
  setTimeout(() => {
    if (socketRef && socketRef.connected) {
      socketRef.send("ping");
    }
    keepAlive();
  }, 5000);
};

type InitOptions = {
  server: string;
  jwtToken: string;
  domain: string;
  host: string;
  port: number;
  origin: string;
};

const initClient = (options: InitOptions) => {
  const initParams: Partial<ManagerOptions & SocketOptions> = {
    path: "/$web_tunnel",
    transports: ["websocket"],
    auth: {
      token: options.jwtToken,
    },
    extraHeaders: {},
  };
  if (options.domain && initParams.extraHeaders) {
    initParams.extraHeaders["x-forwardme-domain"] = options.domain;
  }
  const httpProxy = process.env.https_proxy || process.env.http_proxy;
  if (httpProxy) {
    initParams.agent = new HttpsProxyAgent(httpProxy) as any;
  }
  const socket = io(options.server, initParams);
  socketRef = socket;

  socket.on("connect", () => {
    if (socket?.connected) {
      console.log("client connect to server successfully");
    }
  });

  socket.on("connect_error", (e) => {
    console.log("connect error", e && e.message);
  });

  socket.on("disconnect", () => {
    console.log("client disconnected");
  });

  socket.on("request", (requestId: string, request: http.RequestOptions) => {
    const isWebSocket = request.headers?.upgrade === "websocket";
    console.log(`${isWebSocket ? "WS" : request.method}: `, request.path, requestId);
    request.port = options.port;
    request.hostname = options.host;
    if (!request.headers) {
      request.headers = {};
    }
    if (options.origin) {
      request.headers.host = options.origin;
    }
    const tunnelRequest = new ReadableTunnelRequest({
      requestId,
      socket,
    });
    const localReq = http.request(request);
    tunnelRequest.pipe(localReq);
    const onTunnelRequestError = (e: Error) => {
      tunnelRequest.off("end", onTunnelRequestEnd);
      localReq.destroy(e);
    };
    const onTunnelRequestEnd = () => {
      tunnelRequest.off("error", onTunnelRequestError);
    };
    tunnelRequest.once("error", onTunnelRequestError);
    tunnelRequest.once("end", onTunnelRequestEnd);

    const onLocalResponse = (localRes: http.IncomingMessage) => {
      localReq.off("error", onLocalError);
      if (isWebSocket && localRes.headers.upgrade) {
        return;
      }
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: true,
      });
      tunnelResponse.writeHead(
        localRes.statusCode,
        localRes.statusMessage,
        localRes.headers,
        localRes.httpVersion,
      );
      localRes.pipe(tunnelResponse);
    };
    const onLocalError = (error: Error) => {
      console.log(error);
      localReq.off("response", onLocalResponse);
      socket.emit("request-error", requestId, error && error.message);
      tunnelRequest.destroy(error);
    };
    const onUpgrade = (
      localRes: http.IncomingMessage,
      localSocket: NetSocket,
      localHead: Buffer,
    ) => {
      localSocket.once("error", onTunnelRequestError);
      if (localHead && localHead.length) localSocket.unshift(localHead);
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: true,
      });
      tunnelResponse.writeHead(
        undefined,
        undefined,
        localRes.headers,
        localRes.httpVersion,
      );
      localSocket.pipe(tunnelResponse).pipe(localSocket);
    };
    localReq.once("error", onLocalError);
    localReq.once("response", onLocalResponse);

    if (isWebSocket) {
      localReq.on("upgrade", onUpgrade);
    }
  });
  keepAlive();
};

const program = new Command();

program.name("redtun").description("HTTP tunnel client");

program
  .command("start")
  .addArgument(
    new Argument("<type>", "config type").choices(["jwt", "server", "path"]),
  )
  .argument("<port>", "local server port number", (value: string) => {
    const port = parseInt(value, 10);
    if (isNaN(port)) {
      throw new Error("Not a number.");
    }
    return port;
  })
  .option("-p, --profile <string>", "setting profile name", "default")
  .option("-h, --host <string>", "local host value", "localhost")
  .option("-o, --origin <string>", "change request origin")
  .action((_, port, options) => {
    console.log(options);
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: any = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }
    console.log(options, config, configFilePath);
    if (!config.server) {
      console.log("Please set remote tunnel server first.");
      return;
    }
    // if (!config.jwtToken) {
    //   console.log(`Please set jwt token for ${config.server} first.`);
    //   return;
    // }
    options.port = port;
    options.jwtToken = config.jwtToken;
    options.server = config.server;
    options.domain = "def";
    initClient(options);
  });

program
  .command("config")
  .addArgument(
    new Argument("<type>", "config type").choices(["jwt", "server", "path"]),
  )
  .argument("<value>", "config value")
  .option("-p --profile <string>", "setting profile name", "default")
  .action((type, value, options) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: any = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }
    if (type === "jwt") {
      config.jwtToken = value;
    }
    if (type === "server") {
      config.server = value;
    }
    if (type == "path") {
      config.path = value;
    }
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log(`${type} config saved successfully`);
  });

program
  .command("auth")
  .argument("<username>", "JWT generator username")
  .argument("<password>", "JWT generator password")
  .option("-p --profile <string>", "setting profile name", "default")
  .action(async (username, password, options) => {
    const configFilePath = path.resolve(
      os.homedir(),
      ".lite-http-tunnel",
      `${options.profile}.json`,
    );
    if (!fs.existsSync(configFilePath)) {
      console.log("Please config server firstly");
      return;
    }
    const config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    const server = config.server;
    if (!server) {
      console.log("Please config server firstly");
      return;
    }
    const queryParams = new URLSearchParams();
    queryParams.append("username", username);
    queryParams.append("password", password);
    const response = await fetch(
      `${server}/tunnel_jwt_generator?${queryParams.toString()}`,
    );
    if (response.status >= 400) {
      console.log(
        "Auth failed as server response error, status: ",
        response.status,
      );
      return;
    }
    const jwt = await response.text();
    config.jwtToken = jwt;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log("Auth success");
  });

program.parse();
