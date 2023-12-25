import { Request } from "express";
import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import { Readable, Writable } from "stream";

export class WritableTunnelRequest extends Writable {
  private _socket: Socket;
  private _requestId: string;

  constructor({
    socket,
    requestId,
    request,
  }: {
    socket: Socket;
    requestId: string;
    request: Partial<Request>;
  }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    this._socket.emit("request", requestId, request);
  }

  _write(chunk: any, encoding: string, callback: (...args: any[]) => void) {
    this._socket.emit("request-pipe", this._requestId, chunk);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  _writev(
    chunks: { chunk: any; encoding: BufferEncoding }[],
    callback: (...args: any[]) => void,
  ) {
    this._socket.emit("request-pipes", this._requestId, chunks);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  _final(callback: (...args: any[]) => void) {
    this._socket.emit("request-pipe-end", this._requestId);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  _destroy(e: Error, callback: (...args: any[]) => void) {
    if (e) {
      this._socket.emit("request-pipe-error", this._requestId, e && e.message);
      this._socket.conn.once("drain", () => {
        callback();
      });
      return;
    }
    callback();
  }
}

export class ReadableTunnelRequest extends Readable {
  private _socket: ClientSocket;
  private _requestId: string;

  constructor({
    socket,
    requestId,
  }: {
    socket: ClientSocket;
    requestId: string;
  }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    const onRequestPipe = (requestId: string, data: any[]) => {
      if (this._requestId === requestId) {
        this.push(data);
      }
    };
    const onRequestPipes = (requestId: string, data: any[]) => {
      if (this._requestId === requestId) {
        data.forEach((chunk) => {
          this.push(chunk);
        });
      }
    };
    const onRequestPipeError = (requestId: string, error: Error) => {
      if (this._requestId === requestId) {
        this._socket.off("request-pipe", onRequestPipe);
        this._socket.off("request-pipes", onRequestPipes);
        this._socket.off("request-pipe-error", onRequestPipeError);
        this._socket.off("request-pipe-end", onRequestPipeEnd);
        this.destroy(error);
      }
    };
    const onRequestPipeEnd = (requestId: string, data: any[]) => {
      if (this._requestId === requestId) {
        this._socket.off("request-pipe", onRequestPipe);
        this._socket.off("request-pipes", onRequestPipes);
        this._socket.off("request-pipe-error", onRequestPipeError);
        this._socket.off("request-pipe-end", onRequestPipeEnd);
        if (data) {
          this.push(data);
        }
        this.push(null);
      }
    };
    this._socket.on("request-pipe", onRequestPipe);
    this._socket.on("request-pipes", onRequestPipes);
    this._socket.on("request-pipe-error", onRequestPipeError);
    this._socket.on("request-pipe-end", onRequestPipeEnd);
  }

  _read() {}
}
