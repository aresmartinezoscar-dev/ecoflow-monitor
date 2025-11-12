// Número máximo de puntos a mostrar
const MAX_POINTS = 200;

// Arrays de datos
const labels = [];
const socGlobalData = [];
const socDeltaData = [];
const socExtraData = [];
const powerInData = [];
const powerOutData = [];

let socChart, powerChart;

function createCharts() {
  const socCtx = document.getElementById("socChart").getContext("2d");
  const powerCtx = document.getElementById("powerChart").getContext("2d");

  socChart = new Chart(socCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "SOC global (%)",
          data: socGlobalData,
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: "SOC DELTA 2 Max (%)",
          data: socDeltaData,
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: "SOC batería adicional (%)",
          data: socExtraData,
          borderWidth: 2,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100
        }
      }
    }
  });

  powerChart = new Chart(powerCtx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Entrada total (W)",
          data: powerInData,
          borderWidth: 2,
          tension: 0.3
        },
        {
          label: "Salida total (W)",
          data: powerOutData,
          borderWidth: 2,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function addPointFromSnapshot(key, value) {
  const ts = value.ts;
  const label = new Date(ts).toLocaleTimeString();

  labels.push(label);
  socGlobalData.push(value.soc_global);
  socDeltaData.push(value.soc_delta);
  socExtraData.push(value.soc_extra);
  powerInData.push(value.watts_in);
  powerOutData.push(value.watts_out);

  if (labels.length > MAX_POINTS) {
    labels.shift();
    socGlobalData.shift();
    socDeltaData.shift();
    socExtraData.shift();
    powerInData.shift();
    powerOutData.shift();
  }
}

function renderLastReading(value) {
  const lastText = [
    `Hora (ISO): ${value.iso}`,
    `SOC global:           ${value.soc_global} %`,
    `SOC DELTA 2 Max:      ${value.soc_delta} %`,
    `SOC batería adicional:${value.soc_extra} %`,
    `Entrada total:        ${value.watts_in} W`,
    `Salida total:         ${value.watts_out} W`
  ].join("\n");

  document.getElementById("lastReading").textContent = lastText;
}

function loadData() {
  const ref = db.ref("ecoflow_logs").orderByChild("ts").limitToLast(MAX_POINTS);

  ref.on("value", (snapshot) => {
    // Limpiar arrays
    labels.length = 0;
    socGlobalData.length = 0;
    socDeltaData.length = 0;
    socExtraData.length = 0;
    powerInData.length = 0;
    powerOutData.length = 0;

    const val = snapshot.val();
    if (!val) {
      document.getElementById("lastReading").textContent = "No hay datos en Firebase todavía.";
      socChart.update();
      powerChart.update();
      return;
    }

    const entries = Object.entries(val).sort((a, b) => a[1].ts - b[1].ts);

    entries.forEach(([key, value]) => {
      addPointFromSnapshot(key, value);
    });

    const lastValue = entries[entries.length - 1][1];
    renderLastReading(lastValue);

    socChart.update();
    powerChart.update();
  }, (error) => {
    document.getElementById("lastReading").textContent =
      "Error leyendo de Firebase: " + error;
  });
}

window.addEventListener("load", () => {
  createCharts();
  loadData();
});
