import { Argument, Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";
import { initClient } from "../client/client";
const program = new Command();

program.name("redtun").description("HTTP tunnel client");

program
  .command("start")
  .addArgument(new Argument("<type>", "config type").choices(["jwt", "server", "path"]))
  .argument("<port>", "local server port number", (value: string) => {
    const port = parseInt(value, 10);
    if (isNaN(port)) {
      throw new Error("Not a number.");
    }
    return port;
  })
  .option("-p, --profile <string>", "setting profile name", "default")
  .option("-h, --host <string>", "local host value", "localhost")
  .option("-d, --domain <string>", "domain from which to forward")
  .action((_, port, options) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: any = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }

    if (!config.server) {
      console.log("Please set remote tunnel server first.");
      return;
    }
    // if (!config.jwtToken) {
    //   console.log(`Please set jwt token for ${config.server} first.`);
    //   return;
    // }
    options.port = port;
    options.jwtToken = config.jwtToken;
    options.server = config.server;
    initClient(options);
  });

program
  .command("config")
  .addArgument(new Argument("<type>", "config type").choices(["jwt", "server", "path"]))
  .argument("<value>", "config value")
  .option("-p --profile <string>", "setting profile name", "default")
  .action((type, value, options) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: any = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8"));
    }
    if (type === "jwt") {
      config.jwtToken = value;
    }
    if (type === "server") {
      config.server = value;
    }
    if (type == "path") {
      config.path = value;
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
