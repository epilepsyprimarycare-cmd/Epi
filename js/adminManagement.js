/**
 * Unified Admin Management Module
 * Handles both Users and Facilities management with pagination
 * Consolidated from adminUsers.js and adminPhcs.js
 */

// Pagination state
let currentUsersPage = 1;
let currentPhcsPage = 1;
const usersPerPage = 25;
const phcsPerPage = 10;
let allUsers = [];
let allPhcs = [];
let filteredUsers = [];
let filteredPhcs = [];

// Use global loader/notification helpers from utils.js and script.js
// showNotification is defined in utils.js
// showLoader and hideLoader are defined in script.js (as showLoading/hideLoading with aliases)
// All functions are available globally via window object

// =====================================================
// USERS MANAGEMENT
// =====================================================

async function fetchUsers() {
    if (typeof window.showLoader === 'function') window.showLoader('Loading users...');
    try {
        const resp = await fetch(`${window.API_CONFIG.MAIN_SCRIPT_URL}?action=getUsers&t=${Date.now()}`);
        const result = await resp.json();
        if (result.status === 'success' && Array.isArray(result.data)) {
            allUsers = result.data;
            // Filter out admin roles to only show PHC Staff and Viewers
            filteredUsers = allUsers.filter(user => {
                const role = (user.Role || user.role || '').toLowerCase().trim();
                return role === 'phc' || role === 'phc_staff' || role === 'viewer';
            });
            // Sort users by name
            filteredUsers.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
            return filteredUsers;
        }
        showNotification(EpicareI18n.translate('admin.failedToLoadUsers'), 'error');
        return [];
    } catch (err) {
        showNotification(EpicareI18n.translate('admin.errorFetchingUsers') + ': ' + err.message, 'error');
        return [];
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

function renderUsersTable(users = filteredUsers) {
    const container = document.getElementById('usersTableContainer');
    if (!container) return;
    
    // Calculate pagination
    const totalPages = Math.ceil(users.length / usersPerPage);
    const startIndex = (currentUsersPage - 1) * usersPerPage;
    const endIndex = startIndex + usersPerPage;
    const pageUsers = users.slice(startIndex, endIndex);
    
    if (pageUsers.length === 0) {
        container.innerHTML = `<div class="text-center p-4">${window.EpicareI18n ? window.EpicareI18n.translate('admin.noFacilityStaff') : EpicareI18n.translate('admin.noFacilityStaff')}</div>`;
        return;
    }
    
    const cardsHTML = `
        <div style="margin-bottom: 1rem;">
            <strong>${window.EpicareI18n ? window.EpicareI18n.translate('admin.showingFacilityStaffOnly') : 'Showing Facility Staff Only'}</strong> (${window.EpicareI18n ? window.EpicareI18n.translate('admin.adminRolesFiltered') : 'Admin roles filtered out'})
        </div>
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead class="table-dark">
                    <tr>
                        <th>${window.EpicareI18n ? window.EpicareI18n.translate('admin.name') : 'Name'}</th>
                        <th>${window.EpicareI18n ? window.EpicareI18n.translate('admin.email') : 'Email'}</th>
                        <th>${window.EpicareI18n ? window.EpicareI18n.translate('admin.facility') : 'Facility'}</th>
                        <th>${window.EpicareI18n ? window.EpicareI18n.translate('admin.status') : 'Status'}</th>
                        <th>${window.EpicareI18n ? window.EpicareI18n.translate('admin.actions') : 'Actions'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageUsers.map(user => `
                        <tr>
                            <td>${escapeHtml(user.Name || user.name || 'Unnamed User')}</td>
                            <td>${escapeHtml(user.Email || user.email || 'N/A')}</td>
                            <td>${escapeHtml(user.PHC || user.phc || 'N/A')}</td>
                            <td>
                                <span class="badge ${(user.Status || user.status || 'Active') === 'Active' ? 'bg-success' : 'bg-secondary'}" title="${EpicareI18n.translate((user.Status || user.status || 'Active') === 'Active' ? 'status.active' : 'status.inactive')}">
                                    ${escapeHtml(user.Status || user.status || 'Active')}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${escapeHtml(user.Username || user.username || '')}')" title="${EpicareI18n.translate('table.actionsEdit')}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-${(user.Status || 'Active') === 'Active' ? 'warning' : 'success'}" 
                                        onclick="toggleUserStatus('${escapeHtml(user.Username || user.username || '')}', '${escapeHtml(user.Status || 'Active')}')" title="${EpicareI18n.translate((user.Status || 'Active') === 'Active' ? 'status.inactive' : 'status.active')}">
                                    <i class="fas fa-${(user.Status || 'Active') === 'Active' ? 'pause' : 'play'}"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        ${totalPages > 1 ? createPagination({
            currentPage: currentUsersPage,
            totalPages,
            totalItems: filteredUsers.length,
            itemsPerPage: usersPerPage,
            onPageClick: 'goToUsersPage',
            itemType: window.EpicareI18n ? window.EpicareI18n.translate('admin.facilityStaff') : 'facility staff'
        }) : ''}
    `;
    
    container.innerHTML = cardsHTML;
}

// =====================================================
// Facilities MANAGEMENT
// =====================================================

async function fetchPhcs() {
    try {
        if (typeof window.showLoader === 'function') window.showLoader('Loading facilities...');
        
        const response = await fetch(`${window.API_CONFIG.MAIN_SCRIPT_URL}?action=getPHCs&t=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            allPhcs = result.data;
            filteredPhcs = [...allPhcs];
            // Sort PHCs by name
            filteredPhcs.sort((a, b) => {
                const nameA = a.PHCName || a.PHCCode || a.name || '';
                const nameB = b.PHCName || b.PHCCode || b.name || '';
                return nameA.localeCompare(nameB);
            });
            return filteredPhcs;
        } else {
            throw new Error(result.error || 'Failed to load PHCs');
        }
    } catch (error) {
        window.Logger.error('Error fetching PHCs:', error);
        showNotification(EpicareI18n.translate('admin.failedToLoadPhcs') + ': ' + error.message, 'error');
        return [];
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

function renderPhcsTable(phcs = filteredPhcs) {
    const container = document.getElementById('phcListContainer');
    if (!container) return;
    
    // Calculate pagination
    const totalPages = Math.ceil(phcs.length / phcsPerPage);
    const startIndex = (currentPhcsPage - 1) * phcsPerPage;
    const endIndex = startIndex + phcsPerPage;
    const pagePhcs = phcs.slice(startIndex, endIndex);
    
    if (pagePhcs.length === 0) {
        container.innerHTML = `<div class="text-center p-4">${window.EpicareI18n ? window.EpicareI18n.translate('admin.noPhcsFound') : 'No PHCs found.'}</div>`;
        return;
    }
    
    const tableHTML = `
        <div class="table-responsive">
            <table class="table table-sm table-striped">
                <thead class="table-dark">
                    <tr>
                        <th>PHC Name</th>
                        <th>District</th>
                        <th>Block</th>
                        <th>Contact Person</th>
                        <th>Phone</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagePhcs.map(phc => `
                        <tr>
                            <td><strong>${escapeHtml(phc.PHCName || phc.name || 'N/A')}</strong></td>
                            <td>${escapeHtml(phc.District || 'N/A')}</td>
                            <td>${escapeHtml(phc.Block || 'N/A')}</td>
                            <td>${escapeHtml(phc.ContactPerson || 'N/A')}</td>
                            <td>${escapeHtml(phc.Phone || phc.ContactPhone || 'N/A')}</td>
                            <td>
                                <span class="badge ${(phc.Status || 'Active') === 'Active' ? 'bg-success' : 'bg-secondary'}">
                                    ${escapeHtml(phc.Status || 'Active')}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary me-1" onclick="editPhc('${escapeHtml(phc.PHCCode || phc.id || '')}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-info" onclick="viewPhcDetails('${escapeHtml(phc.PHCCode || phc.id || '')}')">
                                    <i class="fas fa-eye"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        ${totalPages > 1 ? createPagination({
            currentPage: currentPhcsPage,
            totalPages,
            totalItems: filteredPhcs.length,
            itemsPerPage: phcsPerPage,
            onPageClick: 'goToPhcPage',
            itemType: 'PHCs'
        }) : ''}
    `;
    
    container.innerHTML = tableHTML;
}

// =====================================================
// USER MODAL AND MANAGEMENT
// =====================================================

async function openUserModal(userObj = null) {
    const modal = document.getElementById('addUserModal');
    const addForm = document.getElementById('addUserForm');
    const nameEl = document.getElementById('addUserName');
    const emailEl = document.getElementById('addUserEmail');
    const roleEl = document.getElementById('addUserRole');
    const phcWrapper = document.getElementById('addUserPhcWrapper');
    const phcSelect = document.getElementById('addUserPhcSelect');
    const errorsDiv = document.getElementById('addUserFormErrors');
    
    if (errorsDiv) errorsDiv.innerHTML = '';

    // Set role options to PHC only
    if (roleEl) roleEl.innerHTML = `<option value="phc">${window.EpicareI18n ? window.EpicareI18n.translate('admin.phcStaff') : 'PHC Staff'}</option>`;

    // Load PHC list from backend
    try {
        const resp = await fetch(`${window.API_CONFIG.MAIN_SCRIPT_URL}?action=getActivePHCNames&t=${Date.now()}`);
        const r = await resp.json();
        const phcs = (r && r.status === 'success' && Array.isArray(r.data)) ? r.data : [];
        if (phcSelect) {
            phcSelect.innerHTML = `<option value="">${window.EpicareI18n ? window.EpicareI18n.translate('admin.selectPhc') : '-- Select PHC --'}</option>`;
            phcs.forEach(phc => {
                const option = document.createElement('option');
                option.value = phc;
                option.textContent = phc;
                phcSelect.appendChild(option);
            });
        }
    } catch (e) {
        window.Logger.warn('Failed to load PHC list', e);
    }

    // Prefill for edit
    if (userObj) {
        if (nameEl) nameEl.value = userObj.Name || userObj.name || userObj.fullName || '';
        if (emailEl) emailEl.value = userObj.Email || userObj.email || '';
        if (roleEl) roleEl.value = 'phc'; // Force PHC role
        if (phcSelect && (userObj.PHC || userObj.phc)) phcSelect.value = userObj.PHC || userObj.phc;
        if (modal) modal.setAttribute('data-edit-id', userObj.ID || userObj.id || userObj.Username || userObj.username || '');
    } else {
        if (addForm) addForm.reset();
        if (roleEl) roleEl.value = 'phc'; // Default to PHC role
        if (modal) modal.removeAttribute('data-edit-id');
    }

    // Always show PHC wrapper since we only allow PHC users
    if (phcWrapper) phcWrapper.style.display = 'block';
    if (phcSelect) phcSelect.required = true;

    if (modal) modal.style.display = 'flex';
    return new Promise(resolve => resolve());
}

// =====================================================
// GLOBAL PAGINATION FUNCTIONS
// =====================================================

window.goToUsersPage = function(page) {
    const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentUsersPage = page;
    renderUsersTable(filteredUsers);
}

window.goToPhcPage = function(page) {
    const totalPages = Math.ceil(filteredPhcs.length / phcsPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentPhcsPage = page;
    renderPhcsTable(filteredPhcs);
}

// =====================================================
// GLOBAL ACTION FUNCTIONS
// =====================================================

// User Actions
window.editUser = function(username) {
    const user = allUsers.find(u => (u.Username || u.username) === username);
    if (user) {
        openUserModal(user);
    } else {
        showNotification(EpicareI18n.translate('admin.userNotFound'), 'error');
    }
}

window.toggleUserStatus = function(username, currentStatus) {
    const newStatus = currentStatus === 'Active' ? 'Inactive' : 'Active';
    if (confirm(`Are you sure you want to ${newStatus.toLowerCase()} user: ${username}?`)) {
        showNotification('Toggle user status functionality coming soon', 'info');
        // TODO: Implement user status toggle API call
    }
}

// PHC Actions
window.editPhc = function(phcCode) {
    showNotification('Edit PHC functionality coming soon for: ' + phcCode, 'info');
    // TODO: Implement PHC editing modal
}

window.viewPhcDetails = function(phcCode) {
    const phc = allPhcs.find(p => (p.PHCCode || p.id) === phcCode);
    if (phc) {
        const details = `
PHC: ${phc.PHCName || 'N/A'}
District: ${phc.District || 'N/A'}
Block: ${phc.Block || 'N/A'}
Address: ${phc.Address || 'N/A'}
Contact: ${phc.ContactPerson || 'N/A'}
Phone: ${phc.Phone || phc.ContactPhone || 'N/A'}
Email: ${phc.Email || 'N/A'}
Status: ${phc.Status || 'Active'}
        `;
        alert(details);
    } else {
        showNotification(EpicareI18n.translate('admin.phcNotFound'), 'error');
    }
}

// =====================================================
// PHC MANAGEMENT FUNCTIONS
// =====================================================

function showAddPhcModal() {
    const phcName = prompt('Enter PHC Name:');
    if (!phcName || phcName.trim() === '') return;
    
    const district = prompt('Enter District:');
    if (!district || district.trim() === '') return;
    
    const block = prompt('Enter Block:');
    if (!block || block.trim() === '') return;
    
    const contactPerson = prompt('Enter Contact Person:');
    const phone = prompt('Enter Phone Number:');
    const email = prompt('Enter Email:');
    const address = prompt('Enter Address:');
    
    addPhc({
        name: phcName.trim(),
        district: district.trim(),
        block: block.trim(),
        contactPerson: contactPerson ? contactPerson.trim() : '',
        phone: phone ? phone.trim() : '',
        email: email ? email.trim() : '',
        address: address ? address.trim() : ''
    });
}

async function addPhc(phcData) {
    try {
        if (typeof window.showLoader === 'function') window.showLoader('Adding PHC...');
        
        const payload = {
            action: 'addPHC',
            data: {
                phcCode: generatePhcCode(phcData.name),
                phcName: phcData.name,
                district: phcData.district,
                block: phcData.block,
                address: phcData.address,
                contactPerson: phcData.contactPerson,
                phone: phcData.phone,
                email: phcData.email,
                status: 'Active',
                state: 'Jharkhand'
            }
        };
        
        const result = (typeof window.makeAPICall === 'function') ? await window.makeAPICall('addPHC', payload.data) : await (async () => { const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); return response.json(); })();
        
        if (result.status === 'success') {
            showNotification(EpicareI18n.translate('admin.phcAddedSuccessfully'), 'success');
            
            // Log PHC addition
            if (typeof window.logUserActivity === 'function') {
                window.logUserActivity('Added New PHC', { 
                    phcName: payload.name || 'Unknown',
                    phcCode: payload.code || 'Unknown'
                });
            }
            
            // Refresh the PHC list
            const phcs = await fetchPhcs();
            renderPhcsTable(phcs);
        } else {
            throw new Error(result.error || result.message || 'Failed to add PHC');
        }
    } catch (error) {
        window.Logger.error('Error adding PHC:', error);
        showNotification('Failed to add PHC: ' + error.message, 'error');
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

function generatePhcCode(name) {
    return 'PHC' + name.replace(/\s+/g, '').substring(0, 6).toUpperCase() + String(Date.now()).slice(-3);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function downloadUsersCSV(users) {
    // Disabled: Exporting users (including passwords or other sensitive fields) is not permitted.
    showNotification('User data export is disabled for security reasons.', 'error');
    window.Logger.warn('Attempt to export users was blocked for security reasons');
    return;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// =====================================================
// INITIALIZATION FUNCTIONS
// =====================================================

async function initUsersManagement() {
    const addBtn = document.getElementById('addUserBtn');
    const modal = document.getElementById('addUserModal');
    const closeModalBtn = document.getElementById('closeAddUserModal');
    const cancelBtn = document.getElementById('cancelAddUserBtn');
    const addForm = document.getElementById('addUserForm');
    const roleSelect = document.getElementById('addUserRole');
    const phcWrapper = document.getElementById('addUserPhcWrapper');

    function showModal() { if (modal) modal.style.display = 'flex'; }
    function hideModal() { 
        if (modal) modal.style.display = 'none'; 
        if (addForm) addForm.reset(); 
        if (phcWrapper) phcWrapper.style.display = 'none'; 
        const errorsDiv = document.getElementById('addUserFormErrors');
        if (errorsDiv) errorsDiv.innerHTML = ''; 
    }

    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', async () => {
            await openUserModal(null);
            showModal();
        });
        addBtn.dataset.listenerAttached = 'true';
    }

    if (closeModalBtn && !closeModalBtn.dataset.listenerAttached) {
        closeModalBtn.addEventListener('click', hideModal);
        closeModalBtn.dataset.listenerAttached = 'true';
    }
    
    if (cancelBtn && !cancelBtn.dataset.listenerAttached) {
        cancelBtn.addEventListener('click', hideModal);
        cancelBtn.dataset.listenerAttached = 'true';
    }

    // Role change handler - always show PHC wrapper since we only allow PHC
    if (roleSelect && !roleSelect.dataset.listenerAttached) {
        roleSelect.addEventListener('change', () => {
            if (phcWrapper) phcWrapper.style.display = 'block';
        });
        roleSelect.dataset.listenerAttached = 'true';
    }

    if (addForm && !addForm.dataset.listenerAttached) {
        addForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const nameEl = document.getElementById('addUserName');
            const emailEl = document.getElementById('addUserEmail');
            const roleEl = document.getElementById('addUserRole');
            const phcEl = document.getElementById('addUserPhcSelect');
            
            const name = nameEl ? nameEl.value.trim() : '';
            const email = emailEl ? emailEl.value.trim() : '';
            const role = roleEl ? roleEl.value : '';
            const assignedPhc = phcEl ? phcEl.value : '';
            
            // Validation
            const errorsDiv = document.getElementById('addUserFormErrors');
            let errors = [];
            
            if (!name || name.length < 2) {
                errors.push('Name must be at least 2 characters long');
            }
            
            if (!email || !isValidEmail(email)) {
                errors.push('Please enter a valid email address');
            }
            
            if (role !== 'phc') {
                errors.push('Only PHC Staff role can be added');
            }
            
            if (!assignedPhc) {
                errors.push('Please select a PHC for the user');
            }
            
            if (errors.length > 0) {
                if (errorsDiv) errorsDiv.innerHTML = errors.map(err => `<div class="alert alert-danger py-1">${err}</div>`).join('');
                return;
            }
            
            showLoader('Adding user...');
            try {
                // Generate username from email
                const username = email.split('@')[0];
                
                const editId = modal ? modal.getAttribute('data-edit-id') : null;
                const payload = { 
                    action: editId ? 'updateUser' : 'addUser',
                    name, 
                    email, 
                    role, 
                    phc: assignedPhc,
                    username: username,
                    status: 'Active'
                };
                
                if (editId) payload.id = editId;
                
                const res = (typeof window.makeAPICall === 'function') ? await window.makeAPICall(payload.action, payload) : await (async () => { const resp = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) }); return resp.json(); })();
                if (res.status === 'success') {
                    showNotification(editId ? EpicareI18n.translate('admin.userUpdated') : EpicareI18n.translate('admin.userAddedSuccessfully'), 'success');
                    
                    // Log user management action
                    if (typeof window.logUserActivity === 'function') {
                        const actionType = editId ? 'Updated User' : 'Added New User';
                        window.logUserActivity(actionType, { 
                            targetUser: username,
                            role: role
                        });
                    }
                    
                    hideModal();
                    const users = await fetchUsers();
                    renderUsersTable(users);
                } else if (res.status === 'error' && res.errors) {
                    // server-side validation errors expected as { field: message }
                    const errHtml = Object.keys(res.errors).map(f => `<div class="alert alert-danger py-1"><strong>${f}:</strong> ${res.errors[f]}</div>`).join('');
                    if (errorsDiv) errorsDiv.innerHTML = errHtml;
                } else {
                    showNotification('Failed to add/update user: ' + (res.message || res.error || 'unknown'), 'error');
                }
            } catch (err) {
                showNotification('Error adding user: ' + err.message, 'error');
            } finally { 
                if (typeof window.hideLoader === 'function') window.hideLoader(); 
            }
        });
        addForm.dataset.listenerAttached = 'true';
    }

    // Initial load
    const users = await fetchUsers();
    renderUsersTable(users);
}

async function initPhcManagement() {
    // Load PHCs
    const phcs = await fetchPhcs();
    renderPhcsTable(phcs);
    
    // Setup Add PHC button
    const addBtn = document.getElementById('addPhcBtn');
    if (addBtn && !addBtn.dataset.listenerAttached) {
        addBtn.addEventListener('click', showAddPhcModal);
        addBtn.dataset.listenerAttached = 'true';
    }
}

// Main initialization function
async function initAdminManagement() {
    await initUsersManagement();
    await initPhcManagement();
}

// Alias for renderFacilitiesManagement (called from script.js)
async function renderFacilitiesManagement() {
    await initPhcManagement();
}

// =====================================================
// MANAGEMENT ANALYTICS
// =====================================================

async function renderManagementAnalytics() {
    const container = document.getElementById('managementAnalyticsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading analytics...</div>';
    
    try {
        // Get summary statistics
        const usersCount = allUsers.length;
        const phcsCount = allPhcs.length;
        const activeUsersCount = allUsers.filter(u => (u.Status || u.status) === 'Active').length;
        const activePHCsCount = allPhcs.filter(p => (p.Status || 'Active') === 'Active').length;
        
        container.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3">
                    <div class="card border-primary">
                        <div class="card-body text-center">
                            <i class="fas fa-users fa-2x text-primary mb-2"></i>
                            <h4 class="mb-0">${usersCount}</h4>
                            <small class="text-muted">Total Users</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <i class="fas fa-user-check fa-2x text-success mb-2"></i>
                            <h4 class="mb-0">${activeUsersCount}</h4>
                            <small class="text-muted">Active Users</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-info">
                        <div class="card-body text-center">
                            <i class="fas fa-hospital fa-2x text-info mb-2"></i>
                            <h4 class="mb-0">${phcsCount}</h4>
                            <small class="text-muted">Total Facilities</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card border-success">
                        <div class="card-body text-center">
                            <i class="fas fa-hospital-alt fa-2x text-success mb-2"></i>
                            <h4 class="mb-0">${activePHCsCount}</h4>
                            <small class="text-muted">Active Facilities</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0"><i class="fas fa-chart-pie"></i> Users by Facility</h5>
                        </div>
                        <div class="card-body">
                            <canvas id="usersByPhcChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="mb-0"><i class="fas fa-chart-bar"></i> User Status Distribution</h5>
                        </div>
                        <div class="card-body">
                            <canvas id="userStatusChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Render charts if Chart.js is available
        if (typeof Chart !== 'undefined') {
            renderManagementCharts();
        }
    } catch (error) {
        window.Logger.error('Error rendering management analytics:', error);
        container.innerHTML = '<div class="alert alert-danger">Failed to load analytics</div>';
    }
}

function renderManagementCharts() {
    // Users by PHC chart
    const phcCounts = {};
    allUsers.forEach(user => {
        const phc = user.PHC || user.phc || 'Unassigned';
        phcCounts[phc] = (phcCounts[phc] || 0) + 1;
    });
    
    const phcCanvas = document.getElementById('usersByPhcChart');
    if (phcCanvas) {
        new Chart(phcCanvas, {
            type: 'pie',
            data: {
                labels: Object.keys(phcCounts),
                datasets: [{
                    data: Object.values(phcCounts),
                    backgroundColor: [
                        '#3498db', '#2ecc71', '#f39c12', '#e74c3c', '#9b59b6',
                        '#1abc9c', '#34495e', '#16a085', '#27ae60', '#2980b9'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
    
    // User status chart
    const statusCounts = {
        Active: allUsers.filter(u => (u.Status || u.status || 'Active') === 'Active').length,
        Inactive: allUsers.filter(u => (u.Status || u.status) === 'Inactive').length
    };
    
    const statusCanvas = document.getElementById('userStatusChart');
    if (statusCanvas) {
        new Chart(statusCanvas, {
            type: 'bar',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Number of Users',
                    data: Object.values(statusCounts),
                    backgroundColor: ['#27ae60', '#95a5a6']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
}

// =====================================================
// CDS RULES VIEWER
// =====================================================

async function renderCdsRulesList() {
    const container = document.getElementById('cdsRulesContainer');
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-info">
            <h5><i class="fas fa-brain"></i> Clinical Decision Support System</h5>
            <p class="mb-0">The CDS system is integrated into the follow-up form and provides real-time medication recommendations based on:</p>
            <ul class="mb-0 mt-2">
                <li>Patient age, weight, and seizure type</li>
                <li>Current medications and dosages</li>
                <li>Treatment response and adherence</li>
                <li>Side effects and contraindications</li>
                <li>Evidence-based treatment guidelines</li>
            </ul>
        </div>
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">CDS Status</h5>
            </div>
            <div class="card-body">
                <p><strong>Status:</strong> <span class="badge bg-success">Active</span></p>
                <p><strong>Version:</strong> ${window.cdsVersion || '1.0.0'}</p>
                <p><strong>Knowledge Base:</strong> Integrated with follow-up workflow</p>
                <p class="mb-0"><em>CDS recommendations appear automatically when reviewing patient medications during follow-ups.</em></p>
            </div>
        </div>
    `;
}

// =====================================================
// ADMIN LOGS VIEWER
// =====================================================

let currentLogsPage = 1;
const logsPerPage = 50;
let allLogs = [];

async function renderAdminLogs() {
    const container = document.getElementById('adminLogsContainer');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Loading activity logs...</div>';
    
    try {
        if (typeof window.showLoader === 'function') window.showLoader('Loading logs...');
        
        const response = await fetch(`${window.API_CONFIG.MAIN_SCRIPT_URL}?action=getUserActivityLogs&limit=10&t=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            allLogs = result.data;
            displayLogs();
        } else {
            throw new Error(result.error || 'Failed to load logs');
        }
    } catch (error) {
        window.Logger.error('Error loading admin logs:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> Failed to load activity logs: ${error.message}
            </div>
        `;
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
}

function displayLogs() {
    const container = document.getElementById('adminLogsContainer');
    if (!container) return;
    
    const totalPages = Math.ceil(allLogs.length / logsPerPage);
    const startIndex = (currentLogsPage - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    const pageLogs = allLogs.slice(startIndex, endIndex);
    
    if (pageLogs.length === 0) {
        container.innerHTML = '<div class="alert alert-info">No activity logs found.</div>';
        return;
    }
    
    const logsHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="mb-0"><i class="fas fa-file-alt"></i> User Activity Logs</h5>
        </div>
        
        <div class="table-responsive">
            <table class="table table-sm table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Timestamp</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>Details</th>
                        <th>Role</th>
                        <th>PHC</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageLogs.map(log => {
                        const timestamp = log.Timestamp || log.timestamp || '';
                        const username = log.Username || log.username || 'Unknown';
                        const action = log.Action || log.action || 'N/A';
                        const details = log.Details || log.details || '';
                        
                        // Parse details if it's a JSON string
                        let detailsObj = {};
                        try {
                            detailsObj = typeof details === 'string' ? JSON.parse(details) : details;
                        } catch (e) {
                            detailsObj = { raw: details };
                        }
                        
                        const role = detailsObj.role || 'N/A';
                        const phc = detailsObj.phc || 'N/A';
                        
                        // Format details for display
                        const detailsDisplay = Object.entries(detailsObj)
                            .filter(([key]) => key !== 'role' && key !== 'phc')
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(', ') || '-';
                        
                        return `
                            <tr>
                                <td><small>${escapeHtml(timestamp)}</small></td>
                                <td><strong>${escapeHtml(username)}</strong></td>
                                <td><span class="badge bg-info">${escapeHtml(action)}</span></td>
                                <td><small>${escapeHtml(detailsDisplay)}</small></td>
                                <td><small>${escapeHtml(role)}</small></td>
                                <td><small>${escapeHtml(phc)}</small></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        
        ${totalPages > 1 ? createPagination({
            currentPage: currentLogsPage,
            totalPages,
            totalItems: allLogs.length,
            itemsPerPage: logsPerPage,
            onPageClick: 'goToLogsPage',
            itemType: 'logs'
        }) : ''}
    `;
    
    container.innerHTML = logsHTML;
}

window.goToLogsPage = function(page) {
    const totalPages = Math.ceil(allLogs.length / logsPerPage);
    if (page < 1 || page > totalPages) return;
    
    currentLogsPage = page;
    displayLogs();
}

// Export function removed as per requirements
/*
window.exportLogsToCSV = function() {
    if (!allLogs || allLogs.length === 0) {
        showNotification('No logs to export', 'info');
        return;
    }
    
    const headers = ['Timestamp', 'Username', 'Action', 'Details', 'Role', 'PHC'];
    const rows = allLogs.map(log => {
        const details = log.Details || log.details || '';
        let detailsObj = {};
        try {
            detailsObj = typeof details === 'string' ? JSON.parse(details) : details;
        } catch (e) {
            detailsObj = { raw: details };
        }
        
        return [
            log.Timestamp || log.timestamp || '',
            log.Username || log.username || '',
            log.Action || log.action || '',
            JSON.stringify(detailsObj),
            detailsObj.role || '',
            detailsObj.phc || ''
        ];
    });
    
    const csv = [headers].concat(rows).map(row => 
        row.map(cell => '"' + String(cell || '').replace(/"/g, '""') + '"').join(',')
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    showNotification('Activity logs exported successfully', 'success');
}
*/

// =====================================================
// MANAGEMENT EXPORTS
// =====================================================

async function initManagementExports() {
    const container = document.getElementById('adminExportContainer');
    if (!container) return;
    const isPhcAdmin = (window.currentUserRole === 'phc_admin');

    let cardsHtml = '';
    // Never include user data export for security reasons.
    if (isPhcAdmin) {
        // PHC admin should only see Monthly follow-up export (PHC-scoped)
        // (Monthly follow-up card added below)
    } else {
        // Master admin: show PHC export and Full System Export
        cardsHtml += `
        <div class="col-md-6">
            <div class="card border-info">
                <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-hospital"></i> Export Facilities</h6>
                    <p class="card-text">Export all PHC data to CSV format</p>
                    <button class="btn btn-info" onclick="window.exportPhcsData()">
                        <i class="fas fa-download"></i> Export PHCs CSV
                    </button>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card border-warning">
                <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-database"></i> Full System Export</h6>
                    <p class="card-text">Export all management data in one package (Note: User passwords and sensitive fields are excluded)</p>
                    <button class="btn btn-warning" onclick="window.exportAllManagementData()">
                        <i class="fas fa-download"></i> Export All Data
                    </button>
                </div>
            </div>
        </div>
    `;
    }

    // Monthly follow-up card shown for both master admin and PHC admin
    cardsHtml += `
        <div class="col-md-6">
            <div class="card border-success">
                <div class="card-body">
                    <h6 class="card-title"><i class="fas fa-calendar-check"></i> Export Monthly Follow-up Status</h6>
                    <p class="card-text">Export monthly follow-up status per facility. Master Admin receives a workbook with per-PHC sheets; PHC Admin receives a single-PHC sheet.</p>
                    <button class="btn btn-success" id="exportMonthlyFollowUpStatusBtn">
                        <i class="fas fa-download"></i> Export Monthly Follow-up Status (.xlsx)
                    </button>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0"><i class="fas fa-download"></i> Data Exports</h5>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    ${cardsHtml}
                </div>
            </div>
        </div>
    `;

    // Attach XLSX export handler for the new button if present
    const followUpBtn = document.getElementById('exportMonthlyFollowUpStatusBtn');
    if (followUpBtn) {
        followUpBtn.addEventListener('click', function () {
            if (typeof window.exportMonthlyFollowUpStatusXLSX === 'function') {
                window.exportMonthlyFollowUpStatusXLSX();
            } else if (typeof window.exportMonthlyFollowUpStatusCSV === 'function') {
                window.exportMonthlyFollowUpStatusCSV();
            } else {
                showNotification('Export function not available', 'error');
            }
        });
    }

    // Developer helper: check management exports UI status
    window._checkManagementExports = function() {
        const status = { helper: typeof window.initManagementExports === 'function', hasButton: false, buttonEventAttached: false };
        const el = document.getElementById('exportMonthlyFollowUpStatusBtn');
        if (el) {
            status.hasButton = true;
            // quick check if there's an onclick handler or listener
            try { status.buttonEventAttached = (typeof el.onclick === 'function') || el.dataset.listenerAttached === 'true'; } catch(e) { status.buttonEventAttached = false; }
        }
        console.log('Management Export Status:', status);
        return status;
    };

    // Developer helper: check that user exports are disabled and full export excludes user data
    window._checkUserExportDisabled = function() {
        const isDisabled = typeof window.exportUsersData === 'function' && window.exportUsersData.toString().includes('Exporting user data has been disabled');
        console.log('User export disabled:', !!isDisabled);
        return !!isDisabled;
    };
}

window.exportUsersData = function() {
    // For security reasons, exporting user data is disabled.
    showNotification('Exporting user data has been disabled for security compliance.', 'error');
    window.Logger.warn('User export request blocked');
    return;
}

window.exportPhcsData = function() {
    if (!allPhcs || allPhcs.length === 0) {
        showNotification('No PHC data to export', 'info');
        return;
    }
    
    const headers = Object.keys(allPhcs[0]);
    const rows = allPhcs.map(phc => Object.values(phc));
    const csv = [headers].concat(rows).map(row => 
        row.map(cell => '"' + String(cell || '').replace(/"/g, '""') + '"').join(',')
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phcs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    
    showNotification('PHC data exported successfully', 'success');
}

window.exportAllManagementData = async function() {
    showNotification('Preparing comprehensive export (users export excluded for security)...', 'info');

    // Export PHCs and other non-user datasets but exclude users
    setTimeout(() => {
        if (allPhcs && allPhcs.length > 0) window.exportPhcsData();
    }, 100);

    setTimeout(() => {
        showNotification('All management data exported (excluding sensitive user data).', 'success');
    }, 300);
}

// =====================================================
// ADVANCED ADMIN ACTIONS
// =====================================================

async function initAdvancedAdminActions() {
    const container = document.getElementById('mg-advanced');
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-warning">
            <h5><i class="fas fa-exclamation-triangle"></i> Advanced Administrative Actions</h5>
            <p class="mb-0">These actions require careful consideration and should only be performed by authorized administrators.</p>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0"><i class="fas fa-cogs"></i> System Maintenance</h5>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-4">
                        <button class="btn btn-outline-primary w-100" onclick="window.refreshAllData()">
                            <i class="fas fa-sync"></i><br>Refresh All Data
                        </button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-outline-info w-100" onclick="window.clearAppCache()">
                            <i class="fas fa-trash-alt"></i><br>Clear Cache
                        </button>
                    </div>
                    <div class="col-md-4">
                        <button class="btn btn-outline-success w-100" onclick="window.showSystemInfo()">
                            <i class="fas fa-info-circle"></i><br>System Info
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.refreshAllData = async function() {
    if (!confirm('Refresh all management data? This will reload users and facilities.')) return;
    
    showNotification('Refreshing data...', 'info');
    
    try {
        await fetchUsers();
        await fetchPhcs();
        renderUsersTable();
        renderPhcsTable();
        showNotification('Data refreshed successfully', 'success');
    } catch (error) {
        showNotification('Failed to refresh data: ' + error.message, 'error');
    }
}

window.clearAppCache = function() {
    if (!confirm('Clear application cache? You may need to reload the page.')) return;
    
    try {
        localStorage.clear();
        sessionStorage.clear();
        showNotification('Cache cleared successfully. Please reload the page.', 'success');
    } catch (error) {
        showNotification('Failed to clear cache: ' + error.message, 'error');
    }
}

window.showSystemInfo = function() {
    const info = {
        'Total Users': allUsers.length,
        'Active Users': allUsers.filter(u => (u.Status || 'Active') === 'Active').length,
        'Total PHCs': allPhcs.length,
        'Active PHCs': allPhcs.filter(p => (p.Status || 'Active') === 'Active').length,
        'Current User': window.currentUserName || 'Unknown',
        'User Role': window.currentUserRole || 'Unknown',
        'User PHC': window.currentUserPHC || 'N/A',
        'App Version': '2.0.0',
        'Browser': navigator.userAgent.split(' ').pop()
    };
    
    const infoText = Object.entries(info)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
    
    alert('System Information\n\n' + infoText);
}

// Make main functions globally available
window.initAdminManagement = initAdminManagement;
window.initUsersManagement = initUsersManagement;
window.initPhcManagement = initPhcManagement;
window.renderFacilitiesManagement = renderFacilitiesManagement;
window.renderManagementAnalytics = renderManagementAnalytics;
window.renderCdsRulesList = renderCdsRulesList;
window.renderAdminLogs = renderAdminLogs;
window.initManagementExports = initManagementExports;
window.initAdvancedAdminActions = initAdvancedAdminActions;
window.fetchUsers = fetchUsers;
window.fetchPhcs = fetchPhcs;
window.renderUsersTable = renderUsersTable;
window.renderPhcsTable = renderPhcsTable;

// Don't export showLoader/hideLoader as they're global functions, not defined in this module
// Also export named bindings for ESM-style imports
export {
    initAdminManagement,
    initUsersManagement,
    initPhcManagement,
    renderFacilitiesManagement,
    renderManagementAnalytics,
    renderCdsRulesList,
    renderAdminLogs,
    initManagementExports,
    initAdvancedAdminActions,
    fetchUsers,
    fetchPhcs,
    renderUsersTable,
    renderPhcsTable
};

window.Logger.debug('🔧 Unified Admin Management module loaded');
