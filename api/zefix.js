const BASE = 'https://www.zefix.admin.ch/ZefixPublicREST/api/v1';
const NEW_KEYS = new Set(['NEW', 'NEW_ENTRY', 'NEUEINTRAG', 'FIRST_ENTRY', 'NEUEINTRAGUNG']);

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

function pickCompany(entry) {
  const pub = entry.sogcPublication || entry.publication || entry;
  const company = entry.companyShort || entry.company || entry;
  return { pub, company, mutationTypes: pub.mutationTypes || entry.mutationTypes || [] };
}

export default async function handler(req, res) {
  const { canton = 'VD', count = 100 } = req.body || {};
  const target = Math.min(Math.max(parseInt(count, 10) || 100, 1), 500);

  const user = process.env.ZEFIX_USER;
  const pass = process.env.ZEFIX_PASS;
  if (!user || !pass) {
    return res.status(500).json({ error: 'Missing ZEFIX_USER / ZEFIX_PASS env vars on Vercel', list: [] });
  }
  const authHeader = 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');

  const dates = recentWeekdays(60);
  const errors = [];
  const mutationKeysSeen = new Set();
  let httpStatuses = {};
  const cantonMatches = [];
  const newOnly = [];
  const seen = new Set();

  for (let i = 0; i < dates.length && newOnly.length < target; i += 5) {
    const batch = dates.slice(i, i + 5);
    const results = await Promise.all(batch.map(async (date) => {
      try {
        const r = await fetch(`${BASE}/sogc/bydate/${date}`, {
          headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
        });
        httpStatuses[r.status] = (httpStatuses[r.status] || 0) + 1;
        if (!r.ok) {
          errors.push(`${date}: HTTP ${r.status}`);
          return [];
        }
        const body = await r.json();
        return Array.isArray(body) ? body : (body.list || body.publications || []);
      } catch (e) {
        errors.push(`${date}: ${e.message}`);
        return [];
      }
    }));

    for (const entries of results) {
      for (const entry of entries) {
        const { pub, company, mutationTypes } = pickCompany(entry);
        for (const m of mutationTypes) if (m && m.key) mutationKeysSeen.add(m.key);

        if (company.canton && company.canton !== canton) continue;

        const uid = company.uid || company.ehraid;
        if (!uid || seen.has(uid)) continue;
        seen.add(uid);

        const record = {
          name: company.name,
          uid: company.uid,
          ehraid: company.ehraid,
          legalForm: company.legalForm,
          legalSeat: company.legalSeat,
          canton: company.canton,
          sogcDate: pub.sogcDate,
          mutationTypes: mutationTypes.map(m => m && m.key).filter(Boolean)
        };

        cantonMatches.push(record);
        const isNew = mutationTypes.some(m => NEW_KEYS.has(String(m && m.key || '').toUpperCase()));
        if (isNew) newOnly.push(record);

        if (newOnly.length >= target) break;
      }
      if (newOnly.length >= target) break;
    }
  }

  const filteredByNew = newOnly.length > 0;
  const list = (filteredByNew ? newOnly : cantonMatches).slice(0, target);

  res.status(200).json({
    list,
    debug: {
      canton,
      datesQueried: dates.length,
      httpStatuses,
      mutationKeysSeen: [...mutationKeysSeen],
      cantonMatchesCount: cantonMatches.length,
      newOnlyCount: newOnly.length,
      usedNewFilter: filteredByNew,
      errors: errors.slice(0, 5),
      returned: list.length
    }
  });
}
