import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
  transports: [new winston.transports.Console()],
});

export const getLogger = (module: string) => {
  const childLogger = logger.child({ name: module });
  childLogger.format = winston.format.printf(({ level, message }) => `${level}: ${module}: ${message}`);
  return childLogger;
};
