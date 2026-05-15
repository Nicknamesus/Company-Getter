const BASE = 'https://www.zefix.admin.ch/ZefixPublicREST/api/v1';
const NEW_KEYS = new Set(['NEW', 'NEW_ENTRY', 'NEUEINTRAG']);

function recentWeekdays(maxDays) {
  const out = [];
  const d = new Date();
  for (let i = 0; out.length < maxDays && i < maxDays * 2; i++) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

export default async function handler(req, res) {
  const { canton = 'VD', count = 100 } = req.body || {};
  const target = Math.min(Math.max(parseInt(count, 10) || 100, 1), 500);

  const credentials = Buffer.from(
    `${process.env.ZEFIX_USER}:${process.env.ZEFIX_PASS}`
  ).toString('base64');
  const authHeader = `Basic ${credentials}`;

  const dates = recentWeekdays(60);
  const seen = new Set();
  const collected = [];
  const debug = { datesQueried: 0, mutationKeysSeen: new Set(), errors: [] };

  for (let i = 0; i < dates.length && collected.length < target; i += 5) {
    const batch = dates.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (date) => {
      try {
        const r = await fetch(`${BASE}/sogc/bydate/${date}`, {
          headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });
        debug.datesQueried++;
        if (!r.ok) {
          debug.errors.push(`${date}: HTTP ${r.status}`);
          return [];
        }
        const body = await r.json();
        return Array.isArray(body) ? body : [];
      } catch (e) {
        debug.errors.push(`${date}: ${e.message}`);
        return [];
      }
    }));

    for (const entries of results) {
      for (const entry of entries) {
        const pub = entry.sogcPublication || entry.publication || entry;
        const company = entry.companyShort || entry.company || entry;
        const mutationTypes = pub.mutationTypes || [];
        for (const m of mutationTypes) if (m && m.key) debug.mutationKeysSeen.add(m.key);

        if (company.canton && company.canton !== canton) continue;
        const isNew = mutationTypes.some(m => NEW_KEYS.has(String(m && m.key || '').toUpperCase()));
        if (!isNew) continue;

        const uid = company.uid || company.ehraid;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);

        collected.push({
          name: company.name,
          uid: company.uid,
          ehraid: company.ehraid,
          legalForm: company.legalForm,
          legalSeat: company.legalSeat,
          canton: company.canton,
          sogcDate: pub.sogcDate
        });

        if (collected.length >= target) break;
      }
      if (collected.length >= target) break;
    }
  }

  res.status(200).json({
    list: collected,
    debug: {
      datesQueried: debug.datesQueried,
      mutationKeysSeen: [...debug.mutationKeysSeen],
      errors: debug.errors.slice(0, 5),
      returned: collected.length
    }
  });
}
