// --- Toast Notifications ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = '<i class="fa-solid fa-circle-info"></i>';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
    if (type === 'danger') icon = '<i class="fa-solid fa-circle-exclamation"></i>';
    if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

    toast.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
            ${icon} ${message}
        </span>
        <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// --- App State & Initialization ---
let currentUser = null;
let userTicket = null;
let currentQueueData = {};
let allTickets = {};
let queueChart = null;
let performanceChart = null;
let isAdminView = false;
let heartbeatTimer = null;

// Dynamic configuration parameters
let avgServiceTimeSec = 90; // default 90 seconds per service

document.addEventListener('DOMContentLoaded', () => {
    // Form & View Toggle Event Listeners
    setupAuthentication();
    setupNavigation();
    setupQueueActions();
    setupAdminControls();
    
    // Connect Real-Time Listeners
    initializeRealTimeDatabase();
    
    // Initialize empty charts
    initializeCharts();
});

// --- Navigation and Views ---
function setupNavigation() {
    const viewToggleBtn = document.getElementById('viewToggleBtn');
    const userBoard = document.getElementById('userBoard');
    const adminBoard = document.getElementById('adminBoard');

    viewToggleBtn.addEventListener('click', () => {
        // While auth is disabled, admin controls must work WITHOUT login.
        // When FEATURES.authEnabled is flipped to true, the original login +
        // role gating below is restored automatically.
        const authEnabled = !!(window.FEATURES && window.FEATURES.authEnabled);

        if (authEnabled) {
            if (!currentUser) {
                showToast("Please login or register to access the Admin Portal.", "warning");
                document.getElementById('authModal').classList.add('active');
                return;
            }

            // Simplistic role check - for demo we allow any registered user or check admin
            // If user is admin (you can add a flag in database, or we can check email matches remy)
            const isAdmin = currentUser.email.toLowerCase().includes('admin') ||
                            currentUser.email.toLowerCase().includes('remy');

            if (!isAdmin && !isAdminView) {
                showToast("Access Restricted: User is not authorized as Admin.", "danger");
                return;
            }
        }

        isAdminView = !isAdminView;
        if (isAdminView) {
            userBoard.classList.remove('active');
            adminBoard.classList.add('active');
            viewToggleBtn.innerHTML = '<i class="fa-solid fa-user-shield"></i> User Dashboard';
            showToast("Switched to Admin Control View.", "success");
            // Update charts after container becomes visible
            setTimeout(updateCharts, 100);
        } else {
            adminBoard.classList.remove('active');
            userBoard.classList.add('active');
            viewToggleBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Admin Portal';
            showToast("Switched to User Dashboard View.", "info");
        }
    });
}

