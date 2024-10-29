let monitoringIntervals = {}; // Stores intervals for each server
let charts = {}; // Stores line chart instances for each server
let statsCharts = {}; // Stores bar chart instances for each server
let latencyStats = {}; // Stores latency data for computing max, min, avg
let thresholds = {}; // Stores latency thresholds for each server

// Initialize a new line and bar chart for each server
function initializeCharts(server) {
    const container = document.getElementById('chartsContainer');

    // Create a new div for each server's charts
    const chartDiv = document.createElement('div');
    chartDiv.id = `chart-${server}`;
    chartDiv.classList.add('chart-container');
    chartDiv.innerHTML = `
        <div>
            <h3>Monitoring ${server}</h3>
            <div class="charts">
                <canvas id="latencyChart-${server}" width="400" height="200"></canvas>
                <canvas id="statsChart-${server}" width="200" height="200"></canvas>
            </div>
            <input type="number" id="threshold-${server}" placeholder="Set Latency Threshold">
        <p id="alert-${server}" class="alert-message" style="display:none; color: red;">Threshold Exceeded!</p>
        </div>`;
        
    container.appendChild(chartDiv);

    const ctxLine = document.getElementById(`latencyChart-${server}`).getContext('2d');
    charts[server] = new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Latency (ms)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Time' } },
                y: { title: { display: true, text: 'Latency (ms)' }, beginAtZero: true }
            }
        }
    });

    const ctxBar = document.getElementById(`statsChart-${server}`).getContext('2d');
    statsCharts[server] = new Chart(ctxBar, {
        type: 'bar',
        data: {
            labels: ['Highest', 'Lowest', 'Average'],
            datasets: [{
                label: 'Latency (ms)',
                data: [0, 0, 0], // Initial values
                backgroundColor: ['rgba(255, 99, 132, 0.6)', 'rgba(54, 162, 235, 0.6)', 'rgba(75, 192, 192, 0.6)']
            }]
        },
        options: {
            scales: {
                y: { beginAtZero: true }
            }
        }
    });

    // Initialize latency data for stats calculation
    latencyStats[server] = { values: [], maxTime: null, minTime: null };
}

// Update line chart data with new latency values
function updateLineChart(server, latency) {
    const timestamp = new Date().toLocaleTimeString();
    const chart = charts[server];

    chart.data.labels.push(timestamp);
    chart.data.datasets[0].data.push(latency);

    // Limit the number of data points displayed
    if (chart.data.labels.length > 10) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update();

    // Track latency values for stats calculations
    updateStats(server, latency, timestamp);
     // Check if latency exceeds threshold
    checkThreshold(server, latency);
    
}

// Update bar chart with max, min, and average latencies
function updateStatsChart(server) {
    const stats = latencyStats[server];
    const total = stats.values.reduce((acc, val) => acc + val, 0);
    const avg = total / stats.values.length;

    statsCharts[server].data.datasets[0].data = [
        Math.max(...stats.values),
        Math.min(...stats.values),
        avg
    ];

    statsCharts[server].update();
}

// Track latency data to compute max, min, and average
function updateStats(server, latency, timestamp) {
    const stats = latencyStats[server];
    stats.values.push(latency);

    // Track the highest and lowest latencies with their timestamps
    if (latency === Math.max(...stats.values)) {
        stats.maxTime = timestamp;
    }
    if (latency === Math.min(...stats.values)) {
        stats.minTime = timestamp;
    }

    // Limit the values array to avoid memory overflow
    if (stats.values.length > 100) stats.values.shift();

    updateStatsChart(server);
}

function checkThreshold(server, latency) {
    const thresholdInput = document.getElementById(`threshold-${server}`);
    const alertMessage = document.getElementById(`alert-${server}`);
    const threshold = parseFloat(thresholdInput.value);

    if (threshold && latency > threshold) {
        alertMessage.style.display = "block";
        charts[server].data.datasets[0].borderColor = 'rgba(255, 99, 132, 1)';
        charts[server].update();

        // Play the alert sound using the Web Audio API
        playAlertSound();
    } else {
        alertMessage.style.display = "none";
        charts[server].data.datasets[0].borderColor = 'rgba(75, 192, 192, 1)';
        charts[server].update();
    }
}


