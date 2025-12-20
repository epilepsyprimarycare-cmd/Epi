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

// =====================================================
// USERNAME & PASSWORD GENERATION HELPERS
// =====================================================

/**
 * Generate a unique username in format: firstname + 2 digits + _cho (all lowercase)
 * @param {string} fullName - The full name of the user
 * @param {Array} existingUsers - Array of existing users to check uniqueness
 * @returns {string} - Generated unique username
 */
function generateCHOUsername(fullName, existingUsers = []) {
    // Extract first name and clean it (alphanumeric, lowercase only)
    const firstName = (fullName || 'user').split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
    const baseName = firstName || 'user';
    
    // Get list of existing usernames
    const existingUsernames = existingUsers.map(u => (u.Username || u.username || '').toLowerCase());
    
    // Try to generate a unique username
    let attempts = 0;
    let username = '';
    
    while (attempts < 100) {
        // Generate 2 random digits
        const digits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
        username = `${baseName}${digits}_cho`;
        
        if (!existingUsernames.includes(username)) {
            return username;
        }
        attempts++;
    }
    
    // Fallback with timestamp if still not unique
    const timestamp = Date.now().toString().slice(-4);
    return `${baseName}${timestamp}_cho`;
}

/**
 * Generate a password in format: cho + 4 random digits
 * @returns {string} - Generated password
 */
function generateCHOPassword() {
    const digits = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `cho${digits}`;
}

/**
 * Show a modal with the generated user credentials
 * @param {string} name - User's full name
 * @param {string} username - Generated username
 * @param {string} password - Generated password
 * @param {string} email - User's email
 * @param {string} phc - Assigned PHC
 */
