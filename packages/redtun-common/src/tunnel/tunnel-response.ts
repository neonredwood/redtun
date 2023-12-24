import { Socket } from "socket.io";
import { Duplex } from 'stream';
import * as http from 'http';
import { Response } from "express";
import { Socket as ClientSocket } from "socket.io-client";
import { Client } from "socket.io/dist/client";

export type TunnelResponseMeta = {
  httpVersion: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
}

export class TunnelResponse extends Duplex {
  private _socket: Socket | ClientSocket;
  private _responseId: string;

  constructor({ socket, responseId, duplex }: { socket: Socket | ClientSocket, responseId: string, duplex: boolean }) {
    super();
    this._socket = socket;
    this._responseId = responseId;
    if (duplex) {
      const onResponse = (responseId: string, data: TunnelResponseMeta) => {
        if (this._responseId === responseId) {
          this._socket.off('response', onResponse);
          this._socket.off('request-error', onRequestError);
          this.emit('response', {
            statusCode: data.statusCode,
            statusMessage: data.statusMessage,
            headers: data.headers,
            httpVersion: data.httpVersion,
          });
        }
      }
      const onResponsePipe = (responseId: string, data: any) => {
        if (this._responseId === responseId) {
          this.push(data);
        }
      };
      const onResponsePipes = (responseId: string, data: any) => {
        if (this._responseId === responseId) {
          data.forEach((chunk: any) => {
            this.push(chunk);
          });
        }
      };
      const onResponsePipeError = (responseId: string, error: string) => {
        if (this._responseId !== responseId) {
          return;
        }
        this._socket.off('response-pipe', onResponsePipe);
        this._socket.off('response-pipes', onResponsePipes);
        this._socket.off('response-pipe-error', onResponsePipeError);
        this._socket.off('response-pipe-end', onResponsePipeEnd);
        this.destroy(new Error(error));
      };
      const onResponsePipeEnd = (responseId: string, data: any) => {
        if (this._responseId !== responseId) {
          return;
        }
        if (data) {
          this.push(data);
        }
        this._socket.off('response-pipe', onResponsePipe);
        this._socket.off('response-pipes', onResponsePipes);
        this._socket.off('response-pipe-error', onResponsePipeError);
        this._socket.off('response-pipe-end', onResponsePipeEnd);
        this.push(null);
      };
      const onRequestError = (requestId: string, error: Error) => {
        if (requestId === this._responseId) {
          this._socket.off('request-error', onRequestError);
          this._socket.off('response', onResponse);
          this._socket.off('response-pipe', onResponsePipe);
          this._socket.off('response-pipes', onResponsePipes);
          this._socket.off('response-pipe-error', onResponsePipeError);
          this._socket.off('response-pipe-end', onResponsePipeEnd);
          this.emit('requestError', error);
        }
      };
      this._socket.on('response', onResponse);
      this._socket.on('response-pipe', onResponsePipe);
      this._socket.on('response-pipes', onResponsePipes);
      this._socket.on('response-pipe-error', onResponsePipeError);
      this._socket.on('response-pipe-end', onResponsePipeEnd);
      this._socket.on('request-error', onRequestError);
    }
  }

  writeHead(
    statusCode: number | undefined,
    statusMessage: string | undefined,
    headers: http.IncomingHttpHeaders,
    httpVersion: string) {
    this._socket.emit('response', this._responseId, {
      statusCode,
      statusMessage,
      headers,
      httpVersion,
    });
  }

  _read(size: number) { }

  _write(chunk: any, encoding: string, callback: (...args: any[]) => void) {
    this._socket.emit('response-pipe', this._responseId, chunk);
    if (this._socket instanceof Socket) {
      this._socket.conn.once('drain', () => {
        callback();
      });
    }
  }

  _writev(chunks: any, callback: (...args: any[]) => void) {
    this._socket.emit('response-pipes', this._responseId, chunks);
    if (this._socket instanceof Socket) {
      this._socket.conn.once('drain', () => {
        callback();
      });
    }
  }

  _final(callback: (...args: any[]) => void) {
    this._socket.emit('response-pipe-end', this._responseId);
    if (this._socket instanceof Socket) {
      this._socket.conn.once('drain', () => {
        callback();
      });
    }
  }

  _destroy(e: Error, callback: (...args: any[]) => void) {
    if (e) {
      this._socket.emit('response-pipe-error', this._responseId, e && e.message);
      if (this._socket instanceof Socket) {
        this._socket.conn.once('drain', () => {
          callback();
        });
      }
      return;
    }
    callback();
  }
}
