/****************************************************
 * Bharat-NILM Dashboard (WebSocket Live Version)
 * Original dashboard logic preserved
 * Only data source changed to WebSocket
 ****************************************************/

document.addEventListener("DOMContentLoaded", () => {

  /* ===================== STATE ===================== */

  let allEvents = [];
  let renewableShare = 42;

  /* ===================== DOM ===================== */

  const totalEventsEl   = document.getElementById("totalEvents");
  const topLoadEl      = document.getElementById("topLoad");
  const avgConfEl      = document.getElementById("avgConfidence");
  const renewableShareEl = document.getElementById("renewableShare");
  const recommendationsEl = document.getElementById("recommendations");

  /* ===================== CHARTS ===================== */

  let loadChart, energyChart, usageChart, timelineChart;

  initializeCharts();

  /* =================================================
     WEBSOCKET — THIS IS THE ONLY NEW PART
     ================================================= */

  const socket = new WebSocket(
  (location.protocol === "https:" ? "wss://" : "ws://") +
  location.host +
  "/ws"
);



  socket.onopen = () => {
    console.log("Connected to NILM WebSocket backend");
  };

  socket.onmessage = (msg) => {
    const event = JSON.parse(msg.data);
    allEvents.push(event);
    updateDashboard(allEvents);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  /* ===================== DASHBOARD ===================== */

  function updateDashboard(events) {

    let loadCounts = {};
    let loadEnergy = {};
    let usageByHour     = {};
    let confidenceSum   = 0;

    events.forEach(e => {

      // Counts
      loadCounts[e.load_channel] =
        (loadCounts[e.load_channel] || 0) + 1;

      // Energy
      loadEnergy[e.load_channel] =
        (loadEnergy[e.load_channel] || 0) + e.delta_power;

      // Usage pattern
      if (!usageByHour[e.load_channel]) {
        usageByHour[e.load_channel] = Array(24).fill(0);
      }
      usageByHour[e.load_channel][e.hour]++;

      confidenceSum += e.confidence;
    });

    /* ---------- KPIs ---------- */

    totalEventsEl.innerText = events.length;

    avgConfEl.innerText =
      (confidenceSum / events.length).toFixed(2);

    topLoadEl.innerText =
      Object.keys(loadEnergy)
        .reduce((a,b)=>loadEnergy[a]>loadEnergy[b]?a:b);

    renewableShare += (42 + Math.random() * 12 - renewableShare) * 0.05;
    renewableShareEl.innerText = renewableShare.toFixed(0) + "%";

    /* ---------- Charts ---------- */

    updateLoadChart(loadCounts);
    updateEnergyChart(loadEnergy);
    updateUsageChart(usageByHour);
    updateTimelineChart(events);

    /* ---------- Recommendations ---------- */

    updateRecommendations(loadEnergy);
  }

  /* ===================== CHART SETUP ===================== */

  function initializeCharts() {

    loadChart = new Chart(
      document.getElementById("loadChart"),
      {
        type: "doughnut",
        data: { labels: [], datasets: [{ data: [] }] }
      }
    );

    energyChart = new Chart(
      document.getElementById("energyChart"),
      {
        type: "bar",
        data: { labels: [], datasets: [{ data: [] }] }
      }
    );

    usageChart = new Chart(
      document.getElementById("usageChart"),
      {
        type: "line",
        data: { labels: [...Array(24).keys()], datasets: [] }
      }
    );

    timelineChart = new Chart(
      document.getElementById("timelineChart"),
      {
        type: "line",
        data: { labels: [], datasets: [{ data: [] }] }
      }
    );
  }

  /* ===================== CHART UPDATES ===================== */

  function updateLoadChart(counts) {
    loadChart.data.labels = Object.keys(counts);
    loadChart.data.datasets[0].data = Object.values(counts);
    loadChart.update();
  }

  function updateEnergyChart(energy) {
    energyChart.data.labels = Object.keys(energy);
    energyChart.data.datasets[0].data = Object.values(energy);
    energyChart.update();
  }

  function updateUsageChart(usage) {
    usageChart.data.datasets = [];

    const colors = ["#22c55e","#38bdf8","#f97316","#ef4444"];

    let i = 0;
    for (const channel in usage) {
      usageChart.data.datasets.push({
        label: channel,
        data: usage[channel],
        borderColor: colors[i % colors.length],
        tension: 0.35,
        pointRadius: 2
      });
      i++;
    }
    usageChart.update();
  }

  function updateTimelineChart(events) {
    timelineChart.data.labels = events.map(e => e.event_id);
    timelineChart.data.datasets[0].data =
      events.map(e => e.delta_power);
    timelineChart.update();
  }

  /* ===================== RECOMMENDATIONS ===================== */

  function updateRecommendations(energy) {

    recommendationsEl.innerHTML = "";

    Object.keys(energy).forEach(channel => {
      if (energy[channel] > 6000) {
        const li = document.createElement("li");
        li.innerText =
          `${channel}: High station load detected. Defer non-essential load if margin is low.`;
        recommendationsEl.appendChild(li);
      }
    });
  }

});
