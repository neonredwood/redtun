import * as http from "http";
import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import { Duplex } from "stream";

export type TunnelResponseMeta = {
  httpVersion: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
};

function isServerSocket(o: any): o is Socket {
  return !isClientSocket(o);
}

function isClientSocket(o: any): o is ClientSocket {
  return o.io?.engine?.transport?.name === "websocket";
}

export class TunnelResponse<T extends Socket | ClientSocket> extends Duplex {
  private _socket: T;
  private _responseId: string;

  constructor({ socket, responseId, duplex }: { socket: T; responseId: string; duplex: boolean }) {
    super();
    this._socket = socket;
    this._responseId = responseId;

    if (duplex) {
      const onResponse = (responseId: string, data: TunnelResponseMeta) => {
        console.debug(`tunnel-response: response ${this._responseId} <=> ${responseId}: ${JSON.stringify(data)}`);
        if (this._responseId === responseId) {
          this._socket.off("response", onResponse);
          this._socket.off("request-error", onRequestError);
          this.emit("response", {
            statusCode: data.statusCode,
            statusMessage: data.statusMessage,
            headers: data.headers,
            httpVersion: data.httpVersion,
          });
        }
      };
      const onResponsePipe = (responseId: string, chunk: any, encoding: BufferEncoding) => {
        console.debug(`tunnel-response: response-pipe ${this._responseId} <=> ${responseId}: ${chunk.length}`);
        if (this._responseId === responseId) {
          this.push(chunk, encoding);
        }
      };
      const onResponsePipes = (
        responseId: string,
        data: {
          chunk: any;
          encoding: BufferEncoding;
        }[],
      ) => {
        console.debug(`tunnel-response: response-pipes ${this._responseId} <=> ${responseId}: ${data.length}`);
        if (this._responseId === responseId) {
          data.forEach(data => {
            this.push(data.chunk, data.encoding);
          });
        }
      };
      const onResponsePipeError = (responseId: string, error: { code: string; message: string }) => {
        if (this._responseId !== responseId) {
          return;
        }
        console.error(`tunnel-response: response-pipe-error ${this._responseId} <=> ${responseId}: ${error.code}`);
        this._socket.off("response-pipe", onResponsePipe);
        this._socket.off("response-pipes", onResponsePipes);
        this._socket.off("response-pipe-error", onResponsePipeError);
        this._socket.off("response-pipe-end", onResponsePipeEnd);
        this.destroy(new Error(error.message));
      };
      const onResponsePipeEnd = (responseId: string, data?: any) => {
        console.debug(`tunnel-response: response-pipe-end ${this._responseId} <=> ${responseId}`);
        if (this._responseId !== responseId) {
          return;
        }
        if (data) {
          this.push(data);
        }
        this._socket.off("response-pipe", onResponsePipe);
        this._socket.off("response-pipes", onResponsePipes);
        this._socket.off("response-pipe-error", onResponsePipeError);
        this._socket.off("response-pipe-end", onResponsePipeEnd);
        this.push(null);
      };
      const onRequestError = (requestId: string, error: Error) => {
        if (requestId === this._responseId) {
          this._socket.off("request-error", onRequestError);
          this._socket.off("response", onResponse);
          this._socket.off("response-pipe", onResponsePipe);
          this._socket.off("response-pipes", onResponsePipes);
          this._socket.off("response-pipe-error", onResponsePipeError);
          this._socket.off("response-pipe-end", onResponsePipeEnd);
          this.emit("requestError", error);
        }
      };
      this._socket.on("response", onResponse);
      this._socket.on("response-pipe", onResponsePipe);
      this._socket.on("response-pipes", onResponsePipes);
      this._socket.on("response-pipe-error", onResponsePipeError);
      this._socket.on("response-pipe-end", onResponsePipeEnd);
      this._socket.on("request-error", onRequestError);
    }
  }

  writeHead(
    statusCode: number | undefined,
    statusMessage: string | undefined,
    headers: http.IncomingHttpHeaders,
    httpVersion: string,
  ) {
    console.debug(`tunnel-response: Writing head ${this._responseId} <=> ${statusCode}: ${statusMessage}`);
    this._socket.emit("response", this._responseId, {
      statusCode,
      statusMessage,
      headers,
      httpVersion,
    });
  }

  _read() {}

  private drainCallback(callback: (...args: any[]) => void) {
    if (isServerSocket(this._socket)) {
      this._socket.conn.once("drain", () => {
        callback();
      });
    } else if (isClientSocket(this._socket)) {
      this._socket.io.engine.once("drain", () => {
        callback();
      });
    }
  }

  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this._socket.emit("response-pipe", this._responseId, chunk, encoding);
    this.drainCallback(callback);
  }

  _writev(
    chunks: {
      chunk: any;
      encoding: BufferEncoding;
    }[],
    callback: (...args: any[]) => void,
  ) {
    this._socket.emit("response-pipes", this._responseId, chunks);
    this.drainCallback(callback);
  }

  _final(callback: (...args: any[]) => void) {
    this._socket.emit("response-pipe-end", this._responseId);
    this.drainCallback(callback);
  }

  _destroy(e: Error, callback: (...args: any[]) => void) {
    if (e) {
      this._socket.emit("response-pipe-error", this._responseId, e);
      this.drainCallback(callback);
      return;
    }
    callback();
  }
}
