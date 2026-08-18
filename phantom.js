(() => {
  "use strict";
  const button = document.querySelector("#connect-phantom");
  const status = document.querySelector("#phantom-status");
  const provider = () => window.phantom?.solana?.isPhantom ? window.phantom.solana : null;
  button.addEventListener("click", async () => {
    const wallet = provider();
    if (!wallet) { status.textContent = "Open this page in Phantom’s in-app browser, then try again."; return; }
    button.disabled = true;
    try {
      const response = await wallet.connect();
      const address = response.publicKey?.toString();
      if (!address) throw new Error("Phantom did not return a Solana public address.");
      sessionStorage.setItem("silkRoadPhantomAddress", address);
      status.textContent = `Connected: ${address.slice(0, 6)}…${address.slice(-4)}. You can now continue to Pump.fun.`;
      button.textContent = "PHANTOM CONNECTED";
    } catch (error) {
      status.textContent = error?.message || "Phantom connection was not approved.";
      button.disabled = false;
    }
  });
})();
