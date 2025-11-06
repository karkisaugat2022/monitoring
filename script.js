// Login Authentication System
class LoginManager {
    constructor() {
        this.validCredentials = {
            id: 'fifty hertz',
            password: 'company'
        };
        this.isAuthenticated = false;
        this.init();
    }

    init() {
        // Check if user is already authenticated
        const authStatus = localStorage.getItem('sensorDashboardAuth');
        if (authStatus === 'authenticated') {
            this.showDashboard();
        } else {
            this.showLogin();
        }

        this.bindEvents();
    }

    bindEvents() {
        // Login form submission
        const loginForm = document.getElementById('loginForm');
        const logoutButton = document.getElementById('logoutButton');

        loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        logoutButton.addEventListener('click', () => this.handleLogout());

        // Auto-fill on demo credential click (for convenience)
        document.querySelector('.demo-credentials').addEventListener('click', () => {
            document.getElementById('userId').value = this.validCredentials.id;
            document.getElementById('password').value = this.validCredentials.password;
        });
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const userId = document.getElementById('userId').value;
        const password = document.getElementById('password').value;
        const loginButton = document.getElementById('loginButton');
        const errorMessage = document.getElementById('errorMessage');
        const userIdInput = document.getElementById('userId');
        const passwordInput = document.getElementById('password');

        // Clear previous errors
        errorMessage.classList.remove('show');
        userIdInput.classList.remove('error');
        passwordInput.classList.remove('error');

        // Show loading state
        loginButton.classList.add('loading');
        loginButton.disabled = true;

        // Simulate authentication delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check credentials
        if (userId === this.validCredentials.id && password === this.validCredentials.password) {
            // Successful login
            this.isAuthenticated = true;
            localStorage.setItem('sensorDashboardAuth', 'authenticated');
            this.showDashboard();
        } else {
            // Failed login
            errorMessage.classList.add('show');
            userIdInput.classList.add('error');
            passwordInput.classList.add('error');
            
            // Shake animation
            loginButton.style.animation = 'shake 0.5s ease-in-out';
            setTimeout(() => {
                loginButton.style.animation = '';
            }, 500);
        }

        // Reset button state
        loginButton.classList.remove('loading');
        loginButton.disabled = false;
    }

    handleLogout() {
        this.isAuthenticated = false;
        localStorage.removeItem('sensorDashboardAuth');
        this.showLogin();
        
        // Clean up dashboard if it was initialized
        if (window.dashboard) {
            if (window.dashboard.ws) {
                window.dashboard.ws.close();
            }
            window.dashboard = null;
        }
    }

    showLogin() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.getElementById('dashboardPage').classList.add('hidden');
        
        // Clear form
        document.getElementById('userId').value = '';
        document.getElementById('password').value = '';
        document.getElementById('errorMessage').classList.remove('show');
        document.getElementById('userId').classList.remove('error');
        document.getElementById('password').classList.remove('error');
        
        // Focus on first input
        setTimeout(() => {
            document.getElementById('userId').focus();
        }, 100);
    }

    showDashboard() {
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('dashboardPage').classList.remove('hidden');
        
        // Initialize dashboard
        setTimeout(() => {
            if (!window.dashboard) {
                console.log('Initializing Sensor Dashboard...');
                window.dashboard = new SensorDashboard();
                window.dashboard.init();
            }
        }, 100);
    }
}

// Sensor Dashboard Class
class SensorDashboard {
    constructor() {
        this.isConnected = false;
        this.lastDataTime = null;
        this.lastData = null;
        this.dataHistory = [];
        this.persistentDataHistory = [];
        this.lastStoredTimestamp = null;
        this.dataCount = 0;
        this.consecutiveDataCount = 0;
        this.MIN_CONSECUTIVE_DATA = 2;
        
        // Thresholds for alerts
        this.tempThresholds = { warning: 35, critical: 45 };
        this.humidityThresholds = { warning: 80, critical: 90 };
        this.CurrentThresholds = { warning: 3.0, critical: 2.5 }; // Low Current alerts
        
        this.charts = {
            temperature: null,
            humidity: null,
            Current: null
        };
        
        this.activeEnvChart = 'temp';
        this.map = null;
        this.markers = [];
        this.connectionTimeout = null;
        this.CONNECTION_TIMEOUT = 20000;
        this.STORAGE_KEY = 'sensor_historical_data';
        this.MAX_HISTORICAL_POINTS = 50;
        
        // Replace with your Node-RED IP
        this.NODE_RED_IP = "192.168.1.150";
        this.ws = null;
        
        this.sensorLocations = [
            { name: 'Transformer A', location: 'Old Baneshwor', coords: [27.6936, 85.3379], id: 'A', status: 'operational' },
            { name: 'Transformer B', location: 'Banasthali', coords: [27.727036, 85.30474], id: 'B', status: 'inactive' },
            { name: 'Transformer C', location: 'Lazimpat', coords: [27.729122, 85.328579], id: 'C', status: 'inactive' }
        ];
    }

