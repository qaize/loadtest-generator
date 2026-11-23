const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Serializes a string as a safe JavaScript string literal. U+2028 and U+2029
 * are escaped because older JavaScript parsers treat them as line terminators.
 */
export function quoteJsString(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Formats an object key. `__proto__` must use computed syntax so generated
 * object literals create an own property instead of mutating the prototype.
 */
export function formatPropertyKey(key: string): string {
  if (key === '__proto__') {
    return '["__proto__"]';
  }
  return IDENTIFIER_PATTERN.test(key) ? key : quoteJsString(key);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new TypeError('Cannot serialize a non-finite number.');
  }
  return Object.is(value, -0) ? '0' : String(value);
}

/**
 * Converts JSON-like data into deterministic JavaScript source. Supported
 * values are primitives, arrays, and plain objects. Anything executable
 * (functions, symbols, bigints, class instances) is rejected.
 */
export function toJsLiteral(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  const childPad = ' '.repeat(indent + 2);

  if (value === null) {
    return 'null';
  }

  switch (typeof value) {
    case 'string':
      return quoteJsString(value);
    case 'number':
      return formatNumber(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'object':
      break;
    default:
      throw new TypeError(`Cannot serialize a value of type ${typeof value}.`);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value.map(
      (item) => `${childPad}${toJsLiteral(item, indent + 2)}`,
    );
    return `[\n${items.join(',\n')}\n${pad}]`;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Cannot serialize a non-plain object.');
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return '{}';
  }

  const properties = entries.map(
    ([key, item]) =>
      `${childPad}${formatPropertyKey(key)}: ${toJsLiteral(item, indent + 2)}`,
  );
  return `{\n${properties.join(',\n')}\n${pad}}`;
}