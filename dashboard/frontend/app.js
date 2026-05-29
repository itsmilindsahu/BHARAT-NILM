/****************************************************
 * Bharat-NILM Dashboard (WebSocket Live Version)
 * Original dashboard logic preserved
 * Only data source changed to WebSocket
 ****************************************************/

document.addEventListener("DOMContentLoaded", () => {

  /* ===================== STATE ===================== */

  let allEvents = [];
  let displayedBill = 1200; // realistic starting bill

  /* ===================== DOM ===================== */

  const totalEventsEl   = document.getElementById("totalEvents");
  const topApplianceEl = document.getElementById("topAppliance");
  const avgConfEl      = document.getElementById("avgConfidence");
  const billEl         = document.getElementById("monthlyBill");
  const recommendationsEl = document.getElementById("recommendations");

  /* ===================== CHARTS ===================== */

  let applianceChart, energyChart, usageChart, timelineChart;

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

    let applianceCounts = {};
    let applianceEnergy = {};
    let usageByHour     = {};
    let confidenceSum   = 0;

    events.forEach(e => {

      // Counts
      applianceCounts[e.predicted_appliance] =
        (applianceCounts[e.predicted_appliance] || 0) + 1;

      // Energy
      applianceEnergy[e.predicted_appliance] =
        (applianceEnergy[e.predicted_appliance] || 0) + e.delta_power;

      // Usage pattern
      if (!usageByHour[e.predicted_appliance]) {
        usageByHour[e.predicted_appliance] = Array(24).fill(0);
      }
      usageByHour[e.predicted_appliance][e.hour]++;

      confidenceSum += e.confidence;
    });

    /* ---------- KPIs ---------- */

    totalEventsEl.innerText = events.length;

    avgConfEl.innerText =
      (confidenceSum / events.length).toFixed(2);

    topApplianceEl.innerText =
      Object.keys(applianceEnergy)
        .reduce((a,b)=>applianceEnergy[a]>applianceEnergy[b]?a:b);

    const totalEnergy =
      Object.values(applianceEnergy).reduce((a,b)=>a+b,0);

    const estimatedBill =
      (totalEnergy / 1000) * 30 * 6;

    displayedBill += (estimatedBill - displayedBill) * 0.05;
    billEl.innerText = "₹" + displayedBill.toFixed(0);

    /* ---------- Charts ---------- */

    updateApplianceChart(applianceCounts);
    updateEnergyChart(applianceEnergy);
    updateUsageChart(usageByHour);
    updateTimelineChart(events);

    /* ---------- Recommendations ---------- */

    updateRecommendations(applianceEnergy);
  }

  /* ===================== CHART SETUP ===================== */

  function initializeCharts() {

    applianceChart = new Chart(
      document.getElementById("applianceChart"),
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

  function updateApplianceChart(counts) {
    applianceChart.data.labels = Object.keys(counts);
    applianceChart.data.datasets[0].data = Object.values(counts);
    applianceChart.update();
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
    for (const app in usage) {
      usageChart.data.datasets.push({
        label: app,
        data: usage[app],
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

    Object.keys(energy).forEach(app => {
      if (energy[app] > 6000) {
        const li = document.createElement("li");
        li.innerText =
          `${app}: High energy usage detected. Consider reducing peak usage.`;
        recommendationsEl.appendChild(li);
      }
    });
  }

});
