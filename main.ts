// A tiny stack VM for make.fun's ISA v1: runs /input/<id>/program.bin on input.bin, writes stdout.bin and exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input', O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
// [pops, pushes] per opcode; size of immediate in IMM
const POP: number[] = [], PUSH: number[] = [], IMM: number[] = [];
const def = (ops: number[], p: number, q: number, n = 0) => ops.forEach(o => (POP[o] = p, PUSH[o] = q, IMM[o] = n));
def([0], 0, 0); def([1], 0, 1, 1); def([2], 0, 1, 4); def([3, 0x53], 1, 0); def([4], 1, 2); def([5], 2, 2);
def([6], 2, 3); def([7], 3, 3); def([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x20, 0x21, 0x22], 2, 1);
def([0x17, 0x1b, 0x40], 1, 1); def([0x30, 0x33], 0, 0, 2); def([0x31, 0x32], 1, 0, 2); def([0x34], 0, 0);
def([0x41], 2, 0); def([0x50, 0x51], 1, 0); def([0x52], 0, 1);

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const L = p.length, s = new Int32Array(260), m = new Int32Array(256), cs: number[] = [], out = new Uint8Array(65536);
  let pc = 0, sp = 0, n = 0, ip = 0, o = 0, a = 0, b = 0;
  const end = (c: number): [Uint8Array, number] => [out.subarray(0, o), c & 255];
  for (;;) {
    if (n >= 1e6) return end(10);
    if (pc < 0 || pc >= L) return end(9);
    const op = p[pc], k = POP[op];
    if (k === undefined) return end(5);
    const q = pc + 1, nx = q + IMM[op];
    if (nx > L) return end(9);
    n++;
    if (sp < k) return end(2);
    if (sp - k + PUSH[op] > 256) return end(3);
    pc = nx;
    if (k === 2) { b = s[--sp]; a = s[--sp]; }
    switch (op) {
      case 0: return end(0);
      case 1: s[sp++] = (p[q] << 24) >> 24; break;
      case 2: s[sp++] = p[q] | p[q + 1] << 8 | p[q + 2] << 16 | p[q + 3] << 24; break;
      case 3: sp--; break;
      case 4: s[sp] = s[sp - 1]; sp++; break;
      case 5: s[sp++] = b; s[sp++] = a; break;
      case 6: s[sp++] = a; s[sp++] = b; s[sp++] = a; break;
      case 7: a = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = a; break;
      case 0x10: s[sp++] = a + b; break;
      case 0x11: s[sp++] = a - b; break;
      case 0x12: s[sp++] = Math.imul(a, b); break;
      case 0x13: case 0x14: case 0x15: case 0x16:
        if (b === 0) return end(4);
        s[sp++] = op === 0x13 ? (b === -1 ? -a : a / b) : op === 0x14 ? (b === -1 ? 0 : a % b)
          : op === 0x15 ? (a >>> 0) / (b >>> 0) : (a >>> 0) % (b >>> 0);
        break;
      case 0x17: s[sp - 1] = -s[sp - 1]; break;
      case 0x18: s[sp++] = a & b; break;
      case 0x19: s[sp++] = a | b; break;
      case 0x1a: s[sp++] = a ^ b; break;
      case 0x1b: s[sp - 1] = ~s[sp - 1]; break;
      case 0x1c: s[sp++] = a << b; break;
      case 0x1d: s[sp++] = a >> b; break;
      case 0x1e: s[sp++] = a >>> b; break;
      case 0x20: s[sp++] = +(a === b); break;
      case 0x21: s[sp++] = +(a < b); break;
      case 0x22: s[sp++] = +((a >>> 0) < (b >>> 0)); break;
      case 0x30: case 0x31: case 0x32: {
        const off = (p[q] | p[q + 1] << 8) << 16 >> 16;
        if (op === 0x30 || (op === 0x31) === (s[--sp] === 0)) pc = nx + off;
        break;
      }
      case 0x33: if (cs.length >= 64) return end(7); cs.push(nx); pc = p[q] | p[q + 1] << 8; break;
      case 0x34: if (!cs.length) return end(8); pc = cs.pop()!; break;
      case 0x40: a = s[sp - 1]; if (a < 0 || a > 255) return end(6); s[sp - 1] = m[a]; break;
      case 0x41: if (b < 0 || b > 255) return end(6); m[b] = a; break;
      case 0x50: {
        const t = String(s[--sp]);
        if (o + t.length > 65536) return end(11);
        for (let i = 0; i < t.length; i++) out[o++] = t.charCodeAt(i);
        break;
      }
      case 0x51: if (o >= 65536) return end(11); out[o++] = s[--sp]; break;
      case 0x52: s[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return end(s[--sp]);
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const d = `${I}/${id}/`, r = run(readFileSync(d + 'program.bin'), readFileSync(d + 'input.bin'));
  mkdirSync(`${O}/${id}`, { recursive: true });
  writeFileSync(`${O}/${id}/stdout.bin`, r[0]);
  writeFileSync(`${O}/${id}/exit.txt`, String(r[1]));
}
