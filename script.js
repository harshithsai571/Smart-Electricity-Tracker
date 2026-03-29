const APP_VERSION = "1.0.1";
const STORAGE_KEY = "smart-electricity-tracker-readings";
const COST_STORAGE_KEY = "smart-electricity-tracker-cost-per-unit";

const form = document.getElementById("reading-form");
const readingInput = document.getElementById("meter-reading");
const messageElement = document.getElementById("form-message");
const todayUsageElement = document.getElementById("today-usage");
const weeklyUsageElement = document.getElementById("weekly-usage");
const monthlyUsageElement = document.getElementById("monthly-usage");
const totalUsageElement = document.getElementById("total-usage");
const historyListElement = document.getElementById("history-list");

const costPerUnitInput = document.getElementById("cost-per-unit");
const weeklyBillElement = document.getElementById("weekly-bill");
const monthlyBillElement = document.getElementById("monthly-bill");
const totalBillElement = document.getElementById("total-bill");
const exportButton = document.getElementById("export-button");

const weekChartButton = document.getElementById("week-chart-button");
const monthChartButton = document.getElementById("month-chart-button");
const usageChartCanvas = document.getElementById("usage-chart");
const chartEmptyElement = document.getElementById("chart-empty");

const openScannerButton = document.getElementById("open-scanner");
const closeScannerButton = document.getElementById("close-scanner");
const scannerModal = document.getElementById("scanner-modal");
const cameraPreview = document.getElementById("camera-preview");
const capturePreview = document.getElementById("capture-preview");
const captureButton = document.getElementById("capture-button");
const useReadingButton = document.getElementById("use-reading-button");
const retakeButton = document.getElementById("retake-button");
const scannerStatusElement = document.getElementById("scanner-status");
const scannerLoadingElement = document.getElementById("scanner-loading");
const ocrResultElement = document.getElementById("ocr-result");
const guideBox = document.getElementById("guide-box");
const cropPreview = document.getElementById("crop-preview");
const updateModal = document.getElementById("update-modal");
const updateMessageElement = document.getElementById("update-message");
const updateNowButton = document.getElementById("update-now-button");
const updateLaterButton = document.getElementById("update-later-button");

const chartState = {
  mode: "week",
  animationFrame: null
};

const scannerState = {
  stream: null,
  worker: null,
  capturedReading: "",
  isProcessing: false,
  scanToken: 0
};

function loadReadings() {
  try {
    const savedReadings = localStorage.getItem(STORAGE_KEY);
    const parsedReadings = JSON.parse(savedReadings);

    return Array.isArray(parsedReadings) ? parsedReadings : [];
  } catch (error) {
    return [];
  }
}

function saveReadings(readings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
}

function loadCostPerUnit() {
  const savedCost = Number.parseFloat(localStorage.getItem(COST_STORAGE_KEY));
  return Number.isFinite(savedCost) && savedCost >= 0 ? savedCost : 0;
}

function saveCostPerUnit(costPerUnit) {
  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
    localStorage.removeItem(COST_STORAGE_KEY);
    return;
  }

  localStorage.setItem(COST_STORAGE_KEY, String(costPerUnit));
}

