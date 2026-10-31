const video = document.getElementById("video");
const urlInput = document.getElementById("urlInput");
const urlForm = document.getElementById("urlForm");
const errorMsg = document.getElementById("errorMsg");
const spinner = document.getElementById("loadingSpinner");
const playBtn = document.getElementById("playBtn");
const muteBtn = document.getElementById("muteBtn");
const volumeBar = document.getElementById("volumeBar");
const timeLabel = document.getElementById("timeLabel");
const seekBar = document.getElementById("seekBar");
const speedSelect = document.getElementById("speedSelect");
const qualitySelect = document.getElementById("qualitySelect");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const historyList = document.getElementById("historyList");

let player = null;
let seeking = false;

const detectType = (url) => {
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  if (clean.endsWith(".mpd")) return "DASH";
  if (clean.endsWith(".m3u8")) return "HLS";
  if (clean.endsWith(".mp4") || clean.endsWith(".m4v") || clean.endsWith(".webm")) return "MP4";
  return "AUTO";
};

const showError = (msg) => {
  errorMsg.textContent = msg;
  errorMsg.classList.remove("hidden");
};
const hideError = () => errorMsg.classList.add("hidden");

const formatTime = (sec) => {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

const saveHistory = (url, type) => {
  const raw = localStorage.getItem("videoHistory");
  let list = [];
  try { list = JSON.parse(raw) || []; } catch (e) {}
  list = list.filter((item) => item.url !== url);
  list.unshift({ url, type, ts: Date.now() });
  list = list.slice(0, 15);
  localStorage.setItem("videoHistory", JSON.stringify(list));
  renderHistory();
};

const removeHistory = (url) => {
  const raw = localStorage.getItem("videoHistory");
  let list = [];
  try { list = JSON.parse(raw) || []; } catch (e) {}
  list = list.filter((item) => item.url !== url);
  localStorage.setItem("videoHistory", JSON.stringify(list));
  renderHistory();
};

const renderHistory = () => {
  let list = [];
  try { list = JSON.parse(localStorage.getItem("videoHistory")) || []; } catch (e) {}
  historyList.innerHTML = "";
  if (!list.length) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="empty">Belum ada URL yang dimuat.</span>';
    historyList.appendChild(li);
    return;
  }
  list.forEach((item) => {
    const li = document.createElement("li");
    const url = document.createElement("span");
    url.className = "hist-url";
    url.textContent = item.url;
    url.title = item.url;
    url.style.cursor = "pointer";
    url.addEventListener("click", () => {
      urlInput.value = item.url;
      loadSource(item.url);
    });
    const type = document.createElement("span");
    type.className = "hist-type";
    type.textContent = item.type;
    const del = document.createElement("button");
    del.className = "hist-del";
    del.textContent = "✕";
    del.title = "Hapus";
    del.addEventListener("click", () => removeHistory(item.url));
    li.append(url, type, del);
    historyList.appendChild(li);
  });
};

const populateQuality = () => {
  qualitySelect.innerHTML = '<option value="">Auto</option>';
  if (!player) return;
  const tracks = player.getVariantTracks();
  const heights = [...new Set(tracks.map((t) => t.height).filter(Boolean))].sort((a, b) => b - a);
  heights.forEach((h) => {
    const opt = document.createElement("option");
    opt.value = h;
    opt.textContent = `${h}p`;
    qualitySelect.appendChild(opt);
  });
};

qualitySelect.addEventListener("change", () => {
  if (!player) return;
  const h = qualitySelect.value;
  if (!h) {
    player.configure({ abr: { enabled: true } });
    return;
  }
  const tracks = player.getVariantTracks();
  const target = Number(h);
  let best = null;
  tracks
    .filter((t) => t.height && t.height <= target)
    .sort((a, b) => b.height - a.height)
    .forEach((t) => { if (!best) best = t; });
  if (!best) best = tracks.find((t) => t.height === Math.max(...tracks.map((x) => x.height || 0)));
  if (best) {
    player.configure({ abr: { enabled: false } });
    player.selectVariantTrack(best, true);
  }
});

const initPlayer = () => {
  if (player) {
    player.destroy();
    player = null;
  }
  player = new shaka.Player();
  player.attach(video);
  player.configure({
    abr: { enabled: true },
    streaming: { bufferingGoal: 30 },
  });
  player.addEventListener("error", (e) => {
    spinner.classList.add("hidden");
    showError(`Error ${e.detail.code}: ${e.detail.message}`);
  });
  player.addEventListener("variantchanged", populateQuality);
};

const loadSource = async (url) => {
  if (!url) return;
  hideError();
  spinner.classList.remove("hidden");
  const type = detectType(url);
  try {
    if (type === "HLS" && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari) -- no library needed
      video.src = url;
      await video.load();
    } else {
      initPlayer();
      await player.load(url);
    }
    saveHistory(url, type);
    video.play();
  } catch (e) {
    // Fallback: let the browser try the URL directly
    try {
      video.src = url;
      await video.load();
      saveHistory(url, type);
      video.play();
    } catch (e2) {
      spinner.classList.add("hidden");
      showError(`Gagal memuat URL: ${e2.message || e2}. Pastikan URL valid dan server mengizinkan CORS.`);
    }
  }
};

urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  loadSource(urlInput.value.trim());
});

video.addEventListener("loadeddata", () => {
  spinner.classList.add("hidden");
  populateQuality();
});

video.addEventListener("timeupdate", () => {
  if (!seeking && video.duration) {
    seekBar.value = (video.currentTime / video.duration) * 1000;
  }
  timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
});

video.addEventListener("loadedmetadata", () => {
  timeLabel.textContent = `00:00 / ${formatTime(video.duration)}`;
});

video.addEventListener("waiting", () => spinner.classList.remove("hidden"));
video.addEventListener("playing", () => spinner.classList.add("hidden"));
video.addEventListener("canplay", () => spinner.classList.add("hidden"));

seekBar.addEventListener("input", () => { seeking = true; });
seekBar.addEventListener("change", () => {
  if (video.duration) video.currentTime = (seekBar.value / 1000) * video.duration;
  seeking = false;
});

playBtn.addEventListener("click", () => {
  if (video.paused) video.play();
  else video.pause();
});
video.addEventListener("play", () => { playBtn.textContent = "⏸"; });
video.addEventListener("pause", () => { playBtn.textContent = "▶"; });

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
});
volumeBar.addEventListener("input", () => {
  video.volume = volumeBar.value;
  video.muted = video.volume === 0;
  muteBtn.textContent = video.muted ? "🔇" : "🔊";
});

speedSelect.addEventListener("change", () => {
  video.playbackRate = Number(speedSelect.value);
});

fullscreenBtn.addEventListener("click", () => {
  const wrapper = video.parentElement;
  if (!document.fullscreenElement) wrapper.requestFullscreen();
  else document.exitFullscreen();
});

document.addEventListener("keydown", (e) => {
  if (document.activeElement === urlInput) return;
  if (e.key === " ") { e.preventDefault(); playBtn.click(); }
  else if (e.key === "ArrowRight" && video.duration) video.currentTime += 5;
  else if (e.key === "ArrowLeft" && video.duration) video.currentTime -= 5;
  else if (e.key.toLowerCase() === "m") muteBtn.click();
  else if (e.key.toLowerCase() === "f") fullscreenBtn.click();
});


renderHistory();

shaka.polyfill.installAll();
if (!shaka.Player.isBrowserSupported()) {
  showError("Browser tidak mendukung Shaka Player.");
}
