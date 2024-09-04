import { headersToCheck } from "../constants/defaultOptions";
import { IPHeaders } from "../@types/IP";
import { logger } from "./logger";

export const getIP = (
  headers: Headers,
  checkHeaders: IPHeaders[] = headersToCheck,
): string | null => {
  if (typeof checkHeaders === "string" && headers.get(checkHeaders)) {
    logger("elysia-ip", `getIP: Found ip from header ${checkHeaders}`);
    return headers.get(checkHeaders);
  }

  // X-Forwarded-For is the de-facto standard header
  if (!checkHeaders && headers.get("x-forwarded-for")) {
    logger("elysia-ip", "getIP: IP From Header x-forwarded-for");
    return headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  }

  if (!checkHeaders) {
    logger("elysia-ip", "getIP: No checkHeaders");
    return null;
  }

  let clientIP: string | undefined | null = null;
  for (const header of checkHeaders) {
    clientIP = headers.get(header);
    if (clientIP) {
      logger("elysia-ip", `getIP: Found ip from header ${header}`);
      break;
    }
  }

  if (!clientIP) {
    logger("elysia-ip", "getIP: Failed to get ip from header!");
    return null;
  }
  return clientIP;
};