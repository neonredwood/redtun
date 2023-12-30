import { getLogger } from ":redtun-common/logging";
import { RequestOptions } from "http";
import { Socket } from "socket.io";
import { Socket as ClientSocket } from "socket.io-client";
import { Readable, Writable } from "stream";

const logger = getLogger("tunnel-request");

export class WritableTunnelRequest extends Writable {
  private _socket: Socket;
  private _requestId: string;

  constructor({ socket, requestId, request }: { socket: Socket; requestId: string; request: Partial<RequestOptions> }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    logger.debug(`emit request ${this._requestId}`);
    this._socket.emit("request", requestId, request);
  }

  _write(chunk: string | Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    logger.debug(`emit request-pipe ${this._requestId} ${chunk.length}`);
    this._socket.emit("request-pipe", this._requestId, chunk);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  _writev?(
    chunks: Array<{
      chunk: string | Buffer;
      encoding: BufferEncoding;
    }>,
    callback: (error?: Error | null) => void,
  ): void {
    logger.debug(`emit request-pipes ${this._requestId} ${chunks.length}`);
    this._socket.emit("request-pipes", this._requestId, chunks);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  final(callback: (...args: unknown[]) => void) {
    logger.debug(`emit request-pipe-end ${this._requestId}`);
    this._socket.emit("request-pipe-end", this._requestId);
    this._socket.conn.once("drain", () => {
      callback();
    });
  }

  finish() {
    this.final(() => {});
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    if (error) {
      this._socket.emit("request-pipe-error", this._requestId, error);
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
  constructor({ socket, requestId }: { socket: ClientSocket; requestId: string }) {
    super();
    this._socket = socket;
    this._requestId = requestId;
    const onRequestPipe = (requestId: string, data: string | Buffer) => {
      logger.debug(`request-pipe ${this._requestId} <=> ${requestId}: ${data.length}`);
      if (this._requestId === requestId) {
        this.push(data);
      }
    };
    const onRequestPipes = (requestId: string, data: unknown[]) => {
      logger.debug(`request-pipes ${this._requestId} <=> ${requestId}: ${data.length}`);
      if (this._requestId === requestId) {
        data.forEach(chunk => {
          this.push(chunk);
        });
      }
    };
    const onRequestPipeError = (requestId: string, error: Error) => {
      logger.debug(`request-pipe-error ${this._requestId} <=> ${requestId}: ${error.message}`);
      if (this._requestId === requestId) {
        this._socket.off("request-pipe", onRequestPipe);
        this._socket.off("request-pipes", onRequestPipes);
        this._socket.off("request-pipe-error", onRequestPipeError);
        this._socket.off("request-pipe-end", onRequestPipeEnd);
        this.destroy(error);
      }
    };
    const onRequestPipeEnd = (requestId: string, data: string | Buffer) => {
      logger.debug(`request-pipe-end ${this._requestId} <=> ${requestId}: ${data?.length}`);
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
