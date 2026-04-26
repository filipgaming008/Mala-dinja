import type { Request, RequestHandler } from "express";
import type { AnyZodObject, ZodTypeAny } from "zod";

type ValidationSchemas = {
  params?: AnyZodObject | ZodTypeAny;
  query?: AnyZodObject | ZodTypeAny;
  body?: AnyZodObject | ZodTypeAny;
};

const validatePart = <T extends keyof Request>(
  req: Request,
  key: T,
  schema?: AnyZodObject | ZodTypeAny,
) => {
  if (!schema) {
    return;
  }

  const parsed = schema.parse(req[key]);
  req[key] = parsed as Request[T];
};

export const validate = (schemas: ValidationSchemas): RequestHandler => {
  return (req, _res, next) => {
    validatePart(req, "params", schemas.params);
    validatePart(req, "query", schemas.query);
    validatePart(req, "body", schemas.body);
    next();
  };
};