function formatUnits(value) {
  return `${Number(value).toFixed(2)} units`;
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function roundToTwo(value) {
  return Number(value.toFixed(2));
}

function isSameLocalDate(timestamp, comparisonDate = new Date()) {
  const entryDate = new Date(timestamp);

  return (
    entryDate.getFullYear() === comparisonDate.getFullYear() &&
    entryDate.getMonth() === comparisonDate.getMonth() &&
    entryDate.getDate() === comparisonDate.getDate()
  );
}

function isSameLocalMonth(timestamp, comparisonDate = new Date()) {
  const entryDate = new Date(timestamp);

  return (
    entryDate.getFullYear() === comparisonDate.getFullYear() &&
    entryDate.getMonth() === comparisonDate.getMonth()
  );
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function getDayKey(input) {
  const date = new Date(input);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
}

function getMonthKey(input) {
  const date = new Date(input);
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}`;
}

function addDays(date, numberOfDays) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + numberOfDays);
  return nextDate;
}

function addMonths(date, numberOfMonths) {
  return new Date(date.getFullYear(), date.getMonth() + numberOfMonths, 1);
}

function calculateReadings(readings) {
  const sortedReadings = [...readings].sort((left, right) => left.timestamp - right.timestamp);

  return sortedReadings.map((reading, index) => {
    const previousReading = sortedReadings[index - 1];
    const dailyUsage = previousReading
      ? roundToTwo(reading.meterReading - previousReading.meterReading)
      : 0;

    return {
      ...reading,
      dailyUsage
    };
  });
}

function buildDailyUsageMap(readings) {
  return readings.reduce((usageMap, reading) => {
    const dayKey = getDayKey(reading.timestamp);
    usageMap.set(dayKey, roundToTwo((usageMap.get(dayKey) || 0) + reading.dailyUsage));
    return usageMap;
  }, new Map());
}

function buildMonthlyUsageMap(readings) {
  return readings.reduce((usageMap, reading) => {
    const monthKey = getMonthKey(reading.timestamp);
    usageMap.set(monthKey, roundToTwo((usageMap.get(monthKey) || 0) + reading.dailyUsage));
    return usageMap;
  }, new Map());
}

function getWeeklySeries(readings) {
  const dailyUsageMap = buildDailyUsageMap(readings);
  const today = new Date();
  const series = [];

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const dayKey = getDayKey(date);

    series.push({
      label: date.toLocaleDateString([], { weekday: "short" }),
      value: dailyUsageMap.get(dayKey) || 0,
      detail: date.toLocaleDateString([], { month: "short", day: "numeric" })
    });
  }

  return series;
}

function getMonthlySeries(readings) {
  const monthlyUsageMap = buildMonthlyUsageMap(readings);
  const currentMonth = new Date();
  const series = [];

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = addMonths(currentMonth, -offset);
    const monthKey = getMonthKey(date);

    series.push({
      label: date.toLocaleDateString([], { month: "short" }),
      value: monthlyUsageMap.get(monthKey) || 0,
      detail: date.toLocaleDateString([], { month: "long", year: "numeric" })
    });
  }

  return series;
}

function getUsageSummary(readings) {
  const todayUsage = readings
    .filter((reading) => isSameLocalDate(reading.timestamp))
    .reduce((sum, reading) => sum + reading.dailyUsage, 0);

  const weeklyUsage = getWeeklySeries(readings).reduce((sum, item) => sum + item.value, 0);
  const monthlyUsage = readings
    .filter((reading) => isSameLocalMonth(reading.timestamp))
    .reduce((sum, reading) => sum + reading.dailyUsage, 0);
  const totalUsage = readings.reduce((sum, reading) => sum + reading.dailyUsage, 0);

  return {
    todayUsage: roundToTwo(todayUsage),
    weeklyUsage: roundToTwo(weeklyUsage),
    monthlyUsage: roundToTwo(monthlyUsage),
    totalUsage: roundToTwo(totalUsage)
  };
}

function renderOverview(summary) {
  todayUsageElement.textContent = formatUnits(summary.todayUsage);
  weeklyUsageElement.textContent = formatUnits(summary.weeklyUsage);
  monthlyUsageElement.textContent = formatUnits(summary.monthlyUsage);
  totalUsageElement.textContent = formatUnits(summary.totalUsage);
}

function renderBillEstimates(summary) {
  const costPerUnit = Number.parseFloat(costPerUnitInput.value);
  const safeCostPerUnit = Number.isFinite(costPerUnit) && costPerUnit >= 0 ? costPerUnit : 0;

  weeklyBillElement.textContent = formatMoney(summary.weeklyUsage * safeCostPerUnit);
  monthlyBillElement.textContent = formatMoney(summary.monthlyUsage * safeCostPerUnit);
  totalBillElement.textContent = formatMoney(summary.totalUsage * safeCostPerUnit);
}

function renderHistory(readings) {
  if (readings.length === 0) {
    historyListElement.innerHTML = '<p class="empty-state">No readings saved yet. Add your first meter reading to get started.</p>';
    return;
  }

  const historyMarkup = [...readings]
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((reading) => {
      return `
        <article class="history-item">
          <div>
            <div class="history-item-header">
              <p class="history-item-date">${formatDate(reading.timestamp)}</p>
            </div>
            <p class="history-item-reading">Meter reading: ${reading.meterReading.toFixed(2)}</p>
          </div>
          <div class="history-meta">
            <p class="history-item-usage">Usage: <strong>${formatUnits(reading.dailyUsage)}</strong></p>
            <button class="delete-button" type="button" data-id="${reading.id}" aria-label="Delete reading from ${formatDate(reading.timestamp)}">
              Delete
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  historyListElement.innerHTML = historyMarkup;
}

function setChartMode(mode) {
  chartState.mode = mode;
  weekChartButton.classList.toggle("is-active", mode === "week");
  monthChartButton.classList.toggle("is-active", mode === "month");
  weekChartButton.setAttribute("aria-pressed", String(mode === "week"));
  monthChartButton.setAttribute("aria-pressed", String(mode === "month"));
}

function resizeCanvasToDisplaySize(canvas, height) {
  const context = canvas.getContext("2d");
  const devicePixelRatio = window.devicePixelRatio || 1;
  const width = Math.max(canvas.clientWidth, 1);

  canvas.width = Math.round(width * devicePixelRatio);
  canvas.height = Math.round(height * devicePixelRatio);
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  return context;
}

function easeOutCubic(progress) {
  return 1 - ((1 - progress) ** 3);
}

function drawUsageChart(series) {
  if (chartState.animationFrame) {
    cancelAnimationFrame(chartState.animationFrame);
    chartState.animationFrame = null;
  }

  const hasMeaningfulData = series.some((item) => item.value > 0);
  chartEmptyElement.classList.toggle("is-hidden", hasMeaningfulData);

  const context = resizeCanvasToDisplaySize(usageChartCanvas, 240);
  const width = usageChartCanvas.width / (window.devicePixelRatio || 1);
  const height = usageChartCanvas.height / (window.devicePixelRatio || 1);
  const padding = { top: 18, right: 14, bottom: 38, left: 12 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...series.map((item) => item.value), 1);
  const barWidth = chartWidth / series.length;

  function paintFrame(progress = 1) {
    context.clearRect(0, 0, width, height);

    for (let gridLine = 0; gridLine <= 4; gridLine += 1) {
      const y = padding.top + (chartHeight / 4) * gridLine;
      context.strokeStyle = "rgba(15, 23, 42, 0.08)";
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(padding.left, y);
      context.lineTo(width - padding.right, y);
      context.stroke();
    }

    series.forEach((item, index) => {
      const normalizedValue = item.value / maxValue;
      const animatedValue = normalizedValue * progress;
      const barHeight = Math.max(animatedValue * chartHeight, item.value > 0 ? 4 : 0);
      const x = padding.left + (index * barWidth) + 8;
      const y = padding.top + chartHeight - barHeight;
      const currentBarWidth = Math.max(barWidth - 16, 12);
      const gradient = context.createLinearGradient(0, y, 0, padding.top + chartHeight);

      gradient.addColorStop(0, "#0f766e");
      gradient.addColorStop(1, "#65c9b8");

      context.fillStyle = gradient;
      context.beginPath();
      context.roundRect(x, y, currentBarWidth, barHeight, 14);
      context.fill();

      context.fillStyle = "#5d7272";
      context.font = "600 12px Segoe UI";
      context.textAlign = "center";
      context.fillText(item.label, x + currentBarWidth / 2, height - 12);
    });

    context.fillStyle = "#102a2a";
    context.font = "700 13px Segoe UI";
    context.textAlign = "left";
    context.fillText(chartState.mode === "week" ? "Daily usage" : "Monthly usage", padding.left, 12);
  }

  if (!hasMeaningfulData) {
    paintFrame(1);
    return;
  }

  let animationStart;

  function animate(timestamp) {
    if (!animationStart) {
      animationStart = timestamp;
    }

    const progress = Math.min((timestamp - animationStart) / 480, 1);
    paintFrame(easeOutCubic(progress));

    if (progress < 1) {
      chartState.animationFrame = requestAnimationFrame(animate);
    } else {
      chartState.animationFrame = null;
    }
  }

  chartState.animationFrame = requestAnimationFrame(animate);
}

function renderAnalytics(readings) {
  const series = chartState.mode === "week"
    ? getWeeklySeries(readings)
    : getMonthlySeries(readings);

  drawUsageChart(series);
}

function renderApp() {
  const readings = calculateReadings(loadReadings());
  const summary = getUsageSummary(readings);

  saveReadings(readings);
  renderOverview(summary);
  renderBillEstimates(summary);
  renderAnalytics(readings);
  renderHistory(readings);
}

function compareVersions(leftVersion, rightVersion) {
  const leftParts = leftVersion.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = rightVersion.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

function showUpdateModal(version) {
  updateMessageElement.textContent = `Version ${version} is available. Refresh now to install the latest app update.`;
  updateModal.classList.remove("is-hidden");
  updateModal.setAttribute("aria-hidden", "false");
}

function hideUpdateModal() {
  updateModal.classList.add("is-hidden");
  updateModal.setAttribute("aria-hidden", "true");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register("service-worker.js", {
      updateViaCache: "none"
    });

    registration.update();
    return registration;
  } catch (error) {
    return null;
  }
}

async function checkForAppUpdate() {
  try {
    const response = await fetch(`version.json?ts=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();
    const latestVersion = typeof data.version === "string" ? data.version : APP_VERSION;

    if (compareVersions(latestVersion, APP_VERSION) > 0) {
      showUpdateModal(latestVersion);
    }
  } catch (error) {
    // Keep the app usable even if update checks fail offline.
  }
}

async function applyAppUpdate() {
  updateNowButton.disabled = true;
  updateLaterButton.disabled = true;
  updateMessageElement.textContent = "Updating the app and clearing old cached files...";

  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }

    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } finally {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("updatedAt", String(Date.now()));
    window.location.replace(nextUrl.toString());
  }
}

function showMessage(text, type = "") {
  messageElement.textContent = text;
  messageElement.className = `form-message ${type}`.trim();
}

function createReading(meterReading) {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    meterReading
  };
}

function handleFormSubmit(event) {
  event.preventDefault();

  const meterReading = Number.parseFloat(readingInput.value);

  if (Number.isNaN(meterReading) || meterReading < 0) {
    showMessage("Enter a valid meter reading greater than or equal to 0.", "error");
    return;
  }

  const readings = calculateReadings(loadReadings());
  const lastReading = readings[readings.length - 1];

  if (lastReading && meterReading < lastReading.meterReading) {
    showMessage("New readings cannot be lower than the previous meter reading.", "error");
    return;
  }

  const nextReadings = calculateReadings([...readings, createReading(meterReading)]);

  saveReadings(nextReadings);
  form.reset();
  readingInput.focus();
  showMessage("Meter reading saved successfully.", "success");
  renderApp();
}

function handleHistoryClick(event) {
  const deleteButton = event.target.closest("[data-id]");

  if (!deleteButton) {
    return;
  }

  const readingId = deleteButton.dataset.id;
  const readings = loadReadings().filter((reading) => reading.id !== readingId);
  const nextReadings = calculateReadings(readings);

  saveReadings(nextReadings);
  showMessage("Reading deleted.", "success");
  renderApp();
}

function escapeCsvValue(value) {
  const stringValue = String(value);

  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

function handleExportCsv() {
  const readings = calculateReadings(loadReadings());

  if (readings.length === 0) {
    showMessage("Add at least one reading before exporting CSV.", "error");
    return;
  }

  const csvRows = [
    ["date", "meter_reading", "daily_usage"],
    ...readings.map((reading) => [
      new Date(reading.timestamp).toISOString(),
      reading.meterReading.toFixed(2),
      reading.dailyUsage.toFixed(2)
    ])
  ];

  const csvContent = csvRows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const blobUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  const exportDate = new Date().toISOString().slice(0, 10);

  downloadLink.href = blobUrl;
  downloadLink.download = `smart-electricity-readings-${exportDate}.csv`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  URL.revokeObjectURL(blobUrl);

  showMessage("CSV export downloaded successfully.", "success");
}

function handleCostInput() {
  const costPerUnit = Number.parseFloat(costPerUnitInput.value);

  if (costPerUnitInput.value.trim() === "") {
    saveCostPerUnit(0);
    renderApp();
    return;
  }

  if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
    renderApp();
    return;
  }

  saveCostPerUnit(costPerUnit);
  renderApp();
}

function handleChartToggle(event) {
  const button = event.target.closest("[data-mode]");

  if (!button || button.dataset.mode === chartState.mode) {
    return;
  }

  setChartMode(button.dataset.mode);
  renderAnalytics(calculateReadings(loadReadings()));
}

function setScannerMessage(text) {
  scannerStatusElement.textContent = text;
}

function setScannerLoading(isLoading) {
  scannerState.isProcessing = isLoading;
  scannerLoadingElement.classList.toggle("is-hidden", !isLoading);
  captureButton.disabled = isLoading || !scannerState.stream;
  retakeButton.disabled = false;
  useReadingButton.disabled = isLoading || !scannerState.capturedReading;
}

function setDetectedReading(reading) {
  scannerState.capturedReading = reading;
  ocrResultElement.innerHTML = `Detected reading: <strong>${reading || "--"}</strong>`;
  useReadingButton.disabled = !reading || scannerState.isProcessing;
}

function showScanner() {
  scannerModal.classList.remove("is-hidden");
  scannerModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("scanner-open");
}

function hideScanner() {
  scannerModal.classList.add("is-hidden");
  scannerModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("scanner-open");
}

function setScannerMode(mode) {
  const isLive = mode === "live";

  cameraPreview.classList.toggle("is-hidden", !isLive);
  capturePreview.classList.toggle("is-hidden", isLive);
  guideBox.classList.toggle("is-hidden", !isLive);
  captureButton.classList.toggle("is-hidden", !isLive);
  useReadingButton.classList.toggle("is-hidden", isLive);
  retakeButton.classList.toggle("is-hidden", isLive);
}

function resetCapturedState() {
  scannerState.scanToken += 1;
  capturePreview.removeAttribute("src");
  resetCropPreview();
  setDetectedReading("");
  setScannerLoading(false);
}

function stopCamera() {
  if (!scannerState.stream) {
    return;
  }

  scannerState.stream.getTracks().forEach((track) => track.stop());
  scannerState.stream = null;
  cameraPreview.srcObject = null;
}

async function requestCameraStream() {
  const preferredConstraints = {
    audio: false,
    video: {
      facingMode: { exact: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  const fallbackConstraints = {
    audio: false,
    video: {
      facingMode: "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  try {
    return await navigator.mediaDevices.getUserMedia(preferredConstraints);
  } catch (error) {
    if (error.name !== "OverconstrainedError" && error.name !== "NotFoundError") {
      throw error;
    }

    return navigator.mediaDevices.getUserMedia(fallbackConstraints);
  }
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScannerMessage("Camera access is not supported in this browser.");
    return;
  }

  stopCamera();
  resetCapturedState();
  setScannerMode("live");
  captureButton.disabled = true;
  setScannerMessage("Starting the rear camera...");
  const scanToken = scannerState.scanToken;

  try {
    const stream = await requestCameraStream();

    if (scanToken !== scannerState.scanToken) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    scannerState.stream = stream;
    cameraPreview.srcObject = stream;
    await cameraPreview.play();

    if (scanToken !== scannerState.scanToken) {
      stopCamera();
      return;
    }

    captureButton.disabled = false;
    setScannerMessage("Hold steady, use good lighting, and keep the meter digits inside the guide box.");
  } catch (error) {
    if (scanToken !== scannerState.scanToken) {
      return;
    }

    const permissionMessage = error.name === "NotAllowedError"
      ? "Camera permission was denied. Please allow access and try again."
      : "Unable to open the camera. Use HTTPS or localhost and check camera availability.";

    stopCamera();
    setScannerMessage(permissionMessage);
    captureButton.disabled = true;
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createFullFrameCanvas() {
  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;

  if (!videoWidth || !videoHeight) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = videoWidth;
  canvas.height = videoHeight;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function createCenterCropCanvas(sourceCanvas) {
  const crop = {
    x: Math.round(sourceCanvas.width * 0.2),
    y: Math.round(sourceCanvas.height * 0.4),
    width: Math.round(sourceCanvas.width * 0.6),
    height: Math.round(sourceCanvas.height * 0.2)
  };
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.max(1, crop.width);
  canvas.height = Math.max(1, crop.height);

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    sourceCanvas,
    clamp(crop.x, 0, sourceCanvas.width),
    clamp(crop.y, 0, sourceCanvas.height),
    clamp(crop.width, 1, sourceCanvas.width - crop.x),
    clamp(crop.height, 1, sourceCanvas.height - crop.y),
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas;
}

function applySharpenFilter(imageData, width, height) {
  const source = new Uint8ClampedArray(imageData.data);
  const { data } = imageData;
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const destinationIndex = (y * width + x) * 4;

      for (let channel = 0; channel < 3; channel += 1) {
        let value = 0;
        let kernelIndex = 0;

        for (let sampleY = -1; sampleY <= 1; sampleY += 1) {
          for (let sampleX = -1; sampleX <= 1; sampleX += 1) {
            const sampleIndex = ((y + sampleY) * width + (x + sampleX)) * 4;
            value += source[sampleIndex + channel] * kernel[kernelIndex];
            kernelIndex += 1;
          }
        }

        data[destinationIndex + channel] = clamp(Math.round(value), 0, 255);
      }
    }
  }

  return imageData;
}

function computeOtsuThreshold(histogram, totalPixels) {
  let sum = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    sum += value * histogram[value];
  }

  let sumBackground = 0;
  let backgroundWeight = 0;
  let bestVariance = 0;
  let bestThreshold = 128;

  for (let threshold = 0; threshold < histogram.length; threshold += 1) {
    backgroundWeight += histogram[threshold];

    if (!backgroundWeight) {
      continue;
    }

    const foregroundWeight = totalPixels - backgroundWeight;

    if (!foregroundWeight) {
      break;
    }

    sumBackground += threshold * histogram[threshold];

    const meanBackground = sumBackground / backgroundWeight;
    const meanForeground = (sum - sumBackground) / foregroundWeight;
    const betweenClassVariance = backgroundWeight * foregroundWeight * ((meanBackground - meanForeground) ** 2);

    if (betweenClassVariance > bestVariance) {
      bestVariance = betweenClassVariance;
      bestThreshold = threshold;
    }
  }

  return bestThreshold;
}

function preprocessForOcr(sourceCanvas) {
  const scaleFactor = 2;
  const paddingX = Math.round(sourceCanvas.width * 0.08 * scaleFactor);
  const paddingY = Math.round(sourceCanvas.height * 0.18 * scaleFactor);
  const processedCanvas = document.createElement("canvas");
  const processedContext = processedCanvas.getContext("2d", { willReadFrequently: true });

  processedCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scaleFactor) + (paddingX * 2));
  processedCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scaleFactor) + (paddingY * 2));

  processedContext.fillStyle = "#ffffff";
  processedContext.fillRect(0, 0, processedCanvas.width, processedCanvas.height);
  processedContext.imageSmoothingEnabled = true;
  processedContext.imageSmoothingQuality = "high";
  processedContext.drawImage(
    sourceCanvas,
    0,
    0,
    sourceCanvas.width,
    sourceCanvas.height,
    paddingX,
    paddingY,
    Math.round(sourceCanvas.width * scaleFactor),
    Math.round(sourceCanvas.height * scaleFactor)
  );

  let imageData = processedContext.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  imageData = applySharpenFilter(imageData, processedCanvas.width, processedCanvas.height);
  const { data } = imageData;

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = Math.round((data[index] * 0.299) + (data[index + 1] * 0.587) + (data[index + 2] * 0.114));
    const contrasted = clamp(Math.round((grayscale - 128) * 2.1 + 128), 0, 255);
    const binaryValue = contrasted > 140 ? 255 : 0;

    data[index] = binaryValue;
    data[index + 1] = binaryValue;
    data[index + 2] = binaryValue;
    data[index + 3] = 255;
  }

  processedContext.putImageData(imageData, 0, 0);

  return processedCanvas;
}

function normalizeOcrText(text) {
  const cleanedText = text.replace(/[^0-9]/g, " ");
  const sequences = (cleanedText.match(/\d+/g) || []).sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return Number.parseInt(right, 10) - Number.parseInt(left, 10);
  });

  if (sequences.length > 0) {
    return sequences[0];
  }

  return text.replace(/[^0-9]/g, "");
}

function formatProgressStatus(status) {
  if (!status) {
    return "Scanning reading...";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function getOcrWorker() {
  if (scannerState.worker) {
    return scannerState.worker;
  }

  scannerState.worker = await Tesseract.createWorker("eng", 1, {
    logger: ({ status, progress }) => {
      if (!scannerState.isProcessing) {
        return;
      }

      const progressText = typeof progress === "number"
        ? `${Math.round(progress * 100)}%`
        : "";

      setScannerMessage([formatProgressStatus(status), progressText].filter(Boolean).join(" "));
    }
  });

  await scannerState.worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: 7,
    preserve_interword_spaces: 0
  });

  return scannerState.worker;
}

async function runOcr(capturedCanvas, scanToken) {
  setDetectedReading("");
  setScannerLoading(true);
  setScannerMessage("Scanning...");

  try {
    const processedCanvas = preprocessForOcr(capturedCanvas);
    const worker = await getOcrWorker();

    if (scanToken !== scannerState.scanToken) {
      return;
    }

    const result = await worker.recognize(processedCanvas);

    if (scanToken !== scannerState.scanToken) {
      return;
    }

    const reading = normalizeOcrText(result.data.text || "");

    cropPreview.src = processedCanvas.toDataURL("image/png");
    cropPreview.classList.remove("is-hidden");

    if (!reading || reading.length < 3) {
      setScannerMessage("Try again, keep digits inside box and hold steady.");
      return;
    }

    setDetectedReading(reading);
    setScannerMessage("Reading detected. Use it or retake the photo.");
  } catch (error) {
    if (scanToken === scannerState.scanToken) {
      setScannerMessage("OCR failed on this capture. Retake the photo and try again.");
    }
  } finally {
    if (scanToken === scannerState.scanToken) {
      setScannerLoading(false);
    }
  }
}

async function handleCapture() {
  if (!scannerState.stream || scannerState.isProcessing) {
    return;
  }

  const fullFrameCanvas = createFullFrameCanvas();

  if (!fullFrameCanvas) {
    setScannerMessage("The camera is not ready yet. Try capturing again in a moment.");
    return;
  }

  const capturedCanvas = createCenterCropCanvas(fullFrameCanvas);

  capturePreview.src = fullFrameCanvas.toDataURL("image/jpeg", 0.95);
  stopCamera();
  setScannerMode("captured");
  retakeButton.disabled = false;
  await runOcr(capturedCanvas, scannerState.scanToken);
}

async function openScanner() {
  showScanner();
  await startCamera();
}

function closeScanner() {
  stopCamera();
  resetCapturedState();
  setScannerMode("live");
  setScannerMessage("Hold steady, use good lighting, and keep the meter digits inside the guide box.");
  hideScanner();
}

async function retakeCapture() {
  resetCapturedState();
  await startCamera();
}

function applyDetectedReading() {
  if (!scannerState.capturedReading) {
    return;
  }

  readingInput.value = scannerState.capturedReading;
  showMessage("Scanned reading added to the input. Review it and tap Save Reading.", "success");
  closeScanner();
  readingInput.focus();
}

function handleEscapeClose(event) {
  if (event.key === "Escape" && !scannerModal.classList.contains("is-hidden")) {
    closeScanner();
  }
}

async function cleanupOcrWorker() {
  if (!scannerState.worker) {
    return;
  }

  await scannerState.worker.terminate();
  scannerState.worker = null;
}

function resetCropPreview() {
  cropPreview.removeAttribute("src");
  cropPreview.classList.add("is-hidden");
}

let resizeTimer;

function handleResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    renderAnalytics(calculateReadings(loadReadings()));
  }, 120);
}

form.addEventListener("submit", handleFormSubmit);
historyListElement.addEventListener("click", handleHistoryClick);
costPerUnitInput.addEventListener("input", handleCostInput);
exportButton.addEventListener("click", handleExportCsv);
weekChartButton.addEventListener("click", handleChartToggle);
monthChartButton.addEventListener("click", handleChartToggle);
updateNowButton.addEventListener("click", applyAppUpdate);
updateLaterButton.addEventListener("click", hideUpdateModal);
openScannerButton.addEventListener("click", openScanner);
closeScannerButton.addEventListener("click", closeScanner);
captureButton.addEventListener("click", handleCapture);
retakeButton.addEventListener("click", retakeCapture);
useReadingButton.addEventListener("click", applyDetectedReading);
window.addEventListener("keydown", handleEscapeClose);
window.addEventListener("resize", handleResize);
window.addEventListener("beforeunload", () => {
  stopCamera();
  cleanupOcrWorker();
});

const savedCostPerUnit = loadCostPerUnit();
costPerUnitInput.value = savedCostPerUnit ? savedCostPerUnit.toFixed(2) : "";
setChartMode("week");
renderApp();
registerServiceWorker().then(() => {
  checkForAppUpdate();
});