// --- User Registration & Authentication ---
function setupAuthentication() {
    const authModal = document.getElementById('authModal');
    const loginRegisterBtn = document.getElementById('loginRegisterBtn');
    const userProfileBadge = document.getElementById('userProfileBadge');
    const closeAuthModal = document.getElementById('closeAuthModal');
    const loginTabBtn = document.getElementById('loginTabBtn');
    const registerTabBtn = document.getElementById('registerTabBtn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const logoutBtn = document.getElementById('logoutBtn');
    const profileName = document.getElementById('profileName');
    const authComingSoon = document.getElementById('authComingSoon');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const registerSubmitBtn = document.getElementById('registerSubmitBtn');

    // --- Feature flag: while auth is disabled, keep the UI visible but inert. ---
    // Flip FEATURES.authEnabled to true (in js/config.js) to re-enable everything
    // below without any further code changes.
    const authEnabled = !!(window.FEATURES && window.FEATURES.authEnabled);
    if (!authEnabled) {
        if (authComingSoon) authComingSoon.classList.remove('hidden');
        // Disable submit buttons + inputs so nothing can be submitted.
        [loginSubmitBtn, registerSubmitBtn].forEach(btn => {
            if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed'; }
        });
        [loginForm, registerForm].forEach(form => {
            if (form) form.querySelectorAll('input').forEach(i => { i.disabled = true; });
        });
    }

    loginRegisterBtn.addEventListener('click', () => {
        if (!authEnabled) {
            showToast("Login & registration are coming soon — not available yet.", "warning");
        }
        // Still open the modal so the (disabled) forms remain visible.
        authModal.classList.add('active');
    });

    closeAuthModal.addEventListener('click', () => {
        authModal.classList.remove('active');
    });

    // Tab toggling
    loginTabBtn.addEventListener('click', () => {
        loginTabBtn.classList.add('active');
        registerTabBtn.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    });

    registerTabBtn.addEventListener('click', () => {
        registerTabBtn.classList.add('active');
        loginTabBtn.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    });

    // Handle Login
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!authEnabled) {
            showToast("Login is coming soon — not available yet.", "warning");
            return;
        }
        const email = document.getElementById('loginEmail').value;
        const pass = document.getElementById('loginPassword').value;

        auth.signInWithEmailAndPassword(email, pass)
            .then((userCredential) => {
                showToast("Successfully logged in!", "success");
                authModal.classList.remove('active');
                loginForm.reset();
            })
            .catch((error) => {
                showToast(error.message, "danger");
            });
    });

    // Handle Registration
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!authEnabled) {
            showToast("Registration is coming soon — not available yet.", "warning");
            return;
        }
        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPassword').value;

        auth.createUserWithEmailAndPassword(email, pass)
            .then((userCredential) => {
                const user = userCredential.user;
                return user.updateProfile({ displayName: name }).then(() => {
                    // Save user profile metadata to DB
                    database.ref(`users/${user.uid}`).set({
                        name: name,
                        email: email,
                        registered_at: firebase.database.ServerValue.TIMESTAMP
                    });
                });
            })
            .then(() => {
                showToast("Account registered successfully!", "success");
                authModal.classList.remove('active');
                registerForm.reset();
            })
            .catch((error) => {
                showToast(error.message, "danger");
            });
    });

    // Handle Logout
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            showToast("Logged out successfully.", "info");
            // If in admin view, revert to user view
            if (isAdminView) {
                viewToggleBtn.click();
            }
        });
    });

    // Auth State Observer
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            loginRegisterBtn.classList.add('hidden');
            userProfileBadge.classList.remove('hidden');
            profileName.textContent = user.displayName || user.email.split('@')[0];
            
            // Sync current user's active ticket if any
            trackUserTicket();
        } else {
            currentUser = null;
            userTicket = null;
            loginRegisterBtn.classList.remove('hidden');
            userProfileBadge.classList.add('hidden');
            document.getElementById('activeTicketCard').classList.add('hidden');
        }
    });
}

