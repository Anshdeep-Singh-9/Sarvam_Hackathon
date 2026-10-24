import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const secretLike = value => /(?:-----BEGIN .*PRIVATE KEY|\bBearer\s+\S+|(?:password|passwd|api[_-]?key|secret|token)["']?\s*[:=]\s*\S+|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|\b[0-9a-f]{40,}\b)/i.test(String(value));
export function redact(value) {
  let s = String(value ?? '');
  for (const [k,v] of Object.entries(process.env)) if (/TOKEN|SECRET|PASSWORD|KEY/.test(k) && v.length > 8) s = s.split(v).join('[redacted]');
  return secretLike(s) ? '[Sensitive content withheld]' : s.slice(0, 12000);
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return y.length > 0 && x.length === y.length && crypto.timingSafeEqual(x,y);
}
export function safePath(file, roots) {
  const p = fs.realpathSync(file);
  if (!roots.some(r => p === r || p.startsWith(r + path.sep))) throw new Error('That path is outside your allowed folders.');
  if (/(^|\/)(\.[^/]+|id_rsa|id_ed25519|credentials(?:\.[^/]+)?|secrets?(?:\.[^/]+)?)(\/|$)/i.test(p) || /\.(pem|key)$/i.test(p)) throw new Error('Private configuration and credential files are blocked.');
  return p;
}
export class Confirmations {
  constructor(ttl = 45000) { this.ttl = ttl; this.pending = new Map(); }
  request(session, description, execute) {
    if (!session || session === 'anonymous') return 'Confirmation needs a caller identifier. Configure caller as User Identifier in Sarvam.';
    const id = crypto.randomBytes(4).toString('hex');
    this.pending.set(session, { id, description, execute, until: Date.now() + this.ttl });
    return `${description} Say confirm to continue within ${Math.round(this.ttl/1000)} seconds. Confirmation ${id}.`;
  }
  async confirm(session, id = '') {
    const p = this.pending.get(session);
    if (!p || p.until < Date.now()) { this.pending.delete(session); return 'There is no active confirmation. Ask for the action again.'; }
    if (id && id !== 'confirm' && id !== 'none' && id !== p.id) return 'That confirmation does not match.';
    this.pending.delete(session);
    return p.execute();
  }
  cancel(session) { this.pending.delete(session); return 'Cancelled.'; }
}
export function terminalPlan(input) {
  const q = String(input).trim().replace(/^run\s+/i,'');
  const commands = {
    pwd:['pwd',[]], ls:['ls',['-lah']], tree:['tree',['-L','2']], whoami:['whoami',[]], date:['date',[]], uptime:['uptime',[]],
    df:['df',['-h','.']], du:['du',['-sh','.']], free:['free',['-h']], ps:['ps',['-eo','pid,comm,%cpu,%mem','--sort=-%cpu']],
    ss:['ss',['-ltn']], lsof:['lsof',['-i','-P','-n']], 'docker ps':['docker',['ps']],
    'git status':['git',['status','--short','--branch']], 'git log':['git',['log','-5','--oneline']],
    'git branch':['git',['branch','--show-current']], 'git diff':['git',['diff','--no-ext-diff','--no-textconv','--stat']],
  };
  if (!Object.hasOwn(commands,q)) throw new Error('That command is not allowlisted. Use terminal_safe for read-only commands or project_run for an approved project script.');
  return commands[q];
}
