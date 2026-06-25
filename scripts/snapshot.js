const MASTER  = '0x315A47b154AA253F5660eDe42b64b4acD8402280';
const SUB_ETH = '0xb9448016187B4DB709d24cC01AbaDbF3C654E175';
const SUB_BNB = '0x9Fff9979A425AbD28c825406A64a31c524b7e403';

const ETH_RPC  = 'https://ethereum-rpc.publicnode.com';
const POL_RPC  = 'https://polygon-bor-rpc.publicnode.com';
const BNB_RPC  = 'https://bsc-rpc.publicnode.com';
const HYPE_RPC = 'https://rpc.hyperliquid.xyz/evm';

async function rpcCall(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 })
  }).then(r => r.json());
  return res.result;
}

function hexToFloat(hex, decimals) {
  return Number(BigInt(hex)) / Math.pow(10, decimals);
}

function balanceOfData(wallet) {
  const sig = '70a08231';
  const padded = wallet.replace('0x', '').padStart(64, '0');
  return '0x' + sig + padded;
}

async function main() {
  // 1. Precios CoinGecko
  const ids = 'pax-gold,quant-network,chainlink,polygon-ecosystem-token,ripple,hyperliquid';
  const prices = await fetch(
    'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd'
  ).then(r => r.json());

  const p = {
    paxg: prices['pax-gold']?.usd || 0,
    qnt:  prices['quant-network']?.usd || 0,
    link: prices['chainlink']?.usd || 0,
    pol:  prices['polygon-ecosystem-token']?.usd || 0,
    xrp:  prices['ripple']?.usd || 0,
    hype: prices['hyperliquid']?.usd || 0,
  };

  // 2. Balances on-chain en paralelo
  const [
    paxgRaw, qntRaw, linkRaw, polRaw,
    wxrpRaw, hypeRaw, stpolRaw,
    vxrpBalRaw, vxrpRateRaw
  ] = await Promise.all([
    rpcCall(ETH_RPC,  'eth_call', [{ to: '0x45804880De22913dAFE09f4980848ECE6EcbAf78', data: balanceOfData(MASTER) }, 'latest']),
    rpcCall(ETH_RPC,  'eth_call', [{ to: '0x4a220E6096B25EADb88358cb44068A3248254675', data: balanceOfData(MASTER) }, 'latest']),
    rpcCall(POL_RPC,  'eth_call', [{ to: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39', data: balanceOfData(MASTER) }, 'latest']),
    rpcCall(POL_RPC,  'eth_getBalance', [MASTER, 'latest']),
    rpcCall(BNB_RPC,  'eth_call', [{ to: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', data: balanceOfData(MASTER) }, 'latest']),
    rpcCall(HYPE_RPC, 'eth_getBalance', [MASTER, 'latest']),
    rpcCall(ETH_RPC,  'eth_call', [{ to: '0x3B790d651e950497c7723D47B24E6f61534f7969', data: balanceOfData(SUB_ETH) }, 'latest']),
    rpcCall(BNB_RPC,  'eth_call', [{ to: '0xB248a295732e0225acd3337607cc01068e3b9c10', data: balanceOfData(SUB_BNB) }, 'latest']),
    rpcCall(BNB_RPC,  'eth_call', [{ to: '0xB248a295732e0225acd3337607cc01068e3b9c10', data: '0x182df0f5' }, 'latest']),
  ]);

  const paxg  = hexToFloat(paxgRaw,  18);
  const qnt   = hexToFloat(qntRaw,   18);
  const link  = hexToFloat(linkRaw,  18);
  const pol   = hexToFloat(polRaw,   18);
  const wxrp  = hexToFloat(wxrpRaw,  18);
  const hype  = hexToFloat(hypeRaw,  18);
  const stpol = hexToFloat(stpolRaw, 18);

  // Venus vXRP con BigInt para evitar Infinity
  const vxrpBal  = BigInt(vxrpBalRaw);
  const vxrpRate = BigInt(vxrpRateRaw);
  const vxrp = Number(vxrpBal * vxrpRate) / Math.pow(10, 36);

  // 3. Totales
  const base_assets_usd =
    (paxg  * p.paxg) +
    (qnt   * p.qnt)  +
    (link  * p.link) +
    (pol   * p.pol)  +
    (wxrp  * p.xrp)  +
    (hype  * p.hype);

  const yield_usd =
    (stpol * p.pol) +
    (vxrp  * p.xrp);

  const treasury_total_usd = base_assets_usd + yield_usd;

  console.log('Base Assets USD:', base_assets_usd);
  console.log('Yield USD:', yield_usd);
  console.log('Total USD:', treasury_total_usd);

  // 4. Guardar en Supabase
  const res = await fetch(process.env.SUPABASE_URL + '/rest/v1/treasury_snapshots', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + process.env.SUPABASE_ANON_KEY,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ treasury_total_usd, base_assets_usd, yield_usd })
  });

  if (res.ok) {
    console.log('Snapshot guardado exitosamente');
  } else {
    const err = await res.text();
    console.error('Error guardando snapshot:', err);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