// --- Live Queue Database Integrations ---
function initializeRealTimeDatabase() {
    // 1. Listen to Queue State Details
    database.ref('queue').on('value', (snapshot) => {
        const data = snapshot.val() || {};
        currentQueueData = data;
        
        // Update general stats
        avgServiceTimeSec = data.avg_service_time_sec || 90;
        
        document.getElementById('totalQueueSize').textContent = data.queue_size || 0;
        document.getElementById('currentlyServing').textContent = formatToken(data.current_token);
        document.getElementById('nextServing').textContent = formatToken(data.next_token);
        document.getElementById('systemState').textContent = data.system_state || 'IDLE';

        // Gate status reflects the device's REPORTED state (gate_open). The ESP both
        // writes and reads this node, so the dashboard mirrors the device and only
        // overrides it on an explicit admin "Toggle Gate" action.
        document.getElementById('gateStatus').textContent = data.gate_open ? 'OPEN' : 'CLOSED';

        // Dynamic wait time: remaining waiting size * avg duration
        const expectedWaitSec = (data.queue_size || 0) * avgServiceTimeSec;
        document.getElementById('expectedWaitTime').textContent = formatDuration(expectedWaitSec);
        document.getElementById('avgServiceTime').textContent = formatDuration(avgServiceTimeSec);
        document.getElementById('manualAvgTime').value = avgServiceTimeSec;

        // ESP32 Heartbeat / "last updated" status (also ticked live by an interval below).
        refreshHeartbeatStatus();

        // Refresh client specific ticket status
        updateClientTicketStatus();
    });

    // 2. Listen to Tickets Data List
    database.ref('remote_tickets').orderByChild('join_time').on('value', (snapshot) => {
        allTickets = snapshot.val() || {};
        const queueTableBody = document.getElementById('queueListBody');
        queueTableBody.innerHTML = '';

        let activeTickets = [];
        Object.keys(allTickets).forEach(key => {
            const ticket = allTickets[key];
            ticket.id = key;
            if (ticket.status === 'pending' || ticket.status === 'enqueued' || ticket.status === 'serving') {
                activeTickets.push(ticket);
            }
        });

        // Sort active tickets
        activeTickets.sort((a, b) => a.join_time - b.join_time);

        if (activeTickets.length === 0) {
            queueTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No customers in queue</td></tr>`;
        } else {
            activeTickets.forEach(ticket => {
                const tr = document.createElement('tr');
                const date = new Date(ticket.join_time);
                const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                
                // Calculate time elapsed
                let timeElapsedStr = '';
                if (ticket.served_time) {
                    timeElapsedStr = 'Served';
                } else {
                    const diffSec = Math.floor((Date.now() - ticket.join_time) / 1000);
                    timeElapsedStr = formatDuration(diffSec);
                }

                tr.innerHTML = `
                    <td><strong>${formatToken(ticket.id)}</strong></td>
                    <td>${ticket.name || 'Anonymous'}</td>
                    <td>${ticket.service_type || 'Joining Queue'}</td>
                    <td>${timeString} <span style="font-size:11px;color:var(--color-text-muted);">(${timeElapsedStr} ago)</span></td>
                    <td><span class="status-badge ${ticket.status}">${ticket.status}</span></td>
                `;
                queueTableBody.appendChild(tr);
            });
        }

        // Update charts and user tickets
        updateClientTicketStatus();
        updateCharts();
    });

    // Tick the "last updated X seconds ago" + OFFLINE badge once a second so the
    // indicator stays accurate even when no new snapshot has arrived. The device
    // heartbeats every ~6s; we flag OFFLINE after ~15s of silence.
    setInterval(refreshHeartbeatStatus, 1000);
}

// Derives the connection badge + age label from /queue/last_updated. Kept separate
// so both the RTDB snapshot and the 1s ticker can call it.
function refreshHeartbeatStatus() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const lastUpdatedText = document.getElementById('lastUpdatedText');
    if (!statusDot || !statusText) return;

    const lastUpdated = currentQueueData.last_updated || 0;
    const ageMs = Date.now() - lastUpdated;

    if (lastUpdated && ageMs < 15000) { // heartbeat within ~15s -> online
        statusDot.className = 'status-dot online';
        statusText.textContent = 'ESP32: Connected';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'ESP32: OFFLINE';
    }

    if (lastUpdatedText) {
        if (!lastUpdated) {
            lastUpdatedText.textContent = '— never updated';
        } else {
            const ageSec = Math.max(0, Math.floor(ageMs / 1000));
            lastUpdatedText.textContent = `updated ${ageSec}s ago`;
        }
    }
}

// --- Join Queue actions ---
function setupQueueActions() {
    const joinQueueBtn = document.getElementById('joinQueueBtn');
    const cancelTicketBtn = document.getElementById('cancelTicketBtn');
    const clientNameInput = document.getElementById('clientName');
    const serviceSelect = document.getElementById('serviceSelect');

    joinQueueBtn.addEventListener('click', () => {
        let name = clientNameInput.value.trim();
        if (!name) {
            if (currentUser && currentUser.displayName) {
                name = currentUser.displayName;
            } else {
                showToast("Please enter a name or login first.", "warning");
                return;
            }
        }

        const serviceType = serviceSelect.value;

        // Perform transaction to get next unique token counter
        database.ref('queue/last_token_issued').transaction((currentVal) => {
            return (currentVal || 0) + 1;
        }, (error, committed, snapshot) => {
            if (error) {
                showToast("Failed to reserve queue slot. Try again.", "danger");
            } else if (committed) {
                const newTokenId = snapshot.val();
                
                // status:"enqueued" matches the ESP remote-ticket contract. The device
                // detects this new web ticket by seeing last_token_issued (just bumped by
                // the transaction above) exceed its own counter, then picks it up.
                const ticketData = {
                    name: name,
                    service_type: serviceType,
                    status: 'enqueued',
                    source: 'web',
                    join_time: firebase.database.ServerValue.TIMESTAMP
                };

                // Create ticket entry
                database.ref(`remote_tickets/${newTokenId}`).set(ticketData)
                    .then(() => {
                        showToast(`Ticket #${formatToken(newTokenId)} issued successfully!`, "success");
                        
                        // If logged in, associate ticket with user
                        if (currentUser) {
                            database.ref(`users/${currentUser.uid}/active_ticket`).set(newTokenId);
                        } else {
                            // Save ticket locally in sessionStorage for non-authenticated sessions
                            sessionStorage.setItem('active_ticket_id', newTokenId);
                        }
                        
                        clientNameInput.value = '';
                        trackUserTicket();
                    })
                    .catch((err) => {
                        showToast(err.message, "danger");
                    });
            }
        });
    });

    cancelTicketBtn.addEventListener('click', () => {
        if (!userTicket) return;
        
        if (confirm("Are you sure you want to cancel your queue ticket?")) {
            const ticketId = userTicket.id;
            
            // Update ticket status to cancelled
            database.ref(`remote_tickets/${ticketId}/status`).set('cancelled')
                .then(() => {
                    // Update queue size count
                    database.ref('queue/queue_size').transaction((size) => {
                        return Math.max(0, (size || 1) - 1);
                    });

                    // Remove link
                    if (currentUser) {
                        database.ref(`users/${currentUser.uid}/active_ticket`).remove();
                    } else {
                        sessionStorage.removeItem('active_ticket_id');
                    }
                    
                    showToast("Ticket cancelled successfully.", "info");
                    userTicket = null;
                    document.getElementById('activeTicketCard').classList.add('hidden');
                });
        }
    });
}

