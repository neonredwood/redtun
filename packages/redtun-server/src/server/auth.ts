import { getLogger } from ":redtun-common/logging";
import { Socket } from "socket.io";

const logger = getLogger("auth");

export const authMiddleWare = (socket: Socket, next: (err?: Error) => void) => {
  // Authentication via API key is disabled
  if (!process.env.REDTUN_API_KEY) {
    return next();
  }

  // Make sure API key was passed
  if (!socket.handshake.auth || !socket.handshake.auth.token) {
    logger.warn("API key was not set");
    return next(new Error("API key was not set"));
  }

  // Make sure API key is valid
  if (socket.handshake.auth.token !== process.env.REDTUN_API_KEY) {
    logger.warn("API key was not valid");
    return next(new Error("API key was not valid"));
  }
  return next();
};
