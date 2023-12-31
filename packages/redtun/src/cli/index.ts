import { Argument, Command } from "commander";
import fs from "fs";
import os from "os";
import path from "path";
import { initClient } from "../client/tunnel";
import { getLogger } from ":redtun-common/logging";

export type RedtunConfig = {
  server: string;
  apiKey?: string;
};

type CliStartOptions = {
  profile: string;
  host: string;
  domain: string;
};

const logger = getLogger("cli");

const program = new Command();

program.name("redtun").description("redtun HTTP tunnel client");

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
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8")) as RedtunConfig;
    }

    if (!config.server) {
      logger.error("Please set remote tunnel server first.");
      return;
    }

    if (!config.apiKey) {
      logger.warn(`API key has not been set for ${config.server}.`);
    }

    initClient({
      localhost: options.host,
      port: port,
      domain: options.domain,
      server: config.server,
      apiKey: config.apiKey,
    });
  });

type CliConfigOptions = {
  profile: string;
};

program
  .command("config")
  .addArgument(new Argument("<type>", "config type").choices(["api-key", "server"]))
  .argument("<value>", "config value")
  .option("-p --profile <string>", "setting profile name", "default")
  .action((type: string, value: string, options: CliConfigOptions) => {
    const configDir = path.resolve(os.homedir(), ".redtun");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir);
    }
    let config: Partial<RedtunConfig> = {};
    const configFilePath = path.resolve(configDir, `${options.profile}.json`);
    if (fs.existsSync(configFilePath)) {
      config = JSON.parse(fs.readFileSync(configFilePath, "utf8")) as RedtunConfig;
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

export default program;
