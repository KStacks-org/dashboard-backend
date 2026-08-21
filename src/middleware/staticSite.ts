import path from "node:path";
import express, { type Router } from "express";
import { NotFoundError } from "@/errors/AppError.js";

/**
 * Serves the built frontend from the same origin as the API, for the Docker
 * image where one container is the whole dashboard.
 *
 * Same-origin is not just convenient here, it is what the cookie flow needs:
 * the CSRF cookie is read by the frontend and echoed back as a header, and
 * auth-service's access_token cookie is SameSite=Lax. Splitting the two
 * across origins would mean neither travels on an ordinary request.
 */
export function staticSiteRouter(configuredRoot: string): Router {
  const router = express.Router();
  // res.sendFile rejects a relative path outright, so anchor it once here
  // rather than depending on STATIC_ROOT being written as absolute.
  const staticRoot = path.resolve(configuredRoot);
  const indexHtml = path.join(staticRoot, "index.html");

  router.use(
    express.static(staticRoot, {
      // Hashed filenames (assets/*-[hash].js) can be cached indefinitely;
      // index.html must not be, or a deploy would keep serving the old app
      // shell pointing at asset names that no longer exist.
      setHeaders(res, filePath) {
        if (path.basename(filePath) === "index.html") {
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  // Client-side routing: a deep link like /tasks is a real URL to the browser
  // but not a file on disk, so anything that isn't an asset gets the app shell
  // and lets the router resolve it.
  router.get("*", (req, res, next) => {
    // An unmatched /api path is a genuine 404 from the API — answering it with
    // the app shell would hand a JSON caller a page of HTML instead.
    if (req.path.startsWith("/api/")) return next(new NotFoundError());
    res.sendFile(indexHtml);
  });

  return router;
}
