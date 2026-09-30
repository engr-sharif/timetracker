/**
 * Tiny, safe expression evaluator for the scratchpad (no eval).
 * Supports + - * / ^ %, parentheses, variables, constants and common functions.
 */

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  min: Math.min,
  max: Math.max,
  sin: (x) => Math.sin((x * Math.PI) / 180),
  cos: (x) => Math.cos((x * Math.PI) / 180),
  tan: (x) => Math.tan((x * Math.PI) / 180),
  asin: (x) => (Math.asin(x) * 180) / Math.PI,
  acos: (x) => (Math.acos(x) * 180) / Math.PI,
  atan: (x) => (Math.atan(x) * 180) / Math.PI,
}
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, g: 9.80665 }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[\d.]/.test(c)) {
      const m = src.slice(i).match(/^(\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i)!
      out.push({ t: 'num', v: parseFloat(m[0].replace(/,/g, '')) })
      i += m[0].length
    } else if (/[a-z_]/i.test(c)) {
      const m = src.slice(i).match(/^[a-z_][\w]*/i)!
      out.push({ t: 'id', v: m[0].toLowerCase() })
      i += m[0].length
    } else if ('+-*/^%(),='.includes(c)) {
      out.push({ t: 'op', v: c === '×' ? '*' : c })
      i++
    } else if (c === '×' || c === '÷') {
      out.push({ t: 'op', v: c === '×' ? '*' : '/' })
      i++
    } else throw new Error(`Unexpected “${c}”`)
  }
  return out
}

export function evaluate(src: string, vars: Record<string, number>): number {
  const toks = tokenize(src)
  let pos = 0
  const peek = () => toks[pos]
  const eat = (v?: string) => {
    const t = toks[pos++]
    if (v && (!t || t.v !== v)) throw new Error(`Expected ${v}`)
    return t
  }
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 }

  function primary(): number {
    const t = eat()
    if (!t) throw new Error('Unexpected end')
    if (t.t === 'num') return t.v
    if (t.t === 'op' && t.v === '(') {
      const v = expr(0)
      eat(')')
      return v
    }
    if (t.t === 'op' && t.v === '-') return -expr(3)
    if (t.t === 'op' && t.v === '+') return expr(3)
    if (t.t === 'id') {
      if (FUNCS[t.v] && peek()?.v === '(') {
        eat('(')
        const args: number[] = []
        if (peek()?.v !== ')') {
          args.push(expr(0))
          while (peek()?.v === ',') {
            eat(',')
            args.push(expr(0))
          }
        }
        eat(')')
        return FUNCS[t.v](...args)
      }
      if (t.v in vars) return vars[t.v]
      if (t.v in CONSTS) return CONSTS[t.v]
      throw new Error(`Unknown “${t.v}”`)
    }
    throw new Error('Syntax error')
  }

  function expr(min: number): number {
    let left = primary()
    for (;;) {
      const t = peek()
      if (!t || t.t !== 'op' || !(t.v in prec) || prec[t.v] < min) break
      eat()
      const p = prec[t.v]
      const right = expr(t.v === '^' ? p : p + 1)
      left = t.v === '+' ? left + right : t.v === '-' ? left - right : t.v === '*' ? left * right : t.v === '/' ? left / right : t.v === '%' ? left % right : left ** right
    }
    return left
  }

  const v = expr(0)
  if (pos < toks.length) throw new Error('Unexpected input')
  return v
}

/** Evaluates each line; `name = expr` assigns. `ans` is the previous result, `total` the running sum. */
export function evaluateSheet(text: string) {
  const vars: Record<string, number> = {}
  let total = 0
  return text.split('\n').map((line) => {
    const clean = line.replace(/\/\/.*$|#.*$/, '').trim()
    if (!clean) return { value: null as number | null, error: null as string | null }
    try {
      const m = clean.match(/^([a-z_]\w*)\s*=\s*(.+)$/i)
      const value = evaluate(m ? m[2] : clean, { ...vars, total })
      if (m) vars[m[1].toLowerCase()] = value
      vars.ans = value
      total += value
      return { value, error: null }
    } catch (e) {
      return { value: null, error: e instanceof Error ? e.message : 'Error' }
    }
  })
}

export function formatNumber(n: number) {
  if (!isFinite(n)) return String(n)
  const abs = Math.abs(n)
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e12)) return n.toExponential(4)
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}
