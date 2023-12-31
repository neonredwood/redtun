import * as blessed from "blessed";
import { green, red, white } from "kolorist";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { version } = require("../../package.json");

export const createDisplay = () => {
  // Create a screen object.
  const screen = blessed.screen({
    smartCSR: true,
    title: `Redtun client v${version}`,
  });

  // Create a box to display the status.
  const statusBox = blessed.box({
    top: "0%",
    left: "0%",
    width: "100%",
    height: "shrink",
    content: "",
    padding: 1,
    label: "Redtun (Ctrl+C to quit)",
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      bg: "black",
      border: {
        fg: "#f0f0f0",
      },
    },
  });

  // Append the box to the screen.
  screen.append(statusBox);

  // Create a box to display the status.
  const requestBox = blessed.box({
    top: "150",
    left: "0%",
    width: "100%",
    label: "Requests",
    padding: 1,
    content: "",
    border: {
      type: "line",
    },
    style: {
      fg: "white",
      bg: "black",
      border: {
        fg: "#f0f0f0",
      },
    },
  });

  statusBox.on("render", ({ height }: { height: number }) => {
    requestBox.top = height;
  });

  // Append the box to the screen.
  screen.append(requestBox);
  // Quit on Escape, q, or Control-C.
  screen.key(["escape", "q", "C-c"], () => {
    return process.exit(0);
  });

  type StatusContent = {
    sessionStatus: "connected" | "disconnected";
    errorMessage?: string;
    serverUrl: string;
    domain: string;
    localhost: string;
    port: number;
  };

  let status: StatusContent = {
    sessionStatus: "disconnected",
    serverUrl: "",
    domain: "",
    localhost: "",
    port: 3000,
  };

  const updateStatusContent = (opts: Partial<StatusContent>) => {
    status = {
      ...status,
      ...opts,
    };
    const statusMessage = (status: Partial<StatusContent>) => {
      const errorMessage = status.errorMessage ? `(${status.errorMessage})` : "";
      const statusMessage =
        status.sessionStatus === "connected" ? status.sessionStatus : `${status.sessionStatus} ${errorMessage}`;
      const color = status.sessionStatus === "connected" ? green : red;
      return color(statusMessage);
    };

    statusBox.setContent(
      `Session status:\t\t${statusMessage(status)}\n` +
        `Tunner Server: \t\t${status.serverUrl}\n` +
        `Forwarding:\t\t\thttp(s)://${status.domain} -> ${status.localhost}:${status.port}\n`,
    );
    screen.render();
  };

  type HttpRes = {
    method: string;
    path: string;
    statusCode: number;
    statusMessage: string;
  };

  const httpResponses: HttpRes[] = [];

  const addHttpResponse = (res: HttpRes) => {
    httpResponses.unshift(res);
    httpResponses.slice(0, 100);
    const colorCode = (code: number) => {
      if (code >= 500) {
        return red;
      }
      if (code >= 400) {
        return red;
      }
      if (code >= 300) {
        return white;
      }
      if (code >= 200) {
        return green;
      }
      return white;
    };

    requestBox.setContent(
      httpResponses
        .map(r => {
          const color = colorCode(r.statusCode);
          return `${r.method} ${r.path} ${color(r.statusCode)} ${color(r.statusMessage)}`;
        })
        .join("\n"),
    );
    screen.render();
  };

  return {
    updateStatusContent,
    addHttpResponse,
  };
};
