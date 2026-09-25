import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const error = err as { message?: string; digest?: string; stack?: string };

  console.error(
    JSON.stringify({
      level: "error",
      at: "onRequestError",
      digest: error.digest,
      message: error.message ?? String(err),
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
    }),
  );

  if (error.stack) console.error(error.stack);
};
