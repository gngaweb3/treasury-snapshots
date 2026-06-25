const { ethers } = require("ethers");

const MASTER  = "0x315A47b154AA253F5660eDe42b64b4acD8402280";
const SUB_ETH = "0xb9448016187B4DB709d24cC01AbaDbF3C654E175";
const SUB_BNB = "0x9Fff9979A425AbD28c825406A64a31c524b7e403";

const ETH_RPC  = "https://ethereum-rpc.publicnode.com";
const POL_RPC  = "https://polygon-bor-rpc.publicnode.com";
const BNB_RPC  = "https://bsc-rpc.publicnode.com";
const HYPE_RPC = "https://rpc.hyperliquid.xyz/evm";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
];

const VTOKEN_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
];

async function main() {
  // 1. Precios CoinGecko
  const ids = "pax-gold,quant-network,chainlink,polygon-ecosystem-token,ripple,hyperliquid";
  const prices = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=" + ids + "&vs_currencies=usd"
  ).then(r => r.json());

  const p = {
    paxg: prices["pax-gold"]?.usd || 0,
    qnt:  prices["quant-network"]?.usd || 0,
    link: prices["chainlink"]?.usd || 0,
    pol:  prices["polygon-ecosystem-token"]?.usd || 0,
    xrp:  prices["ripple"]?.usd || 0,
    hype: prices["hyperliquid"]?.usd || 0,
  };

  // 2. Providers
  const ethProvider  = new ethers.providers.JsonRpcProvider(ETH_RPC);
  const polProvider  = new ethers.providers.JsonRpcProvider(POL_RPC);
  const bnbProvider  = new ethers.providers.JsonRpcProvider(BNB_RPC);
  const hypeProvider = new ethers.providers.JsonRpcProvider(HYPE_RPC);

  // 3. Balances on-chain
  const paxgContract  = new ethers.Contract("0x45804880De22913dAFE09f4980848ECE6EcbAf78", ERC20_ABI, ethProvider);
  const qntContract   = new ethers.Contract("0x4a220E6096B25EADb88358cb44068A3248254675", ERC20_ABI, ethProvider);
  const linkContract  = new ethers.Contract("0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", ERC20_ABI, polProvider);
  const wxrpContract  = new ethers.Contract("0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", ERC20_ABI, bnbProvider);
  const stpolContract = new ethers.Contract("0x3B790d651e950497c7723D47B24E6f61534f7969", ERC20_ABI, ethProvider);
  const vxrpContract  = new ethers.Contract("0xB248a295732e0225acd3337607cc01068e3b9c10", VTOKEN_ABI, bnbProvider);

  const [
    paxgRaw, qntRaw, linkRaw, polRaw,
    wxrpRaw, hypeRaw, stpolRaw,
    vxrpBalRaw, vxrpRateRaw
  ] = await Promise.all([
    paxgContract.balanceOf(MASTER),
    qntContract.balanceOf(MASTER),
    linkContract.balanceOf(MASTER),
    polProvider.getBalance(MASTER),
    wxrpContract.balanceOf(MASTER),
    hypeProvider.getBalance(MASTER),
    stpolContract.balanceOf(SUB_ETH),
    vxrpContract.balanceOf(SUB_BNB),
    vxrpContract.exchangeRateStored(),
  ]);

  const paxg  = parseFloat(ethers.utils.formatUnits(paxgRaw,  18));
  const qnt   = parseFloat(ethers.utils.formatUnits(qntRaw,   18));
  const link  = parseFloat(ethers.utils.formatUnits(linkRaw,  18));
  const pol   = parseFloat(ethers.utils.formatUnits(polRaw,   18));
  const wxrp  = parseFloat(ethers.utils.formatUnits(wxrpRaw,  18));
  const hype  = parseFloat(ethers.utils.formatUnits(hypeRaw,  18));
  const stpol = parseFloat(ethers.utils.formatUnits(stpolRaw, 18));

  // Venus vXRP — igual que tu dashboard, usando BigNumber de ethers
  const productoBN = vxrpBalRaw.mul(vxrpRateRaw);
  const vxrp = parseFloat(ethers.utils.formatUnits(productoBN, 36));

  // 4. Totales
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

  console.log("Base Assets USD:", base_assets_usd);
  console.log("Yield USD:", yield_usd);
  console.log("Total USD:", treasury_total_usd);

  // 5. Guardar en Supabase
  const res = await fetch(process.env.SUPABASE_URL + "/rest/v1/treasury_snapshots", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": process.env.SUPABASE_ANON_KEY,
      "Authorization": "Bearer " + process.env.SUPABASE_ANON_KEY,
      "Prefer": "return=minimal"
    },
    body: JSON.stringify({ treasury_total_usd, base_assets_usd, yield_usd })
  });

  if (res.ok) {
    console.log("Snapshot guardado exitosamente ✅");
  } else {
    const err = await res.text();
    console.error("Error guardando snapshot:", err);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
