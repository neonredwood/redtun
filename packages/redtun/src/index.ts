import os from 'os';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { Command } from "commander";
import { io, Socket, SocketOptions, ManagerOptions } from "socket.io-client";
import {Socket as NetSocket} from 'net';
import { HttpsProxyAgent } from "https-proxy-agent";

import { ReadableTunnelRequest, TunnelResponse } from "@common/tunnel";

let socketRef: Socket | undefined = undefined;

const keepAlive = () => {
  setTimeout(() => {
    if (socketRef && socketRef.connected) {
      socketRef.send('ping');
    }
    keepAlive();
  }, 5000);
}

type InitOptions = {
  server: string;
  jwtToken: string;
  path?: string;
  host: string;
  port: number;
  origin: string;
}

const initClient = (options: InitOptions) => {
  const initParams: Partial<ManagerOptions & SocketOptions> = {
    path: '/$web_tunnel',
    transports: ["websocket"],
    auth: {
      token: options.jwtToken,
    },
    extraHeaders: {},
  };
  if (options.path && initParams.extraHeaders) {
    initParams.extraHeaders['path-prefix'] = options.path;
  }
  const httpProxy = process.env.https_proxy || process.env.http_proxy;
  if (httpProxy) {
    initParams.agent = new HttpsProxyAgent(httpProxy) as any;
  }
  const socket = io(options.server, initParams);
  socketRef = socket;

  socket.on('connect', () => {
    if (socket?.connected) {
      console.log('client connect to server successfully');
    }
  });

  socket.on('connect_error', (e) => {
    console.log('connect error', e && e.message);
  });

  socket.on('disconnect', () => {
    console.log('client disconnected');
  });

  socket.on('request', (requestId: string, request: http.RequestOptions) => {
    const isWebSocket = request.headers?.upgrade === 'websocket';
    console.log(`${isWebSocket ? 'WS' : request.method}: `, request.path);
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
    const onTunnelRequestError = (e) => {
      tunnelRequest.off('end', onTunnelRequestEnd);
      localReq.destroy(e);
    };
    const onTunnelRequestEnd = () => {
      tunnelRequest.off('error', onTunnelRequestError);
    };
    tunnelRequest.once('error', onTunnelRequestError);
    tunnelRequest.once('end', onTunnelRequestEnd);

    const onLocalResponse = (localRes: http.IncomingMessage) => {
      localReq.off('error', onLocalError);
      if (isWebSocket && localRes.headers.upgrade) {
        return;
      }
      const tunnelResponse = new TunnelResponse({
        responseId: requestId,
        socket: socket,
        duplex: false,
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
      localReq.off('response', onLocalResponse);
      socket.emit('request-error', requestId, error && error.message);
      tunnelRequest.destroy(error);
    };
    const onUpgrade = (localRes: http.IncomingMessage, localSocket: NetSocket, localHead: Buffer) => {
      // localSocket.once('error', onTunnelRequestError);
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
        localRes.httpVersion
      );
      localSocket.pipe(tunnelResponse).pipe(localSocket);
    };
    localReq.once('error', onLocalError);
    localReq.once('response', onLocalResponse);

    if (isWebSocket) {
      localReq.on('upgrade', onUpgrade);
    }
  });
  keepAlive();
}

const program = new Command();

program
  .name('lite-http-tunnel')
  .description('HTTP tunnel client')

program
  .command('start')
  .argument('<port>', 'local server port number', (value) => {
    const port = parseInt(value, 10);
    if (isNaN(port)) {
      throw new Error('Not a number.');
    }
    return port;
  })
  .option('-p, --profile <string>', 'setting profile name', 'default')
  .option('-h, --host <string>', 'local host value', 'localhost')
  .option('-o, --origin <string>', 'change request origin')
  .action((port: string, options: any) => {
    const configDir = path.resolve(os.homedir(), '.lite-http-tunnel');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: any = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    }
    if (!config.server) {
      console.log('Please set remote tunnel server firstly');
      return;
    }
    if (!config.jwtToken) {
      console.log(`Please set jwt token for ${config.server} firstly`);
      return;
    }
    options.port = port;
    options.jwtToken = config.jwtToken;
    options.server = config.server;
    options.path = config.path;
    initClient(options);
  });

program.parse(process.argv);
