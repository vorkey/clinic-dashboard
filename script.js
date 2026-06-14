const devices = {};
const counters = {};

const client = mqtt.connect("ws://broker.emqx.io:8083/mqtt");

client.on("connect", () => {
  client.subscribe("iotuas/clinic/dashboard/status");
  client.subscribe("iotuas/clinic/dashboard/history");
  client.subscribe("iotuas/clinic/system/#");
  client.subscribe("iotuas/clinic/counter/+/state");
});

client.on("message", (topic, payload) => {
  const text = payload.toString();

  if (topic === "iotuas/clinic/dashboard/status") {
    const data = JSON.parse(text);
    document.getElementById("issued").textContent = data.issued;
    document.getElementById("waiting").textContent = data.waiting;
    document.getElementById("next").textContent = data.next;
  } else if (topic === "iotuas/clinic/dashboard/history") {
    const raw = JSON.parse(text);
    const history = computeDurations(normalizeHistory(raw));

    const tbody = document.getElementById("history");
    tbody.innerHTML = "";

    history.forEach((item) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
            <td>${item.number}</td>
            <td>${item.counter}</td>
            <td>${item.date}</td>
            <td>${item.time}</td>
            <td>${item.duration}</td>
          `;
      tbody.appendChild(tr);
    });
  } else if (topic.startsWith("iotuas/clinic/system/")) {
    const device = topic.split("/")[3];
    devices[device] = text;
    renderDevices();
  } else if (
    topic.startsWith("iotuas/clinic/counter/") &&
    topic.endsWith("/state")
  ) {
    const counter = topic.split("/")[3];
    counters[counter] = JSON.parse(text);
    renderCurrentQueues();
  }
});

function renderDevices() {
  const root = document.getElementById("devices");
  root.className = "devices-grid";
  root.innerHTML = "";

  Object.keys(devices).forEach((device) => {
    const online = devices[device] === "online";

    const div = document.createElement("div");
    div.className = "device";

    div.innerHTML = `
          <span class="device-name">${device}</span>
          <span class="status ${online ? "online" : "offline"}">
            ${online ? "ONLINE" : "OFFLINE"}
          </span>
        `;

    root.appendChild(div);
  });
}

function renderCurrentQueues() {
  const root = document.getElementById("currentQueues");
  root.innerHTML = "";

  const names = Object.keys(counters).sort();

  if (!names.length) {
    root.innerHTML = "<div class='card'>No counter data</div>";
    return;
  }

  names.forEach((name) => {
    const data = counters[name];

    const card = document.createElement("div");
    card.className = "queue-card";

    card.innerHTML = `
          <div class="queue-counter">${name}</div>
          <div class="queue-number">${data.number ?? "-"}</div>
          <div class="queue-time">${data.date ?? ""} ${data.time ?? ""}</div>
        `;

    root.appendChild(card);
  });
}

function normalizeHistory(history) {
  return history
    .map((item) => {
      const t = item.datetime
        ? new Date(item.datetime)
        : new Date(`${item.date}T${item.time}`);

      if (isNaN(t)) return null;

      return { ...item, _ts: t.getTime() };
    })
    .filter(Boolean);
}

function computeDurations(history) {
  const byCounter = {};

  history.forEach((h) => {
    if (!byCounter[h.counter]) byCounter[h.counter] = [];
    byCounter[h.counter].push(h);
  });

  const result = [];

  Object.keys(byCounter).forEach((counter) => {
    const list = byCounter[counter].sort((a, b) => a._ts - b._ts);

    for (let i = 0; i < list.length; i++) {
      const current = list[i];
      const next = list[i + 1];

      if (next) {
        const sec = Math.floor((next._ts - current._ts) / 1000);

        current.duration =
          String(Math.floor(sec / 3600)).padStart(2, "0") +
          ":" +
          String(Math.floor((sec % 3600) / 60)).padStart(2, "0") +
          ":" +
          String(sec % 60).padStart(2, "0");
      } else {
        current.duration = "-";
      }

      result.push(current);
    }
  });

  return result.sort((a, b) => b._ts - a._ts);
}