let audioContext;
let alertBuffer;

// Initialize the audio context and load the audio file
async function initializeAudio() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    try {
        const response = await fetch('/static/alert-sound.mp3');
        const arrayBuffer = await response.arrayBuffer();
        alertBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (error) {
        console.log("Failed to load audio:", error);
    }
}

// Play the alert sound
function playAlertSound() {
    if (audioContext && alertBuffer) {
        const source = audioContext.createBufferSource();
        source.buffer = alertBuffer;
        source.connect(audioContext.destination);
        source.start(0);
    }
}

// Call this function once on a user interaction to unlock the audio context
document.addEventListener('click', () => {
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
}, { once: true });

// Call `initializeAudio()` when the page loads
window.onload = initializeAudio;

// Start monitoring a server
async function startMonitoring() {
    const server = document.getElementById("serverInput").value;
    if (!server) {
        alert("Please enter a server IP");
        return;
    }
    if (monitoringIntervals[server]) {
        alert("Already monitoring this server");
        return;
    }
    // Fetch and display location data
    const locationData = await fetchLocationData(server);
    if (!locationData) return; // Exit if IP validation fails

    initializeCharts(server);

     // Display location info in the chart container
     const chartContainer = document.getElementById(`chart-${server}`);
     const locationInfo = document.createElement('p');
     locationInfo.innerText = `Location: ${locationData.city || "Unknown"}, ${locationData.region || "Unknown"}, ${locationData.country || "Unknown"}`;
     chartContainer.prepend(locationInfo);

    monitoringIntervals[server] = setInterval(async () => {
        try {
            const response = await fetch(`https://netdash.onrender.com/check?server=${server}`);
            const data = await response.json();

            const latency = data.is_up ? data.latency : 0; // Set latency to 0 if server is down
            updateLineChart(server, latency);
        } catch (error) {
            console.error("Error fetching data:", error);
            updateLineChart(server, 0); // Set latency to 0 if there's a fetch error
        }
    }, 1600); // Fetch data every 2~ seconds
}

// Stop monitoring a specific server or all servers if none specified
function stopMonitoring(server) {
    if (server && monitoringIntervals[server]) {
        clearInterval(monitoringIntervals[server]);
        delete monitoringIntervals[server];

        // Remove charts from page
        const chartDiv = document.getElementById(`chart-${server}`);
        if (chartDiv) chartDiv.remove();
        delete charts[server];
        delete statsCharts[server];
        delete latencyStats[server];
        delete thresholds[server];
    } else if (!server) {
        Object.keys(monitoringIntervals).forEach(server => {
            clearInterval(monitoringIntervals[server]);
            delete monitoringIntervals[server];

            const chartDiv = document.getElementById(`chart-${server}`);
            if (chartDiv) chartDiv.remove();
            delete charts[server];
            delete statsCharts[server];
            delete latencyStats[server];
            delete thresholds[server];
        });
    }
}

async function fetchLocationData(ip) {
    try {
        const response = await fetch(`https://netdash.onrender.com/validate_ip?ip=${ip}`);
        const data = await response.json();
        if (data.error) {
            alert(data.error); // Show error message if IP is invalid
            return null;
        }
        return data;
    } catch (error) {
        console.error("Error fetching location data:", error);
        return null;
    }
}


let summaryData = {}; // Object to store uptime and alert count data for each server

// Update summary data for a server
function updateSummaryData(server, latency) {
    if (!summaryData[server]) {
        summaryData[server] = { upTimeCount: 0, downTimeCount: 0, alertCount: 0 };
    }

    const summary = summaryData[server];

    // Increment uptime or downtime count based on latency
    if (latency > 0) {
        summary.upTimeCount += 1;
    } else {
        summary.downTimeCount += 1;
    }

    // Update the summary table
    displaySummary();
}