function showUserCredentialsModal(name, username, password, email, phc) {
    // Remove existing modal if any
    const existingModal = document.getElementById('userCredentialsModal');
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="userCredentialsModal" class="modal" style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.6); align-items:center; justify-content:center; z-index:3000;">
            <div class="modal-content" style="width:500px; background:#fff; border-radius:12px; padding:24px; box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <div style="text-align:center; margin-bottom:20px;">
                    <div style="width:60px; height:60px; background:linear-gradient(135deg, #27ae60, #219653); border-radius:50%; display:inline-flex; align-items:center; justify-content:center; margin-bottom:12px;">
                        <i class="fas fa-user-check" style="font-size:28px; color:white;"></i>
                    </div>
                    <h3 style="margin:0; color:#27ae60;">Facility User Created Successfully!</h3>
                </div>
                
                <div style="background:#f8f9fa; border-radius:8px; padding:16px; margin-bottom:16px;">
                    <div style="margin-bottom:12px;">
                        <label style="font-weight:600; color:#666; font-size:0.85rem;">Name</label>
                        <div style="font-size:1.1rem; color:#333;">${escapeHtml(name)}</div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-weight:600; color:#666; font-size:0.85rem;">Email</label>
                        <div style="font-size:1rem; color:#333;">${escapeHtml(email)}</div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="font-weight:600; color:#666; font-size:0.85rem;">Assigned Facility</label>
                        <div style="font-size:1rem; color:#333;">${escapeHtml(phc)}</div>
                    </div>
                </div>
                
                <div style="background:#e8f5e9; border:2px solid #27ae60; border-radius:8px; padding:16px; margin-bottom:16px;">
                    <h4 style="margin:0 0 12px 0; color:#1b5e20;"><i class="fas fa-key"></i> Login Credentials</h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label style="font-weight:600; color:#2e7d32; font-size:0.85rem;">Username</label>
                            <div style="font-family:monospace; font-size:1.1rem; background:#fff; padding:8px 12px; border-radius:4px; border:1px solid #a5d6a7;" id="generatedUsername">${escapeHtml(username)}</div>
                        </div>
                        <div>
                            <label style="font-weight:600; color:#2e7d32; font-size:0.85rem;">Password</label>
                            <div style="font-family:monospace; font-size:1.1rem; background:#fff; padding:8px 12px; border-radius:4px; border:1px solid #a5d6a7;" id="generatedPassword">${escapeHtml(password)}</div>
                        </div>
                    </div>
                </div>
                
                <div style="background:#fff3e0; border-radius:8px; padding:12px; margin-bottom:16px;">
                    <p style="margin:0; color:#e65100; font-size:0.9rem;">
                        <i class="fas fa-exclamation-triangle"></i> 
                        <strong>Important:</strong> Please save these credentials securely. The password cannot be recovered later.
                    </p>
                </div>
                
                <div style="display:flex; gap:10px; justify-content:flex-end;">
                    <button id="copyCredentialsBtn" class="btn btn-secondary" style="display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-copy"></i> Copy Credentials
                    </button>
                    <button id="closeCredentialsModalBtn" class="btn btn-primary" style="display:flex; align-items:center; gap:6px;">
                        <i class="fas fa-check"></i> Done
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Copy credentials handler
    document.getElementById('copyCredentialsBtn').addEventListener('click', () => {
        const credentialsText = `Facility User Credentials\n--------------------\nName: ${name}\nEmail: ${email}\nFacility: ${phc}\nUsername: ${username}\nPassword: ${password}`;
        navigator.clipboard.writeText(credentialsText).then(() => {
            showNotification('Credentials copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = credentialsText;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
            showNotification('Credentials copied to clipboard!', 'success');
        });
    });
    
    // Close modal handler
    document.getElementById('closeCredentialsModalBtn').addEventListener('click', () => {
        document.getElementById('userCredentialsModal').remove();
        showNotification('Facility user added successfully!', 'success');
    });
    
    // Close on backdrop click
    document.getElementById('userCredentialsModal').addEventListener('click', (e) => {
        if (e.target.id === 'userCredentialsModal') {
            document.getElementById('userCredentialsModal').remove();
        }
    });
}

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
        <div style="margin-bottom: 1rem; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-info-circle" style="color: #007bff;"></i>
            <small><strong>${window.EpicareI18n ? window.EpicareI18n.translate('admin.showingFacilityStaffOnly') : 'Showing Facility Staff Only'}</strong> (${window.EpicareI18n ? window.EpicareI18n.translate('admin.adminRolesFiltered') : 'Admin roles filtered out'})</small>
        </div>
        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
            <table class="table table-sm table-hover" style="font-size: 0.9rem;">
                <thead style="position: sticky; top: 0; background: #343a40; color: white; z-index: 10;">
                    <tr>
                        <th style="padding: 10px;">${window.EpicareI18n ? window.EpicareI18n.translate('admin.name') : 'Name'}</th>
                        <th style="padding: 10px;">${window.EpicareI18n ? window.EpicareI18n.translate('admin.email') : 'Email'}</th>
                        <th style="padding: 10px;">${window.EpicareI18n ? window.EpicareI18n.translate('admin.facility') : 'Facility'}</th>
                        <th style="padding: 10px; text-align: center;">${window.EpicareI18n ? window.EpicareI18n.translate('admin.status') : 'Status'}</th>
                        <th style="padding: 10px; text-align: center;">${window.EpicareI18n ? window.EpicareI18n.translate('admin.actions') : 'Actions'}</th>
                    </tr>
                </thead>
                <tbody>
                    ${pageUsers.map(user => `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 8px; vertical-align: middle;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85rem;">
                                        ${(user.Name || user.name || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <strong>${escapeHtml(user.Name || user.name || 'Unnamed User')}</strong>
                                </div>
                            </td>
                            <td style="padding: 8px; vertical-align: middle; color: #6c757d;">${escapeHtml(user.Email || user.email || 'N/A')}</td>
                            <td style="padding: 8px; vertical-align: middle;">
                                <span style="padding: 4px 8px; background: #e7f3ff; color: #0066cc; border-radius: 4px; font-size: 0.85rem; display: inline-block;">
                                    <i class="fas fa-hospital" style="font-size: 0.75rem; margin-right: 4px;"></i>${escapeHtml(user.PHC || user.phc || 'N/A')}
                                </span>
                            </td>
                            <td style="padding: 8px; vertical-align: middle; text-align: center;">
                                <span class="badge ${(user.Status || user.status || 'Active') === 'Active' ? 'bg-success' : 'bg-secondary'}" style="font-size: 0.8rem; padding: 4px 10px;" title="${EpicareI18n.translate((user.Status || user.status || 'Active') === 'Active' ? 'status.active' : 'status.inactive')}">
                                    ${escapeHtml(user.Status || user.status || 'Active')}
                                </span>
                            </td>
                            <td style="padding: 8px; vertical-align: middle; text-align: center;">
                                <div style="display: flex; gap: 4px; justify-content: center;">
                                    <button class="btn btn-sm btn-outline-primary" style="padding: 4px 8px;" onclick="editUser('${escapeHtml(user.Username || user.username || '')}')" title="${EpicareI18n.translate('table.actionsEdit')}">
                                        <i class="fas fa-edit" style="font-size: 0.85rem;"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-${(user.Status || 'Active') === 'Active' ? 'warning' : 'success'}" style="padding: 4px 8px;" 
                                            onclick="toggleUserStatus('${escapeHtml(user.Username || user.username || '')}', '${escapeHtml(user.Status || 'Active')}')" title="${EpicareI18n.translate((user.Status || 'Active') === 'Active' ? 'status.inactive' : 'status.active')}">
                                        <i class="fas fa-${(user.Status || 'Active') === 'Active' ? 'pause' : 'play'}" style="font-size: 0.85rem;"></i>
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
        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
            <table class="table table-sm table-hover" style="font-size: 0.9rem;">
                <thead style="position: sticky; top: 0; background: #343a40; color: white; z-index: 10;">
                    <tr>
                        <th style="padding: 10px;">PHC Name</th>
                        <th style="padding: 10px;">District</th>
                        <th style="padding: 10px;">Block</th>
                        <th style="padding: 10px;">Contact Person</th>
                        <th style="padding: 10px;">Phone</th>
                        <th style="padding: 10px; text-align: center;">Status</th>
                        <th style="padding: 10px; text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${pagePhcs.map(phc => `
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 8px; vertical-align: middle;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.85rem;">
                                        ${(phc.PHCName || phc.name || 'P').charAt(0).toUpperCase()}
                                    </div>
                                    <strong>${escapeHtml(phc.PHCName || phc.name || 'N/A')}</strong>
                                </div>
                            </td>
                            <td style="padding: 8px; vertical-align: middle; color: #6c757d;">${escapeHtml(phc.District || 'N/A')}</td>
                            <td style="padding: 8px; vertical-align: middle; color: #6c757d;">${escapeHtml(phc.Block || 'N/A')}</td>
                            <td style="padding: 8px; vertical-align: middle;">${escapeHtml(phc.ContactPerson || 'N/A')}</td>
                            <td style="padding: 8px; vertical-align: middle; color: #6c757d;">${escapeHtml(phc.Phone || phc.ContactPhone || 'N/A')}</td>
                            <td style="padding: 8px; vertical-align: middle; text-align: center;">
                                <span class="badge ${(phc.Status || 'Active') === 'Active' ? 'bg-success' : 'bg-secondary'}" style="font-size: 0.8rem; padding: 4px 10px;">
                                    ${escapeHtml(phc.Status || 'Active')}
                                </span>
                            </td>
                            <td style="padding: 8px; vertical-align: middle; text-align: center;">
                                <div style="display: flex; gap: 4px; justify-content: center;">
                                    <button class="btn btn-sm btn-outline-primary" style="padding: 4px 8px;" onclick="editPhc('${escapeHtml(phc.PHCCode || phc.id || '')}')">
                                        <i class="fas fa-edit" style="font-size: 0.85rem;"></i>
                                    </button>
                                    <button class="btn btn-sm btn-outline-info" style="padding: 4px 8px;" onclick="viewPhcDetails('${escapeHtml(phc.PHCCode || phc.id || '')}')">
                                        <i class="fas fa-eye" style="font-size: 0.85rem;"></i>
                                    </button>
                                </div>
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
        // Keep PHC wrapper visible since it's always needed for PHC users
        if (phcWrapper) phcWrapper.style.display = 'block'; 
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
            const role = 'phc'; // Always PHC role for this form
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
            
            if (!assignedPhc) {
                errors.push('Please select a PHC for the user');
            }
            
            if (errors.length > 0) {
                if (errorsDiv) errorsDiv.innerHTML = errors.map(err => `<div class="alert alert-danger py-1">${err}</div>`).join('');
                return;
            }
            
            showLoader('Adding facility user...');
            try {
                // Auto-generate username and password for CHO
                const username = generateCHOUsername(name, allUsers);
                const password = generateCHOPassword();
                
                window.Logger.debug('Generated credentials:', { username, password });
                window.Logger.info('Adding facility user with auto-generated credentials', { name, username, phc: assignedPhc });
                
                const editId = modal ? modal.getAttribute('data-edit-id') : null;
                const payload = { 
                    action: editId ? 'updateUser' : 'addUser',
                    name, 
                    email, 
                    role, 
                    phc: assignedPhc,
                    username: username,
                    password: password,
                    status: 'Active'
                };
                
                if (editId) payload.id = editId;
                
                window.Logger.debug('Sending payload to backend:', payload);
                
                const res = (typeof window.makeAPICall === 'function') ? await window.makeAPICall(payload.action, payload) : await (async () => { const resp = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(payload) }); return resp.json(); })();
                
                window.Logger.debug('Backend response:', res);
                
                if (res.status === 'success') {
                    // Show credentials modal for new users
                    if (!editId) {
                        window.Logger.debug('Showing credentials modal for new user');
                        showUserCredentialsModal(name, username, password, email, assignedPhc);
                    } else {
                        showNotification(EpicareI18n.translate('admin.userUpdated'), 'success');
                    }
                    
                    // Log user management action
                    if (typeof window.logUserActivity === 'function') {
                        const actionType = editId ? 'Updated User' : 'Added New Facility User';
                        window.logUserActivity(actionType, { 
                            targetUser: username,
                            role: role,
                            phc: assignedPhc
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
                    window.Logger.error('Failed to add user. Response:', res);
                    showNotification('Failed to add/update user: ' + (res.message || res.error || JSON.stringify(res)), 'error');
                }
            } catch (err) {
                window.Logger.error('Error adding user:', err);
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
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-body text-center" style="padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <div style="background: rgba(255,255,255,0.2); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                                <i class="fas fa-users" style="font-size: 1.5rem;"></i>
                            </div>
                            <h3 class="mb-1" style="font-weight: 700;">${usersCount}</h3>
                            <small style="opacity: 0.9; font-weight: 500;">Total Users</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-body text-center" style="padding: 20px; background: linear-gradient(135deg, #56ab2f 0%, #a8e063 100%); color: white;">
                            <div style="background: rgba(255,255,255,0.2); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                                <i class="fas fa-user-check" style="font-size: 1.5rem;"></i>
                            </div>
                            <h3 class="mb-1" style="font-weight: 700;">${activeUsersCount}</h3>
                            <small style="opacity: 0.9; font-weight: 500;">Active Users</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-body text-center" style="padding: 20px; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white;">
                            <div style="background: rgba(255,255,255,0.2); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                                <i class="fas fa-hospital" style="font-size: 1.5rem;"></i>
                            </div>
                            <h3 class="mb-1" style="font-weight: 700;">${phcsCount}</h3>
                            <small style="opacity: 0.9; font-weight: 500;">Total Facilities</small>
                        </div>
                    </div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-body text-center" style="padding: 20px; background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white;">
                            <div style="background: rgba(255,255,255,0.2); width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px;">
                                <i class="fas fa-hospital-alt" style="font-size: 1.5rem;"></i>
                            </div>
                            <h3 class="mb-1" style="font-weight: 700;">${activePHCsCount}</h3>
                            <small style="opacity: 0.9; font-weight: 500;">Active Facilities</small>
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-header" style="background: #f8f9fa; border-bottom: 2px solid #e9ecef; padding: 16px;">
                            <h5 class="mb-0" style="font-weight: 600; color: #495057;"><i class="fas fa-chart-pie" style="color: #667eea; margin-right: 8px;"></i> Users by Facility</h5>
                        </div>
                        <div class="card-body" style="padding: 20px;">
                            <canvas id="usersByPhcChart" height="200"></canvas>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card" style="border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-radius: 12px; overflow: hidden;">
                        <div class="card-header" style="background: #f8f9fa; border-bottom: 2px solid #e9ecef; padding: 16px;">
                            <h5 class="mb-0" style="font-weight: 600; color: #495057;"><i class="fas fa-chart-bar" style="color: #56ab2f; margin-right: 8px;"></i> User Status Distribution</h5>
                        </div>
                        <div class="card-body" style="padding: 20px;">
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
        <div style="margin-bottom: 1rem; padding: 8px 12px; background: #f8f9fa; border-radius: 6px; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-file-alt" style="color: #007bff;"></i>
            <strong>User Activity Logs</strong>
        </div>
        
        <div class="table-responsive" style="max-height: 600px; overflow-y: auto;">
            <table class="table table-sm table-hover" style="font-size: 0.9rem;">
                <thead style="position: sticky; top: 0; background: #343a40; color: white; z-index: 10;">
                    <tr>
                        <th style="padding: 10px;">Timestamp</th>
                        <th style="padding: 10px;">User</th>
                        <th style="padding: 10px; text-align: center;">Action</th>
                        <th style="padding: 10px;">Details</th>
                        <th style="padding: 10px;">Role</th>
                        <th style="padding: 10px;">PHC</th>
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
                            <tr style="border-bottom: 1px solid #dee2e6;">
                                <td style="padding: 8px; vertical-align: middle;"><small style="color: #6c757d;">${escapeHtml(timestamp)}</small></td>
                                <td style="padding: 8px; vertical-align: middle;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 0.75rem;">
                                            ${username.charAt(0).toUpperCase()}
                                        </div>
                                        <strong>${escapeHtml(username)}</strong>
                                    </div>
                                </td>
                                <td style="padding: 8px; vertical-align: middle; text-align: center;">
                                    <span class="badge bg-info" style="font-size: 0.75rem; padding: 4px 8px;">${escapeHtml(action)}</span>
                                </td>
                                <td style="padding: 8px; vertical-align: middle;"><small style="color: #6c757d;">${escapeHtml(detailsDisplay)}</small></td>
                                <td style="padding: 8px; vertical-align: middle;"><small style="color: #6c757d;">${escapeHtml(role)}</small></td>
                                <td style="padding: 8px; vertical-align: middle;">
                                    <span style="padding: 3px 6px; background: #e7f3ff; color: #0066cc; border-radius: 4px; font-size: 0.8rem; display: inline-block;">
                                        <i class="fas fa-hospital" style="font-size: 0.7rem; margin-right: 3px;"></i>${escapeHtml(phc)}
                                    </span>
                                </td>
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
        window.Logger.debug('Management Export Status:', status);
        return status;
    };

    // Developer helper: check that user exports are disabled and full export excludes user data
    window._checkUserExportDisabled = function() {
        const isDisabled = typeof window.exportUsersData === 'function' && window.exportUsersData.toString().includes('Exporting user data has been disabled');
        window.Logger.debug('User export disabled:', !!isDisabled);
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
    
    // Mask phone numbers and exclude address fields for confidentiality
    const maskPhoneForExport = (phone) => {
        if (!phone) return '';
        const phoneStr = String(phone).trim();
        if (phoneStr.length <= 4) return '####';
        return phoneStr.slice(0, -4) + '####';
    };
    
    const sanitizedPhcs = allPhcs.map(phc => {
        const sanitized = { ...phc };
        // Mask phone fields
        if (sanitized.Phone) sanitized.Phone = maskPhoneForExport(sanitized.Phone);
        if (sanitized.ContactPhone) sanitized.ContactPhone = maskPhoneForExport(sanitized.ContactPhone);
        // Remove address fields
        delete sanitized.Address;
        delete sanitized.address;
        return sanitized;
    });
    
    const headers = Object.keys(sanitizedPhcs[0]);
    const rows = sanitizedPhcs.map(phc => Object.values(phc));
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

window.Logger.debug('🔧 Unified Admin Management module loaded');

