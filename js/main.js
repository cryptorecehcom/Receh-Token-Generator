import { createAppKit } from "https://cdn.jsdelivr.net/npm/@reown/appkit@1.8.23/+esm";
import { EthersAdapter } from "https://cdn.jsdelivr.net/npm/@reown/appkit-adapter-ethers@1.8.23/+esm";

let selectedBlockchain = "bnb";
let provider, signer, factoryContract;
let gasPriceInterval;
let isConnected = false;
let isCorrectNetwork = false;
let currentTokenAddress = "";
let currentTokenSymbol = "";
let currentTokenDecimals = 18;
let rateLimiter = new RateLimiter();

const REOWN_PROJECT_ID = "f75e0c5fbfa5a4349b83c28145f6d7dd";
let appKit = null;
let reownInitPromise = null;
let connectInFlight = null;
let disconnectInFlight = null;
let switchInFlight = null;
let walletSyncTimer = null;
let walletSyncRunning = false;
let walletSyncQueued = false;
let walletSyncVersion = 0;
let currentChainId = null;
let connectedAddress = null;
let walletProvider = null;

// ABI untuk token RECEH (ERC20)
const erc20ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// Alamat token RECEH
const RECEH_TOKEN_ADDRESS = "0x4c9C431Fa7fD104c0E7230d20E1623E62019A1C5";

const connectButton = document.getElementById("connectButton");
const createButton = document.getElementById("createButton");
const switchNetworkBtn = document.getElementById("switchNetworkBtn");
const statusDiv = document.getElementById("status");
const loading = document.getElementById("loading");
const currentNetworkIndicator = document.getElementById(
  "currentNetworkIndicator",
);
const currentNetworkText = document.getElementById("currentNetworkText");
const blockchainSelect = document.getElementById("blockchainSelect");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileNav = document.getElementById("mobileNav");
const mobileNavClose = document.getElementById("mobileNavClose");
const stickyStepIndicator = document.getElementById("stickyStepIndicator");

const walletInfo = document.getElementById("walletInfo");
const walletAddressText = document.getElementById("walletAddressText");
const walletBalanceText = document.getElementById("walletBalanceText");
const balanceCheckText = document.getElementById("balanceCheckText");
const walletStatusBadge = document.getElementById("walletStatusBadge");
const walletStatusText = document.getElementById("walletStatusText");
const gasPriceGwei = document.getElementById("gasPriceGwei");

const popupOverlay = document.getElementById("popupOverlay");
const popup = document.getElementById("popup");
const popupIcon = document.getElementById("popupIcon");
const popupTitle = document.getElementById("popupTitle");
const popupMessage = document.getElementById("popupMessage");
const popupDetails = document.getElementById("popupDetails");
const popupTxHash = document.getElementById("popupTxHash");
const tokenAddressContainer = document.getElementById("tokenAddressContainer");
const tokenAddressInput = document.getElementById("tokenAddressInput");
const copyTokenAddressBtn = document.getElementById("copyTokenAddressBtn");
const addTokenToWalletBtn = document.getElementById("addTokenToWalletBtn");
const viewExplorerBtn = document.getElementById("viewExplorerBtn");
const popupActions = document.getElementById("popupActions");
const popupClose = document.getElementById("popupClose");

function showToast(message, type = "info", duration = 5000) {
  const toastContainer = document.getElementById("toastContainer");
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 100);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createConfetti() {
  const confettiContainer = document.getElementById("confettiContainer");
  confettiContainer.innerHTML = "";

  for (let i = 0; i < 100; i++) {
    const confetti = document.createElement("div");
    confetti.className = "confetti";
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.animationDelay = `${Math.random() * 2}s`;
    confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
    confettiContainer.appendChild(confetti);
    setTimeout(() => confetti.remove(), 5000);
  }
}

function showPopup(
  type,
  title,
  message,
  txHash = null,
  tokenAddress = null,
  actions = [],
) {
  popup.className = "popup";
  popupIcon.innerHTML = "";
  popupTitle.textContent = title;
  popupMessage.textContent = message;
  popupDetails.style.display = "none";
  tokenAddressContainer.style.display = "none";
  popupActions.innerHTML = "";

  if (type === "success") {
    popup.classList.add("success");
    popupIcon.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i>';
    if (tokenAddress) {
      tokenAddressContainer.style.display = "block";
      tokenAddressInput.value = tokenAddress;
      currentTokenAddress = tokenAddress;
    }
  } else if (type === "error") {
    popup.classList.add("error");
    popupIcon.innerHTML =
      '<i class="fas fa-exclamation-triangle" aria-hidden="true"></i>';
  } else if (type === "pending") {
    popup.classList.add("pending");
    popupIcon.innerHTML =
      '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';
  }

  if (txHash) {
    popupDetails.style.display = "block";
    popupTxHash.textContent = txHash;
  }

  if (type !== "pending" && actions.length > 0) {
    actions.forEach((action) => {
      const button = document.createElement("button");
      button.className = `btn ${action.className || "btn-secondary"}`;
      button.innerHTML = action.icon
        ? `<i class="${action.icon}" aria-hidden="true"></i> ${action.text}`
        : action.text;
      button.onclick = action.onclick;
      popupActions.appendChild(button);
    });
  }

  popupOverlay.classList.add("active");
  document.body.style.overflow = "hidden";

  setTimeout(() => {
    popupClose.focus();
  }, 100);
}

function hidePopup() {
  popupOverlay.classList.remove("active");
  document.body.style.overflow = "";
}

