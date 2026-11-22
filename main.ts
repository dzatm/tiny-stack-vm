// Tiny stack VM for make.fun's tiny-stack-vm-01 ISA: one run answers every
// instance in /input (program.bin + input.bin) and writes stdout.bin + exit.txt
// per instance, with the reference VM's exact semantics and trap codes.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// [opcode, imm bytes, pops, pushes] per opcode.
const T = [];
for (const [o, i, a, b] of [
  [0x00, 0, 0, 0], [0x01, 1, 0, 1], [0x02, 4, 0, 1], [0x03, 0, 1, 0],
  [0x04, 0, 1, 2], [0x05, 0, 2, 2], [0x06, 0, 2, 3], [0x07, 0, 3, 3],
  [0x10, 0, 2, 1], [0x11, 0, 2, 1], [0x12, 0, 2, 1], [0x13, 0, 2, 1],
  [0x14, 0, 2, 1], [0x15, 0, 2, 1], [0x16, 0, 2, 1], [0x17, 0, 1, 1],
  [0x18, 0, 2, 1], [0x19, 0, 2, 1], [0x1a, 0, 2, 1], [0x1b, 0, 1, 1],
  [0x1c, 0, 2, 1], [0x1d, 0, 2, 1], [0x1e, 0, 2, 1], [0x20, 0, 2, 1],
  [0x21, 0, 2, 1], [0x22, 0, 2, 1],
  [0x30, 2, 0, 0], [0x31, 2, 1, 0], [0x32, 2, 1, 0], [0x33, 2, 0, 0],
  [0x34, 0, 0, 0], [0x40, 0, 1, 1], [0x41, 0, 2, 0],
  [0x50, 0, 1, 0], [0x51, 0, 1, 0], [0x52, 0, 0, 1], [0x53, 0, 1, 0],
]) T[o] = [i, a, b];

function run(p, inp) {
  const n = p.length;
  const S = new Int32Array(256);
  let sp = 0;
  const C = new Int32Array(64);
  let cp = 0;
  const M = new Int32Array(256);
  const o = new Uint8Array(65536);
  let ol = 0, ip = 0, pc = 0, steps = 0;
  const fin = (code) => [o.subarray(0, ol), code];
  for (;;) {
    if (steps === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const op = p[pc], e = T[op];
    if (!e) return fin(5);
    if (pc + e[0] >= n) return fin(9);
    steps++;
    const nx = pc + 1 + e[0];
    if (sp < e[1]) return fin(2);
    if (sp - e[1] + e[2] > 256) return fin(3);
    pc = nx;
    switch (op) {
      case 0x00: return fin(0);
      case 0x01: S[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: S[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24); break;
      case 0x03: sp--; break;
      case 0x04: S[sp] = S[sp - 1]; sp++; break;
      case 0x05: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; }
      case 0x06: S[sp] = S[sp - 2]; sp++; break;
      case 0x07: { const a = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = a; break; }
      case 0x17: S[sp - 1] = (-S[sp - 1]) | 0; break;
      case 0x1b: S[sp - 1] = ~S[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d: case 0x1e:
      case 0x20: case 0x21: case 0x22: {
        const b = S[sp - 1], a = S[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) return fin(4); r = (a === -2147483648 && b === -1) ? a : ((a / b) | 0); }
        else if (op === 0x14) { if (b === 0) return fin(4); r = (b === -1) ? 0 : ((a % b) | 0); }
        else if (op === 0x15) { if (b === 0) return fin(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) return fin(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = (a === b) ? 1 : 0;
        else if (op === 0x21) r = (a < b) ? 1 : 0;
        else r = ((a >>> 0) < (b >>> 0)) ? 1 : 0;
        S[sp - 2] = r; sp--;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = op === 0x30;
        if (op !== 0x30) { const v = S[--sp]; take = (op === 0x31) ? (v === 0) : (v !== 0); }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return fin(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return fin(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const a = S[sp - 1];
        if (a < 0 || a >= 256) return fin(6);
        S[sp - 1] = M[a];
        break;
      }
      case 0x41: {
        const a = S[sp - 1], v = S[sp - 2];
        if (a < 0 || a >= 256) return fin(6);
        M[a] = v; sp -= 2;
        break;
      }
      case 0x50: {
        // PRINT: decimal digits straight into the output buffer, no allocation.
        const v = S[sp - 1];
        const u = (v < 0) ? -v : v;
        let len = (v < 0) ? 1 : 0, t = u;
        do { len++; t = (t / 10) | 0; } while (t > 0);
        if (ol + len > 65536) return fin(11);
        sp--;
        let i = ol + len, q = u;
        do { o[--i] = 48 + (q % 10); q = (q / 10) | 0; } while (q > 0);
        if (v < 0) o[ol] = 45;
        ol += len;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return fin(11);
        o[ol++] = S[--sp] & 255;
        break;
      case 0x52:
        S[sp++] = (ip < inp.length) ? inp[ip++] : -1;
        break;
      case 0x53:
        return fin(S[--sp] & 255);
    }
  }
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const p = readFileSync(join(I, id, 'program.bin'));
  let inp;
  try { inp = readFileSync(join(I, id, 'input.bin')); } catch { inp = new Uint8Array(0); }
  const [out, code] = run(p, inp);
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), out);
  writeFileSync(join(O, id, 'exit.txt'), code + '\n');
}
