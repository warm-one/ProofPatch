export class UserFacingError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.name = "UserFacingError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function toErrorResponse(error) {
  if (error instanceof UserFacingError) {
    return {
      status: error.statusCode,
      body: {
        ok: false,
        error: { code: error.code, message: error.message },
      },
    };
  }

  const message =
    error instanceof Error ? error.message : "本地服务发生了未知错误";
  return {
    status: 500,
    body: {
      ok: false,
      error: { code: "INTERNAL_ERROR", message },
    },
  };
}
