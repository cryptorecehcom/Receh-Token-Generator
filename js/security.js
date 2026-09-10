const SECURITY_CONFIG = {
  MAX_INPUT_LENGTH: {
    TOKEN_NAME: 30,
    TOKEN_SYMBOL: 10,
  },
  RATE_LIMIT: {
    REQUESTS_PER_MINUTE: 10,
    TIMEOUT: 60000,
  },
  VALIDATION: {
    TOKEN_NAME_REGEX: /^[a-zA-Z0-9\s]{1,30}$/,
    TOKEN_SYMBOL_REGEX: /^[A-Z0-9]{2,10}$/,
    DECIMALS_RANGE: { min: 0, max: 18 },
    SUPPLY_MIN: 1,
    SUPPLY_MAX: 1000000000000,
  },
};

class SecurityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

class InputValidator {
  static sanitizeInput(input) {
    if (typeof input !== "string") return "";
    return DOMPurify.sanitize(input.trim());
  }

  static validateTokenName(name) {
    const sanitized = this.sanitizeInput(name);
    if (!sanitized) {
      throw new SecurityError("Token name cannot be empty", "EMPTY_NAME");
    }
    if (!SECURITY_CONFIG.VALIDATION.TOKEN_NAME_REGEX.test(sanitized)) {
      throw new SecurityError(
        "Token name can only contain letters, numbers, and spaces (max 30 characters)",
        "INVALID_NAME"
      );
    }
    return sanitized;
  }

  static validateTokenSymbol(symbol) {
    const sanitized = this.sanitizeInput(symbol).toUpperCase();
    if (!sanitized) {
      throw new SecurityError("Token symbol cannot be empty", "EMPTY_SYMBOL");
    }
    if (!SECURITY_CONFIG.VALIDATION.TOKEN_SYMBOL_REGEX.test(sanitized)) {
      throw new SecurityError(
        "Token symbol can only contain uppercase letters and numbers (2-10 characters)",
        "INVALID_SYMBOL"
      );
    }
    return sanitized;
  }

  static validateDecimals(decimals) {
    const dec = parseInt(decimals);
    if (isNaN(dec)) {
      throw new SecurityError("Decimals must be a number", "INVALID_DECIMALS");
    }
    if (
      dec < SECURITY_CONFIG.VALIDATION.DECIMALS_RANGE.min ||
      dec > SECURITY_CONFIG.VALIDATION.DECIMALS_RANGE.max
    ) {
      throw new SecurityError(
        `Decimals must be between ${SECURITY_CONFIG.VALIDATION.DECIMALS_RANGE.min}-${SECURITY_CONFIG.VALIDATION.DECIMALS_RANGE.max}`,
        "DECIMALS_OUT_OF_RANGE"
      );
    }
    return dec;
  }

  static validateSupply(supply) {
    const sup = BigInt(supply);
    if (sup < SECURITY_CONFIG.VALIDATION.SUPPLY_MIN) {
      throw new SecurityError(
        "Total supply must be greater than 0",
        "INVALID_SUPPLY"
      );
    }
    if (sup > SECURITY_CONFIG.VALIDATION.SUPPLY_MAX) {
      throw new SecurityError(
        `Maximum total supply is ${SECURITY_CONFIG.VALIDATION.SUPPLY_MAX.toLocaleString()}`,
        "SUPPLY_TOO_LARGE"
      );
    }
    return sup;
  }
}

class RateLimiter {
  constructor() {
    this.requests = new Map();
  }

  checkLimit(identifier) {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];

    const recentRequests = userRequests.filter(
      (time) => now - time < SECURITY_CONFIG.RATE_LIMIT.TIMEOUT
    );

    if (
      recentRequests.length >= SECURITY_CONFIG.RATE_LIMIT.REQUESTS_PER_MINUTE
    ) {
      throw new SecurityError(
        "Too many requests. Please try again later.",
        "RATE_LIMIT_EXCEEDED"
      );
    }

    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);
    return true;
  }
}