    async init() {
        try {
            this.loadHistoricalData();
            this.setupMap();
            this.setupCharts();
            this.connectWebSocket();
            this.startConnectionMonitoring();
            this.updateConnectionStatus(false);
            this.updateSensorStatus(false);
            console.log('Sensor Dashboard initialized successfully');
        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            this.updateConnectionStatus(false);
        }
    }

    connectWebSocket() {
        try {
            this.ws = new WebSocket(`ws://${this.NODE_RED_IP}:1880/ws/data`);
            
            this.ws.addEventListener("open", () => {
                console.log("WebSocket connected to Node-RED");
                this.resetConnectionTimeout();
            });
            
            this.ws.addEventListener("message", (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    this.handleSensorData(data);
                } catch (e) {
                    console.warn("WebSocket parse error", e);
                }
            });
            
            this.ws.addEventListener("close", () => {
                console.log("WebSocket disconnected");
                this.updateConnectionStatus(false);
                this.updateSensorStatus(false);
                this.resetConsecutiveDataCount();
                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.connectWebSocket(), 5000);
            });
            
            this.ws.addEventListener("error", (error) => {
                console.error("WebSocket error:", error);
                this.updateConnectionStatus(false);
                this.updateSensorStatus(false);
                this.resetConsecutiveDataCount();
            });
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.updateConnectionStatus(false);
            this.updateSensorStatus(false);
            // Retry connection after 5 seconds
            setTimeout(() => this.connectWebSocket(), 5000);
        }
    }

    loadHistoricalData() {
        try {
            const storedData = localStorage.getItem(this.STORAGE_KEY);
            if (storedData) {
                this.persistentDataHistory = JSON.parse(storedData);
                if (this.persistentDataHistory.length > 0) {
                    this.lastStoredTimestamp = this.persistentDataHistory[this.persistentDataHistory.length - 1].timestamp;
                }
                console.log(`Loaded ${this.persistentDataHistory.length} historical data points`);
            }
        } catch (error) {
            console.error('Error loading historical data:', error);
            this.persistentDataHistory = [];
        }
    }

    saveHistoricalData() {
        try {
            const dataToSave = this.persistentDataHistory.slice(-this.MAX_HISTORICAL_POINTS);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
            this.persistentDataHistory = dataToSave;
        } catch (error) {
            console.error('Error saving historical data:', error);
        }
    }

    shouldStoreData(timestamp) {
        if (!this.lastStoredTimestamp) return true;
        const timeDifference = Math.abs(timestamp - this.lastStoredTimestamp);
        return timeDifference > 1000; // Store every second
    }

    setupMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        this.map = L.map('map').setView([27.7172, 85.3240], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.sensorLocations.forEach(sensor => {
            const markerElement = document.createElement('div');
            markerElement.className = `custom-marker ${sensor.status}`;
            markerElement.textContent = sensor.id;
            
            const marker = L.marker(sensor.coords, {
                icon: L.divIcon({
                    html: markerElement.outerHTML,
                    className: 'custom-div-icon',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                })
            }).addTo(this.map);

            marker.bindPopup(this.getPopupContent(sensor));
            this.markers.push({ ...sensor, marker });
        });
    }

    getPopupContent(sensor) {
        if (sensor.id === 'A') {
            return `
                <div style="font-family: Inter, sans-serif; font-size: 13px; line-height: 1.5; min-width: 360px;">
                    <div style="font-weight: 700; font-size: 16px; color: #0f172a; margin-bottom: 12px; text-align: center; padding: 8px; background: linear-gradient(135deg, #2563eb, #3b82f6); color: white; border-radius: 8px;">${sensor.name}</div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
                        <div style="color: #64748b;"><strong>Location:</strong> ${sensor.location}</div>
                        <div style="color: #64748b;"><strong>Status:</strong> <span style="color: #10b981; font-weight: 600;">Operational</span></div>
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <div style="font-weight: 600; margin-bottom: 8px; color: #374151; text-align: center;">Current Readings</div>
                        <div class="popup-values-grid">
                            <div class="popup-value-box">
                                <div class="popup-value" style="color: #ef4444;" id="popup-temperature">--</div>
                                <div class="popup-label">Temperature (°C)</div>
                            </div>
                            <div class="popup-value-box">
                                <div class="popup-value" style="color: #06b6d4;" id="popup-humidity">--</div>
                                <div class="popup-label">Humidity (%)</div>
                            </div>
                            <div class="popup-value-box">
                                <div class="popup-value" style="color: #10b981;" id="popup-Current">--</div>
                                <div class="popup-label">Current (C)</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 12px; padding: 8px; background: #f8fafc; border-radius: 6px; text-align: center; font-size: 11px; color: #6b7280; border: 1px solid #e2e8f0;">
                        <strong>Last Update:</strong> <span id="popup-last-update">--:--:--</span>
                    </div>
                    
                    <button onclick="window.dashboard.showChartsPage()" class="popup-chart-btn">
                        📊 View Detailed Charts
                    </button>
                </div>
            `;
        } else {
            return `
                <div style="font-family: Inter, sans-serif; font-size: 13px; line-height: 1.5; min-width: 200px;">
                    <div style="font-weight: 600; font-size: 15px; color: #0f172a; margin-bottom: 8px;">${sensor.name}</div>
                    <div style="color: #64748b; margin-bottom: 4px;"><strong>Location:</strong> ${sensor.location}</div>
                    <div style="color: #64748b; margin-bottom: 12px;"><strong>Status:</strong> <span style="color: #9ca3af; font-weight: 600;">Inactive</span></div>
                    
                    <div style="text-align: center; padding: 16px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb;">
                        <div style="font-size: 24px; margin-bottom: 8px;">🔧</div>
                        <div style="color: #6b7280; font-size: 12px;">Sensor offline for maintenance</div>
                    </div>
                </div>
            `;
        }
    }

    setupCharts() {
        Chart.defaults.font.family = 'Inter, sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#64748b';

        const modernOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 20,
                        font: { weight: 500, size: 11 }
                    }
                }
            },
            elements: {
                point: { radius: 4, hoverRadius: 6, borderWidth: 2 },
                line: { borderWidth: 3, tension: 0.4 }
            },
            interaction: { intersect: false, mode: 'index' }
        };

        // Temperature Chart
        const tempCtx = document.getElementById('temperatureChart').getContext('2d');
        this.charts.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Temperature (°C)',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true
                }]
            },
            options: {
                ...modernOptions,
                scales: {
                    x: {
                        position: 'bottom',
                        ticks: {
                            padding: 10,
                            color: '#475569',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            color: '#334155',
                            font: { weight: 500 }
                        }
                    },
                    
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Temperature (°C)' }
                    }
                }
            }
        });

        // Humidity Chart
        const humidCtx = document.getElementById('humidityChart').getContext('2d');
        this.charts.humidity = new Chart(humidCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Humidity (%)',
                    data: [],
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    fill: true
                }]
            },
            options: {
                ...modernOptions,
                scales: {
                    x: {
                        position: 'bottom',
                        ticks: {
                            padding: 10,
                            color: '#475569',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            color: '#334155',
                            font: { weight: 500 }
                        }
                    },
                    
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'Humidity (%)' }
                            }
                        }
                    }
                });

        // Current Chart
        const voltCtx = document.getElementById('CurrentChart').getContext('2d');
        this.charts.Current = new Chart(voltCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Current (A)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true
                }]
            },
            options: {
                ...modernOptions,
                scales: {
                    x: {
                        position: 'bottom',
                        ticks: {
                            padding: 10,
                            color: '#475569',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: 'Time',
                            color: '#334155',
                            font: { weight: 500 }
                        }
                    },
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: 'Current (C)' }
                    }
                }
            }
        });

        this.restoreChartsData();
    }

    startConnectionMonitoring() {
        this.resetConnectionTimeout();
    }

    resetConnectionTimeout() {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
        }
        
        this.connectionTimeout = setTimeout(() => {
            console.log('Connection timeout - no data received');
            this.updateConnectionStatus(false);
            this.updateSensorStatus(false);
            this.resetConsecutiveDataCount();
        }, this.CONNECTION_TIMEOUT);
    }

    resetConsecutiveDataCount() {
        this.consecutiveDataCount = 0;
    }

    updateSensorStatus(online) {
        const sensorStatus = document.getElementById('sensorStatus');
        if (sensorStatus) {
            const statusText = sensorStatus.querySelector('span');
            if (online) {
                sensorStatus.style.background = 'rgba(16, 185, 129, 0.1)';
                sensorStatus.style.color = '#10b981';
                if (statusText) statusText.textContent = 'Online';
            } else {
                sensorStatus.style.background = 'rgba(107, 114, 128, 0.1)';
                sensorStatus.style.color = '#6b7280';
                if (statusText) statusText.textContent = 'Offline';
            }
        }
    }

    handleSensorData(data) {
        this.lastDataTime = Date.now();
        this.resetConnectionTimeout();
        
        this.consecutiveDataCount++;
        
        const processedData = {
            temperature: data.temperature ?? 0,
            humidity: data.humidity ?? 0,
            Current: data.Current ?? 0,
            timestamp: Date.now()
        };

        this.processData(processedData);

        if (this.consecutiveDataCount >= this.MIN_CONSECUTIVE_DATA) {
            this.updateConnectionStatus(true);
            this.updateSensorStatus(true);
        }
    }

    processData(data) {
        this.lastData = data;
        this.dataHistory.push(data);
        this.dataCount++;
        
        if (this.shouldStoreData(data.timestamp)) {
            this.persistentDataHistory.push(data);
            this.lastStoredTimestamp = data.timestamp;
            
            if (this.persistentDataHistory.length > this.MAX_HISTORICAL_POINTS) {
                this.persistentDataHistory.shift();
            }
            
            this.saveHistoricalData();
        }
        
        if (this.dataHistory.length > 100) this.dataHistory.shift();

        this.updateDisplays(data);
        this.updateCharts(data);
        this.updateMapPopups(data);
        this.checkAlerts(data);
        this.updateDataCount();
    }

    updateDisplays(data) {
        const timeString = new Date(data.timestamp).toLocaleTimeString('en-US', { 
            hour12: false 
        });

        // Update main metrics
        const tempElement = document.getElementById('temperature-value');
        const humidElement = document.getElementById('humidity-value');
        const voltElement = document.getElementById('Current-value');
        
        if (tempElement) tempElement.textContent = data.temperature.toFixed(1);
        if (humidElement) humidElement.textContent = data.humidity.toFixed(1);
        if (voltElement) voltElement.textContent = data.Current.toFixed(2);

        // Update popup elements
        const popupTemp = document.getElementById('popup-temperature');
        const popupHumid = document.getElementById('popup-humidity');
        const popupVolt = document.getElementById('popup-Current');
        const popupUpdate = document.getElementById('popup-last-update');

        if (popupTemp) popupTemp.textContent = data.temperature.toFixed(1);
        if (popupHumid) popupHumid.textContent = data.humidity.toFixed(1);
        if (popupVolt) popupVolt.textContent = data.Current.toFixed(2);
        if (popupUpdate) popupUpdate.textContent = timeString;

        // Update last update times
        const mapUpdate = document.getElementById('map-last-update');
        const sensorUpdate = document.getElementById('sensor-last-update');
        
        if (mapUpdate) mapUpdate.textContent = timeString;
        if (sensorUpdate) sensorUpdate.textContent = timeString;

        // Update sensor status based on readings
        const isCritical = data.temperature > this.tempThresholds.critical || 
                         data.humidity > this.humidityThresholds.critical ||
                         data.Current < this.CurrentThresholds.critical;
        
        this.updateSensorStatusOnMap('A', isCritical ? 'critical' : 'operational');
    }

    updateSensorStatusOnMap(sensorId, status) {
        const marker = this.markers.find(m => m.id === sensorId);
        if (marker) {
            const markerElement = document.createElement('div');
            markerElement.className = `custom-marker ${status}`;
            markerElement.textContent = sensorId;
            
            marker.marker.setIcon(L.divIcon({
                html: markerElement.outerHTML,
                className: 'custom-div-icon',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            }));
        }
    }

    updateCharts(data) {
        const timeLabel = new Date(data.timestamp).toLocaleTimeString('en-US', { 
            hour12: false 
        });

        Object.values(this.charts).forEach(chart => {
            if (chart && chart.data.labels) {
                chart.data.labels.push(timeLabel);
                if (chart.data.labels.length > 30) {
                    chart.data.labels.shift();
                    chart.data.datasets[0].data.shift();
                }
            }
        });

        if (this.charts.temperature) {
            this.charts.temperature.data.datasets[0].data.push(data.temperature);
            this.charts.temperature.update('none');
        }

        if (this.charts.humidity) {
            this.charts.humidity.data.datasets[0].data.push(data.humidity);
            this.charts.humidity.update('none');
        }

        if (this.charts.Current) {
            this.charts.Current.data.datasets[0].data.push(data.Current);
            this.charts.Current.update('none');
        }
    }

    restoreChartsData() {
        if (this.persistentDataHistory.length === 0) return;

        const last30Points = this.persistentDataHistory.slice(-30);
        
        // Clear charts
        Object.values(this.charts).forEach(chart => {
            if (chart && chart.data) {
                chart.data.labels = [];
                chart.data.datasets[0].data = [];
            }
        });

        // Populate with data
        last30Points.forEach(data => {
            const timeLabel = new Date(data.timestamp).toLocaleTimeString('en-US', { 
                hour12: false 
            });

            Object.values(this.charts).forEach(chart => {
                if (chart && chart.data.labels) {
                    chart.data.labels.push(timeLabel);
                }
            });

            if (this.charts.temperature) {
                this.charts.temperature.data.datasets[0].data.push(data.temperature);
            }
            if (this.charts.humidity) {
                this.charts.humidity.data.datasets[0].data.push(data.humidity);
            }
            if (this.charts.Current) {
                this.charts.Current.data.datasets[0].data.push(data.Current);
            }
        });

        Object.values(this.charts).forEach(chart => {
            if (chart) chart.update('none');
        });
    }

    updateMapPopups(data) {
        // Handled in updateDisplays
    }

    checkAlerts(data) {
        const alertSection = document.getElementById('alertSection');
        const alertMessage = document.getElementById('alertMessage');
        const alertStatus = document.getElementById('alertStatus');
        
        const isTempCritical = data.temperature > this.tempThresholds.critical;
        const isHumidCritical = data.humidity > this.humidityThresholds.critical;
        const isVoltCritical = data.Current < this.CurrentThresholds.critical;
        
        const isTempWarning = data.temperature > this.tempThresholds.warning;
        const isHumidWarning = data.humidity > this.humidityThresholds.warning;
        const isVoltWarning = data.Current < this.CurrentThresholds.warning;
        
        const isCritical = isTempCritical || isHumidCritical || isVoltCritical;
        const isWarning = isTempWarning || isHumidWarning || isVoltWarning;

        if (isCritical) {
            alertSection.className = 'alert-section show critical';
            alertMessage.textContent = `⚠️ CRITICAL CONDITIONS DETECTED - Temperature: ${data.temperature.toFixed(1)}°C, Humidity: ${data.humidity.toFixed(1)}%, Current: ${data.Current.toFixed(2)}V. Immediate attention required!`;
            if (alertStatus) {
                const statusText = alertStatus.querySelector('span');
                if (statusText) statusText.textContent = 'CRITICAL ALERT';
            }
        } else if (isWarning) {
            alertSection.className = 'alert-section show warning';
            alertMessage.textContent = `⚠️ WARNING CONDITIONS - Temperature: ${data.temperature.toFixed(1)}°C, Humidity: ${data.humidity.toFixed(1)}%, Current: ${data.Current.toFixed(2)}V. Please monitor closely.`;
            if (alertStatus) {
                const statusText = alertStatus.querySelector('span');
                if (statusText) statusText.textContent = 'WARNING ALERT';
            }
        } else {
            alertSection.className = 'alert-section';
        }
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        const connectionStatus = document.getElementById('connectionStatus');
        if (connectionStatus) {
            const text = connectionStatus.querySelector('span');
            
            if (connected) {
                connectionStatus.classList.add('connected');
                if (text) text.textContent = 'Connected';
            } else {
                connectionStatus.classList.remove('connected');
                if (text) text.textContent = 'Disconnected';
            }
        }
    }

    updateDataCount() {
        const dataCountElement = document.getElementById('data-count');
        if (dataCountElement) {
            dataCountElement.textContent = this.dataCount.toString();
        }
    }

    showChartsPage() {
        document.getElementById('mainPage').style.display = 'none';
        document.getElementById('chartsPage').classList.add('active');
        
        setTimeout(() => {
            this.restoreChartsData();
        }, 100);
    }

    showMainPage() {
        document.getElementById('mainPage').style.display = 'block';
        document.getElementById('chartsPage').classList.remove('active');
    }
}

// Global functions
window.showMainPage = function() {
    if (window.dashboard) {
        window.dashboard.showMainPage();
    }
};

window.switchEnvChart = function(chartType) {
    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-chart="${chartType}"]`).classList.add('active');

    document.getElementById('temperatureChart').classList.remove('active');
    document.getElementById('humidityChart').classList.remove('active');
    
    if (chartType === 'temp') {
        document.getElementById('temperatureChart').classList.add('active');
    } else {
        document.getElementById('humidityChart').classList.add('active');
    }

    if (window.dashboard) {
        window.dashboard.activeEnvChart = chartType;
    }
};

// Initialize login manager on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Login Manager...');
    window.loginManager = new LoginManager();
});

// Add some CSS for shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
`;

document.head.appendChild(shakeStyle);
