/**
 * Simple utility to sanitize user input to prevent basic prompt injection attacks.
 * It removes common injection keywords and limits the length of the input.
 */
export function sanitizePromptInput(input: string, maxLength: number = 200): string {
  if (!input) return "";
  
  // Limit length
  let sanitized = input.slice(0, maxLength);
  
  // Remove common prompt injection patterns (case-insensitive)
  const injectionPatterns = [
    /ignore previous instructions/gi,
    /disregard all previous/gi,
    /system instruction/gi,
    /you are now/gi,
    /new role/gi,
    /forget what I said/gi,
    /stop being/gi,
    /as a developer/gi,
    /override/gi
  ];
  
  injectionPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  });
  
  return sanitized.trim();
}