function copyToClipboardText(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("Copied to clipboard successfully!", "success");
    })
    .catch((err) => {
      console.error("Failed to copy: ", err);
      showToast("Failed to copy to clipboard", "error");
    });
}

function isInAppBrowser() {
  const userAgent = navigator.userAgent.toLowerCase();
  return (
    /trustwallet|metamask|bitget|tokenpocket|safepal|walletconnect|dapp|web3|ethereum/i.test(
      userAgent,
    ) ||
    window.ethereum ||
    window.web3
  );
}

function handleScroll() {
  const currentScrollPosition =
    window.pageYOffset || document.documentElement.scrollTop;
  const tokenCreatorSection = document.getElementById("token-creator");
  if (
    tokenCreatorSection &&
    currentScrollPosition > tokenCreatorSection.offsetTop - 80
  ) {
    stickyStepIndicator.classList.add("visible");
  } else {
    stickyStepIndicator.classList.remove("visible");
  }
}

function initLoadingScreen() {
  const loadingScreen = document.getElementById("loadingScreen");
  setTimeout(() => {
    window.scrollTo(0, 0);
  }, 100);
  setTimeout(() => {
    loadingScreen.classList.add("fade-out");
    setTimeout(() => {
      loadingScreen.style.display = "none";
    }, 800);
  }, 1500);
}

function initBlockchainSelector() {
  blockchainSelect.addEventListener("change", async function () {
    const nextBlockchain = this.value;
    if (this.options[this.selectedIndex].disabled) {
      showPopup(
        "warning",
        "Feature Under Development",
        "This network is currently under development. Please select another network.",
      );
      this.value = selectedBlockchain;
      return;
    }

    selectedBlockchain = nextBlockchain;
    const config = blockchainConfig[selectedBlockchain];
    currentNetworkIndicator.style.display = "flex";
    currentNetworkText.textContent = `Selected: ${config.chainName}`;
    updateStepIndicator(1);

    if (isConnected) {
      await switchToCorrectNetwork();
    } else {
      await updateCreationFee();
    }
  });
}
function initTooltips() {
  const tooltipIcons = document.querySelectorAll(".tooltip-icon");
  tooltipIcons.forEach((icon) => {
    icon.addEventListener("mouseenter", (e) => {
      const tooltipText = e.target.getAttribute("data-tooltip");
      if (tooltipText) {
        showToast(tooltipText, "info", 3000);
      }
    });
    icon.addEventListener("focus", (e) => {
      const tooltipText = e.target.getAttribute("data-tooltip");
      if (tooltipText) {
        showToast(tooltipText, "info", 3000);
      }
    });
  });
}

function updateStepIndicator(stepNumber) {
  const steps = document.querySelectorAll(".step");
  steps.forEach((step, index) => {
    if (index < stepNumber) {
      step.classList.add("active");
    } else {
      step.classList.remove("active");
    }
  });
  const progressBar = document.querySelector(".step-indicator");
  if (progressBar) {
    progressBar.setAttribute("aria-valuenow", stepNumber);
  }
}

function updateNetworkStatus() {
  if (!isConnected) {
    walletStatusBadge.className = "wallet-status-badge disconnected";
    walletStatusText.textContent = "Wallet Not Connected";
    connectButton.classList.add("blinking");
    connectButton.innerHTML =
      '<i class="fas fa-plug" aria-hidden="true"></i> Connect Wallet';
    switchNetworkBtn.style.display = "none";
    walletInfo.classList.remove("active");
    updateStepIndicator(1);
  } else if (!isCorrectNetwork) {
    walletStatusBadge.className = "wallet-status-badge wrong-network";
    walletStatusText.textContent = "Wrong Network";
    connectButton.classList.remove("blinking");
    connectButton.innerHTML =
      '<i class="fas fa-plug" aria-hidden="true"></i> Disconnect';
    switchNetworkBtn.style.display = "block";
    switchNetworkBtn.className = "btn btn-error";
    walletInfo.classList.remove("active");
    updateStepIndicator(1);
  } else {
    walletStatusBadge.className = "wallet-status-badge connected";
    walletStatusText.textContent = `Connected to ${blockchainConfig[selectedBlockchain].chainName}`;
    connectButton.classList.remove("blinking");
    connectButton.classList.add("btn-success");
    connectButton.innerHTML =
      '<i class="fas fa-plug" aria-hidden="true"></i> Disconnect';
    switchNetworkBtn.style.display = "none";
    walletInfo.classList.add("active");
    updateStepIndicator(2);
  }
}

function getReownNetworks() {
  return Object.entries(blockchainConfig).map(([key, config]) => ({
    id: Number(config.chainIdDecimal),
    name: config.chainName,
    nativeCurrency: {
      name: config.nativeCurrency,
      symbol: config.nativeCurrency,
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [config.rpcUrl] },
    },
    blockExplorers: {
      default: { name: "Explorer", url: config.blockExplorer },
    },
    chainNamespace: "eip155",
    ...(key === "bnb" ? { networkImageId: "binance-smart-chain" } : {}),
  }));
}

