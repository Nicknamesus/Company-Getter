export default async function handler(req, res) {
  const { canton = 'VD', count = 100 } = req.body;

  const credentials = Buffer.from(
    `${process.env.ZEFIX_USER}:${process.env.ZEFIX_PASS}`
  ).toString('base64');

  const response = await fetch('https://www.zefix.admin.ch/ZefixPublicREST/api/v1/firm/search.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`
    },
    body: JSON.stringify({ canton: [canton], maxEntries: count, offset: 0, searchType: 'ACTIVE' })
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: 'ZEFIX error', status: response.status });
  }

  const data = await response.json();
  res.status(200).json(data);
}
