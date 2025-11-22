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

// Use global loader/notification helpers
function showNotification(message, type = 'info') { 
    if (typeof window.showNotification === 'function') return window.showNotification(message, type); 
    console.log(type, message); 
}

function showLoader(text = 'Loading...') { 
    const el = document.getElementById('loadingIndicator'); 
    if (el) {
        el.style.display = 'flex';
        const loadingText = el.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }
}

function hideLoader() { 
    const el = document.getElementById('loadingIndicator'); 
    if (el) {
        el.style.display = 'none';
    }
}

// =====================================================
// USERS MANAGEMENT
// =====================================================

async function fetchUsers() {
    showLoader('Loading users...');
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
        showNotification('Failed to load users', 'error');
        return [];
    } catch (err) {
        showNotification('Error fetching users: ' + err.message, 'error');
        return [];
    } finally {
        hideLoader();
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
        container.innerHTML = `<div class="text-center p-4">${window.EpicareI18n ? window.EpicareI18n.translate('admin.noFacilityStaff') : 'No facility staff found.'}</div>`;
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
                                <span class="badge ${(user.Status || user.status || 'Active') === 'Active' ? 'bg-success' : 'bg-secondary'}">
                                    ${escapeHtml(user.Status || user.status || 'Active')}
                                </span>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${escapeHtml(user.Username || user.username || '')}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-${(user.Status || 'Active') === 'Active' ? 'warning' : 'success'}" 
                                        onclick="toggleUserStatus('${escapeHtml(user.Username || user.username || '')}', '${escapeHtml(user.Status || 'Active')}')">
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
        showLoader('Loading facilities...');
        
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
        console.error('Error fetching PHCs:', error);
        showNotification('Failed to load PHCs: ' + error.message, 'error');
        return [];
    } finally {
        hideLoader();
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
        console.warn('Failed to load PHC list', e);
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
        showNotification('User not found', 'error');
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
        showNotification('PHC not found', 'error');
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
        showLoader('Adding PHC...');
        
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
        
        const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            showNotification('PHC added successfully!', 'success');
            // Refresh the PHC list
            const phcs = await fetchPhcs();
            renderPhcsTable(phcs);
        } else {
            throw new Error(result.error || result.message || 'Failed to add PHC');
        }
    } catch (error) {
        console.error('Error adding PHC:', error);
        showNotification('Failed to add PHC: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

function generatePhcCode(name) {
    return 'PHC' + name.replace(/\s+/g, '').substring(0, 6).toUpperCase() + String(Date.now()).slice(-3);
}

// =====================================================
// UTILITY FUNCTIONS
// =====================================================

function downloadUsersCSV(users) {
    if (!users || users.length === 0) return showNotification('No users to export', 'info');
    const rows = [Object.keys(users[0])].concat(users.map(u => Object.values(u)));
    const csv = rows.map(r => r.map(cell => '"' + String(cell || '').replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users.csv';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
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
                
                const resp = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
                    method: 'POST', 
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                
                const res = await resp.json();
                if (res.status === 'success') {
                    showNotification(editId ? 'User updated' : 'User added successfully', 'success');
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
                hideLoader(); 
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

// Make main functions globally available
window.initAdminManagement = initAdminManagement;
window.initUsersManagement = initUsersManagement;
window.initPhcManagement = initPhcManagement;
window.fetchUsers = fetchUsers;
window.fetchPhcs = fetchPhcs;
window.renderUsersTable = renderUsersTable;
window.renderPhcsTable = renderPhcsTable;
window.showLoader = showLoader;
window.hideLoader = hideLoader;

// Also export named bindings for ESM-style imports
export {
    initAdminManagement,
    initUsersManagement,
    initPhcManagement,
    fetchUsers,
    fetchPhcs,
    renderUsersTable,
    renderPhcsTable,
    showLoader,
    hideLoader
};

console.log('🔧 Unified Admin Management module loaded');
