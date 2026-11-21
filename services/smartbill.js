// services/smartbill.js
// Emite facturi fiscale reale prin SmartBill (ws.smartbill.ro) pentru comisionul
// de intermediere pe care meșterul îl datorează platformei HandyRO.
//
// Funcționează doar DUPĂ ce firma are CUI și un cont SmartBill activ. Până
// atunci, toate funcțiile de mai jos returnează `{ skipped: true }` fără să
// arunce vreo eroare — restul fluxului (finalizare job, email chitanță) nu se
// blochează niciodată din cauza facturării.
//
// Variabile de mediu necesare (setează-le abia când ai firma înregistrată + cont SmartBill):
//   SMARTBILL_USERNAME — emailul contului SmartBill
//   SMARTBILL_TOKEN    — tokenul API generat din SmartBill (Setări → Integrări → Token API)
//   SMARTBILL_CIF      — CUI-ul firmei tale (cu prefix "RO" dacă ești plătitor de TVA)
//   SMARTBILL_SERIES   — seria de facturare configurată în SmartBill (ex: "HRO")

const SMARTBILL_BASE = 'https://ws.smartbill.ro/SBORO/api';

function config() {
  return {
    username: process.env.SMARTBILL_USERNAME,
    token: process.env.SMARTBILL_TOKEN,
    cif: process.env.SMARTBILL_CIF,
    series: process.env.SMARTBILL_SERIES,
  };
}

function isConfigured() {
  const c = config();
  return !!(c.username && c.token && c.cif && c.series);
}

function authHeader() {
  const c = config();
  const basic = Buffer.from(`${c.username}:${c.token}`).toString('base64');
  return `Basic ${basic}`;
}

// Emite o factură de comision către un meșter (PFA/SRL), pentru serviciul de
// intermediere oferit de platformă printr-o lucrare finalizată.
// `worker` trebuie să aibă cel puțin `cui` completat în profil.
async function createCommissionInvoice({ worker, commissionLei, jobLabel }) {
  if (!isConfigured()) {
    console.log('[smartbill] Integrare dezactivată — lipsesc variabilele de mediu SMARTBILL_*. Factura NU a fost emisă (normal, până firma e înregistrată).');
    return { skipped: true, reason: 'not_configured' };
  }
  if (!worker?.cui) {
    console.log('[smartbill] Meșterul nu are CUI completat în profil — factura nu poate fi emisă.');
    return { skipped: true, reason: 'missing_cui' };
  }

  const c = config();
  const payload = {
    companyVatCode: c.cif,
    client: {
      name: worker.pfa_name || 'Meșter HandyRO',
      vatCode: worker.cui,
      address: worker.fiscal_address || '',
      isTaxPayer: false,
      country: 'Romania',
    },
    issueDate: new Date().toISOString().slice(0, 10),
    seriesName: c.series,
    isDraft: false,
    products: [
      {
        name: `Comision intermediere HandyRO — ${jobLabel || 'lucrare finalizată'}`,
        isTaxIncluded: true,
        measuringUnitName: 'buc',
        quantity: 1,
        price: Number(commissionLei),
        currency: 'RON',
        taxName: 'Neplatitor de TVA',
        taxPercentage: 0,
        isService: true,
        saveToDb: false,
      },
    ],
  };

  let resp, data;
  try {
    resp = await fetch(`${SMARTBILL_BASE}/invoice`, {
      method: 'POST',
      headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    throw new Error('Nu am putut contacta SmartBill: ' + e.message);
  }

  if (!resp.ok) {
    throw new Error(data?.errorText || data?.message || `SmartBill a răspuns cu eroare (${resp.status})`);
  }

  const series = data.series || c.series;
  const number = data.number;
  return {
    skipped: false,
    series,
    number,
    pdfUrl: `${SMARTBILL_BASE}/invoice/pdf?cif=${encodeURIComponent(c.cif)}&seriesname=${encodeURIComponent(series)}&number=${encodeURIComponent(number)}`,
  };
}

// Descarcă PDF-ul unei facturi deja emise — folosit de ruta GET /:id/invoice din jobs.js.
async function getInvoicePdfBuffer(seriesName, number) {
  if (!isConfigured()) throw new Error('Integrare SmartBill dezactivată.');
  const c = config();
  const url = `${SMARTBILL_BASE}/invoice/pdf?cif=${encodeURIComponent(c.cif)}&seriesname=${encodeURIComponent(seriesName)}&number=${encodeURIComponent(number)}`;
  const resp = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!resp.ok) throw new Error(`Nu am putut descărca PDF-ul facturii (${resp.status})`);
  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { isConfigured, createCommissionInvoice, getInvoicePdfBuffer };