// Track user's active ticket
function trackUserTicket() {
    let ticketIdPromise;
    if (currentUser) {
        ticketIdPromise = database.ref(`users/${currentUser.uid}/active_ticket`).once('value').then(snap => snap.val());
    } else {
        ticketIdPromise = Promise.resolve(sessionStorage.getItem('active_ticket_id'));
    }

    ticketIdPromise.then(ticketId => {
        if (ticketId) {
            database.ref(`remote_tickets/${ticketId}`).on('value', (snap) => {
                const ticket = snap.val();
                if (ticket && (ticket.status === 'pending' || ticket.status === 'enqueued' || ticket.status === 'serving')) {
                    userTicket = ticket;
                    userTicket.id = ticketId;
                    updateClientTicketStatus();
                } else {
                    userTicket = null;
                    document.getElementById('activeTicketCard').classList.add('hidden');
                }
            });
        } else {
            userTicket = null;
            document.getElementById('activeTicketCard').classList.add('hidden');
        }
    });
}

// Update active ticket card status
function updateClientTicketStatus() {
    if (!userTicket) return;

    const card = document.getElementById('activeTicketCard');
    const numDisplay = document.getElementById('myTicketNumber');
    const typeBadge = document.getElementById('myTicketType');
    const aheadDisplay = document.getElementById('myPeopleAhead');
    const waitDisplay = document.getElementById('myWaitTime');
    const statusMsg = document.getElementById('ticketStatusMsg');
    const progressBar = document.getElementById('ticketProgress');

    card.classList.remove('hidden');
    numDisplay.textContent = formatToken(userTicket.id);
    typeBadge.textContent = userTicket.service_type || 'Standard';

    // Calculate how many people ahead
    let activeTickets = [];
    Object.keys(allTickets).forEach(key => {
        const ticket = allTickets[key];
        ticket.id = key;
        if (ticket.status === 'pending' || ticket.status === 'enqueued' || ticket.status === 'serving') {
            activeTickets.push(ticket);
        }
    });
    activeTickets.sort((a, b) => a.join_time - b.join_time);

    const index = activeTickets.findIndex(t => t.id === userTicket.id);

    if (index === -1) {
        // Not active anymore
        card.classList.add('hidden');
        return;
    }

    const currentTicketObj = activeTickets[index];

    if (currentTicketObj.status === 'serving') {
        aheadDisplay.textContent = "0";
        waitDisplay.textContent = "Now serving!";
        statusMsg.textContent = "Please go to the teller desk. Service started!";
        progressBar.style.width = "100%";
        progressBar.style.backgroundColor = "var(--color-success)";
    } else {
        // ahead is index
        const peopleAhead = index;
        aheadDisplay.textContent = peopleAhead;
        
        // Wait time
        const waitMin = Math.ceil((peopleAhead * avgServiceTimeSec) / 60);
        waitDisplay.textContent = `${waitMin} min`;
        statusMsg.textContent = `Waiting in queue... Expected slot in ${waitMin} minutes.`;
        
        // Calculate progress percentage
        const progress = Math.max(5, 100 - (peopleAhead * 20));
        progressBar.style.width = `${progress}%`;
        progressBar.style.backgroundColor = "var(--mtn-yellow)";
    }
}

