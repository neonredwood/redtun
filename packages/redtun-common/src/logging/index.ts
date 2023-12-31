import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(options => {
      return `[${options.moduleName}] ${options.level}: ${options.message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

export const getLogger = (moduleName: string) => logger.child({ moduleName });