async function initReownAppKit() {
  if (window.__reownAppKit) {
    appKit = window.__reownAppKit;
    return appKit;
  }
  if (reownInitPromise) return reownInitPromise;

  reownInitPromise = (async () => {
    if (!REOWN_PROJECT_ID || REOWN_PROJECT_ID === "YOUR_REOWN_PROJECT_ID") {
      throw new Error("Reown Project ID is not configured.");
    }

    const metadata = {
      name: "RECEH Token Generator",
      description: "Create tokens on supported EVM networks.",
      url: window.location.origin,
      icons: [`${window.location.origin}/favicon.png`],
    };

    const networks = getReownNetworks();
    const selectedChainId = Number(
      blockchainConfig[selectedBlockchain].chainIdDecimal,
    );
    const defaultNetwork =
      networks.find((n) => n.id === selectedChainId) || networks[0];

    const modal = createAppKit({
      adapters: [new EthersAdapter()],
      projectId: REOWN_PROJECT_ID,
      networks,
      defaultNetwork,
      metadata,
      features: {
        analytics: false,
        email: false,
        socials: [],
      },
    });

    appKit = modal;
    window.__reownAppKit = modal;

    if (
      !window.__reownProviderSubscription &&
      typeof modal.subscribeProviders === "function"
    ) {
      window.__reownProviderSubscription = modal.subscribeProviders((state) => {
        const nextProvider = state?.eip155 || null;
        if (nextProvider) {
          walletProvider = nextProvider;
          window.__reownEip1193Provider = nextProvider;
          queueWalletSync("reown-provider");
        } else if (modal.getIsConnected?.() && modal.getAddress?.()) {
          queueWalletSync("reown-provider-pending");
        }
      });
    }

    if (
      !window.__reownAccountSubscription &&
      typeof modal.subscribeAccount === "function"
    ) {
      window.__reownAccountSubscription = modal.subscribeAccount((state) => {
        const account = state?.accountState || state || {};
        const address = account?.address || null;
        if (!address) {
          clearWalletState();
          return;
        }
        connectedAddress = address;
        isConnected = true;
        window.__reownAccount = account;
        queueWalletSync("reown-account");
      });
    }

    return modal;
  })().catch((error) => {
    reownInitPromise = null;
    appKit = null;
    window.__reownAppKit = null;
    throw error;
  });

  return reownInitPromise;
}

function clearWalletState() {
  walletSyncVersion++;
  if (walletSyncTimer) {
    clearTimeout(walletSyncTimer);
    walletSyncTimer = null;
  }
  walletSyncQueued = false;
  provider = null;
  signer = null;
  factoryContract = null;
  walletProvider = null;
  connectedAddress = null;
  currentChainId = null;
  isConnected = false;
  isCorrectNetwork = false;
  updateNetworkStatus();
  stopGasPriceUpdates();
  if (walletAddressText) walletAddressText.textContent = "-";
  if (walletBalanceText) walletBalanceText.textContent = "-";
  if (balanceCheckText) balanceCheckText.textContent = "-";
}

function queueWalletSync(reason = "queued") {
  walletSyncQueued = true;
  if (walletSyncTimer) return;
  const version = walletSyncVersion;
  walletSyncTimer = setTimeout(async () => {
    walletSyncTimer = null;
    if (walletSyncRunning || version !== walletSyncVersion || !walletSyncQueued)
      return;
    walletSyncQueued = false;
    walletSyncRunning = true;
    try {
      await syncConnectedWallet(reason, version);
    } finally {
      walletSyncRunning = false;
    }
  }, 0);
}

async function refreshProvider() {
  const eip1193 =
    walletProvider ||
    window.__reownEip1193Provider ||
    appKit?.getWalletProvider?.() ||
    appKit?.getProviders?.()?.eip155;

  if (!eip1193) return false;

  walletProvider = eip1193;
  window.__reownEip1193Provider = eip1193;
  provider = new ethers.BrowserProvider(eip1193);

  if (isConnected && connectedAddress) {
    try {
      signer = await provider.getSigner(connectedAddress);
    } catch (_) {
      try {
        signer = await provider.getSigner();
      } catch (__) {
        signer = null;
      }
    }
  }
  return true;
}

async function syncConnectedWallet(
  reason = "unknown",
  expectedVersion = walletSyncVersion,
) {
  const modal = window.__reownAppKit;
  if (!modal || expectedVersion !== walletSyncVersion) return false;

  try {
    const address = modal.getAddress?.() || connectedAddress;
    const eip1193 =
      modal.getWalletProvider?.() ||
      modal.getProviders?.()?.eip155 ||
      window.__reownEip1193Provider ||
      walletProvider;

    if (!address || !eip1193) return false;

    walletProvider = eip1193;
    window.__reownEip1193Provider = eip1193;
    connectedAddress = ethers.getAddress(address);
    isConnected = true;

    const chainValue =
      modal.getChainId?.() ??
      (await eip1193.request({ method: "eth_chainId" }));
    currentChainId =
      typeof chainValue === "string"
        ? chainValue.startsWith("0x")
          ? parseInt(chainValue, 16)
          : Number(chainValue)
        : Number(chainValue);

    if (!(await refreshProvider())) return false;
    if (expectedVersion !== walletSyncVersion) return false;

    signer = await provider.getSigner(connectedAddress);
    isCorrectNetwork =
      currentChainId ===
      Number(blockchainConfig[selectedBlockchain].chainIdDecimal);
    updateWalletUI();
    updateNetworkStatus();

    if (isCorrectNetwork) {
      await initializeContract();
      await updateWalletBalance();
      startGasPriceUpdates();
      updateStepIndicator(3);
    } else {
      factoryContract = null;
      stopGasPriceUpdates();
      await updateCreationFee();
    }
    return isCorrectNetwork;
  } catch (error) {
    console.error("Wallet synchronization failed:", error);
    return false;
  }
}

