import * as http from "http";

export const getReqHeaders = (req: http.IncomingMessage) => {
  const encrypted = req.httpVersionMajor === 2; // TODO: make accurate
  const headers = { ...req.headers };
  const url = new URL(`${encrypted ? "https" : "http"}://${req.headers.host}`);
  type ForwardHeaders = "for" | "port" | "proto";
  const forwardValues: Record<ForwardHeaders, string | undefined> = {
    for: req.socket.remoteAddress,
    port: url.port || (encrypted ? "443" : "80"),
    proto: encrypted ? "https" : "http",
  };
  (["for", "port", "proto"] satisfies ForwardHeaders[]).forEach((key: ForwardHeaders) => {
    const previousValue = (req.headers[`x-forwarded-${key}`] as string) ?? "";
    headers[`x-forwarded-${key}`] = `${previousValue ?? ""}${previousValue ? "," : ""}${forwardValues[key]}`;
  });
  headers["x-forwarded-host"] = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  return headers;
};

export const createSocketHttpHeader = (line: string, headers: Record<string, string>) => {
  return (
    Object.keys(headers)
      .reduce(
        function (head, key) {
          const value = headers[key];

          if (!Array.isArray(value)) {
            head.push(key + ": " + value);
            return head;
          }

          for (let i = 0; i < value.length; i++) {
            head.push(key + ": " + value[i]);
          }
          return head;
        },
        [line],
      )
      .join("\r\n") + "\r\n\r\n"
  );
};
