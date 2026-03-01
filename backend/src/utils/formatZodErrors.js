// backend/src/utils/formatZodErrors.js
export function formatZodErrors(zodError) {
  const errors = {};

  const issues = zodError?.issues;
  if (!Array.isArray(issues)) return errors;

  for (const issue of issues) {
    const key = issue?.path?.[0] || "general";
    const message = issue?.message || "Invalid value";
    if (!errors[key]) errors[key] = message;
  }

  return errors;
}