async function updateWalletBalance() {
  if (!provider || !signer) {
    console.log("Provider or signer not ready");
    if (walletAddressText) walletAddressText.textContent = "Connect wallet";
    if (walletBalanceText)
      walletBalanceText.innerHTML = "Please connect wallet";
    return;
  }

  try {
    const address = await signer.getAddress();
    console.log("Wallet address:", address);

    const config = blockchainConfig[selectedBlockchain];
    const nativeBalance = await provider.getBalance(address);
    const formattedNativeBalance = ethers.formatEther(nativeBalance);

    let recehBalance = "0";
    try {
      const recehToken = new ethers.Contract(
        RECEH_TOKEN_ADDRESS,
        erc20ABI,
        provider,
      );
      const balance = await recehToken.balanceOf(address);
      recehBalance = ethers.formatEther(balance);
    } catch (err) {
      console.log("Error reading RECEH balance:", err.message);
    }

    if (walletAddressText) {
      walletAddressText.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
    }
    if (walletBalanceText) {
      walletBalanceText.innerHTML = `${parseFloat(formattedNativeBalance).toFixed(4)} ${config.symbol} (gas)<br>${parseFloat(recehBalance).toFixed(4)} RECEH (fee)`;
    }

    await checkBalanceSufficiency(
      nativeBalance,
      ethers.parseEther(recehBalance),
    );
  } catch (error) {
    console.error("Error updating wallet balance:", error);
    if (walletBalanceText)
      walletBalanceText.textContent = "Error loading balance";
  }
}

async function checkBalanceSufficiency(nativeBalance, recehBalance) {
  try {
    const creationFee = await factoryContract.creationFee();
    const feeData = await provider.getFeeData();
    const estimatedGasCost = feeData.gasPrice * BigInt(300000);
    const config = blockchainConfig[selectedBlockchain];

    const hasEnoughReceh = recehBalance >= creationFee;
    const hasEnoughGas = nativeBalance >= estimatedGasCost;

    if (hasEnoughReceh && hasEnoughGas) {
      balanceCheckText.innerHTML = `<span class="balance-sufficient">✓ Sufficient RECEH (fee) & ${config.symbol} (gas)</span>`;
    } else if (!hasEnoughReceh) {
      const requiredReceh = ethers.formatEther(creationFee);
      balanceCheckText.innerHTML = `<span class="balance-insufficient">✗ Insufficient RECEH balance! Required: ${requiredReceh} RECEH</span>`;
    } else {
      const requiredGas = ethers.formatEther(estimatedGasCost);
      balanceCheckText.innerHTML = `<span class="balance-insufficient">✗ Insufficient ${config.symbol} for gas! Required approx: ${requiredGas} ${config.symbol}</span>`;
    }
  } catch (error) {
    console.error("Error checking balance sufficiency:", error);
    balanceCheckText.innerHTML =
      '<span class="balance-insufficient">✗ Failed to check balance sufficiency</span>';
  }
}

function updateWalletUI() {
  if (!connectedAddress) {
    if (walletAddressText) walletAddressText.textContent = "-";
    return;
  }
  const address = ethers.isAddress(connectedAddress)
    ? ethers.getAddress(connectedAddress)
    : connectedAddress;
  if (walletAddressText)
    walletAddressText.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function checkNetwork() {
  if (!provider || !isConnected) return false;
  try {
    const network = await provider.getNetwork();
    currentChainId = Number(network.chainId);
    isCorrectNetwork =
      currentChainId ===
      Number(blockchainConfig[selectedBlockchain].chainIdDecimal);
    updateNetworkStatus();
    if (isCorrectNetwork) {
      await initializeContract();
      await updateWalletBalance();
      startGasPriceUpdates();
      updateStepIndicator(3);
    }
    return isCorrectNetwork;
  } catch (error) {
    console.error("Error checking network:", error);
    isCorrectNetwork = false;
    updateNetworkStatus();
    return false;
  }
}

async function switchToCorrectNetwork() {
  if (switchInFlight) return switchInFlight;

  switchInFlight = (async () => {
    try {
      const config = blockchainConfig[selectedBlockchain];
      const targetId = Number(config.chainIdDecimal);
      const modal = await initReownAppKit();

      if (!isConnected) {
        showToast("Connect your wallet first", "warning");
        return false;
      }

      if (currentChainId === targetId) {
        await syncConnectedWallet("already-correct");
        return true;
      }

      showToast(`Switching to ${config.chainName}...`, "info");
      let switched = false;

      if (typeof modal.switchNetwork === "function") {
        try {
          const network = getReownNetworks().find((n) => n.id === targetId);
          if (network) {
            await modal.switchNetwork(network);
            switched = true;
          }
        } catch (error) {
          console.warn("AppKit switchNetwork fallback:", error);
        }
      }

      const eip1193 =
        walletProvider ||
        modal.getWalletProvider?.() ||
        window.__reownEip1193Provider;
      if (!switched && eip1193) {
        try {
          await eip1193.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: config.chainId }],
          });
          switched = true;
        } catch (switchError) {
          const code = switchError?.code ?? switchError?.data?.code;
          if (code === 4902) {
            await eip1193.request({
              method: "wallet_addEthereumChain",
              params: [
                {
                  chainId: config.chainId,
                  chainName: config.chainName,
                  rpcUrls: [config.rpcUrl],
                  nativeCurrency: {
                    name: config.nativeCurrency,
                    symbol: config.nativeCurrency,
                    decimals: 18,
                  },
                  blockExplorerUrls: [config.blockExplorer],
                },
              ],
            });
            await eip1193.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: config.chainId }],
            });
            switched = true;
          } else if (code === 4001) {
            showToast("Network switch rejected", "warning");
            return false;
          } else {
            throw switchError;
          }
        }
      }

      if (!switched)
        throw new Error("Wallet does not support network switching.");

      await new Promise((resolve) => setTimeout(resolve, 300));
      await syncConnectedWallet("network-switched");
      if (isCorrectNetwork) {
        showToast(`Successfully switched to ${config.chainName}!`, "success");
        return true;
      }
      showToast(`Please switch your wallet to ${config.chainName}`, "warning");
      return false;
    } catch (error) {
      const code = error?.code ?? error?.data?.code;
      console.error("Error switching chain:", error);
      if (code === -32002) {
        showToast(
          "A wallet request is already pending. Complete it first.",
          "warning",
        );
      } else if (code !== 4001) {
        showToast(error?.message || "Failed to switch network", "error");
      }
      return false;
    } finally {
      switchInFlight = null;
    }
  })();

  return switchInFlight;
}

