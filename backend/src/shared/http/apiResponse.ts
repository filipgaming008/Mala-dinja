import type { Response } from "express";

type SuccessResponse<TData> = {
  success: true;
  data: TData;
};

type ErrorResponse = {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
    requestId?: string;
  };
};

export const ok = <TData>(res: Response, data: TData, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    data,
  } satisfies SuccessResponse<TData>);
};

export const created = <TData>(res: Response, data: TData) => {
  return ok(res, data, 201);
};

export const noContent = (res: Response) => {
  return res.status(204).send();
};

export const fail = (
  res: Response,
  statusCode: number,
  message: string,
  options?: { code?: string; details?: unknown; requestId?: string },
) => {
  return res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: options?.code,
      details: options?.details,
      requestId: options?.requestId,
    },
  } satisfies ErrorResponse);
};