// Display the summary table in real-time
function displaySummary() {
    const summaryBody = document.getElementById('summaryBody');
    summaryBody.innerHTML = ''; // Clear existing rows

    Object.keys(summaryData).forEach(server => {
        const { upTimeCount, downTimeCount, alertCount } = summaryData[server];
        const totalChecks = upTimeCount + downTimeCount;
        const uptimePercentage = totalChecks > 0 ? ((upTimeCount / totalChecks) * 100).toFixed(2) : 0;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${server}</td>
            <td>${uptimePercentage}%</td>
            <td>${alertCount}</td>
        `;
        summaryBody.appendChild(row);
    });
}

// Update alert count in checkThreshold function
function checkThreshold(server, latency) {
    const thresholdInput = document.getElementById(`threshold-${server}`);
    const alertMessage = document.getElementById(`alert-${server}`);
    const threshold = parseFloat(thresholdInput.value);

    if (threshold && latency > threshold) {
        alertMessage.style.display = "block";
        charts[server].data.datasets[0].borderColor = 'rgba(255, 99, 132, 1)';
        charts[server].update();

        // Increment alert count
        if (!summaryData[server]) {
            summaryData[server] = { upTimeCount: 0, downTimeCount: 0, alertCount: 0 };
        }
        summaryData[server].alertCount += 1;

        // Play the alert sound using the Web Audio API
        playAlertSound();
    } else {
        alertMessage.style.display = "none";
        charts[server].data.datasets[0].borderColor = 'rgba(75, 192, 192, 1)';
        charts[server].update();
    }
}

// Call updateSummaryData in updateLineChart function to track uptime
function updateLineChart(server, latency) {
    const timestamp = new Date().toLocaleTimeString();
    const chart = charts[server];

    chart.data.labels.push(timestamp);
    chart.data.datasets[0].data.push(latency);

    // Limit the number of data points displayed
    if (chart.data.labels.length > 10) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }

    chart.update();

    // Track latency values for stats calculations
    updateStats(server, latency, timestamp);

    // Check if latency exceeds threshold
    checkThreshold(server, latency);

    // Update summary data
    updateSummaryData(server, latency);
}
// Show or hide the scroll-to-top button based on scroll position
window.onscroll = function() {
    const scrollToTopBtn = document.getElementById("scrollToTopBtn");
    if (document.body.scrollTop > 200 || document.documentElement.scrollTop > 200) {
        scrollToTopBtn.style.display = "block";
    } else {
        scrollToTopBtn.style.display = "none";
    }
};

// Smoothly scroll to the top when the button is clicked
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}


// Initialize the map
const map = L.map('map').setView([20, 0], 2); // Center at an approximate global position

// Add a tile layer to the map
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Function to add a marker for each server
function addServerMarker(server, latitude, longitude, latency, uptime, alertCount) {
    const marker = L.marker([latitude, longitude]).addTo(map);

    // Create the popup content
    const popupContent = `
        <strong>Server: ${server}</strong><br>
        Latency: ${latency} ms<br>
        Uptime: ${uptime} %<br>
        Alerts: ${alertCount}
    `;
    marker.bindPopup(popupContent);
}

fetch('/server_data')
    .then(response => response.json())
    .then(data => {
        data.forEach(server => {
            console.log(`Server ${server.ip}: Lat ${server.latitude}, Lon ${server.longitude}`);
            addServerMarker(
                server.ip,
                parseFloat(server.latitude), // Ensure latitude is a number
                parseFloat(server.longitude), // Ensure longitude is a number
                server.latency,
                server.uptime,
                server.alertCount
            );
        });
    })
    .catch(error => console.error("Error fetching server data:", error));

   // Toggle chat visibility
function toggleChat() {
    const chatContainer = document.getElementById("chat-container");
    const messages = document.getElementById("messages");

    if (chatContainer.style.display === "none") {
        chatContainer.style.display = "block";

        // Add greeting message only if it's the first time opening
        if (!messages.innerHTML.includes("bot-message")) {
            messages.innerHTML += `<div class="bot-message">Hi, how can I help you today?</div>`;
        }
    } else {
        chatContainer.style.display = "none";
    }
}

function sendMessage() {
    const userInput = document.getElementById("user-input").value;
    document.getElementById("messages").innerHTML += `<div class="user-message">${userInput}</div>`;
    document.getElementById("user-input").value = '';

    fetch('/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userInput })
    })
    .then(response => response.json())
    .then(data => {
        document.getElementById("messages").innerHTML += `<div class="bot-message">${data.response}</div>`;
    })
    .catch(error => console.error("Error:", error));
}

    