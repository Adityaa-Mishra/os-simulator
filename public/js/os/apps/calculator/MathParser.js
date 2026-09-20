/**
 * public/js/os/apps/calculator/MathParser.js
 * Safe mathematical expression lexer and recursive-descent parser.
 * Strictly adheres to security requirements: ZERO eval(), new Function(), or dynamic execution.
 */

export class MathParser {
  /**
   * Tokenize input expression string.
   * @param {string} expr
   * @returns {Array<{ type: string, value: string|number }>}
   */
  static tokenize(expr) {
    const tokens = [];
    let i = 0;
    const str = String(expr).trim();

    while (i < str.length) {
      const ch = str[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers (integers & decimals)
      if (/[0-9.]/.test(ch)) {
        let numStr = '';
        let hasDecimal = false;
        while (i < str.length && /[0-9.]/.test(str[i])) {
          if (str[i] === '.') {
            if (hasDecimal) break;
            hasDecimal = true;
          }
          numStr += str[i];
          i++;
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      // Identifiers / Math Functions (sqrt, abs, sin, cos, tan, log)
      if (/[a-zA-Z]/.test(ch)) {
        let idStr = '';
        while (i < str.length && /[a-zA-Z]/.test(str[i])) {
          idStr += str[i];
          i++;
        }
        const lower = idStr.toLowerCase();
        if (['sqrt', 'abs', 'sin', 'cos', 'tan', 'log', 'ln', 'exp'].includes(lower)) {
          tokens.push({ type: 'FUNC', value: lower });
        } else if (lower === 'pi') {
          tokens.push({ type: 'NUMBER', value: Math.PI });
        } else if (lower === 'e') {
          tokens.push({ type: 'NUMBER', value: Math.E });
        } else {
          throw new Error(`Unknown identifier: ${idStr}`);
        }
        continue;
      }

      // Operators & Parentheses
      if (ch === '+') { tokens.push({ type: 'PLUS', value: '+' }); i++; continue; }
      if (ch === '-') { tokens.push({ type: 'MINUS', value: '-' }); i++; continue; }
      if (ch === '*' || ch === '×') { tokens.push({ type: 'MUL', value: '*' }); i++; continue; }
      if (ch === '/' || ch === '÷') { tokens.push({ type: 'DIV', value: '/' }); i++; continue; }
      if (ch === '%') { tokens.push({ type: 'MOD', value: '%' }); i++; continue; }
      if (ch === '^') { tokens.push({ type: 'POW', value: '^' }); i++; continue; }
      if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
      if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }

      throw new Error(`Unexpected character: '${ch}'`);
    }

    tokens.push({ type: 'EOF', value: null });
    return tokens;
  }

  /**
   * Evaluate mathematical expression string safely.
   * @param {string} expr
   * @returns {number}
   */
  static evaluate(expr) {
    if (!expr || typeof expr !== 'string' || !expr.trim()) {
      return 0;
    }

    const tokens = this.tokenize(expr);
    let index = 0;

    function peek() {
      return tokens[index];
    }

    function consume(expectedType = null) {
      const tok = tokens[index];
      if (expectedType && tok.type !== expectedType) {
        throw new Error(`Expected ${expectedType}, got ${tok.type}`);
      }
      index++;
      return tok;
    }

    // Expression: Term (('+' | '-') Term)*
    function parseExpression() {
      let result = parseTerm();
      while (peek().type === 'PLUS' || peek().type === 'MINUS') {
        const op = consume().type;
        const right = parseTerm();
        if (op === 'PLUS') result += right;
        else result -= right;
      }
      return result;
    }

    // Term: Factor (('*' | '/' | '%') Factor)*
    function parseTerm() {
      let result = parseFactor();
      while (peek().type === 'MUL' || peek().type === 'DIV' || peek().type === 'MOD') {
        const op = consume().type;
        const right = parseFactor();
        if (op === 'MUL') {
          result *= right;
        } else if (op === 'DIV') {
          if (right === 0) {
            throw new Error('Division by zero');
          }
          result /= right;
        } else if (op === 'MOD') {
          if (right === 0) {
            throw new Error('Division by zero');
          }
          result %= right;
        }
      }
      return result;
    }

    // Factor: Power ('^' Power)* (right-associative)
    function parseFactor() {
      const base = parseUnary();
      if (peek().type === 'POW') {
        consume();
        const exponent = parseFactor();
        return Math.pow(base, exponent);
      }
      return base;
    }

    // Unary: ('+' | '-')* Primary
    function parseUnary() {
      if (peek().type === 'PLUS') {
        consume();
        return parseUnary();
      }
      if (peek().type === 'MINUS') {
        consume();
        return -parseUnary();
      }
      return parsePrimary();
    }

    // Primary: NUMBER | '(' Expression ')' | FUNC '(' Expression ')'
    function parsePrimary() {
      const tok = peek();

      if (tok.type === 'NUMBER') {
        consume();
        return tok.value;
      }

      if (tok.type === 'LPAREN') {
        consume();
        const val = parseExpression();
        consume('RPAREN');
        return val;
      }

      if (tok.type === 'FUNC') {
        const fnName = consume().value;
        consume('LPAREN');
        const arg = parseExpression();
        consume('RPAREN');

        switch (fnName) {
          case 'sqrt':
            if (arg < 0) throw new Error('Cannot calculate square root of negative number');
            return Math.sqrt(arg);
          case 'abs':
            return Math.abs(arg);
          case 'sin':
            return Math.sin(arg);
          case 'cos':
            return Math.cos(arg);
          case 'tan':
            return Math.tan(arg);
          case 'log':
            if (arg <= 0) throw new Error('Logarithm domain error');
            return Math.log10(arg);
          case 'ln':
            if (arg <= 0) throw new Error('Logarithm domain error');
            return Math.log(arg);
          case 'exp':
            return Math.exp(arg);
          default:
            throw new Error(`Unsupported function: ${fnName}`);
        }
      }

      throw new Error(`Unexpected token: ${tok.type}`);
    }

    const result = parseExpression();
    if (peek().type !== 'EOF') {
      throw new Error(`Unexpected token at end: ${peek().type}`);
    }

    if (typeof result !== 'number' || isNaN(result)) {
      throw new Error('Invalid mathematical result');
    }

    return result;
  }
}
