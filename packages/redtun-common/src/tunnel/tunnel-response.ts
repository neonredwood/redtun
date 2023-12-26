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

export class TunnelResponse extends Duplex {
  private _socket: Socket | ClientSocket;
  private _responseId: string;

  constructor({
    socket,
    responseId,
    duplex,
  }: {
    socket: Socket | ClientSocket;
    responseId: string;
    duplex: boolean;
  }) {
    super();
    this._socket = socket;
    this._responseId = responseId;
    if (duplex) {
      const onResponse = (responseId: string, data: TunnelResponseMeta) => {
        console.debug("onResponse", responseId, data);
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
      const onResponsePipe = (responseId: string, data: any) => {
        console.debug("onResponsePipe", this._responseId, responseId, data);
        if (this._responseId === responseId) {
          this.push(data);
        }
      };
      const onResponsePipes = (responseId: string, data: any[]) => {
        console.debug("onResponsePipes", responseId, data);
        if (this._responseId === responseId) {
          data.forEach((chunk: any) => {
            this.push(chunk);
          });
        }
      };
      const onResponsePipeError = (responseId: string, error: string) => {
        console.debug("onResponsePipeError", responseId, error);
        if (this._responseId !== responseId) {
          return;
        }
        this._socket.off("response-pipe", onResponsePipe);
        this._socket.off("response-pipes", onResponsePipes);
        this._socket.off("response-pipe-error", onResponsePipeError);
        this._socket.off("response-pipe-end", onResponsePipeEnd);
        this.destroy(new Error(error));
      };
      const onResponsePipeEnd = (responseId: string, data: any) => {
        console.debug("onResponsePipeEnd", responseId, data);
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
    this._socket.emit("response", this._responseId, {
      statusCode,
      statusMessage,
      headers,
      httpVersion,
    });
  }

  _read() {}

  _write(chunk: any, encoding: string, callback: (...args: any[]) => void) {
    this._socket.emit("response-pipe", this._responseId, chunk);
    if ((this._socket as any).conn) {
      (this._socket as any).conn.once("drain", () => {
        callback();
      });
    }
  }

  _writev(chunks: any, callback: (...args: any[]) => void) {
    this._socket.emit("response-pipes", this._responseId, chunks);
    if ((this._socket as any).conn) {
      (this._socket as any).conn.once("drain", () => {
        callback();
      });
    }
  }

  _final(callback: (...args: any[]) => void) {
    this._socket.emit("response-pipe-end", this._responseId);
    if ((this._socket as any).conn) {
      (this._socket as any).conn.once("drain", () => {
        callback();
      });
    }
  }

  _destroy(e: Error, callback: (...args: any[]) => void) {
    if (e) {
      this._socket.emit(
        "response-pipe-error",
        this._responseId,
        e,
      );
      if ((this._socket as any).conn) {
        (this._socket as any).conn.once("drain", () => {
          callback();
        });
      }
      return;
    }
    callback();
  }
}
