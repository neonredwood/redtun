import winston from "winston";

interface CustomTransformableInfo extends winston.Logform.TransformableInfo {
  moduleName: string;
  message: string;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.printf(info => {
      const options = info as CustomTransformableInfo;
      return `[${options.moduleName}] ${options.level}: ${options.message}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

export const getLogger = (moduleName: string) => logger.child({ moduleName });
