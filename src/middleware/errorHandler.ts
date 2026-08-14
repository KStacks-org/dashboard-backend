import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "@/errors/AppError.js";
import { logger } from "@/lib/logger.js";

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: `No route for ${req.method} ${req.path}` } });
}

// The unused `_next` is required: Express only treats a handler as an error
// handler when it declares four parameters.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err }, "Unhandled application error");
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res
        .status(409)
        .json({ error: { code: "CONFLICT", message: "Record already exists" } });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found" } });
    }
    if (err.code === "P2003") {
      return res.status(400).json({
        error: { code: "INVALID_REFERENCE", message: "Referenced record does not exist" },
      });
    }
  }

  // Unknown failure: log full detail server-side, never leak internals to the client.
  logger.error({ err, path: req.path, method: req.method }, "Unexpected error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}
