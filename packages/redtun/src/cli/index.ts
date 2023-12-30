import { Argument, Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";
import { initClient } from "../client";

export type RedtunConfig = {
  server: string;
  apiKey: string;
};

type CliStartOptions = {
  profile: string;
  host: string;
  domain: string;
};

const program = new Command();

program.name("redtun").description("HTTP tunnel client");

program
  .command("start")
  .addArgument(new Argument("<type>", "config type").choices(["api-key", "server", "path"]))
  .argument("<port>", "port number to forward to", (value: string) => {
    const port = parseInt(value, 10);
    if (isNaN(port)) {
      throw new Error("Not a number.");
    }
    return port;
  })
  .option("-p, --profile <string>", "setting profile name", "default")
  .option("-h, --host <string>", "host to forward requests to", "localhost")
  .option("-d, --domain <string>", "domain name for which to forward requests")
  .action((_, port: number, options: CliStartOptions) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: Partial<RedtunConfig> = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }

    if (!config.server) {
      console.log("Please set remote tunnel server first.");
      return;
    }
    if (!config.apiKey) {
      console.log(`Please set API key for ${config.server} first.`);
      return;
    }

    initClient({
      localhost: options.host,
      port: port,
      domain: options.domain,
      server: config.server,
      apiKey: config.apiKey,
    });
  });

program
  .command("config")
  .addArgument(new Argument("<type>", "config type").choices(["api-key", "server"]))
  .argument("<value>", "config value")
  .option("-p --profile <string>", "setting profile name", "default")
  .action((type, value, options) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: Partial<RedtunConfig> = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }
    if (type === "api-key") {
      config.apiKey = value;
    }
    if (type === "server") {
      config.server = value;
    }
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log(`${type} config saved successfully`);
  });

program
  .command("auth")
  .argument("<username>", "JWT generator username")
  .argument("<password>", "JWT generator password")
  .option("-p --profile <string>", "setting profile name", "default")
  .action(async (username, password, options) => {
    const configFilePath = path.resolve(os.homedir(), ".lite-http-tunnel", `${options.profile}.json`);
    if (!fs.existsSync(configFilePath)) {
      console.log("Please config server firstly");
      return;
    }
    const config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    const server = config.server;
    if (!server) {
      console.log("Please config server firstly");
      return;
    }
    const queryParams = new URLSearchParams();
    queryParams.append("username", username);
    queryParams.append("password", password);
    const response = await fetch(`${server}/tunnel_jwt_generator?${queryParams.toString()}`);
    if (response.status >= 400) {
      console.log("Auth failed as server response error, status: ", response.status);
      return;
    }
    const jwt = await response.text();
    config.jwtToken = jwt;
    fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2));
    console.log("Auth success");
  });

export default program;