async function connectWallet() {
  if (connectInFlight) return connectInFlight;

  connectInFlight = (async () => {
    try {
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      if (isMobile && !isInAppBrowser()) {
        document.getElementById("mobileModal")?.classList.add("active");
        return;
      }

      const modal = await initReownAppKit();
      connectButton.disabled = true;
      connectButton.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> Connecting...';
      showToast("Connecting to wallet...", "info");

      if (modal.getIsConnected?.()) {
        await syncConnectedWallet("connect-already-active");
        try {
          modal.close?.();
        } catch (_) {}
        return;
      }

      modal.open({ view: "Connect", namespace: "eip155" });

      for (let attempt = 0; attempt < 50; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        if (modal.getIsConnected?.() && modal.getAddress?.()) {
          const synced = await syncConnectedWallet("connect-complete");
          if (synced || isConnected) {
            try {
              modal.close?.();
            } catch (_) {}
            if (isCorrectNetwork)
              showToast("Successfully connected!", "success");
            else showToast("Wallet connected! But wrong network.", "warning");
            return;
          }
        }
      }

      if (!isConnected) updateNetworkStatus();
    } catch (error) {
      const code = error?.code ?? error?.data?.code;
      console.error("Error connecting wallet:", error);
      if (code === -32002) {
        showToast(
          "A wallet request is already pending. Complete the open wallet prompt first.",
          "warning",
        );
      } else if (code === 4001) {
        showToast("Wallet connection rejected", "warning");
      } else {
        showToast(error?.message || "Failed to connect wallet", "error");
      }
    } finally {
      connectButton.disabled = false;
      if (isConnected) {
        connectButton.innerHTML =
          '<i class="fas fa-plug" aria-hidden="true"></i> Disconnect';
      } else {
        connectButton.innerHTML =
          '<i class="fas fa-plug" aria-hidden="true"></i> Connect Wallet';
      }
      connectInFlight = null;
    }
  })();

  return connectInFlight;
}

async function disconnectWallet() {
  if (disconnectInFlight) return disconnectInFlight;

  disconnectInFlight = (async () => {
    walletSyncVersion++;
    walletSyncQueued = false;
    if (walletSyncTimer) {
      clearTimeout(walletSyncTimer);
      walletSyncTimer = null;
    }

    try {
      const client = appKit?.adapter?.connectionControllerClient;
      if (client?.disconnect) await client.disconnect();
      else if (typeof appKit?.disconnect === "function")
        await appKit.disconnect();
      try {
        appKit?.close?.();
      } catch (_) {}
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
    } finally {
      window.__reownAccount = null;
      window.__reownEip1193Provider = null;
      clearWalletState();
      connectInFlight = null;
      disconnectInFlight = null;
      showToast("Wallet disconnected", "info");
      statusDiv.innerHTML = "";
      updateStepIndicator(1);
    }
  })();

  return disconnectInFlight;
}

async function initializeContract() {
  if (!signer || !isConnected || !isCorrectNetwork) return false;
  try {
    const config = blockchainConfig[selectedBlockchain];
    const code = await provider.getCode(config.factoryAddress);
    if (!code || code === "0x") {
      factoryContract = null;
      throw new Error(
        `Factory contract not found on ${config.chainName}: ${config.factoryAddress}`,
      );
    }

    factoryContract = new ethers.Contract(
      config.factoryAddress,
      factoryABI,
      signer,
    );
    await updateCreationFee();
    console.log("Contract initialized successfully");
    return true;
  } catch (error) {
    factoryContract = null;
    console.error("Error initializing contract:", error);
    return false;
  }
}

async function updateCreationFee() {
  const tokenCreationFee = document.getElementById("tokenCreationFee");
  if (!tokenCreationFee) return null;

  try {
    const config = blockchainConfig[selectedBlockchain];
    const readProvider = new ethers.JsonRpcProvider(config.rpcUrl);
    const code = await readProvider.getCode(config.factoryAddress);
    if (!code || code === "0x") {
      tokenCreationFee.textContent = "Unavailable";
      updateTotalEstimate();
      return null;
    }

    const readFactoryContract = new ethers.Contract(
      config.factoryAddress,
      factoryABI,
      readProvider,
    );
    const fee = await readFactoryContract.creationFee();
    const currentCreationFee = parseFloat(ethers.formatEther(fee));
    tokenCreationFee.textContent = `${currentCreationFee.toFixed(4)} RECEH`;
    updateTotalEstimate();
    return fee;
  } catch (error) {
    console.error("Failed to read creation fee:", error);
    tokenCreationFee.textContent = "Unavailable";
    updateTotalEstimate();
    return null;
  }
}

