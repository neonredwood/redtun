import * as blessed from "blessed";
import { green, red, white } from "kolorist";
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { version } = require("../../package.json");

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
  height: "150",
  content: "",
  label: "Status",
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
  content: "",
  border: {
    type: "line",
  },
  style: {
    fg: "white",
    bg: "black",
    boder: {
      fg: "#f0f0f0",
    },
  },
});

// Append the box to the screen.
screen.append(requestBox);
// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], () => {
  return process.exit(0);
});

type StatusContent = {
  sessionStatus: "connected" | "disconnected";
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

export const updateStatusContent = (opts: Partial<StatusContent>) => {
  status = {
    ...status,
    ...opts,
  };
  statusBox.setContent(
    `Session status:\t\t${
      status.sessionStatus === "connected" ? green(status.sessionStatus) : red(status.sessionStatus)
    }\n` +
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

export const addHttpResponse = (res: HttpRes) => {
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
