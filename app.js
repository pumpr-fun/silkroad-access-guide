const ONION = "silkrdo2o63ljm5geo2vpiraycqyj575ifmwsxrbbsezncltfzcqfdyd.onion";

const platformContent = {
  windows: [
    ["Download", "Open the official Tor Project download page and choose Windows. Download the .exe installer and its signature if you plan to verify it."],
    ["Install", "Run the installer, choose a location you will remember, and launch Tor Browser from its shortcut."],
    ["Connect", "Select Connect. If Tor is blocked, choose Configure Connection and enable a bridge."],
    ["Open", `Paste the complete address into Tor Browser: ${ONION}`]
  ],
  macos: [
    ["Download", "Get the macOS .dmg only from the official Tor Project download page."],
    ["Install", "Open the .dmg, move Tor Browser to Applications, then launch it. macOS may ask you to confirm the first launch."],
    ["Connect", "Select Connect. Use Configure Connection if your network requires a bridge."],
    ["Open", `Paste the complete address into Tor Browser: ${ONION}`]
  ],
  linux: [
    ["Download", "Download the Linux .tar.xz archive and matching signature from Tor Project."],
    ["Install", "Extract the archive. If needed, run chmod +x start-tor-browser.desktop, then launch ./start-tor-browser.desktop."],
    ["Connect", "Select Connect, or configure a bridge if direct Tor connections are blocked."],
    ["Open", `Paste the complete address into Tor Browser: ${ONION}`]
  ],
  android: [
    ["Install", "Install Tor Browser for Android from Tor Project, Google Play, or the Guardian Project’s official F-Droid repository."],
    ["Launch", "Open Tor Browser and tap Connect. Approve the connection prompt if one appears."],
    ["Bridge", "If blocked, open Settings → Connection → Config Bridge and select or enter a bridge."],
    ["Open", `Paste the complete address into Tor Browser: ${ONION}`]
  ],
  ios: [
    ["Understand the limit", "Tor Project states there is no Tor Browser for iOS because Apple requires WebKit."],
    ["Install", "Use the open-source Onion Browser linked from Tor Project’s installation guidance."],
    ["Connect", "Start Onion Browser and allow it to establish a Tor connection."],
    ["Open", `Paste the complete address and remember that iOS does not offer the same protections as Tor Browser: ${ONION}`]
  ]
};

const stepsContainer = document.querySelector("#platform-steps");
const tabs = [...document.querySelectorAll("[data-platform]")];

function renderSteps(platform) {
  stepsContainer.innerHTML = platformContent[platform].map((step, index) => `
    <article class="step-card">
      <span class="step-number">0${index + 1}</span>
      <div><h3>${step[0]}</h3><p>${step[1]}</p></div>
    </article>
  `).join("");
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((item) => item.setAttribute("aria-selected", String(item === tab)));
    renderSteps(tab.dataset.platform);
  });
});
renderSteps("windows");

async function copyOnion(button) {
  await navigator.clipboard.writeText(ONION);
  const original = button.textContent;
  button.textContent = "ADDRESS COPIED";
  button.classList.add("copied");
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove("copied");
  }, 1800);
}

document.querySelector("#copy-onion").addEventListener("click", (event) => copyOnion(event.currentTarget));
document.querySelector("#copy-onion-bottom").addEventListener("click", (event) => copyOnion(event.currentTarget));

document.querySelector("#verify-address").addEventListener("click", () => {
  const input = document.querySelector("#address-input");
  const result = document.querySelector("#verification-result");
  const normalized = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const matches = normalized === ONION;
  result.textContent = matches
    ? "VERIFIED — This exactly matches the published v3 onion address."
    : "NO MATCH — Do not sign in. Copy the verified address from this page.";
  result.className = `verification-result ${matches ? "success" : "error"}`;
});