async function updateGasPrice() {
  if (!provider) {
    const gasPriceEl = document.getElementById("gasPriceGwei");
    if (gasPriceEl) gasPriceEl.textContent = "-";
    const estimatedGasFee = document.getElementById("estimatedGasFee");
    if (estimatedGasFee) estimatedGasFee.textContent = "Connect wallet first";
    return;
  }
  try {
    const feeData = await provider.getFeeData();
    if (feeData && feeData.gasPrice) {
      const currentGasPrice = parseFloat(
        ethers.formatUnits(feeData.gasPrice, "gwei"),
      );
      const gasPriceEl = document.getElementById("gasPriceGwei");
      if (gasPriceEl)
        gasPriceEl.textContent = `${currentGasPrice.toFixed(2)} Gwei`;
      const estimatedGasLimit = 300000;
      const gasFeeInWei = feeData.gasPrice * BigInt(estimatedGasLimit);
      const gasFeeInNative = parseFloat(ethers.formatEther(gasFeeInWei));
      const estimatedGasFee = document.getElementById("estimatedGasFee");
      if (estimatedGasFee) {
        estimatedGasFee.textContent = `${gasFeeInNative.toFixed(5)} ${blockchainConfig[selectedBlockchain].symbol}`;
      }
      updateTotalEstimate();
    } else {
      const gasPriceEl = document.getElementById("gasPriceGwei");
      if (gasPriceEl) gasPriceEl.textContent = "Fetching...";
    }
  } catch (error) {
    console.error("Error fetching gas price:", error);
    const gasPriceEl = document.getElementById("gasPriceGwei");
    if (gasPriceEl) gasPriceEl.textContent = "Error";
    const estimatedGasFee = document.getElementById("estimatedGasFee");
    if (estimatedGasFee)
      estimatedGasFee.textContent = "Unable to fetch gas fee";
  }
}

function updateTotalEstimate() {
  const tokenCreationFee = document.getElementById("tokenCreationFee");
  const estimatedGasFee = document.getElementById("estimatedGasFee");
  const totalEstimatedFee = document.getElementById("totalEstimatedFee");
  if (!tokenCreationFee || !estimatedGasFee || !totalEstimatedFee) return;

  let creationFee = 0;
  const recehText = tokenCreationFee.textContent;
  if (recehText && recehText !== "Error" && recehText !== "Loading..") {
    const match = recehText.match(/([\d.]+)/);
    if (match) creationFee = parseFloat(match[1]);
  }

  let gasFee = 0;
  let gasSymbol = "";
  const gasText = estimatedGasFee.textContent;
  if (
    gasText &&
    gasText !== "Loading.." &&
    gasText !== "Connect wallet first" &&
    gasText !== "Unable to fetch gas fee"
  ) {
    const match = gasText.match(/([\d.]+)\s+(\w+)/);
    if (match) {
      gasFee = parseFloat(match[1]);
      gasSymbol = match[2];
    }
  }

  if (creationFee > 0 && gasFee > 0) {
    totalEstimatedFee.innerHTML = `${creationFee.toFixed(4)} RECEH (fee) + ${gasFee.toFixed(5)} ${gasSymbol} (gas)`;
  } else if (creationFee > 0) {
    totalEstimatedFee.innerHTML = `${creationFee.toFixed(4)} RECEH (fee) + (waiting for gas)`;
  } else {
    totalEstimatedFee.innerHTML = "Loading...";
  }
}

function startGasPriceUpdates() {
  if (gasPriceInterval) {
    clearInterval(gasPriceInterval);
  }
  updateGasPrice();
  gasPriceInterval = setInterval(updateGasPrice, 30000);
}

function stopGasPriceUpdates() {
  if (gasPriceInterval) {
    clearInterval(gasPriceInterval);
    gasPriceInterval = null;
  }
}

async function createToken() {
  if (!factoryContract) {
    showError("Please connect your wallet first!");
    return;
  }
  if (!isCorrectNetwork) {
    showError(
      `Please switch your wallet to ${blockchainConfig[selectedBlockchain].chainName}`,
    );
    return;
  }

  try {
    const userIdentifier = await signer.getAddress();
    rateLimiter.checkLimit(userIdentifier);
  } catch (error) {
    if (error instanceof SecurityError) {
      showError(error.message);
      return;
    }
  }

  clearValidationErrors();

  try {
    const name = InputValidator.validateTokenName(
      document.getElementById("tokenName").value,
    );
    const symbol = InputValidator.validateTokenSymbol(
      document.getElementById("tokenSymbol").value,
    );
    const decimals = InputValidator.validateDecimals(
      document.getElementById("tokenDecimals").value,
    );
    const supply = InputValidator.validateSupply(
      document.getElementById("tokenSupply").value,
    );

    showLoading();

    const fee = await factoryContract.creationFee();
    const address = await signer.getAddress();
    const config = blockchainConfig[selectedBlockchain];

    const recehToken = new ethers.Contract(
      RECEH_TOKEN_ADDRESS,
      erc20ABI,
      signer,
    );
    const recehBalance = await recehToken.balanceOf(address);

    if (recehBalance < fee) {
      showError(
        `Insufficient RECEH balance! Required: ${ethers.formatEther(fee)} RECEH`,
      );
      hideLoading();
      return;
    }

    const nativeBalance = await provider.getBalance(address);
    const feeData = await provider.getFeeData();
    const estimatedGasCost = feeData.gasPrice * BigInt(300000);

    if (nativeBalance < estimatedGasCost) {
      showError(
        `Insufficient ${config.symbol} for gas! Required approx: ${ethers.formatEther(estimatedGasCost)} ${config.symbol}`,
      );
      hideLoading();
      return;
    }

    showToast("Approving RECEH token...", "info");
    const approveTx = await recehToken.approve(factoryContract.target, fee);
    await approveTx.wait();
    showToast("RECEH approved successfully!", "success");

    const tx = await factoryContract.createToken(
      name,
      symbol,
      decimals,
      supply,
    );
    showTransactionPending(tx.hash);
    const receipt = await tx.wait();
    hideLoading();
    processSuccess(receipt, name, symbol, decimals, supply);
  } catch (err) {
    hideLoading();
    if (err instanceof SecurityError) {
      handleValidationError(err);
    } else {
      handleTransactionError(err);
    }
  }
}

