// 5 段 cron（分 时 日 月 周），支持 *、列表、范围、步长；按创作者时区判断当前分钟是否命中
function field(spec, value, min, max) {
  return String(spec).split(',').some((part) => {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? +stepStr : 1;
    let lo, hi;
    if (range === '*') { lo = min; hi = max; }
    else if (range.includes('-')) [lo, hi] = range.split('-').map(Number);
    else { lo = +range; hi = stepStr ? max : lo; }
    if ([lo, hi, step].some((n) => !Number.isFinite(n)) || step < 1) return false;
    return value >= lo && value <= hi && (value - lo) % step === 0;
  });
}

export function cronMatches(expr, date, tz = 'UTC') {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', minute: 'numeric', hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short' }).formatToParts(date).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  const [mi, h, dom, mon, wd] = parts;
  const dowOk = field(wd, dow, 0, 7) || (dow === 0 && field(wd, 7, 0, 7));
  const domOk = field(dom, +p.day, 1, 31);
  // 标准 cron：日和周都受限时满足其一即可
  const dayOk = dom !== '*' && wd !== '*' ? domOk || dowOk : domOk && dowOk;
  return field(mi, +p.minute, 0, 59) && field(h, +p.hour % 24, 0, 23) && field(mon, +p.month, 1, 12) && dayOk;
}