// --- Admin Controls ---
function setupAdminControls() {
    const nextBtn = document.getElementById('adminNextBtn');
    const toggleGateBtn = document.getElementById('adminOpenGateBtn');
    const buzzerBtn = document.getElementById('adminBuzzerBtn');
    const idleBtn = document.getElementById('adminSetIdleBtn');
    const resetBtn = document.getElementById('adminResetBtn');
    const manualAvgInput = document.getElementById('manualAvgTime');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');

    nextBtn.addEventListener('click', () => {
        // Simulates next button trigger
        // Find next token in remote_tickets list
        let activeTickets = [];
        Object.keys(allTickets).forEach(key => {
            const ticket = allTickets[key];
            ticket.id = key;
            if (ticket.status === 'pending' || ticket.status === 'enqueued') {
                activeTickets.push(ticket);
            }
        });
        activeTickets.sort((a, b) => a.join_time - b.join_time);

        if (activeTickets.length === 0) {
            showToast("No customers left in the queue.", "warning");
            return;
        }

        const nextTicket = activeTickets[0];
        
        // Complete current serving ticket
        const curToken = currentQueueData.current_token || 0;
        if (curToken > 0) {
            database.ref(`remote_tickets/${curToken}`).update({
                status: 'completed',
                completed_time: firebase.database.ServerValue.TIMESTAMP
            });
        }

        // Set next ticket to serving
        database.ref(`remote_tickets/${nextTicket.id}`).update({
            status: 'serving',
            served_time: firebase.database.ServerValue.TIMESTAMP
        });

        // Update queue parameters
        const updatedNextToken = activeTickets[1] ? activeTickets[1].id : 0;
        database.ref('queue').update({
            current_token: parseInt(nextTicket.id),
            next_token: parseInt(updatedNextToken),
            queue_size: activeTickets.length - 1,
            system_state: 'SERVING',
            gate_open: true, // open gate briefly
            trigger_buzzer: true
        });

        showToast(`Calling Ticket #${formatToken(nextTicket.id)}!`, "success");
    });

    toggleGateBtn.addEventListener('click', () => {
        const currentGate = currentQueueData.gate_open || false;
        database.ref('queue/gate_open').set(!currentGate);
        showToast(`Gate state updated to: ${!currentGate ? 'OPEN' : 'CLOSED'}`, "info");
    });

    buzzerBtn.addEventListener('click', () => {
        database.ref('queue/trigger_buzzer').set(true);
        showToast("Triggered hardware buzzer beep.", "info");
    });

    idleBtn.addEventListener('click', () => {
        database.ref('queue').update({
            system_state: 'IDLE',
            current_token: 0,
            next_token: 0,
            queue_size: 0
        });
        showToast("Queue state set to IDLE.", "warning");
    });

    resetBtn.addEventListener('click', () => {
        if (confirm("CRITICAL WARNING: This will delete ALL tokens, logs, stats, and queue states. Do you wish to continue?")) {
            database.ref().update({
                queue: {
                    current_token: 0,
                    next_token: 0,
                    last_token_issued: 0,
                    queue_size: 0,
                    system_state: 'IDLE',
                    avg_service_time_sec: 90,
                    gate_open: false,
                    trigger_buzzer: false,
                    last_updated: firebase.database.ServerValue.TIMESTAMP
                },
                remote_tickets: null
            }).then(() => {
                showToast("All databases cleared and system reset.", "danger");
            });
        }
    });

    saveSettingsBtn.addEventListener('click', () => {
        const val = parseInt(manualAvgInput.value);
        if (val && val > 0) {
            database.ref('queue/avg_service_time_sec').set(val)
                .then(() => {
                    showToast(`Updated average service duration to ${val} seconds.`, "success");
                });
        } else {
            showToast("Please enter a valid duration.", "warning");
        }
    });
}