function clearValidationErrors() {
  const errorElements = document.querySelectorAll(".error-message");
  errorElements.forEach((el) => {
    el.classList.remove("show");
    el.textContent = "";
  });
  const formControls = document.querySelectorAll(".form-control");
  formControls.forEach((control) => {
    control.classList.remove("error");
  });
}

function handleValidationError(error) {
  let fieldId = "";
  let message = error.message;
  switch (error.code) {
    case "EMPTY_NAME":
    case "INVALID_NAME":
      fieldId = "tokenName";
      break;
    case "EMPTY_SYMBOL":
    case "INVALID_SYMBOL":
      fieldId = "tokenSymbol";
      break;
    case "INVALID_DECIMALS":
    case "DECIMALS_OUT_OF_RANGE":
      fieldId = "tokenDecimals";
      break;
    case "INVALID_SUPPLY":
    case "SUPPLY_TOO_LARGE":
      fieldId = "tokenSupply";
      break;
    default:
      showError(message);
      return;
  }
  const field = document.getElementById(fieldId);
  const errorElement = document.getElementById(fieldId + "Error");
  if (field && errorElement) {
    field.classList.add("error");
    errorElement.textContent = message;
    errorElement.classList.add("show");
    field.focus();
  }
}

function showTransactionPending(txHash) {
  showPopup(
    "pending",
    "Transaction Processing",
    "Waiting for blockchain confirmation...",
    txHash,
  );
  updateStepIndicator(4);
}

