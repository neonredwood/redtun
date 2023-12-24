import { Socket } from "socket.io";
import { getLogger } from ":redtun-common/logging";

const logger = getLogger("client-manager");

const parseHost = (host: string) => {
  return host.split(":")[0];
};

export class ClientManager {
  #clients: Record<string, Socket> = {};

  constructor() {}

  addClient(host: string, socket: Socket) {
    const justHost = parseHost(host);
    logger.debug(`Adding client ${host} -> ${justHost}`);
    this.#clients[justHost] = socket;
  }

  removeClient(host: string) {
    const justHost = parseHost(host);
    logger.debug(`Removing client ${host} -> ${justHost}`);
    delete this.#clients[justHost];
  }

  getClient(host: string): Socket {
    const justHost = parseHost(host);
    logger.debug(`Getting client ${host} -> ${justHost}`);
    return this.#clients[justHost];
  }
}