// --- Analytics Charts ---
function initializeCharts() {
    const queueCtx = document.getElementById('queueSizeChart').getContext('2d');
    const perfCtx = document.getElementById('servicePerformanceChart').getContext('2d');

    // Chart.js Configuration
    queueChart = new Chart(queueCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'People Waiting',
                data: [],
                borderColor: '#FFCC00',
                backgroundColor: 'rgba(255, 204, 0, 0.08)',
                fill: true,
                borderWidth: 2,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Real-Time Queue Size Stream', color: '#FFF' }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
            }
        }
    });

    performanceChart = new Chart(perfCtx, {
        type: 'bar',
        data: {
            labels: ['08:00', '10:00', '12:00', '14:00', '16:00'],
            datasets: [{
                label: 'Service Time (sec)',
                data: [75, 110, 95, 120, 85],
                backgroundColor: 'rgba(139, 92, 246, 0.5)',
                borderColor: '#8B5CF6',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: true, text: 'Avg Service Duration per Block', color: '#FFF' }
            },
            scales: {
                y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8' } },
                x: { grid: { display: false }, ticks: { color: '#94A3B8' } }
            }
        }
    });
}

function updateCharts() {
    if (!queueChart || !performanceChart) return;

    // Create custom datasets based on remote_tickets logs
    const completedTickets = [];
    const timestamps = [];
    const sizes = [];

    // Parse all tickets
    let sizeCounter = 0;
    const sortedAll = Object.keys(allTickets).map(k => ({ id: k, ...allTickets[k] })).sort((a,b) => a.join_time - b.join_time);
    
    sortedAll.forEach(t => {
        if (t.status === 'completed') {
            completedTickets.push(t);
        }
        
        // Track queue size over time
        if (t.status !== 'cancelled') {
            const timeStr = new Date(t.join_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timestamps.push(timeStr);
            if (t.status === 'serving' || t.status === 'completed') {
                sizeCounter = Math.max(0, sizeCounter - 1);
            } else {
                sizeCounter++;
            }
            sizes.push(sizeCounter);
        }
    });

    // Limit line chart data points
    queueChart.data.labels = timestamps.slice(-10);
    queueChart.data.datasets[0].data = sizes.slice(-10);
    queueChart.update();

    // Group service performance by service type
    const serviceTypePerformance = {};
    const serviceTypeCounts = {};

    completedTickets.forEach(t => {
        if (t.served_time && t.completed_time) {
            const serviceSec = Math.floor((t.completed_time - t.served_time) / 1000);
            const type = t.service_type || 'Joining Queue';
            serviceTypePerformance[type] = (serviceTypePerformance[type] || 0) + serviceSec;
            serviceTypeCounts[type] = (serviceTypeCounts[type] || 0) + 1;
        }
    });

    const categories = Object.keys(serviceTypePerformance);
    const avgTimes = categories.map(cat => Math.ceil(serviceTypePerformance[cat] / serviceTypeCounts[cat]));

    if (categories.length > 0) {
        performanceChart.data.labels = categories;
        performanceChart.data.datasets[0].data = avgTimes;
        performanceChart.update();
    }
}

// --- Formatting Utilities ---
function formatToken(t) {
    if (!t || t <= 0) return "---";
    let s = String(t);
    while (s.length < 3) s = "0" + s;
    return s;
}

function formatDuration(sec) {
    if (sec < 60) return `${Math.ceil(sec)}s`;
    const min = Math.floor(sec / 60);
    const remainingSec = Math.round(sec % 60);
    return remainingSec > 0 ? `${min}m ${remainingSec}s` : `${min}m`;
}