function extractTokenAddress(receipt) {
  let tokenAddr = null;
  try {
    for (const log of receipt.logs) {
      try {
        const parsed = factoryContract.interface.parseLog(log);
        if (parsed && parsed.name === "TokenCreated") {
          tokenAddr = parsed.args.tokenAddress;
          break;
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    console.log("Error processing logs:", e);
  }
  if (tokenAddr && ethers.isAddress(tokenAddr)) {
    return tokenAddr;
  } else {
    console.error("Invalid token address:", tokenAddr);
    return null;
  }
}

function processSuccess(receipt, name, symbol, decimals, supply) {
  let tokenAddr = extractTokenAddress(receipt);
  const config = blockchainConfig[selectedBlockchain];
  if (!tokenAddr) {
    showPopup(
      "error",
      "Token Successfully Created",
      `Token ${name} (${symbol}) successfully created on ${config.chainName}, but token address could not be extracted. Please check the transaction on the blockchain explorer.`,
    );
    return;
  }
  currentTokenAddress = tokenAddr;
  currentTokenSymbol = symbol;
  currentTokenDecimals = decimals;
  createConfetti();
  statusDiv.innerHTML = "";

  function downloadSourceCode() {
    const supplyStr = supply.toString();
    const decimalsNum = Number(decimals);
    const multiplier = 10n ** BigInt(decimalsNum);
    const initialSupplyBigInt = BigInt(supplyStr) * multiplier;
    const initialSupplyStr = initialSupplyBigInt.toString();
    const creator = walletAddressText.textContent;
    const sourceCode = `// SPDX-License-Identifier: MIT

pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Token is ERC20, Ownable {
    uint8 private _customDecimals;
    
    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply,
        address creator
    ) ERC20(name_, symbol_) Ownable(creator) {
        _customDecimals = decimals_;
        _mint(creator, initialSupply);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _customDecimals;
    }
}

/*
==================================================
TOKEN DETAILS
==================================================
Network: ${config.chainName}
Token: ${name} (${symbol})
Decimals: ${decimals}
Total Supply: ${supplyStr}
Contract Address: ${tokenAddr}
Creator: ${creator}
Transaction Hash: ${receipt.transactionHash}
==================================================
*/`;
    const blob = new Blob([sourceCode], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol}_Token.sol`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast("✅ Source code downloaded!", "success");
  }

  const extraActions = [
    {
      text: "📥 Download Source Code",
      icon: "fas fa-download",
      className: "btn-primary",
      onclick: downloadSourceCode,
    },
  ];
  showPopup(
    "success",
    "Token Successfully Created! 🚀",
    `Token ${name} (${symbol}) successfully deployed on ${config.chainName}. Total Supply: ${supply.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} with ${decimals} decimal places.`,
    receipt.transactionHash,
    tokenAddr,
    extraActions,
  );
}

function handleTransactionError(err) {
  const config = blockchainConfig[selectedBlockchain];
  let userMessage = "Failed to create token";
  if (err.code === "INSUFFICIENT_FUNDS") {
    userMessage = `Insufficient ${config.symbol} balance for gas fee`;
  } else if (err.code === "USER_REJECTED") {
    userMessage = "Transaction cancelled by user";
  } else if (err.message.includes("gas")) {
    userMessage = "Gas fee too high, please try again later";
  } else if (err.message.includes("network")) {
    userMessage =
      "Network issue, ensure you're connected to the correct network";
  } else if (err.message.includes("rate limit")) {
    userMessage = "Too many requests, please try again later";
  } else if (err.message.includes("RECEH") || err.message.includes("Receh")) {
    userMessage =
      "RECEH token transfer failed. Make sure you have enough RECEH and have approved the contract.";
  }
  showPopup("error", "Transaction Failed", `${userMessage}: ${err.message}`);
}

function showError(message) {
  showPopup("error", "Error", message);
  showToast(message, "error", 5000);
}

function showLoading() {
  showToast("Processing blockchain transaction...", "info");
  loading.style.display = "block";
  createButton.disabled = true;
  createButton.innerHTML =
    '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Processing...';
}

function hideLoading() {
  loading.style.display = "none";
  createButton.disabled = false;
  createButton.innerHTML =
    '<i class="fas fa-rocket" aria-hidden="true"></i> Deploy Now';
}

async function addTokenToWallet(tokenAddress, symbol, decimals) {
  try {
    await window.ethereum.request({
      method: "wallet_watchAsset",
      params: {
        type: "ERC20",
        options: { address: tokenAddress, symbol: symbol, decimals: decimals },
      },
    });
    showToast("Token successfully added to wallet!", "success");
  } catch (error) {
    console.error("Error adding token to wallet:", error);
    showToast("Failed to add token to wallet", "error");
  }
}

function setupNetworkListeners() {}

function initEventListeners() {
  popupClose.onclick = hidePopup;
  popupOverlay.onclick = function (e) {
    if (e.target === popupOverlay) {
      hidePopup();
    }
  };
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && popupOverlay.classList.contains("active")) {
      hidePopup();
    }
  });
  copyTokenAddressBtn.onclick = function () {
    copyToClipboardText(currentTokenAddress);
  };
  addTokenToWalletBtn.onclick = function () {
    addTokenToWallet(
      currentTokenAddress,
      currentTokenSymbol,
      currentTokenDecimals,
    );
  };
  viewExplorerBtn.onclick = function () {
    const config = blockchainConfig[selectedBlockchain];
    window.open(
      `${config.blockExplorer}/token/${currentTokenAddress}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  mobileMenuBtn.onclick = function () {
    mobileNav.classList.add("active");
    mobileMenuBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  };
  mobileNavClose.onclick = function () {
    mobileNav.classList.remove("active");
    mobileMenuBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    mobileMenuBtn.focus();
  };
  document.addEventListener("click", function (e) {
    if (
      mobileNav.classList.contains("active") &&
      !mobileNav.contains(e.target) &&
      !mobileMenuBtn.contains(e.target)
    ) {
      mobileNav.classList.remove("active");
      mobileMenuBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }
  });
  switchNetworkBtn.onclick = switchToCorrectNetwork;
  connectButton.onclick = connectWallet;
  createButton.onclick = createToken;
  const formInputs = document.querySelectorAll(".form-control");
  formInputs.forEach((input) => {
    input.addEventListener("blur", function () {
      clearValidationErrors();
    });
  });
  window.addEventListener("scroll", handleScroll, { passive: true });
}

function copyUrlAndClose() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    showToast(
      "URL copied successfully! Open in your wallet DApp Browser.",
      "success",
    );
    document.getElementById("mobileModal").classList.remove("active");
  });
}

function contactSupport() {
  const telegramUrl = "https://t.me/receh_community";
  window.open(telegramUrl, "_blank", "noopener,noreferrer");
  showToast("Opening Telegram...", "info");
}

async function initApp() {
  initLoadingScreen();
  initBlockchainSelector();
  initEventListeners();
  initTooltips();
  setupNetworkListeners();
  blockchainSelect.value = "bnb";
  selectedBlockchain = "bnb";
  currentNetworkIndicator.style.display = "flex";
  currentNetworkText.textContent = `Selected: ${blockchainConfig[selectedBlockchain].chainName}`;

  await updateCreationFee();

  try {
    const modal = await initReownAppKit();
    if (modal.getIsConnected?.() && modal.getAddress?.()) {
      connectedAddress = modal.getAddress();
      isConnected = true;
      await syncConnectedWallet("auto-connect");
      if (isCorrectNetwork) showToast("Wallet auto-connected!", "success");
      else showToast("Wallet connected but wrong network", "warning");
    }
  } catch (error) {
    if (!/Reown Project ID is not configured/.test(error?.message || "")) {
      console.log("No previous wallet connection:", error);
    }
  }
}

window.addEventListener("error", function (e) {
  console.error("Global error:", e.error);
  showToast("An unexpected error occurred", "error");
});
window.addEventListener("unhandledrejection", function (e) {
  console.error("Unhandled promise rejection:", e.reason);
  showToast("An issue occurred with the operation", "error");
  e.preventDefault();
});
window.addEventListener("load", initApp);
