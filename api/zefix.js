export default async function handler(req, res) {
  const { canton = 'VD', count = 100 } = req.body;

  const response = await fetch('https://www.zefix.admin.ch/ZefixPublicREST/api/v1/firm/search.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from('YOUR_USER:YOUR_PASSWORD').toString('base64')
    },
    body: JSON.stringify({ canton: [canton], maxEntries: count, offset: 0, searchType: 'ACTIVE' })
  });

  const data = await response.json();
  res.status(200).json(data);
}
